<script setup lang="ts">
/**
 * Job setup's workspace: the part or file on the bed, from above or in 3D.
 *
 *   print job with a model   3D, unless this screen uses Lighter drawing or can't draw in 3D
 *   laser, knife, CNC        from above, with a toggle to 3D (remembered per screen)
 *   ready-made G-code        as above, and its 3D view is the Preview viewer
 */
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import BedView from './BedView.vue'
import PartsList from './PartsList.vue'
import { parseInWorker, type ParseJob } from '@/gcode/parseInWorker'
import type { ParsedGcode } from '@/gcode/parse'
import { cncStock } from '@/slicer/kiriSettings'
import type { MachineInfo, PartInfo, PartView, PrepareJob } from '@/slicer/types'
import { clampCentre, partsProblems } from '@/viewer/placement'
import type { WireBox } from '@/viewer/scene'
import { loadReduced, saveReduced } from '@/viewer/theme'

const PartWorkspace = defineAsyncComponent(() => import('@/viewer/PartWorkspace.vue'))
const GcodeViewer = defineAsyncComponent(() => import('@/viewer/GcodeViewer.vue'))

const props = defineProps<{
  machine: MachineInfo
  job: PrepareJob
  /** the selected part */
  part: PartInfo | null
  /** every part in the job, and which one is selected */
  parts?: PartView[]
  selectedId?: number
  result: { min: [number, number, number]; max: [number, number, number] } | null
  /** a ready-made file's text and flat toolpath */
  fileText?: string | null
  paths?: Array<Array<[number, number]>> | null
}>()
const emit = defineEmits<{
  pick: [normal: [number, number, number]]
  mode: [is3d: boolean]
  select: [id: number]
  menu: [id: number, x: number, y: number, normal: [number, number, number] | null]
}>()
const picking = defineModel<boolean>('picking', { default: false })

const KEY = 'rs.prepare.view3d'
function loadChoice(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const isCnc = computed(() => props.job.process === 'cnc')
const isPrintModel = computed(() => props.job.process === 'fdm' && !!props.part)
const reduced = ref(loadReduced())
const choice = ref(loadChoice())
const failure = ref<string | null>(null)

const is3d = computed(() => {
  if (failure.value) return false
  return isPrintModel.value ? !reduced.value : choice.value
})
watch(is3d, (v) => {
  emit('mode', v)
  if (!v) picking.value = false
}, { immediate: true })

function setChoice(on: boolean) {
  choice.value = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* storage blocked: it still applies to this view */
  }
}
function toggleLighter() {
  reduced.value = !reduced.value
  saveReduced(reduced.value)
}

// ---- a model in 3D
const bed = computed(() => {
  const m = props.machine
  if (isCnc.value && props.part) {
    const s = cncStock(props.job, props.part)
    return { x: s.x, y: s.y, keepOut: [] }
  }
  const p = m.prime && props.job.process === 'fdm' ? { x0: Math.max(0, m.prime.x - 2), y0: m.prime.y, x1: m.prime.x + 2, y1: m.prime.y + m.prime.length } : null
  return { x: m.workArea.x, y: m.workArea.y, keepOut: m.keepOut, prime: p }
})
const allParts = computed(() => props.parts ?? [])
const models = computed(() =>
  allParts.value.map((p) => ({
    id: p.id,
    vertices: p.vertices,
    size: p.info.size,
    height: p.info.size.z,
    // a CNC part sits in the middle of its stock
    x: isCnc.value ? bed.value.x / 2 : p.x,
    y: isCnc.value ? bed.value.y / 2 : p.y,
  })),
)
const boxes = computed<WireBox[]>(() => {
  const out: WireBox[] = []
  if (isCnc.value && props.part) {
    const s = cncStock(props.job, props.part)
    out.push({ min: [0, 0, 0], max: [s.x, s.y, s.z] })
  } else if (props.result) out.push({ min: props.result.min, max: props.result.max })
  return out
})
const problems = computed(() => (props.part && allParts.value.length ? partsProblems(allParts.value, props.job, props.machine) : []))

function moveTo(x: number, y: number) {
  if (!props.part) return
  props.job.placement.x = clampCentre(x, props.part.size.x, props.machine.workArea.x)
  props.job.placement.y = clampCentre(y, props.part.size.y, props.machine.workArea.y)
}
function nudge(dx: number, dy: number) {
  moveTo(props.job.placement.x + dx, props.job.placement.y + dy)
}
function onPick(n: [number, number, number]) {
  picking.value = false
  emit('pick', n)
}

// ---- a ready-made file in 3D: read only once it's asked for
const parsed = shallowRef<ParsedGcode | null>(null)
const parseId = ref(0)
const reading = ref(false)
const readError = ref<string | null>(null)
let reader: ParseJob | null = null
function readFile() {
  reader?.cancel()
  reader = null
  parsed.value = null
  readError.value = null
  reading.value = false
  if (!props.fileText || !is3d.value) return
  reading.value = true
  const mine = parseInWorker({ text: props.fileText }, () => {})
  reader = mine
  mine.result.then(
    (p) => {
      if (reader !== mine) return
      parsed.value = p
      parseId.value++
      reading.value = false
      reader = null
    },
    (e: Error) => {
      if (reader !== mine) return
      readError.value = e.message
      reading.value = false
      reader = null
    },
  )
}
watch([() => props.fileText, is3d], readFile, { immediate: true })
onBeforeUnmount(() => reader?.cancel())

