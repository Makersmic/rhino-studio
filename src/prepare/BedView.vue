<script setup lang="ts">
/**
 * The bed seen from above, to scale: where the part sits, and after Prepare,
 * where the file's moves actually go.
 *
 *   print heads, laser, knife   the machine's work area (550 x 375), machine X/Y.
 *                               Drag the part, or use the arrow keys (Shift = 10 mm).
 *                               Print heads also show the prime line, kept clear.
 *   CNC                         the stock, with X0 Y0 at its front-left corner:
 *                               CNC_JOB_SETUP sets that corner on the machine,
 *                               so there is nothing to place.
 */
import { computed, ref } from 'vue'
import type { MachineInfo, PartInfo, PrepareJob } from '@/slicer/types'
import { cncStock } from '@/slicer/kiriSettings'

const props = defineProps<{
  machine: MachineInfo
  job: PrepareJob
  part: PartInfo | null
  /** where the prepared file's moves go (min/max X/Y), if prepared */
  result: { min: [number, number, number]; max: [number, number, number] } | null
}>()

const isCnc = computed(() => props.job.process === 'cnc')
const stock = computed(() => (props.part && isCnc.value ? cncStock(props.job, props.part) : null))

/** The drawing area in mm: the bed, or the stock with a margin */
const area = computed(() => {
  if (stock.value) return { w: stock.value.x, h: stock.value.y }
  return { w: props.machine.workArea.x, h: props.machine.workArea.y }
})
/** dither dot spacing: about 1/180 of the drawing */
const dot = computed(() => Math.max(area.value.w, area.value.h) / 180)
const pad = computed(() => Math.max(area.value.w, area.value.h) * 0.04)
const view = computed(() => `${-pad.value} ${-pad.value} ${area.value.w + 2 * pad.value} ${area.value.h + 2 * pad.value}`)
/** SVG y grows downwards; the machine's Y grows away from you */
const fy = (y: number) => area.value.h - y

const centre = computed(() => (stock.value ? { x: stock.value.x / 2, y: stock.value.y / 2 } : { x: props.job.placement.x, y: props.job.placement.y }))
const outline = computed(() => (props.part ? props.part.footprint.map(([x, y]) => `${(centre.value.x + x).toFixed(2)},${fy(centre.value.y + y).toFixed(2)}`).join(' ') : ''))
const box = computed(() => {
  if (!props.part) return null
  const { x, y } = props.part.size
  return { x: centre.value.x - x / 2, y: fy(centre.value.y + y / 2), w: x, h: y }
})

const grid = computed(() => {
  const step = area.value.w > 200 ? 50 : area.value.w > 60 ? 10 : 5
  const xs: number[] = []
  const ys: number[] = []
  for (let v = step; v < area.value.w; v += step) xs.push(v)
  for (let v = step; v < area.value.h; v += step) ys.push(v)
  return { step, xs, ys }
})

const prime = computed(() => {
  const p = props.machine.prime
  if (!p || props.job.process !== 'fdm') return null
  return { x: Math.max(0, p.x - 2), y: fy(p.y + p.length), w: 4, h: p.length }
})

/** Leadscrew and other no-go areas (bed processes only; a CNC job is drawn on its stock) */
const keepOut = computed(() => (isCnc.value ? [] : props.machine.keepOut.map((k) => ({ ...k, x: k.x0, y: fy(k.y1), w: k.x1 - k.x0, h: k.y1 - k.y0 }))))

const fileBox = computed(() => {
  const r = props.result
  if (!r) return null
  return { x: r.min[0], y: fy(r.max[1]), w: Math.max(0.1, r.max[0] - r.min[0]), h: Math.max(0.1, r.max[1] - r.min[1]) }
})

// ---- moving the part (not CNC)
const svg = ref<SVGSVGElement | null>(null)
let grab: { dx: number; dy: number } | null = null
const toMm = (e: PointerEvent) => {
  const m = svg.value?.getScreenCTM()
  if (!m) return null
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return { x: p.x, y: area.value.h - p.y }
}
const clampX = (x: number) => {
  const half = (props.part?.size.x ?? 0) / 2
  return Math.round(Math.min(Math.max(x, half), area.value.w - half) * 2) / 2
}
const clampY = (y: number) => {
  const half = (props.part?.size.y ?? 0) / 2
  return Math.round(Math.min(Math.max(y, half), area.value.h - half) * 2) / 2
}
function down(e: PointerEvent) {
  if (isCnc.value || !props.part) return
  const p = toMm(e)
  if (!p) return
  grab = { dx: props.job.placement.x - p.x, dy: props.job.placement.y - p.y }
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (!grab) return
  const p = toMm(e)
  if (!p) return
  props.job.placement.x = clampX(p.x + grab.dx)
  props.job.placement.y = clampY(p.y + grab.dy)
}
function up() {
  grab = null
}
function key(e: KeyboardEvent) {
  if (isCnc.value) return
  const s = e.shiftKey ? 10 : 1
  const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }
  const v = d[e.key]
  if (!v) return
  e.preventDefault()
  props.job.placement.x = clampX(props.job.placement.x + v[0])
  props.job.placement.y = clampY(props.job.placement.y + v[1])
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString()
</script>

