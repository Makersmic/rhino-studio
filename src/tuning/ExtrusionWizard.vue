<script setup lang="ts">
/**
 * Extrusion multiplier (Ellis' Print Tuning Guide, Extrusion Multiplier): cubes at stepped multipliers; the one with the
 * smoothest top, filled without going over, wins; "if you can't decide, pick the higher". Users find this the hardest
 * to judge (Duet forum: "all pretty much the same"), so the tips are on screen, including the marker trick for light
 * colours (guide issue #167), and "They all look alike" prints a wider spread. Saved per head + nozzle + material; prints
 * Studio prepares get it as their flow (M221 after START_JOB).
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import StartFile from '@/files/StartFile.vue'
import type { Material } from '@/slicer/profiles'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import { EM_CUBES, emCubesBounds, emCubesFile, emRefine, emValues, emWider, lastRun, materialKey, patternClear } from './tuning'

const props = defineProps<{ tool: string; mat: Material }>()
const emit = defineEmits<{ done: [] }>()
const machine = useMachineStore()
const control = useControlStore()
const prep = usePrepareStore()
const tuning = useTuningStore()
onMounted(() => { if (!tuning.state) void tuning.load() })

const nozzle = computed(() => props.mat.nozzle ?? 0.4)
const key = computed(() => materialKey(props.tool, nozzle.value, props.mat.name))
const range = ref({ start: 0.9, step: 0.02, count: 6 })
const values = computed(() => emValues(range.value.start, range.value.step, range.value.count))
const bed = computed(() => ({ x: prep.machineInfo.workArea.x, y: prep.machineInfo.workArea.y, keepOut: prep.machineInfo.keepOut }))
const mounted = computed(() => machine.mountedVerified && machine.mountedName === props.tool)
const advice = computed(() => {
  const out: string[] = []
  if (!lastRun(tuning.state, props.tool, 'extruder_calibration')) out.push('Extruder calibration hasn’t been run for this head: Ellis does it first.')
  if (!lastRun(tuning.state, props.tool, 'pressure_advance', nozzle.value, props.mat.name)) out.push(`Pressure advance hasn’t been tuned for ${props.mat.name}: Ellis tunes it before this.`)
  return out
})
const blockers = computed(() => {
  const out: string[] = []
  if (!machine.klippyReady) out.push('Klipper isn’t ready')
  if (!mounted.value) out.push(`Mount and confirm ${props.tool} first`)
  if (!patternClear(emCubesBounds(bed.value, values.value.length), bed.value.keepOut)) out.push('The cubes would cross an area to keep clear on this bed')
  return out
})

const uploaded = ref<string | null>(null)
const busy = ref(false)
const msg = ref<{ text: string; bad?: boolean } | null>(null)
async function makeTest() {
  busy.value = true
  msg.value = null
  try {
    const text = emCubesFile({
      tool: props.tool,
      material: props.mat.name,
      nozzle: nozzle.value,
      path: props.mat.path ?? 0,
      rotationDistance: tuning.state?.heads[props.tool]?.rotation_distance?.value,
      pressureAdvance: tuning.state?.materials[key.value]?.pressure_advance?.value,
      bed: bed.value,
      values: values.value,
    })
    const name = `tuning/em-${props.tool}-${props.mat.key}-${range.value.step}.gcode`.replace(/[^A-Za-z0-9_./-]/g, '_')
    uploaded.value = await machine.uploadFile(new File([text], name, { type: 'text/plain' }))
    pick.value = null
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
const printing = computed(() => control.jobActive && !!machine.job.filename?.includes('/em-'))
const pick = ref<number | null>(null)
function next(r: { start: number; step: number; count: number }, why: string) {
  range.value = r
  uploaded.value = null
  pick.value = null
  msg.value = { text: `${why} Next test: ${r.count} cubes, ${values.value.map((v) => `${Math.round(v * 1000) / 10} %`).join(', ')}. Make it and print it the same way.` }
}
const saved = ref(false)
const was = ref<number | null>(null)
async function save() {
  if (pick.value == null) return
  busy.value = true
  try {
    was.value = tuning.state?.materials[key.value]?.extrusion_multiplier?.value ?? null
    await tuning.save({ tool: props.tool, test: 'extrusion_multiplier', value: pick.value, nozzle: nozzle.value, material: props.mat.name })
    saved.value = true
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
const pct = (v: number) => `${Math.round(v * 1000) / 10} %`
</script>

<template>
  <div class="wiz">
    <template v-if="!saved">
      <ul v-if="advice.length" class="advice"><li v-for="a in advice" :key="a">{{ a }}</li></ul>
      <ul v-if="blockers.length" class="block"><li v-for="b in blockers" :key="b">{{ b }}</li></ul>
      <ol class="how">
        <li>
          {{ values.length }} cubes, {{ EM_CUBES.size }}×{{ EM_CUBES.size }}×{{ EM_CUBES.height }} mm, left to right at {{ values.map(pct).join(', ') }}: many smooth top layers over a little infill, the last laid one way at 60 mm/s.
          <RsButton v-if="!uploaded" size="sm" variant="primary" :disabled="!!blockers.length || busy" @click="makeTest">{{ busy ? 'Sending…' : 'Make the test' }}</RsButton>
          <span v-else class="muted small">Sent as {{ uploaded }}</span>
        </li>
        <li v-if="uploaded && !printing">Start it.<StartFile :file-path="uploaded" stay /></li>
        <li v-else-if="uploaded">Printing the cubes.</li>
        <li>
          When they’re cool, compare the tops:
          <ul class="look">
            <li><strong>Too little:</strong> gaps or valleys between the top lines.</li>
            <li><strong>Too much:</strong> a rough top, ridges, plastic piling up at the edges.</li>
            <li><strong>Right:</strong> lines fill the top as fully as they can without going over: noticeably smoother to the touch. Judge the middle of each top, not the edges.</li>
            <li><strong>Hard to tell?</strong> Hold a light low beside them so it skims across the tops. On a light colour, scribble a marker across each top and wipe it: the right one lets the ink run least into the grooves. If still unsure, pick the higher one.</li>
          </ul>
        </li>
      </ol>
      <fieldset class="cols">
        <legend>Which cube has the smoothest top? (left to right)</legend>
        <button v-for="(v, i) in values" :key="v" type="button" :disabled="!uploaded" :class="{ on: pick === v }" :aria-pressed="pick === v" @click="pick = v">
          <span class="n">{{ i + 1 }}</span><span class="v mono">{{ pct(v) }}</span>
        </button>
      </fieldset>
      <p v-if="msg" class="msg" :class="{ bad: msg.bad }" role="status">{{ msg.text }}</p>
      <div class="acts">
        <RsButton variant="primary" :disabled="pick == null || busy" @click="save">Save {{ pick != null ? pct(pick) : '' }}</RsButton>
        <RsButton :disabled="pick == null" @click="next(emRefine(pick!), 'Finer steps round your pick.')">Refine round {{ pick != null ? pct(pick) : 'it' }}</RsButton>
        <RsButton variant="quiet" :disabled="!uploaded" @click="next(emWider(), 'A wider spread, so the difference shows.')">They all look alike</RsButton>
        <RsButton v-if="printing" variant="danger-outline" @click="control.cancelJob()">Cancel the test print</RsButton>
      </div>
    </template>
    <template v-else>
      <p class="msg" role="status">Saved: {{ tool }} with {{ mat.name }} and a {{ nozzle }} mm nozzle prints at <strong class="mono">{{ pct(pick!) }}</strong> flow{{ was != null ? ` (was ${pct(was)})` : ' (was 100 %)' }}. Prints Studio prepares use it from now on, whichever slicer.</p>
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
.cols { border: 0; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
.cols legend { font-size: var(--rs-text-sm); margin-bottom: 6px; }
.cols button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text); cursor: pointer; font: inherit; }
.cols button.on { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.cols button:disabled { cursor: default; opacity: 0.5; }
.n { font-size: var(--rs-text-xs); }
.v { font-size: var(--rs-text-sm); }
.mono { font-family: var(--rs-font-code); }
.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); }
</style>