const fallback = computed(() => (failure.value ? `This browser couldn't start the 3D drawing (${failure.value}), so the part is shown from above.` : null))
const label = computed(() => (props.part ? `${props.part.name} on the bed in 3D${isCnc.value ? '' : `, at X ${props.job.placement.x} Y ${props.job.placement.y}. Arrow keys move it.`}` : 'The bed in 3D'))
</script>

<template>
  <div class="workspace">
    <div v-if="!isPrintModel && !failure" class="toggle" role="group" aria-label="How to show the job">
      <button type="button" class="seg" :class="{ on: !choice }" :aria-pressed="!choice" @click="setChoice(false)">From above</button>
      <button type="button" class="seg" :class="{ on: choice }" :aria-pressed="choice" @click="setChoice(true)">3D</button>
    </div>

    <div :class="{ beside: allParts.length > 1 }">
    <div class="drawing">
    <template v-if="is3d && part && allParts.length">
      <PartWorkspace
        :parts="models"
        :selected-id="selectedId ?? 0"
        :bed="bed"
        :movable="!isCnc"
        :reduced="reduced"
        :boxes="boxes"
        :picking="picking"
        :label="label"
        @select="emit('select', $event)"
        @menu="(id, x, y, n) => emit('menu', id, x, y, n)"
        @move="moveTo"
        @nudge="nudge"
        @pick="onPick"
        @cancel-pick="picking = false"
        @failed="failure = $event"
      />
      <p class="muted small">
        <template v-if="isCnc">Thin box: the stock · Z0 is its top (CNC_JOB_SETUP) · X0 Y0 front-left corner</template>
        <template v-else>
          Bed {{ machine.workArea.x }} × {{ machine.workArea.y }} mm · X0 Y0 front-left · drag the part, or empty space to turn the view<template v-if="result"> · thin box: where the file's moves go</template>
        </template>
      </p>
    </template>
    <template v-else-if="is3d && fileText">
      <p v-if="readError" class="error" role="alert">{{ readError }}</p>
      <p v-else-if="reading" class="muted" role="status">Reading the file…</p>
      <GcodeViewer v-else-if="parsed" :key="parseId" :parsed="parsed" :bed="{ x: machine.workArea.x, y: machine.workArea.y, keepOut: machine.keepOut }" />
    </template>
    <BedView
      v-else
      :machine="machine"
      :job="job"
      :part="part"
      :result="result"
      :paths="paths"
      :parts="allParts"
      :selected-id="selectedId ?? 0"
      @select="emit('select', $event)"
      @menu="(id, x, y) => emit('menu', id, x, y, null)"
    />
    </div>
    <PartsList v-if="allParts.length > 1" :parts="allParts" :selected-id="selectedId ?? 0" @select="emit('select', $event)" @menu="(id, x, y) => emit('menu', id, x, y, null)" />
    </div>

    <p v-if="fallback" class="notice small" role="status">{{ fallback }}</p>
    <ul v-if="problems.length" class="problems" role="status">
      <li v-for="p in problems" :key="p">{{ p }}</li>
    </ul>
    <label v-if="isPrintModel && !failure" class="check"><input :checked="reduced" type="checkbox" @change="toggleLighter" /> Lighter drawing (from above)</label>
  </div>
</template>

<style scoped>
.workspace { display: flex; flex-direction: column; gap: var(--rs-space-2); container-type: inline-size; }
.drawing { display: flex; flex-direction: column; gap: var(--rs-space-2); min-width: 0; }
.beside { display: flex; flex-direction: column; gap: var(--rs-space-3); }
@container (min-width: 640px) { .beside { display: grid; grid-template-columns: minmax(0, 1fr) 210px; align-items: start; } }
.toggle { display: inline-flex; align-self: flex-start; border: 1px solid var(--rs-line-strong); border-radius: 8px; overflow: hidden; }
.seg { min-height: 32px; padding: 0 var(--rs-space-3); font: inherit; font-size: var(--rs-text-xs); color: var(--rs-text-strong); background: transparent; border: 0; cursor: pointer; }
.seg.on { color: var(--rs-surface); background: var(--rs-text-strong); }
.seg:focus-visible { outline: 2px solid var(--rs-text-strong); outline-offset: -2px; }
.muted { margin: 0; color: var(--rs-text-muted); }
.small { font-size: var(--rs-text-xs); }
.notice { margin: 0; }
.error { margin: 0; }
.problems { margin: 0; padding: var(--rs-space-2) var(--rs-space-3) var(--rs-space-2) var(--rs-space-5); font-size: var(--rs-text-sm); font-weight: 600; color: var(--rs-text-strong); border: 1px solid var(--rs-line-strong); border-radius: 8px; }
.check { display: inline-flex; align-items: center; gap: var(--rs-space-1); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.check input { width: 16px; height: 16px; accent-color: var(--rs-text-strong); }
</style>
