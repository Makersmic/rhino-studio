<script setup lang="ts">
/**
 * The CNC job as a list of steps, run top to bottom with one tool (the Rhino
 * has no tool changer: a second tool would mean stopping to re-zero, so a job
 * uses one tool; make a second job for a second tool).
 */
import { computed, ref } from 'vue'
import NumField from './NumField.vue'
import RsButton from '@/components/RsButton.vue'
import { newOp } from '@/slicer/profiles'
import type { CncOp, CncSettings } from '@/slicer/types'

const props = defineProps<{ cnc: CncSettings }>()

const NAMES: Record<CncOp['kind'], { name: string; what: string }> = {
  level: { name: 'Level the top', what: 'Takes the stock above the part down flat' },
  rough: { name: 'Rough out', what: 'Clears around and inside the part, leaving a little to finish' },
  outline: { name: 'Outline', what: 'Traces the part outline: outside cuts it out' },
}
const adding = ref<CncOp['kind']>('rough')
const open = ref<number | null>(null)

function add() {
  const o = newOp(adding.value)
  // level goes first, outline (cut out) last
  if (o.kind === 'level') props.cnc.ops.unshift(o)
  else {
    const last = props.cnc.ops.findIndex((x) => x.kind === 'outline' && x.side === 'outside')
    if (last >= 0 && o.kind !== 'outline') props.cnc.ops.splice(last, 0, o)
    else props.cnc.ops.push(o)
  }
  open.value = props.cnc.ops.indexOf(o)
}
function move(i: number, by: number) {
  const ops = props.cnc.ops
  const j = i + by
  if (j < 0 || j >= ops.length) return
  ;[ops[i], ops[j]] = [ops[j]!, ops[i]!]
  if (open.value === i) open.value = j
}
function remove(i: number) {
  props.cnc.ops.splice(i, 1)
  open.value = null
}
const summary = (o: CncOp) => {
  switch (o.kind) {
    case 'level':
      return `${o.depth} mm off the top, ${o.stepDown} mm passes`
    case 'rough':
      return `${o.stepDown} mm down, ${Math.round(o.stepOver * 100)}% over, leaves ${o.leave} mm`
    case 'outline':
      return `${o.side === 'outside' ? 'Outside (cut out)' : 'Inside'}, ${o.stepDown} mm down`
  }
}
const noLevelStock = computed(() => props.cnc.extraTop <= 0 && props.cnc.ops.some((o) => o.kind === 'level' && o.on))
</script>

<template>
  <div class="ops">
    <h3>Steps</h3>
    <ol>
      <li v-for="(o, i) in cnc.ops" :key="i" :class="{ off: !o.on }">
        <div class="row">
          <input v-model="o.on" type="checkbox" :aria-label="`${NAMES[o.kind].name} on`" />
          <button type="button" class="name" :aria-expanded="open === i" @click="open = open === i ? null : i">
            <span class="n">{{ i + 1 }}. {{ NAMES[o.kind].name }}</span>
            <span class="s">{{ summary(o) }}</span>
          </button>
          <span class="tools">
            <button type="button" class="ib" :disabled="i === 0" :aria-label="`Move ${NAMES[o.kind].name} up`" @click="move(i, -1)">↑</button>
            <button type="button" class="ib" :disabled="i === cnc.ops.length - 1" :aria-label="`Move ${NAMES[o.kind].name} down`" @click="move(i, 1)">↓</button>
            <button type="button" class="ib" :aria-label="`Remove ${NAMES[o.kind].name}`" @click="remove(i)">✕</button>
          </span>
        </div>
        <div v-if="open === i" class="detail">
          <p class="muted small wide">{{ NAMES[o.kind].what }}.</p>
          <template v-if="o.kind === 'level'">
            <NumField v-model="o.depth" label="Take off" unit="mm" :min="0.05" :max="Math.max(0.05, cnc.extraTop)" :step="0.1" :hint="`Up to the ${cnc.extraTop} mm above the part`" />
            <NumField v-model="o.stepDown" label="Per pass" unit="mm" :min="0.05" :max="5" :step="0.1" />
            <NumField v-model="o.stepOver" label="Step over" unit="%" :min="0.05" :max="0.9" :step="0.05" percent />
          </template>
          <template v-if="o.kind === 'rough'">
            <NumField v-model="o.stepDown" label="Step down" unit="mm" :min="0.1" :max="10" :step="0.1" />
            <NumField v-model="o.stepOver" label="Step over" unit="%" :min="0.05" :max="0.9" :step="0.05" percent />
            <NumField v-model="o.leave" label="Leave" unit="mm" :min="0" :max="5" :step="0.05" hint="For a finishing step" />
          </template>
          <template v-if="o.kind === 'outline'">
            <label class="fld"><span>Side</span>
              <select v-model="o.side"><option value="outside">Outside (cut the part out)</option><option value="inside">Inside (holes, pockets)</option></select>
            </label>
            <NumField v-model="o.stepDown" label="Step down" unit="mm" :min="0.1" :max="10" :step="0.1" />
          </template>
          <NumField v-model="o.feed" label="Feed" unit="mm/min" :min="0" :max="5000" :step="10" hint="0 = the job's feed" />
          <label class="fld"><span>Cut direction</span>
            <select v-model="o.direction"><option value="climb">Climb</option><option value="conventional">Conventional</option></select>
          </label>
        </div>
      </li>
    </ol>
    <p v-if="!cnc.ops.some((o) => o.on)" class="error">Turn on at least one step.</p>
    <p v-if="noLevelStock" class="muted small">Level the top only runs with stock above the part: set "Stock above the part" below.</p>
    <div class="add">
      <select v-model="adding" aria-label="Step to add">
        <option value="level">Level the top</option>
        <option value="rough">Rough out</option>
        <option value="outline">Outline</option>
      </select>
      <RsButton size="sm" @click="add">Add step</RsButton>
    </div>
  </div>
</template>

<style scoped>
.ops { grid-column: 1 / -1; display: flex; flex-direction: column; gap: var(--rs-space-2); }
h3 { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
li { border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); }
li.off .n, li.off .s { opacity: 0.5; }
.row { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; }
.name { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; padding: 2px 0; border: 0; background: none; color: var(--rs-text-strong); font: inherit; text-align: left; cursor: pointer; }
.n { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); }
.s { font-size: 11px; color: var(--rs-text-muted); }
.row input { width: 16px; height: 16px; accent-color: var(--rs-text-strong); }
.tools { display: flex; gap: 2px; }
.ib { width: 30px; height: 30px; border: 1px solid transparent; border-radius: var(--rs-radius-sm); background: none; color: var(--rs-text-strong); cursor: pointer; }
.ib:hover:not(:disabled) { border-color: var(--rs-line-strong); }
.ib:disabled { opacity: 0.3; cursor: default; }
.detail { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--rs-space-3) var(--rs-space-4); padding: 4px 12px 12px; }
.wide { grid-column: 1 / -1; }
.small { font-size: var(--rs-text-xs); }
.error { color: var(--rs-danger); font-size: var(--rs-text-sm); }
.fld { display: flex; flex-direction: column; gap: 4px; }
.fld > span { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
select { height: 36px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.add { display: flex; gap: 8px; align-items: center; }
</style>
