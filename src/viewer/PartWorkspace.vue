<script setup lang="ts">
/**
 * The part on the bed in 3D: drag it along the bed, turn the camera, click a face to lay it flat.
 * It changes only the job's placement, through events, and nothing here can reach the machine.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import type { BedShape, GcodeScene, SceneModel, ViewAngle, WireBox } from './scene'
import { colourOf, watchTheme } from './theme'

const props = defineProps<{
  /** every part on the bed */
  parts: Array<SceneModel & { size: { x: number; y: number; z: number } }>
  selectedId: number
  bed: BedShape
  /** can it be dragged? (A CNC part sits in its stock, so no.) */
  movable: boolean
  reduced: boolean
  boxes: WireBox[]
  /** waiting for a click on a face */
  picking: boolean
  label: string
  /** marking support spots: a click on a part adds or removes one */
  marking?: boolean
  /** support marks to show, on the bed */
  marks?: Array<{ at: [number, number, number]; r: number; block?: boolean }>
  /** tint faces that need support past this angle, or null */
  overhang?: number | null
}>()
const emit = defineEmits<{
  select: [id: number]
  /** a part's menu was asked for: right click, a long press, or the menu key. normal = the face it was asked on */
  menu: [id: number, x: number, y: number, normal: [number, number, number] | null]
  /** the middle of the selected part wants to be here (not yet kept on the bed) */
  move: [x: number, y: number]
  nudge: [dx: number, dy: number]
  /** a face was clicked, pointing this way */
  pick: [normal: [number, number, number]]
  cancelPick: []
  /** this browser can't draw in 3D */
  failed: [message: string]
  /** a click on a part while marking supports, where on the bed */
  mark: [id: number, point: [number, number, number]]
  /** a click on a mark's ball while marking: its place in `marks` */
  unmark: [index: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLDivElement | null>(null)
const contextLost = ref(false)
const markHint = ref<string | null>(null)
const dragging = ref(false)
const angle = ref<ViewAngle>('angle')
const wholeBed = ref(true)

let scene: GcodeScene | null = null
let observer: ResizeObserver | null = null
let stopTheme: (() => void) | null = null

function applyColours() {
  if (!stage.value || !scene) return
  const st = getComputedStyle(stage.value)
  scene.setColours({ ink: colourOf(st.color), paper: colourOf(st.backgroundColor) })
}
const onVisible = () => {
  if (!document.hidden) scene?.draw()
}

const boxOf = (p: (typeof props.parts)[number]) => ({
  min: [p.x - p.size.x / 2, p.y - p.size.y / 2, 0] as [number, number, number],
  max: [p.x + p.size.x / 2, p.y + p.size.y / 2, p.size.z] as [number, number, number],
})
const selectedPart = computed(() => props.parts.find((p) => p.id === props.selectedId) ?? props.parts[0])
/** Whole bed: the bed and anything taller or wider on it. Otherwise only the selected part. */
const focus = computed(() => {
  const boxes = props.parts.map(boxOf)
  if (!wholeBed.value && selectedPart.value) return boxOf(selectedPart.value)
  return {
    min: [Math.min(0, ...boxes.map((b) => b.min[0])), Math.min(0, ...boxes.map((b) => b.min[1])), 0] as [number, number, number],
    max: [Math.max(props.bed.x, ...boxes.map((b) => b.max[0])), Math.max(props.bed.y, ...boxes.map((b) => b.max[1])), Math.max(0, ...boxes.map((b) => b.max[2]))] as [number, number, number],
  }
})
function drawParts() {
  scene?.setModels(props.parts, props.selectedId)
}
function look(a: ViewAngle) {
  angle.value = a
  scene?.setFocus(focus.value)
  scene?.setView(a)
}
function toggleWhole() {
  wholeBed.value = !wholeBed.value
  look(angle.value)
}

// ---- pointer: a drag on a part selects and moves it, anywhere else turns the camera.
// Right click opens its menu, but right drag still pans. A long press does the same on a touch screen.
let grab: { z: number; dx: number; dy: number } | null = null
let press: { x: number; y: number } | null = null
let rightPress: { x: number; y: number } | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null
const CLICK_SLOP = 6
const HOLD_MS = 550

function stopHold() {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
}
function endGrab() {
  grab = null
  dragging.value = false
  scene?.setOrbit(true)
}
function openMenu(x: number, y: number) {
  const hit = scene?.hitModel(x, y)
  if (!hit) return
  emit('select', hit.id)
  emit('menu', hit.id, x, y, hit.normal)
}

function down(e: PointerEvent) {
  if (!scene) return
  if (e.button === 2) {
    rightPress = { x: e.clientX, y: e.clientY }
    return
  }
  if (e.button !== 0) return
  stopHold()
  press = { x: e.clientX, y: e.clientY }
  if (e.pointerType === 'touch' && !props.picking) {
    const { clientX: x, clientY: y } = e
    holdTimer = setTimeout(() => {
      holdTimer = null
      press = null
      endGrab()
      openMenu(x, y)
    }, HOLD_MS)
  }
  if (props.picking || props.marking) return
  const hit = scene.hitModel(e.clientX, e.clientY)
  if (!hit) return
  emit('select', hit.id)
  if (!props.movable) return
  const at = scene.hitLevel(e.clientX, e.clientY, hit.point[2])
  const part = props.parts.find((p) => p.id === hit.id)
  if (!at || !part) return
  grab = { z: hit.point[2], dx: part.x - at[0], dy: part.y - at[1] }
  dragging.value = true
  scene.setOrbit(false)
  canvas.value?.setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (holdTimer && press) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP) return // still deciding: a hold or a drag
    stopHold()
  }
  if (!grab || !scene) return
  const at = scene.hitLevel(e.clientX, e.clientY, grab.z)
  if (at) emit('move', at[0] + grab.dx, at[1] + grab.dy)
}
function up(e: PointerEvent) {
  stopHold()
  if (e.button === 2) {
    if (rightPress && Math.hypot(e.clientX - rightPress.x, e.clientY - rightPress.y) < CLICK_SLOP) openMenu(e.clientX, e.clientY)
    rightPress = null
    return
  }
  if (grab) {
    endGrab()
  } else if (props.marking && press && scene && Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP) {
    // a click on a mark's ball removes that one mark
    const onMark = scene.markUnder(e.clientX, e.clientY)
    if (onMark !== null) {
      markHint.value = null
      emit('unmark', onMark)
      press = null
      return
    }
    // the mark goes on the overhang under the spot clicked: that's where Kiri builds support from
    const spot = scene.supportSpot(e.clientX, e.clientY)
    if (spot) {
      markHint.value = null
      emit('mark', spot.id, spot.point)
    } else if (scene.hitModel(e.clientX, e.clientY)) markHint.value = 'Nothing under that spot hangs in the air: it already stands on the part or the bed.'
  } else if (props.picking && press && scene && Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP) {
    const hit = scene.hitModel(e.clientX, e.clientY)
    if (hit) {
      emit('select', hit.id)
      emit('pick', hit.normal)
    }
  }
  press = null
}
function key(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.picking) {
    emit('cancelPick')
    return
  }
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault()
    const r = canvas.value?.getBoundingClientRect()
    if (r && selectedPart.value) emit('menu', selectedPart.value.id, r.left + r.width / 2, r.top + r.height / 2, null)
    return
  }
  if (!props.movable) return
  const s = e.shiftKey ? 10 : 1
  const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }
  const v = d[e.key]
  if (!v) return
  e.preventDefault()
  emit('nudge', v[0], v[1])
}

