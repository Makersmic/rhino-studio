<script setup lang="ts">
/**
 * Wizards > Material tower (Tool Manager docs/proposal-tuning-wizards-2.md, item 4): print a tower that changes the temperature
 * (or the retraction length) every 5 mm, look at it, say which band is best, and record it for this print head, nozzle and
 * material. Studio writes the G-code itself and shows it (editable). The value is recorded on the Rhino and shown on the
 * Results page; slicing doesn't read it yet, so type it into your slice profile.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import EditableText from '@/components/EditableText.vue'
import StartFile from '@/files/StartFile.vue'
import { TOWER_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import { HEAT_LIMITS } from '@/control/heatLimits'
import { LEVEL_TONE, LEVEL_WORD } from '@/system/healthCheck'
import { DEFAULTS, TOWER, bandAtHeight, footprint, retractValues, tempValues, towerFile, towerHeight, valuesProblem, type Mode } from '@/tuning/materialTower'

const STEPS = [
  { id: 'pick', label: 'What to test', help: 'Head, material, range' },
  { id: 'make', label: 'The G-code', help: 'Shown, editable' },
  { id: 'print', label: 'Print it', help: 'About 10 to 20 minutes' },
  { id: 'judge', label: 'Look at it', help: 'Pick the best band' },
  { id: 'save', label: 'Record it', help: 'For this head and material' },
] as const
type StepId = (typeof STEPS)[number]['id']

const machine = useMachineStore()
const control = useControlStore()
const prep = usePrepareStore()
const tuning = useTuningStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)

// ---- 1 pick
const head = computed(() => machine.mountedName)
const isPrint = computed(() => machine.toolKind === 'print')
const mats = computed(() => (head.value ? prep.materialsOf(head.value) : []))
const matKey = ref<string>('')
const mat = computed(() => mats.value.find((m) => m.key === matKey.value) ?? mats.value[0] ?? null)
const mode = ref<Mode>('temperature')
const range = ref({ ...DEFAULTS.temperature })
function setMode(m: Mode) {
  mode.value = m
  range.value = { ...DEFAULTS[m] }
}
const values = computed(() => (mode.value === 'temperature' ? tempValues(range.value.start, range.value.step, range.value.count) : retractValues(range.value.start, range.value.step, range.value.count)))
const vProblem = computed(() => valuesProblem(mode.value, values.value, HEAT_LIMITS.hotend))
const bed = computed(() => ({ x: (machine.limits.max?.[0] ?? 300) - (machine.limits.min?.[0] ?? 0), y: (machine.limits.max?.[1] ?? 200) - (machine.limits.min?.[1] ?? 0) }))
const checks = computed(() => {
  const out: { level: 'PASS' | 'FAIL'; what: string; detail?: string }[] = []
  out.push(machine.klippyReady && !control.jobActive ? { level: 'PASS', what: 'Klipper is ready and no job is running' } : { level: 'FAIL', what: 'Klipper isn\'t ready, or a job is running' })
  out.push(isPrint.value ? { level: 'PASS', what: `${head.value} is mounted: a print head` } : { level: 'FAIL', what: 'A print head isn\'t mounted', detail: 'Mount one and confirm it in Control.' })
  out.push(mat.value ? { level: 'PASS', what: `Material: ${mat.value.name} (${mat.value.nozzle ?? 0.4} mm nozzle)` } : { level: 'FAIL', what: 'No materials for this head', detail: 'Add one in Assets.' })
  return out
})
const ready = computed(() => checks.value.every((c) => c.level === 'PASS') && !vProblem.value)
const nozzle = computed(() => mat.value?.nozzle ?? 0.4)

// ---- 2 make
const generated = computed(() => (head.value && mat.value ? towerFile({ tool: head.value, material: mat.value.name, nozzle: nozzle.value, path: mat.value.path ?? 0, bed: bed.value, mode: mode.value, values: values.value }) : ''))
const edited = ref('')
const touched = ref(false)
const text = computed({ get: () => (touched.value ? edited.value : generated.value), set: (v: string) => ((edited.value = v), (touched.value = true)) })
const textProblem = computed(() => (/\b(M112|SAVE_CONFIG|FIRMWARE_RESTART|RESTART|FORCE_MOVE|SET_KINEMATIC_POSITION)\b/i.test(text.value) ? 'That line isn\'t allowed in this wizard.' : !/START_JOB/.test(text.value) || !/END_PRINT/.test(text.value) ? 'The file needs its START_JOB and END_PRINT lines.' : null))
const uploaded = ref<string | null>(null)
const busy = ref(false)
const msg = ref<string | null>(null)
async function send() {
  busy.value = true
  msg.value = null
  try {
    const name = `tuning/${mode.value}-tower-${head.value}-${mat.value!.key}.gcode`.replace(/[^A-Za-z0-9_./-]/g, '_')
    uploaded.value = await machine.uploadFile(new File([text.value], name, { type: 'text/plain' }))
  } catch (e) {
    msg.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
const fp = computed(() => footprint(bed.value, mode.value))
const printing = computed(() => control.jobActive && !!machine.job.filename?.includes('-tower-'))

// ---- 4 judge, 5 save
const measured = ref<number | null>(null)
const band = ref<number | null>(null)
function fromHeight() {
  if (measured.value != null) band.value = bandAtHeight(measured.value, values.value.length)
}
const chosen = computed(() => (band.value == null ? null : values.value[band.value] ?? null))
const saved = ref(false)
const saveError = ref<string | null>(null)
async function save() {
  if (chosen.value == null || !head.value || !mat.value) return
  busy.value = true
  saveError.value = null
  try {
    await tuning.save({ tool: head.value, test: mode.value === 'temperature' ? 'print_temperature' : 'retraction_length', value: chosen.value, nozzle: nozzle.value, material: mat.value.name })
    saved.value = true
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />
    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="tower.step">
      <MascotRow :pose="TOWER_STEP_POSE[step]">
        <template v-if="step === 'pick'">
          <p class="q">What should the tower test?</p>
          <ul class="list checks"><li v-for="(c, i) in checks" :key="i"><StatusChip :tone="LEVEL_TONE[c.level]">{{ LEVEL_WORD[c.level] }}</StatusChip><span>{{ c.what }}<span v-if="c.detail" class="detail">{{ c.detail }}</span></span></li></ul>
          <div class="pick">
            <label class="opt" :class="{ on: mode === 'temperature' }"><input type="radio" :checked="mode === 'temperature'" @change="setMode('temperature')"><span><b>Temperature</b><span class="detail">The lowest temperature that still prints cleanly. Do this first: heat changes pressure advance.</span></span></label>
            <label class="opt" :class="{ on: mode === 'retraction' }"><input type="radio" :checked="mode === 'retraction'" @change="setMode('retraction')"><span><b>Retraction</b><span class="detail">The shortest retraction that stops strings between two pillars.</span></span></label>
          </div>
          <label v-if="mats.length > 1" class="tm-lbl">Material<select v-model="matKey" class="tm-inp"><option v-for="m in mats" :key="m.key" :value="m.key">{{ m.name }} ({{ m.nozzle ?? 0.4 }} mm)</option></select></label>
          <p class="row">
            <label class="tm-lbl">{{ mode === 'temperature' ? 'Bottom (C)' : 'First length (mm)' }}<input v-model.number="range.start" type="number" :step="mode === 'temperature' ? 5 : 0.1" class="tm-inp num"></label>
            <label class="tm-lbl">Step<input v-model.number="range.step" type="number" :step="mode === 'temperature' ? 1 : 0.1" class="tm-inp num"></label>
            <label class="tm-lbl">Bands<input v-model.number="range.count" type="number" min="3" max="10" class="tm-inp num"></label>
          </p>
          <p class="plain">{{ values.length }} bands of {{ TOWER.band }} mm, bottom to top: <b class="mono">{{ values.join(', ') }}</b>{{ mode === 'temperature' ? ' C' : ' mm' }}. {{ towerHeight(values.length) }} mm tall.</p>
          <p v-if="vProblem" class="tm-err">{{ vProblem }}</p>
          <WhatThisDoes><p>Studio writes the test G-code itself, so Klipper needs nothing extra. {{ mode === 'temperature' ? 'An M109 at the start of each band sets and waits for the temperature.' : 'Two small pillars stand apart; the retraction length changes every band, and the strings between the pillars show which length is enough.' }}</p></WhatThisDoes>
        </template>

        <template v-if="step === 'make'">
          <p class="q">This is the G-code that prints.</p>
          <EditableText v-model="text" :generated="generated" :problem="textProblem" label="The test file" :rows="10" />
          <p class="plain">It sits in the middle of the bed ({{ fp.x1 - fp.x0 }} × {{ fp.y1 - fp.y0 }} mm). Check that area is clear.</p>
          <p class="row"><RsButton variant="primary" :disabled="busy || !!textProblem || !ready || !!uploaded" @click="send">{{ busy ? 'Sending…' : uploaded ? 'Sent' : 'Send it to the Rhino' }}</RsButton><span v-if="uploaded" class="plain muted">Sent as {{ uploaded }}</span></p>
          <p v-if="msg" class="tm-err">{{ msg }}</p>
        </template>

        <template v-if="step === 'print'">
          <p class="q">Print it.</p>
          <p v-if="!uploaded" class="plain muted">Send the file first (step 2).</p>
          <template v-else>
            <p class="plain">The head heats from the material's own settings, then the tower prints, changing {{ mode === 'temperature' ? 'the temperature' : 'the retraction' }} every {{ TOWER.band }} mm. Watch the first layer, and stay near.</p>
            <StartFile v-if="!printing" :file-path="uploaded" stay />
            <p v-else class="plain">Printing the tower.</p>
          </template>
        </template>

        <template v-if="step === 'judge'">
          <p class="q">Which band looks best?</p>
          <p class="plain">{{ mode === 'temperature' ? 'Look for the band with the cleanest surface and the strongest layers, and the least stringing or blobs. The lowest temperature that still looks good is the best choice.' : 'Look between the two pillars: the lowest band with no strings is enough. Higher than that only adds wear and blobs.' }} Bands count from the bottom.</p>
          <div class="bands"><button v-for="(v, i) in values" :key="i" type="button" class="band" :class="{ on: band === i }" @click="band = i"><b>{{ i + 1 }}</b><span>{{ v }}{{ mode === 'temperature' ? ' C' : ' mm' }}</span></button></div>
          <p class="row"><label class="tm-lbl">Or measure up from the bed (mm)<input v-model.number="measured" type="number" step="0.5" class="tm-inp num"></label><RsButton variant="quiet" :disabled="measured == null" @click="fromHeight">Find the band</RsButton></p>
        </template>

        <template v-if="step === 'save'">
          <p class="q">{{ chosen == null ? 'Choose a band first.' : `Record ${chosen}${mode === 'temperature' ? ' C' : ' mm'} for ${head} with ${mat?.name}?` }}</p>
          <p v-if="chosen != null" class="plain">This is recorded on the Rhino for {{ head }}, {{ nozzle }} mm, {{ mat?.name }}, and shown on the Results page. <b>Slicing doesn't read it yet</b>: type it into your slice profile ({{ mode === 'temperature' ? 'the print temperature' : 'the retraction length' }}).</p>
          <p v-if="!saved && chosen != null" class="row"><RsButton variant="primary" :disabled="busy" @click="save">Record it</RsButton></p>
          <p v-if="saved" class="tm-ok">Recorded. {{ mode === 'temperature' ? 'Next, run pressure advance at this temperature.' : 'Done for this material.' }}</p>
          <p v-if="saveError" class="tm-err">{{ saveError }}</p>
        </template>
      </MascotRow>
    </RsPanel>
    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="busy" @click="at--">Back</RsButton>
      <RsButton v-if="step === 'pick'" variant="primary" :disabled="!ready" @click="touched = false; at = 1">Next</RsButton>
      <RsButton v-if="step === 'make'" variant="primary" :disabled="!uploaded" @click="at = 2">Next</RsButton>
      <RsButton v-if="step === 'print'" variant="primary" :disabled="printing" @click="at = 3">It's printed</RsButton>
      <RsButton v-if="step === 'judge'" variant="primary" :disabled="band == null" @click="at = 4">Next</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.muted { color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-code); }
.row { display: flex; flex-wrap: wrap; align-items: end; gap: var(--rs-space-3); margin: 0; }
.num { width: 7em; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.checks li { display: flex; align-items: baseline; gap: var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.checks li > :first-child { flex: none; }
.detail { display: block; font-size: var(--rs-text-sm); color: var(--rs-text-muted); font-weight: normal; }
.pick { display: flex; flex-wrap: wrap; gap: var(--rs-space-3); }
.opt { display: flex; gap: 8px; align-items: flex-start; flex: 1 1 240px; padding: 10px 12px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); cursor: pointer; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.opt.on { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.opt input { margin-top: 3px; accent-color: var(--rs-text-strong); }
.bands { display: flex; flex-wrap: wrap; gap: 6px; }
.band { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 76px; padding: 8px 10px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); cursor: pointer; }
.band.on { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