<template>
  <figure class="bed">
    <svg ref="svg" :viewBox="view" role="img" :aria-label="isCnc ? 'Stock seen from above' : 'Bed seen from above'" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- dither and hatch sized to the drawing, so they look the same on a 550 mm bed and a 40 mm stock -->
        <pattern id="bed-dither" :width="dot * 2" :height="dot * 2" patternUnits="userSpaceOnUse">
          <circle :cx="dot * 0.5" :cy="dot * 0.5" :r="dot * 0.32" fill="currentColor" />
          <circle :cx="dot * 1.5" :cy="dot * 1.5" :r="dot * 0.32" fill="currentColor" />
        </pattern>
        <pattern id="bed-hatch" :width="dot * 2.5" :height="dot * 2.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" :y2="dot * 2.5" stroke="currentColor" :stroke-width="dot * 0.6" />
        </pattern>
      </defs>

      <rect class="plate" x="0" y="0" :width="area.w" :height="area.h" rx="1.5" />
      <g class="grid">
        <line v-for="x in grid.xs" :key="'x' + x" :x1="x" :x2="x" y1="0" :y2="area.h" />
        <line v-for="y in grid.ys" :key="'y' + y" x1="0" :x2="area.w" :y1="fy(y)" :y2="fy(y)" />
      </g>

      <g v-if="prime" class="prime">
        <rect :x="prime.x" :y="prime.y" :width="prime.w" :height="prime.h" fill="url(#bed-hatch)" />
      </g>

      <g v-for="k in keepOut" :key="k.label + k.x" class="keepout">
        <rect :x="k.x" :y="k.y" :width="k.w" :height="k.h" fill="url(#bed-hatch)" />
        <rect :x="k.x" :y="k.y" :width="k.w" :height="k.h" class="koedge" />
        <rect :x="k.x + k.w / 2 - dot * 10" :y="k.y + k.h / 2 - dot * 2.6" :width="dot * 20" :height="dot * 5.2" :rx="dot" class="kolabel" />
        <text :x="k.x + k.w / 2" :y="k.y + k.h / 2" :font-size="dot * 3.4" text-anchor="middle" dominant-baseline="central">{{ k.label }}</text>
      </g>

      <!-- origin: front-left corner -->
      <g class="origin">
        <path :d="`M0 ${area.h} l${area.w * 0.06} 0 M0 ${area.h} l0 ${-area.h * 0.08}`" />
      </g>

      <g v-if="part" class="part" :class="{ movable: !isCnc }" tabindex="0" :aria-label="isCnc ? `Part in the stock` : `Part at X ${fmt(job.placement.x)} Y ${fmt(job.placement.y)}. Arrow keys move it.`" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key">
        <rect v-if="box" class="box" :x="box.x" :y="box.y" :width="box.w" :height="box.h" />
        <polygon :points="outline" class="shape" fill="url(#bed-dither)" />
        <polygon :points="outline" class="edge" />
      </g>

      <rect v-if="fileBox" class="filebox" :x="fileBox.x" :y="fileBox.y" :width="fileBox.w" :height="fileBox.h" />
    </svg>
    <figcaption>
      <span v-if="isCnc">Stock {{ stock ? `${fmt(stock.x)} × ${fmt(stock.y)} × ${fmt(stock.z)} mm` : '' }} · X0 Y0 front-left corner · Z0 stock top</span>
      <span v-else>Bed {{ fmt(machine.workArea.x) }} × {{ fmt(machine.workArea.y) }} mm · X0 Y0 front-left<template v-if="prime || keepOut.length"> · hatched: {{ [prime ? 'prime line' : '', keepOut.length ? 'keep clear' : ''].filter(Boolean).join(', ') }}</template></span>
      <span v-if="result" class="file">Outline: where the file's moves go</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.bed { margin: 0; display: flex; flex-direction: column; gap: var(--rs-space-2); }
svg { width: 100%; height: auto; max-height: 62vh; display: block; color: var(--rs-text-strong); touch-action: none; }
.plate { fill: var(--rs-surface-2); stroke: var(--rs-line-strong); stroke-width: 0.6; vector-effect: non-scaling-stroke; }
.grid line { stroke: var(--rs-line); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-dasharray: 1 3; }
.origin path { stroke: var(--rs-text-strong); stroke-width: 2; fill: none; vector-effect: non-scaling-stroke; }
.prime { color: var(--rs-text-muted); }
.keepout { color: var(--rs-text-muted); }
.kolabel { fill: var(--rs-surface-2); }
.koedge { fill: none; stroke: var(--rs-text-muted); stroke-width: 1; vector-effect: non-scaling-stroke; }
.keepout text { fill: var(--rs-text-strong); font-family: var(--rs-font-ui); font-weight: 600; }
.part { outline: none; }
.part.movable { cursor: grab; }
.part.movable:active { cursor: grabbing; }
.part:focus-visible .edge { stroke-width: 3; }
.box { fill: none; stroke: var(--rs-text-muted); stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.shape { color: var(--rs-text-strong); }
.edge { fill: none; stroke: var(--rs-text-strong); stroke-width: 1.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.filebox { fill: none; stroke: var(--rs-text-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
figcaption { display: flex; flex-wrap: wrap; gap: var(--rs-space-2) var(--rs-space-4); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
</style>