onMounted(async () => {
  try {
    const { GcodeScene } = await import('./scene')
    if (!canvas.value || !stage.value) return
    scene = new GcodeScene(canvas.value, { reduced: props.reduced, onContextChange: (l) => (contextLost.value = l) })
    const r = stage.value.getBoundingClientRect()
    scene.resize(r.width, r.height)
    applyColours()
    scene.setBed(props.bed)
    drawParts()
    scene.setBoxes(props.boxes)
    scene.setMarks(props.marks ?? [])
    scene.setOverhang(props.overhang ?? null)
    look('angle')
    // Before the camera's own handler, so a drag that starts on the part doesn't turn the view too
    canvas.value.addEventListener('pointerdown', down, { capture: true })
    observer = new ResizeObserver(([e]) => {
      if (e) scene?.resize(e.contentRect.width, e.contentRect.height)
    })
    observer.observe(stage.value)
    stopTheme = watchTheme(applyColours)
    document.addEventListener('visibilitychange', onVisible)
  } catch (e) {
    emit('failed', (e as Error).message)
  }
})
onBeforeUnmount(() => {
  stopHold()
  canvas.value?.removeEventListener('pointerdown', down, { capture: true })
  observer?.disconnect()
  stopTheme?.()
  document.removeEventListener('visibilitychange', onVisible)
  scene?.dispose()
  scene = null
})

