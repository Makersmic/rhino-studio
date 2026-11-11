<script setup lang="ts">
/**
 * One laser, drag knife or spindle tuning test (cutTests.ts): set it up, make the file, start it through the tool's setup
 * macro (Files' Start: LASER_JOB_SETUP / DRAGKNIFE_JOB_SETUP / CNC_JOB_SETUP FILE=), pick what came out best, save. The
 * file is checked like any prepared job before it goes to the Rhino; the focus ramp's Z moves are allowed only by its
 * own check. Spindle tests are per bit, and note the throttle the setup ran the spindle at.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import '@/toolmgr/forms.css'
import MascotRow from '@/components/MascotRow.vue'
import StartFile from '@/files/StartFile.vue'
import { DONE_POSE, TROUBLE_POSE, TUNING_POSE } from '@/brand/mascot'
import { checkFile } from '@/slicer/check'
import { newJob, type Material } from '@/slicer/profiles'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import {
  BIT_VALUES, CUT_WIZARDS, COUNT, HEAD_VALUES, centred, cutChoices, cutDefaults, cutFile, cutFileName, cutProblem, cutValueProblem,
  diameterFrom, focusRampSafe, kerfFrom, lastCut, stockNeeded, throttlePct, type CutChoice, type CutInputs, type CutTest, type CutValue,
} from './cutTests'
import type { Bit } from '@/toolmgr/bits'

const props = defineProps<{ tool: string; test: CutTest; mat: Material; bit?: Bit | null }>()
const emit = defineEmits<{ done: [] }>()
const machine = useMachineStore()
const control = useControlStore()
const prep = usePrepareStore()
const tuning = useTuningStore()
onMounted(() => { if (!tuning.state) void tuning.load() })

const w = CUT_WIZARDS.find((c) => c.test === props.test)!
const laser = w.process === 'laser'
const spindle = w.process === 'cnc'
const tuned = (v: CutValue) => lastCut(tuning.state?.runs, props.tool, v, props.mat.name, props.bit?.name)?.value
const inp = reactive<CutInputs>((() => {
  const d = cutDefaults(props.test, spindle
    ? { feed: tuned('cnc_feed'), depth: props.test === 'cnc_depth' ? tuned('cnc_depth') : undefined, plunge: tuned('cnc_plunge'),
        diameter: tuned('cnc_diameter') ?? props.bit?.diameter, length: props.bit?.length }
    : {
        power: tuned('laser_cut_power') ?? props.mat.laserPower,
        feed: (laser ? tuned('laser_cut_speed') : undefined) ?? props.mat.feed,
        passes: tuned('laser_passes'),
        depth: tuned('knife_depth'),
      })
  // spindle tests are placed from the work zero (the stock's corner), 5 mm in
  return { ...d, ...(spindle ? { x: 5, y: 5 } : centred(props.test, d, prep.machineInfo.workArea)) }
})())
const stock = computed(() => (spindle ? stockNeeded(props.test, inp) : null))
// the form shows % for power
const pct = (k: 'power' | 'powerFrom' | 'powerTo') => computed({ get: () => Math.round(inp[k] * 100), set: (v: number) => { inp[k] = v / 100 } })
const power = pct('power')
const powerFrom = pct('powerFrom')
const powerTo = pct('powerTo')

const problem = computed(() => cutProblem(props.test, inp, prep.machineInfo))
const mounted = computed(() => machine.mountedVerified && machine.mountedName === props.tool)
const blockers = computed(() => {
  const out: string[] = []
  if (!machine.klippyReady) out.push('Klipper isn’t ready')
  if (!mounted.value) out.push(`Mount and confirm ${props.tool} first`)
  if (spindle && !props.bit) out.push('Pick a bit first')
  return out
})

type Step = 'set' | 'run' | 'saved'
const step = ref<Step>('set')
const msg = ref<{ text: string; bad?: boolean } | null>(null)
const uploaded = ref<string | null>(null)
const busy = ref(false)
const pose = computed(() => (msg.value?.bad ? TROUBLE_POSE : step.value === 'saved' ? DONE_POSE : TUNING_POSE[props.test]!))

async function makeTest() {
  busy.value = true
  msg.value = null
  try {
    const sMax = prep.machineInfo.laserSMax
    const text = cutFile(props.test, { tool: props.tool, material: props.mat.name, bit: props.bit?.name }, inp, sMax)
    // checked like a prepared job: the same refusals, the knife held to this test's deepest cut
    const job = newJob(props.tool, w.process, [])
    job.material = props.mat.key
    job.knife.depth = props.test === 'knife_depth' ? inp.depthFrom + inp.depthStep * (COUNT.depth - 1) : inp.depth
    const bad = checkFile(text, job, null, prep.machineInfo).checks.filter((c) => c.level === 'error')
    const allowed = props.test === 'laser_focus' ? bad.filter((c) => c.id !== 'laserz') : bad
    const own = props.test === 'laser_focus' ? focusRampSafe(text, sMax) : null
    if (allowed.length || own) throw new Error(`Studio won’t send this test: ${own ?? allowed.map((c) => c.detail ?? c.label).join('; ')}`)
    uploaded.value = await machine.uploadFile(new File([text], cutFileName(props.test, props.tool, props.mat.name, props.bit?.name), { type: 'text/plain' }))
    step.value = 'run'
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
const running = computed(() => control.jobActive && !!uploaded.value && !!machine.job.filename && uploaded.value.endsWith(machine.job.filename))
// the spindle's throttle while this test runs (the ESC pin: 0.3 stopped, 1.0 full): what the feed was found at
const throttle = ref<number | null>(null)
watch(
  () => (machine.status['output_pin SPINDLE_SPEED'] as { value?: number } | undefined)?.value,
  (v) => { if (spindle && running.value && typeof v === 'number' && v > 0.3 && (throttle.value == null || v > throttle.value)) throttle.value = v },
)
const throttlePctIn = computed({
  get: () => (throttle.value == null ? null : throttlePct(throttle.value)),
  set: (p: number | null) => { throttle.value = p == null || !Number.isFinite(p) ? null : Number((p / 100).toFixed(3)) },
})

// ---- judging
const choices = computed(() => cutChoices(props.test, inp))
// the index of the pick: a ref would hold a reactive copy, never === the choice itself
const pickedAt = ref<number | null>(null)
const picked = computed<CutChoice | null>(() => (pickedAt.value == null ? null : (choices.value[pickedAt.value] ?? null)))
const measured = ref<number | null>(null)
const pressure = ref<number | null>(null)
const kerf = computed(() => (measured.value == null ? null : props.test === 'cnc_size' ? diameterFrom(measured.value, props.bit?.diameter ?? inp.diameter) : kerfFrom(measured.value)))
const toSave = computed<Partial<Record<CutValue, number>> | null>(() => {
  if (props.test === 'laser_kerf') return kerf.value && 'value' in kerf.value ? { laser_kerf: kerf.value.value, laser_cut_power: inp.power, laser_cut_speed: inp.feed, laser_passes: inp.passes } : null
  if (props.test === 'cnc_size') return kerf.value && 'value' in kerf.value ? { cnc_diameter: kerf.value.value } : null
  if (!picked.value) return null
  if (props.test === 'cnc_feed') return throttle.value != null ? { ...picked.value.values, cnc_throttle: throttle.value } : null
  return props.test === 'knife_depth' && pressure.value != null ? { ...picked.value.values, knife_pressure: pressure.value } : picked.value.values
})
const saveProblem = computed(() => {
  for (const [k, v] of Object.entries(toSave.value ?? {})) {
    const p = cutValueProblem(k as CutValue, v)
    if (p) return `${k.replace(/_/g, ' ')}: ${p}`
  }
  return null
})
const LABEL: Record<CutValue, string> = {
  laser_focus_height: 'Focus height', laser_cut_power: 'Cut power', laser_cut_speed: 'Cut speed', laser_engrave_power: 'Engrave power',
  laser_engrave_speed: 'Engrave speed', laser_passes: 'Passes', laser_kerf: 'Kerf', knife_depth: 'Depth', knife_pressure: 'Pressure dial',
  knife_blade_offset: 'Blade offset', cnc_diameter: 'True diameter', cnc_feed: 'Feed', cnc_throttle: 'Throttle', cnc_depth: 'Depth per pass',
  cnc_plunge: 'Plunge',
}
const UNIT: Partial<Record<CutValue, string>> = {
  laser_focus_height: ' mm', laser_cut_speed: ' mm/min', laser_engrave_speed: ' mm/min', laser_kerf: ' mm', knife_depth: ' mm', knife_pressure: ' g',
  knife_blade_offset: ' mm', cnc_diameter: ' mm', cnc_feed: ' mm/min', cnc_depth: ' mm', cnc_plunge: ' mm/min',
}
const show = (k: CutValue, v: number) => (k.endsWith('_power') ? `${Math.round(v * 100)} %` : k === 'cnc_throttle' ? `${throttlePct(v)} %` : `${v}${UNIT[k] ?? ''}`)
const rows = computed(() => Object.entries(toSave.value ?? {}).map(([k, v]) => {
  const old = tuned(k as CutValue)
  return { k: k as CutValue, now: show(k as CutValue, v), was: old == null ? 'Not tuned' : show(k as CutValue, old) }
}))

async function save() {
  if (!toSave.value || saveProblem.value) return
  busy.value = true
  msg.value = null
  try {
    for (const [k, v] of Object.entries(toSave.value)) {
      const key = k as CutValue
      const perMat = !HEAD_VALUES.has(key) && !BIT_VALUES.has(key)
      await tuning.save({ tool: props.tool, test: key, value: v, material: perMat ? props.mat.name : undefined, bit: spindle ? props.bit?.name : undefined })
    }
    step.value = 'saved'
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
const grid = computed(() => props.test === 'laser_cut' || props.test === 'laser_engrave')
const gridRows = computed(() => [...Array(COUNT.grid).keys()].reverse()) // back row first, as you look down at the bed
</script>

<template>
  <MascotRow :pose="pose">
    <p class="why">{{ w.why }}</p>

    <!-- ===== set up ===== -->
    <template v-if="step === 'set'">
      <ul v-if="laser" class="safety">
        <li>Laser glasses on, fume extraction running, an extinguisher nearby; you stay for the whole test.</li>
        <li v-if="test === 'laser_focus'">When the setup asks you to set focus, lower the laser until its shroud <strong>just touches</strong> the material (a sheet of paper should drag). The ramp lifts from 1 mm above that.</li>
        <li v-else>Set focus as usual when the setup asks{{ tuned('laser_focus_height') != null ? ` (tuned: ${tuned('laser_focus_height')} mm above the surface)` : '' }}.</li>
      </ul>
      <ul v-else-if="spindle" class="safety">
        <li>Glasses and hearing protection on, extraction or a vacuum ready. Scrap stock of this material at least {{ stock?.x }} x {{ stock?.y }} mm, held down flat.</li>
        <li>When the setup asks: X/Y zero on the stock’s front-left corner, Z zero on its top. Note the throttle you start the spindle at: Studio keeps it with the feed.</li>
        <li v-if="bit">The {{ bit.name }} in the collet: {{ inp.diameter }} mm{{ tuned('cnc_diameter') != null ? ' (measured)' : '' }}, {{ bit.length }} mm cutting.</li>
      </ul>
      <ul v-else class="safety">
        <li>Material taped flat, backing sheet or mat under it, blade extended. Set Z zero on the surface when the setup asks.</li>
        <li v-if="test === 'knife_depth'">Note where the pressure dial is set: you'll save it with the depth.</li>
      </ul>

      <div class="form">
        <template v-if="test === 'laser_focus'">
          <label>Ramp from (mm above the surface)<input v-model.number="inp.zFrom" type="number" min="1" step="0.5" class="tm-in" /></label>
          <label>to<input v-model.number="inp.zTo" type="number" step="0.5" class="tm-in" /></label>
        </template>
        <template v-else-if="grid">
          <label>Power from (%)<input v-model.number="powerFrom" type="number" min="1" max="100" class="tm-in" /></label>
          <label>to<input v-model.number="powerTo" type="number" min="1" max="100" class="tm-in" /></label>
          <label>Speed from (mm/min)<input v-model.number="inp.feedFrom" type="number" min="30" step="50" class="tm-in" /></label>
          <label>to<input v-model.number="inp.feedTo" type="number" step="50" class="tm-in" /></label>
        </template>
        <template v-else-if="test === 'laser_passes' || test === 'laser_kerf'">
          <label>Cut power (%)<input v-model.number="power" type="number" min="1" max="100" class="tm-in" /></label>
          <label>Cut speed (mm/min)<input v-model.number="inp.feed" type="number" min="30" step="50" class="tm-in" /></label>
          <label v-if="test === 'laser_kerf'">Passes<input v-model.number="inp.passes" type="number" min="1" max="10" class="tm-in" /></label>
        </template>
        <template v-else-if="test === 'knife_depth'">
          <label>First depth (mm)<input v-model.number="inp.depthFrom" type="number" min="0.01" step="0.05" class="tm-in" /></label>
          <label>Step (mm)<input v-model.number="inp.depthStep" type="number" min="0.01" step="0.01" class="tm-in" /></label>
          <label>Speed (mm/min)<input v-model.number="inp.feed" type="number" min="30" step="50" class="tm-in" /></label>
        </template>
        <template v-else-if="test === 'knife_offset'">
          <label>Offset from (mm)<input v-model.number="inp.offsetFrom" type="number" min="0" step="0.05" class="tm-in" /></label>
          <label>to<input v-model.number="inp.offsetTo" type="number" step="0.05" class="tm-in" /></label>
          <label>Depth (mm)<input v-model.number="inp.depth" type="number" min="0.01" step="0.05" class="tm-in" /></label>
        </template>
        <template v-else-if="test === 'cnc_feed'">
          <label>Feed from (mm/min)<input v-model.number="inp.feedFrom" type="number" min="10" step="50" class="tm-in" /></label>
          <label>to<input v-model.number="inp.feedTo" type="number" step="50" class="tm-in" /></label>
          <label>Depth (mm)<input v-model.number="inp.depth" type="number" min="0.05" step="0.1" class="tm-in" /></label>
          <label>Plunge (mm/min)<input v-model.number="inp.plunge" type="number" min="10" step="10" class="tm-in" /></label>
        </template>
        <template v-else-if="test === 'cnc_depth'">
          <label>First depth (mm)<input v-model.number="inp.depthFrom" type="number" min="0.05" step="0.1" class="tm-in" /></label>
          <label>Step (mm)<input v-model.number="inp.depthStep" type="number" min="0.05" step="0.1" class="tm-in" /></label>
          <label>Feed (mm/min)<input v-model.number="inp.feed" type="number" min="10" step="50" class="tm-in" /></label>
          <label>Plunge (mm/min)<input v-model.number="inp.plunge" type="number" min="10" step="10" class="tm-in" /></label>
        </template>
        <template v-else-if="test === 'cnc_size'">
          <label>Depth (mm)<input v-model.number="inp.depth" type="number" min="0.05" step="0.1" class="tm-in" /></label>
          <label>Feed (mm/min)<input v-model.number="inp.feed" type="number" min="10" step="50" class="tm-in" /></label>
          <label>Plunge (mm/min)<input v-model.number="inp.plunge" type="number" min="10" step="10" class="tm-in" /></label>
        </template>
        <label>{{ spindle ? 'From the zero, X' : 'Front-left corner X' }}<input v-model.number="inp.x" type="number" class="tm-in" /></label>
        <label>Y<input v-model.number="inp.y" type="number" class="tm-in" /></label>
      </div>
      <p v-if="spindle" class="hint">X and Y are from the work zero you set on the stock’s corner. Studio keeps each cut within the bit’s cutting length and at most twice its diameter deep.</p>
      <p v-else class="hint">X and Y are machine positions: put the material under them. Studio keeps the test inside the bed and clear of the leadscrew.</p>

      <ul v-if="blockers.length || problem" class="block">
        <li v-for="b in blockers" :key="b">{{ b }}</li>
        <li v-if="problem">{{ problem }}</li>
      </ul>
      <div class="acts">
        <RsButton variant="primary" :disabled="!!blockers.length || !!problem || busy" @click="makeTest">{{ busy ? 'Sending…' : 'Make the test' }}</RsButton>
        <RsButton @click="emit('done')">Back to the tests</RsButton>
      </div>
    </template>

    <!-- ===== run, then judge ===== -->
    <template v-else-if="step === 'run'">
      <ol class="run">
        <li v-if="spindle">Start it. The CNC setup runs as for any job: the checklist, X/Y zero on the corner, Z zero on the top, the spindle warm-up and its throttle, then the test.
          <StartFile v-if="uploaded && !running" :file-path="uploaded" stay />
          <span v-else-if="running" class="muted"> Running…{{ throttle != null ? ` Spindle at ${throttlePct(throttle)} %.` : '' }}</span>
        </li>
        <li v-else>Start it. The {{ laser ? 'laser' : 'knife' }} setup runs as for any job: the checklist, Z zero, the test {{ laser ? 'fire' : 'cut' }}, then the test.
          <StartFile v-if="uploaded && !running" :file-path="uploaded" stay />
          <span v-else-if="running" class="muted"> Running…</span>
        </li>
        <li v-if="test === 'laser_focus'">Find the thinnest, sharpest part of the line. Long ticks are every 5 mm, labelled; pick the tick under it.</li>
        <li v-else-if="test === 'laser_cut'">Pick the square that dropped out cleanly with the least char. Rows are power, columns speed.</li>
        <li v-else-if="test === 'laser_engrave'">Pick the square that looks best: even, the darkness you want, not burnt through.</li>
        <li v-else-if="test === 'laser_passes'">Squares from the left had 1 to 5 passes. Pick the fewest that cut right through.</li>
        <li v-else-if="test === 'laser_kerf'">Measure the square part that dropped out with calipers, across the flats.</li>
        <li v-else-if="test === 'knife_depth'">Lines from the left are deeper each time. Pick the shallowest that cut through cleanly, with the backing still whole.</li>
        <li v-else-if="test === 'cnc_size'">Brush the chips out and measure across the slot with the caliper’s inside jaws, near the top.</li>
        <li v-else-if="test === 'cnc_feed'">Slots from the left are faster each time. Pick the fastest with smooth walls, no burning or chatter, and a steady sound while it cut.</li>
        <li v-else-if="test === 'cnc_depth'">Slots from the left are deeper each time. Pick the deepest that cut cleanly without the spindle bogging down or the bit deflecting.</li>
        <li v-else>Squares from the left have more offset each time. Pick the one with the sharpest, closed corners.</li>
      </ol>

      <div v-if="grid" class="grid" role="radiogroup" aria-label="Squares">
        <template v-for="r in gridRows" :key="r">
          <button v-for="c in choices.filter((x) => x.row === r)" :key="`${r}-${c.col}`" type="button" class="cell" :class="{ on: picked === c }" :aria-pressed="picked === c" @click="pickedAt = choices.indexOf(c)">{{ c.label }}</button>
        </template>
      </div>
      <div v-else-if="choices.length" class="picks">
        <button v-for="(c, k) in choices" :key="c.label" type="button" class="cell" :class="{ on: pickedAt === k }" :aria-pressed="pickedAt === k" @click="pickedAt = k">
          <span v-if="test !== 'laser_focus'" class="n">{{ k + 1 }}</span>{{ c.label }}
        </button>
      </div>
      <div class="form">
        <label v-if="test === 'laser_kerf'">The part measures (mm)<input v-model.number="measured" type="number" step="0.01" class="tm-in" /></label>
        <label v-if="test === 'cnc_size'">The slot measures (mm)<input v-model.number="measured" type="number" step="0.01" class="tm-in" /></label>
        <label v-if="test === 'cnc_feed'">Throttle it cut at (%)<input v-model.number="throttlePctIn" type="number" min="30" max="100" step="5" class="tm-in" /></label>
        <label v-if="test === 'knife_depth'">Pressure dial (g, optional)<input v-model.number="pressure" type="number" min="0" step="10" class="tm-in" /></label>
      </div>
      <p v-if="test === 'cnc_feed' && picked && throttle == null" class="hint">Type the throttle the spindle ran at: the setup’s Ready to cut window says “Spindle running at …% throttle”.</p>
      <p v-if="kerf && 'error' in kerf" class="bad">{{ kerf.error }}</p>

      <table v-if="rows.length" class="was">
        <thead><tr><th /><th>Was</th><th>Now</th></tr></thead>
        <tbody><tr v-for="r in rows" :key="r.k"><th>{{ LABEL[r.k] }}</th><td class="muted">{{ r.was }}</td><td>{{ r.now }}</td></tr></tbody>
      </table>
      <p v-if="saveProblem" class="bad">{{ saveProblem }}</p>
      <div class="acts">
        <RsButton variant="primary" :disabled="!toSave || !!saveProblem || busy" @click="save">{{ busy ? 'Saving…' : 'Save' }}</RsButton>
        <RsButton @click="step = 'set'; pickedAt = null">Change the test</RsButton>
      </div>
    </template>

    <!-- ===== saved ===== -->
    <template v-else>
      <p class="q">Saved for {{ tool }}{{ w.scope === 'bit' ? ` with ${bit?.name}` : w.scope === 'cut' ? ` with ${bit?.name} on ${mat.name}` : w.scope === 'stock' ? ` on ${mat.name}` : '' }}.</p>
      <p class="hint">It's on the Rhino, in the backup, with what it replaced.</p>
      <div class="acts"><RsButton variant="primary" @click="emit('done')">Back to the tests</RsButton></div>
    </template>

    <p v-if="msg" :class="msg.bad ? 'bad' : 'hint'" role="status">{{ msg.text }}</p>
  </MascotRow>
</template>

<style scoped>
.why { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); max-width: 72ch; }
.q { margin: 0; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.safety, .run { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: 6px; font-size: var(--rs-text-sm); }
.form { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--rs-space-3); }
.form label { display: flex; flex-direction: column; gap: 4px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.hint { margin: 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.muted { color: var(--rs-text-muted); }
.bad, .block { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-danger); }
.block { padding-left: 1.2em; }
.acts { display: flex; gap: var(--rs-space-2); flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; max-width: 560px; }
.picks { display: flex; flex-wrap: wrap; gap: 6px; }
.cell { padding: 8px 6px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text); font: inherit; font-size: var(--rs-text-xs); cursor: pointer; display: flex; gap: 6px; align-items: center; justify-content: center; }
.cell .n { color: var(--rs-text-muted); }
.cell.on { background: var(--rs-ink); color: var(--rs-surface); border-color: var(--rs-ink); }
.cell.on .n { color: inherit; }
.was { border-collapse: collapse; font-size: var(--rs-text-sm); }
.was th, .was td { text-align: left; padding: 4px 12px 4px 0; border-top: 1px solid var(--rs-line); }
.was thead th { border-top: 0; color: var(--rs-text-muted); font-weight: 400; font-size: var(--rs-text-xs); }
</style>
