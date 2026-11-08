<script setup lang="ts">
/**
 * The bed from above, front at the bottom (as the Bed mesh map), with each Z lead screw and a tick box beside it: the
 * ticked motors are the ones Move screws moves. Each screw also shows how far it has been moved since unlocking and
 * what the last Z-tilt asked of it.
 *
 * Drawn by place, not to scale (Mike, Nov 8: "more uniform"): each screw sits just off the bed at its corner or edge
 * (front left, rear centre ...) from screwLabel, so the drawing is symmetric and every label card is the same size in
 * the same spot relative to its screw. Real z_positions can be lopsided (the Rhino's front right is 146 mm off the bed,
 * front left 17 mm); when two screws share a place the true positions are used instead. Probe points stay true.
 */
import { computed } from 'vue'
import type { BedLayout } from './zscrews'

const props = defineProps<{
  layout: BedLayout
  picked: string[]
  /** mm moved per stepper since unlocking (bed up is +) */
  moved: Record<string, number>
  /** the last Z-tilt's first adjustment per stepper, as Klipper printed it */
  tilt: Record<string, number> | null
  /** stepper_enable: false = switched off (turns by hand) */
  enabled: Record<string, boolean>
  disabled?: boolean
}>()
const emit = defineEmits<{ toggle: [stepper: string] }>()