watch(() => [props.parts, props.selectedId], drawParts)
// Lay flat can start from a menu or a button: Esc has to reach this view to cancel it
watch(() => props.picking, (on) => {
  if (on) canvas.value?.focus({ preventScroll: true })
})
watch(() => props.boxes, (b) => scene?.setBoxes(b))
watch(() => props.marks, (m) => scene?.setMarks(m ?? []), { deep: true })
watch(() => props.overhang, (a) => scene?.setOverhang(a ?? null))
watch(() => props.bed, (b) => {
  scene?.setBed(b)
  look(angle.value)
})
</script>

<template>
  <div ref="stage" class="stage" :class="{ picking: picking || marking, movable: movable && !marking, dragging }">
    <canvas ref="canvas" tabindex="0" role="img" :aria-label="label" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key" @contextmenu.prevent />
    <p v-if="contextLost" class="lost" role="status">The browser paused the 3D drawing. It comes back by itself, or reload this page.</p>
    <p v-if="picking" class="pickhint" role="status">Click the face that should sit on the bed. Esc cancels.</p>
    <p v-else-if="marking" class="pickhint" role="status">{{ markHint ?? 'Click the part above where it needs support: the mark goes on the overhang below. Click a mark to remove it.' }}</p>
    <div class="views" role="group" aria-label="View">
      <RsButton size="sm" :variant="angle === 'angle' ? 'primary' : undefined" :aria-pressed="angle === 'angle'" @click="look('angle')">Angle</RsButton>
      <RsButton size="sm" :variant="angle === 'top' ? 'primary' : undefined" :aria-pressed="angle === 'top'" @click="look('top')">Top</RsButton>
      <RsButton size="sm" :aria-pressed="!wholeBed" @click="toggleWhole">{{ wholeBed ? 'Fit part' : 'Whole bed' }}</RsButton>
    </div>
  </div>
</template>

<style scoped>
.stage { position: relative; height: min(62vh, 640px); min-height: 280px; overflow: hidden; color: var(--rs-text-strong); background: var(--rs-surface); border: 1px solid var(--rs-line); border-radius: 10px; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; cursor: grab; -webkit-touch-callout: none; user-select: none; }
canvas:active { cursor: grabbing; }
canvas:focus-visible { outline: 2px solid var(--rs-text-strong); outline-offset: -2px; }
.picking canvas { cursor: crosshair; }
.views { position: absolute; top: var(--rs-space-2); right: var(--rs-space-2); display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--rs-space-1); }
.lost, .pickhint { position: absolute; left: var(--rs-space-2); bottom: var(--rs-space-2); margin: 0; padding: 2px 6px; font-size: var(--rs-text-xs); background: var(--rs-surface); border-radius: 4px; }
.lost { color: var(--rs-text-muted); }
</style>
