<script setup lang="ts">
/**
 * The 3D view of a G-code file: turn and zoom it, step through layers and moves.
 * It takes parsed data and draws it; the three.js scene is loaded only when this
 * opens. Look-only: nothing here can reach the machine.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import type { ParsedGcode } from '@/gcode/parse'
import { BUDGET_NORMAL, BUDGET_REDUCED, buildDraw, fileMoveAt, previewNotes, visibleRange, type DrawData } from './draw'
import type { BedShape, GcodeScene, Rgb, ViewAngle } from './scene'

const props = defineProps<{ parsed: ParsedGcode; bed: BedShape }>()

const REDUCED_KEY = 'rs.viewer.reduced'
function loadReduced(): boolean {
  try {
    const v = localStorage.getItem(REDUCED_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* storage blocked: fall through to the guess */
  }
  // A two-core machine, such as the kiosk, starts in the lighter mode
  return (navigator.hardwareConcurrency || 4) <= 2
}

const canvas = ref<HTMLCanvasElement | null>(null)
const box = ref<HTMLDivElement | null>(null)
const failure = ref<string | null>(null)
const contextLost = ref(false)
const reduced = ref(loadReduced())
const showTravel = ref(false)
const angle = ref<ViewAngle>('angle')
const wholeBed = ref(false)

const draw = shallowRef<DrawData>(buildDraw(props.parsed, reduced.value ? BUDGET_REDUCED : BUDGET_NORMAL))
const layerCount = computed(() => draw.value.layerStarts.length)
const layer = ref(Math.max(0, layerCount.value - 1))
/** How far through the layer, 0 to 1000 on the slider */
const through = ref(1000)

const range = computed(() => visibleRange(draw.value, layer.value, through.value / 1000))
const notes = computed(() => previewNotes(props.parsed, draw.value))
const zLabel = computed(() => {
  const z = draw.value.layerZ[layer.value]
  return z === undefined ? '' : `${z.toFixed(2)} mm`
})
const layerWord = computed(() => (props.parsed.layerSource === 'depth' ? 'Depth' : 'Layer'))
/** Where the last drawn move ends, for the readout */
const head = computed(() => {
  const i = range.value.end - 1
  if (i < 0) return null
  const s = draw.value.segments
  return { x: s[i * 6 + 3]!, y: s[i * 6 + 4]!, z: s[i * 6 + 5]!, move: fileMoveAt(draw.value, i) + 1 }
})

let scene: GcodeScene | null = null
let observer: ResizeObserver | null = null
let themeWatch: MutationObserver | null = null
let systemTheme: MediaQueryList | null = null

/** Any CSS colour as sRGB numbers: the browser does the converting, including color-mix() */
function colourOf(css: string): Rgb {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return { r: 0.5, g: 0.5, b: 0.5 }
  g.fillStyle = css
  g.fillRect(0, 0, 1, 1)
  const d = g.getImageData(0, 0, 1, 1).data
  return { r: d[0]! / 255, g: d[1]! / 255, b: d[2]! / 255 }
}
function applyColours() {
  if (!box.value || !scene) return
  const st = getComputedStyle(box.value)
  scene.setColours({ ink: colourOf(st.color), paper: colourOf(st.backgroundColor) })
}
const onThemeChange = () => applyColours()
const onVisible = () => {
  if (!document.hidden) scene?.draw()
}