const W = computed(() => props.layout.w)
const H = computed(() => props.layout.h)
const M = computed(() => Math.round(Math.max(W.value, H.value) * 0.09))
/** where each screw is drawn: by place (front/rear x left/centre/right), or true when places repeat */
const spots = computed(() => {
  const s = props.layout.screws
  const byPlace = new Set(s.map((x) => x.label)).size === s.length
  return s.map((x) => {
    if (!byPlace) return { ...x, dx: x.x, dy: x.y, front: x.y < H.value / 2 }
    const [fb, lr] = x.label.split(' ')
    const front = fb === 'Front'
    return { ...x, dx: lr === 'left' ? -M.value : lr === 'right' ? W.value + M.value : W.value / 2, dy: front ? -M.value : H.value + M.value, front }
  })
})
const box = computed(() => {
  const xs = [0, W.value, ...spots.value.map((s) => s.dx)]
  const ys = [0, H.value, ...spots.value.map((s) => s.dy)]
  const pad = M.value * 0.6
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad
  return { x0, w: x1 - x0, h: y1 - y0, y1 }
})
const px = (x: number) => x - box.value.x0
const py = (y: number) => box.value.y1 - y // front (Y 0) at the bottom
const pct = (x: number, y: number) => ({ left: `${(px(x) / box.value.w) * 100}%`, top: `${(py(y) / box.value.h) * 100}%` })
/** where the screw's arm meets the bed */
const near = (x: number, y: number) => ({ x: Math.min(Math.max(x, 0), W.value), y: Math.min(Math.max(y, 0), H.value) })
const mm = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(2)} mm`
const R = computed(() => M.value * 0.38)
const anyOff = computed(() => props.layout.screws.some((s) => props.enabled[s.stepper] === false))
</script>

<template>
  <div class="frame">
    <div class="map" :style="{ aspectRatio: `${box.w} / ${box.h}` }">
      <svg :viewBox="`0 0 ${box.w} ${box.h}`" role="img" :aria-label="`The bed seen from above, front at the bottom, with ${layout.screws.length} Z lead screws`">
        <line v-for="s in spots" :key="`a${s.stepper}`" class="arm" :x1="px(s.dx)" :y1="py(s.dy)" :x2="px(near(s.dx, s.dy).x)" :y2="py(near(s.dx, s.dy).y)" />
        <rect class="bed" :x="px(0)" :y="py(H)" :width="W" :height="H" rx="6" />
        <text class="front" :x="px(W / 2)" :y="py(H / 2)" text-anchor="middle" dominant-baseline="middle">FRONT ↓</text>
        <g v-for="(p, i) in layout.points" :key="`p${i}`" class="probe">
          <path :d="`M${px(p.x) - 9} ${py(p.y)}h18M${px(p.x)} ${py(p.y) - 9}v18`" />
          <circle :cx="px(p.x)" :cy="py(p.y)" r="14" />
        </g>
        <g v-for="s in spots" :key="s.stepper" class="screw" :class="{ on: picked.includes(s.stepper), off: enabled[s.stepper] === false }">
          <circle :cx="px(s.dx)" :cy="py(s.dy)" :r="R" />
          <circle class="core" :cx="px(s.dx)" :cy="py(s.dy)" :r="R * 0.32" />
        </g>
      </svg>
      <label
        v-for="s in spots"
        :key="`l${s.stepper}`"
        class="tag"
        :class="{ below: s.front, on: picked.includes(s.stepper) }"
        :style="pct(s.dx, s.dy)"
      >
        <span class="head"><input type="checkbox" :checked="picked.includes(s.stepper)" :disabled="disabled" @change="emit('toggle', s.stepper)" /><strong>{{ s.label }}</strong></span>
        <small class="mono">{{ s.stepper }}<template v-if="enabled[s.stepper] === false"> · motor off</template></small>
        <small class="mono">moved {{ mm(moved[s.stepper] ?? 0) }}</small>
        <small class="mono muted">Z-tilt {{ tilt && tilt[s.stepper] != null ? tilt[s.stepper]!.toFixed(3) : '–' }}</small>
      </label>
    </div>
    <p class="legend">
      <span><i class="k screw-k" /> lead screw</span>
      <span><i class="k screw-k on" /> ticked</span>
      <span v-if="anyOff"><i class="k screw-k off" /> motor off: turns by hand (Klipper also switches motors off when idle)</span>
      <span><i class="k probe-k" /> where Z-tilt probes</span>
      <span class="muted">Screws drawn by place, not to scale.</span>
    </p>
  </div>
</template>

<style scoped>
/* room above and below the drawing for the label cards */
.frame { padding: 96px 64px 0; }
.map { position: relative; width: 100%; max-height: 52vh; margin: 0 auto; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.bed { fill: var(--rs-surface-2); stroke: var(--rs-line-strong); stroke-width: 2; vector-effect: non-scaling-stroke; }
.front { font-size: 22px; letter-spacing: 0.2em; fill: var(--rs-text-muted); }
.arm { stroke: var(--rs-line-strong); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.probe path { stroke: var(--rs-text-muted); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.probe circle { fill: none; stroke: var(--rs-text-muted); stroke-width: 1; vector-effect: non-scaling-stroke; }
.screw circle { fill: var(--rs-surface); stroke: var(--rs-ink); stroke-width: 2; vector-effect: non-scaling-stroke; }
.screw .core { fill: var(--rs-ink); }
.screw.on circle { fill: var(--rs-ink); }
.screw.on .core { fill: var(--rs-on-ink); }
.screw.off circle:first-child { stroke-dasharray: 5 4; }

/* every card the same size, centred on its screw: above for rear screws, below for front ones */
.tag {
  position: absolute; width: 148px; box-sizing: border-box; display: flex; flex-direction: column; gap: 1px;
  transform: translate(-50%, calc(-100% - 30px));
  background: var(--rs-surface); color: var(--rs-text); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md);
  padding: 6px 8px; font-size: var(--rs-text-xs); line-height: 1.3; cursor: pointer; white-space: nowrap;
}
.tag.below { transform: translate(-50%, 30px); }
.tag.on { box-shadow: inset 3px 0 0 var(--rs-ink); }
.head { display: flex; align-items: center; gap: 6px; }
.head input { margin: 0; }
.head strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.mono { font-family: var(--rs-font-code); font-size: 11px; }
.muted { color: var(--rs-text-muted); }

.legend { display: flex; flex-wrap: wrap; gap: 4px var(--rs-space-4); margin: 104px 0 0; font-size: var(--rs-text-xs); color: var(--rs-text); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.k { display: inline-block; width: 12px; height: 12px; border-radius: 50%; box-sizing: border-box; }
.screw-k { border: 2px solid var(--rs-ink); background: var(--rs-surface); }
.screw-k.on { background: var(--rs-ink); }
.screw-k.off { border-style: dashed; }
.probe-k { border: 1px solid var(--rs-text-muted); background: linear-gradient(var(--rs-text-muted), var(--rs-text-muted)) center / 8px 1.5px no-repeat, linear-gradient(var(--rs-text-muted), var(--rs-text-muted)) center / 1.5px 8px no-repeat; }
@container (max-width: 520px) {
  .frame { padding: 78px 44px 0; }
  .tag { width: 112px; padding: 4px 6px; }
  .tag small:nth-of-type(3) { display: none; }
  .legend { margin-top: 84px; }
}
</style>
