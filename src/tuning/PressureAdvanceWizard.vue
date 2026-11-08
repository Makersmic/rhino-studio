<script setup lang="ts">
/**
 * Pressure advance (Ellis' Print Tuning Guide, the pattern method): columns of sharp corners, each at its own pressure
 * advance; pick the column with the sharpest corner and the fewest gaps, bulges or dents. Refine prints a finer range
 * round the pick. Saved per head + nozzle + material; prints Studio prepares use it instead of the CALCULATE_PA estimate.
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import StartFile from '@/files/StartFile.vue'
import type { Material } from '@/slicer/profiles'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import { lastRun, paPatternBounds, paPatternFile, paRefine, paValues, patternClear } from './tuning'

const props = defineProps<{ tool: string; mat: Material }>()
const emit = defineEmits<{ done: [] }>()
const machine = useMachineStore()
const control = useControlStore()
const prep = usePrepareStore()
const tuning = useTuningStore()
const restore = ref(0)
onMounted(async () => {
  if (!tuning.state) await tuning.load()
  try {
    restore.value = Number((await machine.extruderConfig()).pressure_advance ?? 0) || 0
  } catch {
    restore.value = 0
  }
})

const nozzle = computed(() => props.mat.nozzle ?? 0.4)
const range = ref({ start: 0, step: 0.005, count: 21 })
const values = computed(() => paValues(range.value.start, range.value.step, range.value.count))
const bed = computed(() => ({ x: prep.machineInfo.workArea.x, y: prep.machineInfo.workArea.y, keepOut: prep.machineInfo.keepOut }))
const mounted = computed(() => machine.mountedVerified && machine.mountedName === props.tool)
const advice = computed(() => {
  const out: string[] = []
  if (!lastRun(tuning.state, props.tool, 'extruder_calibration')) out.push('Extruder calibration hasn’t been run for this head: Ellis does it first.')
  if (!lastRun(tuning.state, props.tool, 'first_layer', nozzle.value, props.mat.name)) out.push(`First-layer squish hasn’t been run for ${props.mat.name}: a poor first layer makes corners hard to read.`)
  return out
})
const blockers = computed(() => {
  const out: string[] = []
  if (!machine.klippyReady) out.push('Klipper isn’t ready')
  if (!mounted.value) out.push(`Mount and confirm ${props.tool} first`)
  if (!patternClear(paPatternBounds(bed.value, values.value.length), bed.value.keepOut)) out.push('The pattern would cross an area to keep clear on this bed')
  return out
})

const uploaded = ref<string | null>(null)
const busy = ref(false)
const msg = ref<{ text: string; bad?: boolean } | null>(null)
async function makeTest() {
  busy.value = true
  msg.value = null
  try {
    const text = paPatternFile({
      tool: props.tool,
      material: props.mat.name,
      nozzle: nozzle.value,
      path: props.mat.path ?? 0,
      bed: bed.value,
      values: values.value,
      restore: restore.value,
    })
    const name = `tuning/pa-${props.tool}-${props.mat.key}-${range.value.step}.gcode`.replace(/[^A-Za-z0-9_./-]/g, '_')
    uploaded.value = await machine.uploadFile(new File([text], name, { type: 'text/plain' }))
    pick.value = null
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
const printing = computed(() => control.jobActive && !!machine.job.filename?.includes('/pa-'))
const pick = ref<number | null>(null)
function refine() {
  if (pick.value == null) return
  range.value = paRefine(pick.value)
  uploaded.value = null
  msg.value = { text: `Next test: ${range.value.count} columns from ${values.value[0]} to ${values.value.at(-1)}, in ${range.value.step} steps. Make it and print it the same way.` }
}
const saved = ref(false)
const was = ref<number | null>(null)
async function save() {
  if (pick.value == null) return
  busy.value = true
  try {
    was.value = tuning.state?.materials[`${props.tool}|${nozzle.value}|${props.mat.name}`]?.pressure_advance?.value ?? null
    await tuning.save({ tool: props.tool, test: 'pressure_advance', value: pick.value, nozzle: nozzle.value, material: props.mat.name })
    saved.value = true
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wiz">
    <template v-if="!saved">
      <ul v-if="advice.length" class="advice"><li v-for="a in advice" :key="a">{{ a }}</li></ul>
      <ul v-if="blockers.length" class="block"><li v-for="b in blockers" :key="b">{{ b }}</li></ul>
      <ol class="how">
        <li>
          {{ values.length }} columns of sharp corners, {{ values[0] }} to {{ values.at(-1) }} in {{ range.step }} steps, left to right.
          Marks under them count the columns: a long one under the 1st, 6th, 11th…
          <RsButton v-if="!uploaded" size="sm" variant="primary" :disabled="!!blockers.length || busy" @click="makeTest">{{ busy ? 'Sending…' : 'Make the test' }}</RsButton>
          <span v-else class="muted small">Sent as {{ uploaded }}</span>
        </li>
        <li v-if="uploaded && !printing">Start it.<StartFile :file-path="uploaded" stay /></li>
        <li v-else-if="uploaded">Printing the pattern.</li>
        <li>
          When it’s done, look at each corner under a bright light from the side:
          <ul class="look">
            <li><strong>Too low:</strong> the corner bulges out, and the walls gap on the straight runs.</li>
            <li><strong>Too high:</strong> the corner is dented or thin, with gaps between walls at the corner.</li>
            <li><strong>Right:</strong> the sharpest corner with the fewest gaps, bulges or dents. Ellis prefers the higher of two that look alike, and says perfect is rare.</li>
          </ul>
        </li>
      </ol>
      <fieldset class="cols" :disabled="!uploaded">
        <legend>Which column has the sharpest corner? (left to right)</legend>
        <button v-for="(v, i) in values" :key="v" type="button" :class="{ on: pick === v, five: i % 5 === 0 }" :aria-pressed="pick === v" @click="pick = v">
          <span class="n">{{ i + 1 }}</span><span class="v mono">{{ v }}</span>
        </button>
      </fieldset>
      <p v-if="msg" class="msg" :class="{ bad: msg.bad }" role="status">{{ msg.text }}</p>
      <div class="acts">
        <RsButton variant="primary" :disabled="pick == null || busy" @click="save">Save {{ pick ?? '' }}</RsButton>
        <RsButton :disabled="pick == null" @click="refine">Refine round {{ pick ?? 'it' }}</RsButton>
        <RsButton v-if="printing" variant="danger-outline" @click="control.cancelJob()">Cancel the test print</RsButton>
      </div>
      <p class="muted small">If you can’t get a clean corner at any value, or see gaps and bulges at the same time, Ellis says the extruder itself needs looking at (loose parts, backlash) before tuning further.</p>
    </template>
    <template v-else>
      <p class="msg" role="status">Saved: {{ tool }} with {{ mat.name }} and a {{ nozzle }} mm nozzle uses pressure advance <strong class="mono">{{ pick }}</strong>{{ was != null ? ` (was ${was})` : ' (was the CALCULATE_PA estimate)' }}. Prints Studio prepares use it from now on.</p>
      <div class="acts"><RsButton variant="primary" @click="emit('done')">Done</RsButton></div>
    </template>
  </div>
</template>

<style scoped>
.wiz { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.acts { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); }
.advice, .block { margin: 0; padding-left: 1.2em; font-size: var(--rs-text-sm); }
.block { color: var(--rs-text-strong); }
.advice { color: var(--rs-text-muted); }
.how { margin: 0; padding-left: 1.3em; display: flex; flex-direction: column; gap: var(--rs-space-3); font-size: var(--rs-text-sm); }
.how > li > :deep(button) { margin-left: var(--rs-space-2); }
.look { margin: 6px 0 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 2px; }
.cols { border: 0; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px; }
.cols legend { font-size: var(--rs-text-sm); margin-bottom: 6px; }
.cols button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text); cursor: pointer; font: inherit; }
.cols button.five { border-color: var(--rs-line-strong); }
.cols button.on { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.cols button:disabled { cursor: default; opacity: 0.5; }
.n { font-size: var(--rs-text-xs); }
.v { font-size: var(--rs-text-sm); }
.mono { font-family: var(--rs-font-code); }
.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); }
</style>
