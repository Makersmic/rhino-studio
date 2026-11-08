<script setup lang="ts">
/**
 * The bed from above, front at the bottom (as the Bed mesh map), with each Z lead screw where [z_tilt] puts it and a
 * tick box beside it: the ticked motors are the ones Move screws moves. Each screw also shows how far it has been
 * moved since unlocking and what the last Z-tilt asked of it.
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

const PAD = 70
const box = computed(() => {
  const l = props.layout
  const xs = [0, l.w, ...l.screws.map((s) => s.x)]
  const ys = [0, l.h, ...l.screws.map((s) => s.y)]
  const x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD
  const y0 = Math.min(...ys) - PAD, y1 = Math.max(...ys) + PAD
  return { x0, y0, w: x1 - x0, h: y1 - y0, y1 }
})
const px = (x: number) => x - box.value.x0
const py = (y: number) => box.value.y1 - y // front (Y 0) at the bottom
const pct = (x: number, y: number) => ({ left: `${(px(x) / box.value.w) * 100}%`, top: `${(py(y) / box.value.h) * 100}%` })
/** where the screw's arm meets the bed */
const near = (x: number, y: number) => ({ x: Math.min(Math.max(x, 0), props.layout.w), y: Math.min(Math.max(y, 0), props.layout.h) })
const mm = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(Math.abs(n) < 1 ? 2 : 1)} mm`
const R = 26
</script>

<template>
  <div class="map" :style="{ aspectRatio: `${box.w} / ${box.h}` }">
    <svg :viewBox="`0 0 ${box.w} ${box.h}`" role="img" :aria-label="`The bed seen from above, front at the bottom, with ${layout.screws.length} Z lead screws`">
      <!-- arms from each screw to the bed -->
      <line v-for="s in layout.screws" :key="`a${s.stepper}`" class="arm" :x1="px(s.x)" :y1="py(s.y)" :x2="px(near(s.x, s.y).x)" :y2="py(near(s.x, s.y).y)" />
      <rect class="bed" :x="px(0)" :y="py(layout.h)" :width="layout.w" :height="layout.h" rx="6" />
      <text class="front" :x="px(layout.w / 2)" :y="py(0) + 34" text-anchor="middle">FRONT</text>
      <!-- where Z-tilt probes -->
      <g v-for="(p, i) in layout.points" :key="`p${i}`" class="probe">
        <path :d="`M${px(p.x) - 9} ${py(p.y)}h18M${px(p.x)} ${py(p.y) - 9}v18`" />
        <circle :cx="px(p.x)" :cy="py(p.y)" r="14" />
      </g>
      <g v-for="s in layout.screws" :key="s.stepper" class="screw" :class="{ on: picked.includes(s.stepper), off: enabled[s.stepper] === false }">
        <circle :cx="px(s.x)" :cy="py(s.y)" :r="R" />
        <circle class="core" :cx="px(s.x)" :cy="py(s.y)" :r="R * 0.32" />
      </g>
    </svg>
    <label
      v-for="s in layout.screws"
      :key="`l${s.stepper}`"
      class="tag"
      :class="{ right: s.x < layout.w / 2, on: picked.includes(s.stepper) }"
      :style="pct(s.x, s.y)"
    >
      <input type="checkbox" :checked="picked.includes(s.stepper)" :disabled="disabled" @change="emit('toggle', s.stepper)" />
      <span class="txt">
        <strong>{{ s.label }}</strong>
        <small class="mono">{{ s.stepper }}<template v-if="enabled[s.stepper] === false"> · released</template></small>
        <small v-if="moved[s.stepper]" class="mono">moved {{ mm(moved[s.stepper]!) }}</small>
        <small v-if="tilt && tilt[s.stepper] != null" class="mono muted">Z-tilt {{ tilt[s.stepper]!.toFixed(3) }}</small>
      </span>
    </label>
  </div>
</template>

<style scoped>
.map { position: relative; width: 100%; max-height: 62vh; margin: 0 auto; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.bed { fill: var(--rs-surface-2); stroke: var(--rs-line-strong); stroke-width: 2; vector-effect: non-scaling-stroke; }
.front { font-size: 20px; letter-spacing: 0.2em; fill: var(--rs-text-muted); font-family: var(--rs-font-ui, inherit); }
.arm { stroke: var(--rs-line-strong); stroke-width: 1.5; stroke-dasharray: 6 5; vector-effect: non-scaling-stroke; }
.probe path { stroke: var(--rs-text-muted); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.probe circle { fill: none; stroke: var(--rs-text-muted); stroke-width: 1; vector-effect: non-scaling-stroke; }
.screw circle { fill: var(--rs-surface); stroke: var(--rs-ink); stroke-width: 2; vector-effect: non-scaling-stroke; }
.screw .core { fill: var(--rs-ink); }
.screw.on circle { fill: var(--rs-ink); }
.screw.on .core { fill: var(--rs-on-ink); }
.screw.off circle:first-child { stroke-dasharray: 5 4; }

.tag {
  position: absolute; display: flex; align-items: flex-start; gap: 6px; transform: translate(calc(-100% - 22px), -50%);
  background: var(--rs-surface); color: var(--rs-text); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md);
  padding: 5px 8px; font-size: var(--rs-text-xs); line-height: 1.3; cursor: pointer; white-space: nowrap;
}
.tag.right { transform: translate(22px, -50%); }
.tag.on { box-shadow: inset 3px 0 0 var(--rs-ink); }
.tag input { margin: 2px 0 0; }
.txt { display: flex; flex-direction: column; }
.txt strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.mono { font-family: var(--rs-font-code); font-size: 11px; }
.muted { color: var(--rs-text-muted); }
@container (max-width: 520px) {
  .tag { padding: 3px 6px; transform: translate(calc(-100% - 12px), -50%); }
  .tag.right { transform: translate(12px, -50%); }
  .tag small:not(:nth-of-type(1)) { display: none; }
}
</style>
