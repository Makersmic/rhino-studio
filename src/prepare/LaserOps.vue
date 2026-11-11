<script setup lang="ts">
/**
 * Job setup › Settings, laser: operations, after LaserWeb's CAM list (Mike, Nov 11). Each operation is a cut, a score
 * or an engrave fill with its own power, speed and passes, for the loops picked on the drawing below; they run top to
 * bottom, then everything not picked, with the settings above. Logic in src/slicer/laserOps.ts.
 */
import { computed, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import NumField from './NumField.vue'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import { lastCut } from '@/tuning/cutTests'
import { assign, drawingBox, newOp, opTitle, opsWarnings, toggleLoop, within, type Loop } from '@/slicer/laserOps'
import type { LaserOp } from '@/slicer/types'

const prep = usePrepareStore()
const tuning = useTuningStore()
const job = computed(() => prep.job!)
const ops = computed(() => job.value.laser.ops ?? [])
const loops = computed(() => prep.laserLoops)
const picking = ref<string | null>(null)

const KINDS: { value: LaserOp['kind']; label: string }[] = [
  { value: 'cut', label: 'Cut' }, { value: 'score', label: 'Score' }, { value: 'fill', label: 'Engrave fill' },
]
function add(kind: LaserOp['kind']) {
  const l = job.value.laser
  const mat = prep.materialsOf(job.value.toolhead).find((m) => m.key === job.value.material)?.name
  const t = (v: 'laser_engrave_power' | 'laser_engrave_speed') => lastCut(tuning.state?.runs, job.value.toolhead, v, mat)?.value
  const o = newOp(kind, l, { power: t('laser_engrave_power'), feed: t('laser_engrave_speed') })
  l.ops = [...ops.value, o]
  picking.value = o.id
  if (!loops.value) void prep.findLoops()
}
function move(i: number, d: -1 | 1) {
  const a = [...ops.value]
  ;[a[i], a[i + d]] = [a[i + d]!, a[i]!]
  job.value.laser.ops = a
}
function remove(i: number) {
  const a = [...ops.value]
  if (a[i]?.id === picking.value) picking.value = null
  a.splice(i, 1)
  job.value.laser.ops = a
}
function click(l: Loop) {
  const k = ops.value.findIndex((o) => o.id === picking.value)
  if (k < 0 || !loops.value) return
  const a = ops.value.map((o) => ({ ...o, loops: [...o.loops] }))
  toggleLoop(a, k, l, loops.value)
  job.value.laser.ops = a
}

// ---- the drawing
const got = computed(() => (loops.value ? assign(ops.value, loops.value) : null))
const warnings = computed(() => (loops.value ? opsWarnings(ops.value, loops.value) : []))
const box = computed(() => (loops.value?.length ? drawingBox(loops.value) : null))
const view = computed(() => {
  const b = box.value
  if (!b) return '0 0 1 1'
  const m = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.04 + 1
  return `${b.x0 - m} ${-(b.y1 + m)} ${b.x1 - b.x0 + 2 * m} ${b.y1 - b.y0 + 2 * m}`
})
const d = (l: Loop) => 'M' + l.pts.map((p) => `${p[0].toFixed(2)} ${(-p[1]).toFixed(2)}`).join('L') + (l.closed ? 'Z' : '')
/** For each loop: the operations that picked it (numbers), and how to draw it */
const marks = computed(() =>
  (loops.value ?? []).map((_, i) => {
    const on = ops.value.map((o, k) => ({ o, k })).filter(({ k }) => got.value?.picked[k]?.includes(i))
    const cur = on.find(({ o }) => o.id === picking.value)
    const line = on.find(({ o }) => o.kind !== 'fill')?.o.kind ?? (on.length ? null : 'rest')
    return { nums: on.map(({ k }) => k + 1), cur: !!cur, fill: on.some(({ o }) => o.kind === 'fill'), line }
  }),
)
/** where a loop's operation numbers go: its middle, or inside its top-left corner when other loops sit inside it */
const centre = (l: Loop) => {
  if (loops.value?.some((o) => within(o, l))) return { x: l.box.x0 + label.value * 1.6, y: -l.box.y1 + label.value * 1.4 }
  return { x: (l.box.x0 + l.box.x1) / 2, y: -(l.box.y0 + l.box.y1) / 2 }
}
const label = computed(() => (box.value ? Math.max(box.value.x1 - box.value.x0, box.value.y1 - box.value.y0) / 28 : 1))
const picked = (i: number) => got.value?.picked[i]?.length ?? 0
</script>

<template>
  <section class="ops wide">
    <header class="ops-head">
      <h3>Operations</h3>
      <span class="muted small">Different settings for parts of the drawing. They run top to bottom, then everything else.</span>
    </header>

    <ol v-if="ops.length" class="list">
      <li v-for="(o, i) in ops" :key="o.id" class="op" :class="{ picking: picking === o.id }">
        <div class="row1">
          <span class="n">{{ i + 1 }}</span>
          <select v-model="o.kind" :aria-label="`Operation ${i + 1}: kind`">
            <option v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
          <input v-model="o.name" class="name" maxlength="40" :placeholder="opTitle({ ...o, name: '' }, i)" :aria-label="`Operation ${i + 1}: name`" />
          <span class="tools">
            <button type="button" class="ic" :disabled="i === 0" aria-label="Move up" title="Move up" @click="move(i, -1)">↑</button>
            <button type="button" class="ic" :disabled="i === ops.length - 1" aria-label="Move down" title="Move down" @click="move(i, 1)">↓</button>
            <button type="button" class="ic" aria-label="Remove" title="Remove" @click="remove(i)">✕</button>
          </span>
        </div>
        <div class="row2">
          <NumField v-model="o.power" label="Power" unit="%" :min="0.01" :max="1" :step="0.05" percent />
          <NumField v-model="o.feed" label="Speed" unit="mm/min" :min="10" :max="12000" :step="50" />
          <NumField v-model="o.passes" label="Passes" :min="1" :max="20" />
          <template v-if="o.kind === 'fill'">
            <NumField v-model="o.spacing" label="Line spacing" unit="mm" :min="0.05" :max="2" :step="0.05" />
            <NumField v-model="o.angle" label="Angle" unit="°" :min="0" :max="180" :step="15" />
          </template>
        </div>
        <div class="row3">
          <span class="muted small">{{ picked(i) ? `${picked(i)} loop${picked(i) === 1 ? '' : 's'}` : 'No loops picked yet' }}{{ o.kind === 'fill' ? ' · pick a hole too to leave it empty' : '' }}</span>
          <RsButton size="sm" :variant="picking === o.id ? 'primary' : 'default'" @click="picking = picking === o.id ? null : o.id">{{ picking === o.id ? 'Done picking' : 'Pick loops' }}</RsButton>
        </div>
      </li>
      <li class="op rest">
        <span class="n">{{ ops.length + 1 }}</span>
        <span><strong>Everything else</strong> <span class="muted small">· cut with the settings above{{ got ? ` · ${got.rest.length} loop${got.rest.length === 1 ? '' : 's'}` : '' }}</span></span>
      </li>
    </ol>

    <div class="adds">
      <span class="muted small">Add</span>
      <RsButton size="sm" @click="add('cut')">Cut</RsButton>
      <RsButton size="sm" @click="add('score')">Score</RsButton>
      <RsButton size="sm" @click="add('fill')">Engrave fill</RsButton>
    </div>

    <ul v-if="warnings.length" class="warn">
      <li v-for="w in warnings" :key="w">{{ w }}</li>
    </ul>

    <!-- the drawing's loops: click to pick for the operation being picked -->
    <div v-if="ops.length" class="draw" :class="{ armed: !!picking }">
      <p v-if="prep.loopsError" class="warn-text">{{ prep.loopsError }}</p>
      <p v-else-if="!loops" class="muted small">
        <template v-if="prep.findingLoops">Finding the loops…</template>
        <template v-else>The loops show once the drawing is sliced. <RsButton size="sm" @click="prep.findLoops()">Find the loops</RsButton></template>
      </p>
      <template v-else>
        <p class="muted small">{{ picking ? `Click loops for ${opTitle(ops.find((o) => o.id === picking)!, ops.findIndex((o) => o.id === picking))}; click again to take one off.` : 'Press Pick loops on an operation, then click loops here.' }}</p>
        <svg :viewBox="view" class="svg" role="img" aria-label="The drawing’s loops">
          <defs>
            <pattern id="ops-hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="1.2" class="hl" />
            </pattern>
          </defs>
          <g v-for="(l, i) in loops" :key="i" class="loop" :class="[`k-${marks[i]?.line ?? 'none'}`, { cur: marks[i]?.cur }]" @click="click(l)">
            <path v-if="marks[i]?.fill" :d="d(l)" class="fillarea" />
            <path :d="d(l)" class="hit" />
            <path :d="d(l)" class="ln" />
            <text v-if="marks[i]?.nums.length" :x="centre(l).x" :y="centre(l).y" :font-size="label" class="num">{{ marks[i]!.nums.join(' ') }}</text>
          </g>
        </svg>
        <p class="legend muted small"><span class="sw solid" /> cut <span class="sw dash" /> score <span class="sw hatch" /> fill <span class="sw thin" /> everything else</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.ops { display: flex; flex-direction: column; gap: var(--rs-space-3); padding-top: var(--rs-space-3); border-top: 1px dotted var(--rs-line-strong); }
.ops-head { display: flex; flex-direction: column; gap: 2px; }
.ops-head h3 { margin: 0; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.op { border: 1px solid var(--rs-line); border-left: 3px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--rs-surface); }
.op.picking { border-left-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.op.rest { flex-direction: row; align-items: center; gap: 10px; font-size: var(--rs-text-sm); border-left-style: dashed; }
.row1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row1 select, .name { height: 32px; padding: 0 8px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.name { flex: 1 1 140px; min-width: 0; }
@media (max-width: 560px) { .name { order: 3; flex-basis: 100%; } .tools { margin-left: auto; } }
.n { width: 22px; height: 22px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 11px; background: var(--rs-ink); color: var(--rs-on-ink); }
.rest .n { background: transparent; color: var(--rs-text-muted); box-shadow: inset 0 0 0 1px var(--rs-line-strong); }
.tools { display: flex; gap: 2px; }
.ic { width: 28px; height: 28px; border: 0; border-radius: var(--rs-radius-sm); background: transparent; color: var(--rs-text); font: inherit; cursor: pointer; }
.ic:hover:not(:disabled) { background: var(--rs-surface-2); color: var(--rs-text-strong); }
.ic:disabled { opacity: 0.3; cursor: not-allowed; }
.row2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px var(--rs-space-3); }
.row3 { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.adds { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.warn { margin: 0; padding: 8px 12px 8px 26px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); border-left: 4px solid var(--rs-text-strong); font-size: var(--rs-text-xs); color: var(--rs-text-strong); }
.warn-text { color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.draw { display: flex; flex-direction: column; gap: 6px; }
.svg { width: 100%; max-height: 340px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); }
.loop { cursor: default; }
.armed .loop { cursor: pointer; }
.hit { fill: none; stroke: transparent; stroke-width: 12px; vector-effect: non-scaling-stroke; pointer-events: stroke; }
.ln { fill: none; stroke: var(--rs-text-muted); stroke-width: 1px; vector-effect: non-scaling-stroke; pointer-events: none; }
.k-cut .ln { stroke: var(--rs-text-strong); stroke-width: 1.6px; }
.k-score .ln { stroke: var(--rs-text-strong); stroke-width: 1.6px; stroke-dasharray: 5 3; }
.k-null .ln { stroke: var(--rs-text-strong); stroke-width: 1px; stroke-dasharray: 1 3; }
.cur .ln { stroke: var(--rs-ink); stroke-width: 3px; }
.armed .loop:hover .ln { stroke: var(--rs-ink); stroke-width: 3px; }
.fillarea { fill: url(#ops-hatch); fill-rule: evenodd; pointer-events: none; }
.hl { stroke: var(--rs-text-strong); stroke-width: 0.25; opacity: 0.55; }
.num { fill: var(--rs-text-strong); text-anchor: middle; dominant-baseline: middle; font-family: var(--rs-font-code); pointer-events: none; paint-order: stroke; stroke: var(--rs-surface-2); stroke-width: 3px; vector-effect: non-scaling-stroke; }
.legend { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0; }
.sw { display: inline-block; width: 18px; height: 0; border-top: 2px solid var(--rs-text-strong); margin-left: 6px; }
.sw.dash { border-top-style: dashed; }
.sw.hatch { height: 8px; border: 1px solid var(--rs-text-strong); background: repeating-linear-gradient(45deg, var(--rs-text-strong) 0 1px, transparent 1px 3px); }
.sw.thin { border-top: 1px solid var(--rs-text-muted); }
</style>
