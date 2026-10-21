<script setup lang="ts">
/**
 * The bed seen from above, as you stand at the front of the machine: front at
 * the bottom, X to the right. No 3D, no rotating: the most common complaint
 * about Mainsail's heightmap is that it opens from a confusing corner and has
 * to be turned before it means anything (mainsail #993).
 *
 * - The whole bed is drawn (travel from Klipper) with the probed area on it.
 * - Shading: blue below the average, amber above, stronger the further away,
 *   on a scale that starts fixed at ±0.25 mm (see scaleFor), so a flat bed
 *   stays pale. Between points it is a straight-line blend.
 * - The numbers are the probed values, as Klipper measured them (mm).
 * - Text keeps the same size on screen whatever the map's width (a phone
 *   shows the whole bed at a third of the size), so it stays readable.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { sampleAt, scalePos, xAt, yAt, type MeshParams } from './mesh'

const props = withDefaults(
  defineProps<{
    points: number[][]
    params: MeshParams
    /** Bed travel (mm): the outline */
    bedW: number
    bedH: number
    mean: number
    /** Scale half-width (mm) */
    half: number
    values?: boolean
    /** What the numbers are (for screen readers) */
    label: string
    /** Mark the highest and lowest points */
    extremes?: boolean
  }>(),
  { values: true, extremes: true },
)

const W = computed(() => Math.max(props.bedW, props.params.maxX + 10))
const H = computed(() => Math.max(props.bedH, props.params.maxY + 10))
// Room for the axis labels, in screen pixels turned into map units
const PAD = computed(() => {
  const u = unitsPerPx.value
  return { l: 40 * u, r: 12 * u, t: 22 * u, b: 44 * u }
})
const viewBox = computed(() => `${-PAD.value.l} ${-PAD.value.t} ${W.value + PAD.value.l + PAD.value.r} ${H.value + PAD.value.t + PAD.value.b}`)
const sy = (y: number) => H.value - y // SVG y runs down; the front (Y 0) is at the bottom

// Shading cells across the probed area
const cells = computed(() => {
  const p = props.params
  const w = p.maxX - p.minX, h = p.maxY - p.minY
  const nx = Math.max(1, Math.min(60, Math.round(w / 9)))
  const ny = Math.max(1, Math.min(40, Math.round(h / 9)))
  const cw = w / nx, ch = h / ny
  const out: { x: number; y: number; w: number; h: number; fill: string; op: number }[] = []
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const cx = p.minX + (i + 0.5) * cw, cy = p.minY + (j + 0.5) * ch
      const t = scalePos(sampleAt(props.points, p, cx, cy), props.mean, props.half)
      out.push({ x: p.minX + i * cw, y: sy(p.minY + (j + 1) * ch), w: cw, h: ch, fill: t < 0 ? 'var(--rs-mesh-low)' : 'var(--rs-mesh-high)', op: Math.abs(t) * 0.88 })
    }
  return out
})