onMounted(async () => {
  try {
    const { GcodeScene } = await import('./scene')
    if (!canvas.value || !box.value) return
    scene = new GcodeScene(canvas.value, { reduced: reduced.value, onContextChange: (l) => (contextLost.value = l) })
    const r = box.value.getBoundingClientRect()
    scene.resize(r.width, r.height)
    applyColours()
    scene.setBed(props.bed)
    scene.setPath(draw.value, !reduced.value)
    scene.setTravel(showTravel.value)
    scene.setVisible(range.value.end, range.value.dimBefore)
    observer = new ResizeObserver(([e]) => {
      if (e) scene?.resize(e.contentRect.width, e.contentRect.height)
    })
    observer.observe(box.value)
    themeWatch = new MutationObserver(onThemeChange)
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    systemTheme.addEventListener('change', onThemeChange)
    document.addEventListener('visibilitychange', onVisible)
  } catch (e) {
    failure.value = `This browser couldn't start the 3D drawing (${(e as Error).message}). The file itself is fine.`
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  themeWatch?.disconnect()
  systemTheme?.removeEventListener('change', onThemeChange)
  document.removeEventListener('visibilitychange', onVisible)
  scene?.dispose()
  scene = null
})

watch(range, (v) => scene?.setVisible(v.end, v.dimBefore))
watch(showTravel, (v) => scene?.setTravel(v))
watch(layer, () => {
  through.value = 1000
})

function look(a: ViewAngle) {
  angle.value = a
  scene?.setView(a, wholeBed.value)
}
function toggleWhole() {
  wholeBed.value = !wholeBed.value
  scene?.setView(angle.value, wholeBed.value)
}
function toggleReduced() {
  reduced.value = !reduced.value
  try {
    localStorage.setItem(REDUCED_KEY, reduced.value ? '1' : '0')
  } catch {
    /* storage blocked: it still applies to this view */
  }
  draw.value = buildDraw(props.parsed, reduced.value ? BUDGET_REDUCED : BUDGET_NORMAL)
  scene?.setPath(draw.value, !reduced.value)
  scene?.setVisible(range.value.end, range.value.dimBefore)
}
const fmt = (v: number) => v.toFixed(2)
</script>

<template>
  <div class="viewer">
    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
    <div v-else ref="box" class="stage">
      <canvas ref="canvas" role="img" :aria-label="`3D drawing of the job: ${layerWord.toLowerCase()} ${layer + 1} of ${layerCount}`" />
      <p v-if="contextLost" class="lost" role="status">The browser paused the 3D drawing. It comes back by itself, or reload this page.</p>
      <div class="views" role="group" aria-label="View">
        <RsButton size="sm" :variant="angle === 'angle' ? 'primary' : undefined" :aria-pressed="angle === 'angle'" @click="look('angle')">Angle</RsButton>
        <RsButton size="sm" :variant="angle === 'top' ? 'primary' : undefined" :aria-pressed="angle === 'top'" @click="look('top')">Top</RsButton>
        <RsButton size="sm" :aria-pressed="wholeBed" @click="toggleWhole">{{ wholeBed ? 'Fit job' : 'Whole bed' }}</RsButton>
      </div>
    </div>

    <div class="controls">
      <label v-if="layerCount > 1" class="slide">
        <span class="lab">{{ layerWord }} {{ layer + 1 }} of {{ layerCount }} <span class="mono">Z {{ zLabel }}</span></span>
        <input v-model.number="layer" type="range" min="0" :max="layerCount - 1" step="1" />
      </label>
      <label class="slide">
        <span class="lab">Move <span class="mono">{{ head ? head.move.toLocaleString() : 0 }} of {{ draw.fileMoves.toLocaleString() }}</span></span>
        <input v-model.number="through" type="range" min="0" max="1000" step="1" />
      </label>
      <div class="foot">
        <span v-if="head" class="pos mono">X {{ fmt(head.x) }} Y {{ fmt(head.y) }} Z {{ fmt(head.z) }}</span>
        <label class="check"><input v-model="showTravel" type="checkbox" /> Show travel moves</label>
        <label class="check"><input :checked="reduced" type="checkbox" @change="toggleReduced" /> Lighter drawing</label>
      </div>
    </div>

    <ul v-if="notes.length" class="notes">
      <li v-for="n in notes" :key="n">{{ n }}</li>
    </ul>
  </div>
</template>

<style scoped>
.viewer { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.stage { position: relative; height: min(62vh, 640px); min-height: 280px; overflow: hidden; color: var(--rs-text-strong); background: var(--rs-surface); border: 1px solid var(--rs-line); border-radius: 10px; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
canvas:active { cursor: grabbing; }
.views { position: absolute; top: var(--rs-space-2); right: var(--rs-space-2); display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--rs-space-1); }
.lost { position: absolute; left: var(--rs-space-2); bottom: var(--rs-space-2); margin: 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.failure { margin: 0; padding: var(--rs-space-4); border: 1px solid var(--rs-line); border-radius: 10px; }
.controls { display: flex; flex-direction: column; gap: var(--rs-space-2); }
.slide { display: flex; flex-direction: column; gap: 2px; }
.slide input { width: 100%; height: 28px; margin: 0; accent-color: var(--rs-text-strong); }
.lab { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-mono); font-variant-numeric: tabular-nums; }
.lab .mono { margin-left: var(--rs-space-1); color: var(--rs-text-strong); }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2) var(--rs-space-4); font-size: var(--rs-text-xs); }
.pos { margin-right: auto; color: var(--rs-text-strong); }
.check { display: inline-flex; align-items: center; gap: var(--rs-space-1); color: var(--rs-text-muted); }
.check input { width: 16px; height: 16px; accent-color: var(--rs-text-strong); }
.notes { margin: 0; padding-left: var(--rs-space-4); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
</style>