const probes = computed(() => {
  const p = props.params
  let lo = Infinity, hi = -Infinity
  for (const r of props.points) for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  return props.points.flatMap((row, j) =>
    row.map((v, i) => ({
      x: xAt(p, i),
      y: sy(yAt(p, j)),
      v,
      mark: props.extremes && hi - lo > 1e-6 ? (v === hi ? 'hi' : v === lo ? 'lo' : null) : null,
    })),
  )
})
const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2))
const xTicks = computed(() => Array.from({ length: props.params.xCount }, (_, i) => xAt(props.params, i)))
const yTicks = computed(() => Array.from({ length: props.params.yCount }, (_, j) => yAt(props.params, j)))
// Keep labels apart on dense meshes
const every = (n: number, span: number) => Math.max(1, Math.ceil((n * 34) / Math.max(span, 1)))
const xEvery = computed(() => every(props.params.xCount, props.params.maxX - props.params.minX))
const yEvery = computed(() => every(props.params.yCount, props.params.maxY - props.params.minY))
// Map units per screen pixel, from the drawn width: text is about 11 px on screen at any size
const svg = ref<SVGSVGElement | null>(null)
const unitsPerPx = ref(1)
let ro: ResizeObserver | null = null
onMounted(() => {
  const measure = () => {
    const r = svg.value?.getBoundingClientRect()
    // "meet": the drawing is scaled by whichever side is tighter
    if (r && r.width > 0 && r.height > 0)
      // The margins are fixed in pixels (52 across, 66 down), the bed is in mm: solve for mm per pixel
      unitsPerPx.value = Math.max(W.value / Math.max(r.width - 52, 40), H.value / Math.max(r.height - 66, 40))
  }
  measure()
  if (typeof ResizeObserver !== 'undefined' && svg.value) {
    ro = new ResizeObserver(measure)
    ro.observe(svg.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())
const fontSize = computed(() => 12.5 * unitsPerPx.value)
</script>

<template>
  <svg ref="svg" class="map" :viewBox="viewBox" role="img" :aria-label="label" preserveAspectRatio="xMidYMid meet">
    <title>{{ label }}</title>
    <!-- the bed -->
    <rect class="bed" x="0" y="0" :width="W" :height="H" rx="6" />
    <!-- shading over the probed area -->
    <g class="shade" shape-rendering="crispEdges">
      <rect v-for="(c, k) in cells" :key="k" :x="c.x" :y="c.y" :width="c.w" :height="c.h" :fill="c.fill" :fill-opacity="c.op" />
    </g>
    <rect class="area" :x="params.minX" :y="sy(params.maxY)" :width="params.maxX - params.minX" :height="params.maxY - params.minY" />
    <!-- probed points -->
    <g class="probes" :style="{ fontSize: `${fontSize}px` }">
      <g v-for="(p, k) in probes" :key="k">
        <circle v-if="p.mark" class="ring" :cx="p.x" :cy="p.y" :r="fontSize * 0.5" :stroke-width="unitsPerPx * 1.4" />
        <circle class="dot" :cx="p.x" :cy="p.y" :r="unitsPerPx * 2.4" />
        <text v-if="values" class="val" :x="p.x" :y="p.y - fontSize * 0.55" text-anchor="middle">{{ fmt(p.v) }}</text>
      </g>
    </g>
    <!-- axes: probe columns along the front edge, rows along the left -->
    <g class="axis" :style="{ fontSize: `${fontSize * 0.85}px` }">
      <template v-for="(x, i) in xTicks" :key="`x${i}`">
        <line :x1="x" :x2="x" :y1="H" :y2="H + 5" />
        <text v-if="i % xEvery === 0 || i === xTicks.length - 1" :x="x" :y="H + 6 + fontSize * 0.85" text-anchor="middle">{{ Math.round(x) }}</text>
      </template>
      <template v-for="(y, j) in yTicks" :key="`y${j}`">
        <line :x1="-5" :x2="0" :y1="sy(y)" :y2="sy(y)" />
        <text v-if="j % yEvery === 0 || j === yTicks.length - 1" :x="-8" :y="sy(y) + fontSize * 0.3" text-anchor="end">{{ Math.round(y) }}</text>
      </template>
      <text class="front" :x="W / 2" :y="H + PAD.b - 6 * unitsPerPx" text-anchor="middle">FRONT</text>
    </g>
  </svg>
</template>

<style scoped>
.map { display: block; width: 100%; height: auto; max-height: 62vh; }
.bed { fill: var(--rs-surface-2); stroke: var(--rs-line-strong); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.area { fill: none; stroke: var(--rs-line-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
.dot { fill: var(--rs-ink); }
.ring { fill: none; stroke: var(--rs-ink); }
.val {
  font-family: var(--rs-font-code);
  font-weight: 600;
  fill: var(--rs-text-strong);
  paint-order: stroke;
  stroke: var(--rs-surface-2);
  stroke-width: 0.25em;
  stroke-linejoin: round;
}
.axis { font-family: var(--rs-font-code); fill: var(--rs-text-muted); }
.axis line { stroke: var(--rs-line-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
.front { font-family: var(--rs-font-ui); font-weight: 600; letter-spacing: 0.18em; fill: var(--rs-text); }
</style>
