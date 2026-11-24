<script setup lang="ts">
/**
 * Settings > Probe check (Tool Manager docs/proposal-tuning-wizards-2.md, item 1): is the probe steady enough to trust a bed
 * mesh? Runs PROBE_ACCURACY at a spot (10 touches) and says the result in words; optionally again with the bed warm, to show
 * thermal drift. It writes nothing to the Rhino's config. Probing moves the head to the spot and touches down a few times:
 * keep a hand near Stop. The G-code is shown and can be edited (docs/wizard-rules.md).
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import EditableText from '@/components/EditableText.vue'
import { PROBE_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { LEVEL_TONE, LEVEL_WORD } from '@/system/healthCheck'
import { BED_MAX, RATING_TONE, centreSpot, driftSentence, parseProbeAccuracy, problem, rate, script, sentence, warmProblem, type ProbeResult } from '@/checks/probeCheck'

const STEPS = [
  { id: 'check', label: 'Check', help: 'Homed, a head mounted' },
  { id: 'spot', label: 'Where', help: 'A spot over the bed' },
  { id: 'run', label: 'Measure', help: '10 touches, cold' },
  { id: 'warm', label: 'Warm bed', help: 'Optional: drift' },
  { id: 'done', label: 'Done', help: 'What it means' },
] as const
type StepId = (typeof STEPS)[number]['id']

const machine = useMachineStore()
const control = useControlStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)

// ---- 1 check
const homed = computed(() => machine.position.homed.toLowerCase())
const hasProbe = computed(() => machine.objects.has('probe'))
const checks = computed(() => {
  const out: { level: 'PASS' | 'FAIL'; what: string; detail?: string }[] = []
  out.push(machine.klippyReady ? { level: 'PASS', what: 'Klipper is ready' } : { level: 'FAIL', what: 'Klipper isn\'t ready', detail: 'Look in Control, or restart Klipper from Settings > Host.' })
  out.push(machine.mountedVerified ? { level: 'PASS', what: `${machine.mountedName} is mounted` } : { level: 'FAIL', what: 'No toolhead is confirmed as mounted', detail: 'Mount one and confirm it in Control, then come back.' })
  out.push(hasProbe.value ? { level: 'PASS', what: 'Klipper has a probe' } : { level: 'FAIL', what: 'Klipper has no [probe] section', detail: 'There is nothing to check.' })
  out.push(/x/.test(homed.value) && /y/.test(homed.value) && /z/.test(homed.value) ? { level: 'PASS', what: 'The machine is homed' } : { level: 'FAIL', what: 'The machine isn\'t homed', detail: 'Home all in Control first. The probe touches from the height homing leaves it at.' })
  out.push(control.jobActive ? { level: 'FAIL', what: 'A job is running', detail: 'Nothing moves until it is finished.' } : { level: 'PASS', what: 'No job is running' })
  return out
})
const ready = computed(() => checks.value.every((c) => c.level === 'PASS'))

// ---- 2 spot
const lim = computed(() => (machine.limits.min && machine.limits.max ? { min: machine.limits.min, max: machine.limits.max } : null))
const off = ref<{ x: number; y: number } | null>(null)
const x = ref(NaN)
const y = ref(NaN)
const offError = ref<string | null>(null)
onMounted(async () => {
  try {
    const s = await machine.configSection('probe')
    off.value = { x: Number(s?.x_offset ?? 0) || 0, y: Number(s?.y_offset ?? 0) || 0 }
  } catch (e) {
    off.value = { x: 0, y: 0 }
    offError.value = `Couldn't read the probe's offsets from Klipper (${(e as Error).message}); the spot below is the nozzle's, not the probe's.`
  }
  fillCentre()
})
function fillCentre() {
  const c = centreSpot(lim.value, off.value?.x ?? 0, off.value?.y ?? 0)
  if (c) (x.value = c.x, (y.value = c.y))
}
const spotProblem = computed(() => problem(x.value, y.value, lim.value))

// ---- 3 run
const generated = computed(() => script(x.value, y.value))
const edited = ref('')
const touched = ref(false)
const text = computed({
  get: () => (touched.value ? edited.value : generated.value),
  set: (v: string) => ((edited.value = v), (touched.value = true)),
})
const textProblem = computed(() => (/\b(M112|SAVE_CONFIG|FIRMWARE_RESTART|RESTART|FORCE_MOVE|SET_KINEMATIC_POSITION)\b/i.test(text.value) ? 'That line isn\'t allowed in this wizard.' : !/PROBE_ACCURACY/i.test(text.value) ? 'The G-code needs a PROBE_ACCURACY line.' : null))
const running = ref(false)
const cold = ref<ProbeResult | null>(null)
const warm = ref<ProbeResult | null>(null)
const runError = ref<string | null>(null)
async function measure(into: 'cold' | 'warm') {
  running.value = true
  runError.value = null
  try {
    const r = await control.runCapture(text.value, {
      label: 'Probe check',
      confirmTitle: 'Run the probe check?',
      confirmBody: 'The head moves to the spot and the probe touches down 10 times. Keep a hand near Stop.',
      confirmLabel: 'Measure',
    })
    const got = parseProbeAccuracy(r.lines)
    if (!r.ok || !got) runError.value = r.lines.find((l) => l.startsWith('!!'))?.replace(/^!!\s*/, '') ?? 'Klipper gave no result. Look in Control for what it said.'
    else (into === 'cold' ? (cold.value = got) : (warm.value = got))
  } finally {
    running.value = false
  }
}

// ---- 4 warm
const bedTemp = ref(60)
const bedProblem = computed(() => warmProblem(bedTemp.value))
const heating = ref(false)
async function measureWarm() {
  heating.value = true
  try {
    const ok = await control.send(`M190 S${bedTemp.value}`, { label: 'Heat the bed for the probe check', confirmTitle: `Heat the bed to ${bedTemp.value} C?`, confirmBody: 'The bed heats and Klipper waits for it. This can take several minutes. You can stop it with Stop.', confirmLabel: 'Heat the bed' })
    if (ok) await measure('warm')
  } finally {
    heating.value = false
  }
}
async function bedOff() {
  await control.send('M140 S0', { label: 'Bed off' })
}

const rating = computed(() => (cold.value ? rate(cold.value.range) : null))
const ratingTone = computed(() => (rating.value ? RATING_TONE[rating.value] : 'ok'))
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="probecheck.step">
      <MascotRow :pose="PROBE_STEP_POSE[step]">
        <template v-if="step === 'check'">
          <p class="q">Is the probe steady enough to trust a bed mesh?</p>
          <ul class="list checks">
            <li v-for="(c, i) in checks" :key="i"><StatusChip :tone="LEVEL_TONE[c.level]">{{ LEVEL_WORD[c.level] }}</StatusChip><span>{{ c.what }}<span v-if="c.detail" class="detail">{{ c.detail }}</span></span></li>
          </ul>
          <WhatThisDoes><p>Nothing moves in this step. The check touches the bed with the probe ten times at one spot and compares the heights. A steady probe gives the same height each time; this is the first thing to check before a mesh, a Z offset or a first-layer problem.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'spot'">
          <p class="q">Where should it touch?</p>
          <p class="plain">The middle of the bed is a good spot: clear of clamps and the bed edge. The numbers are where the <b>nozzle</b> goes, so the <b>probe</b> ends up over the middle{{ off ? ` (the probe sits ${off.x} mm in X and ${off.y} mm in Y from the nozzle)` : '' }}.</p>
          <p class="row">
            <label class="tm-lbl">X <input v-model.number="x" type="number" step="1" class="tm-inp num"></label>
            <label class="tm-lbl">Y <input v-model.number="y" type="number" step="1" class="tm-inp num"></label>
            <RsButton variant="quiet" @click="fillCentre">Use the middle</RsButton>
          </p>
          <p v-if="spotProblem" class="tm-err">{{ spotProblem }}</p>
          <p v-if="offError" class="plain muted">{{ offError }}</p>
          <p class="plain">Make sure nothing is on the bed at that spot.</p>
          <WhatThisDoes><p>The probe's offsets are read from Klipper's <code>[probe]</code> section. Nothing is written.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'run'">
          <p class="q">Measure: ten touches.</p>
          <EditableText v-model="text" :generated="generated" :problem="textProblem" label="The G-code this runs" :rows="4" />
          <p class="plain">The head moves to the spot, then the probe touches down ten times. Keep a hand near Stop.</p>
          <p class="row"><RsButton variant="primary" :disabled="running || !!textProblem || !ready" @click="measure('cold')">{{ running ? 'Measuring…' : cold ? 'Measure again' : 'Measure' }}</RsButton></p>
          <p v-if="runError" class="tm-err">{{ runError }}</p>
          <template v-if="cold">
            <p class="plain"><StatusChip :tone="ratingTone === 'ok' ? 'ok' : ratingTone === 'warn' ? 'warn' : 'danger'">{{ rating }}</StatusChip> {{ sentence(cold) }}</p>
            <p class="plain mono">range {{ cold.range.toFixed(4) }} · spread {{ cold.sd.toFixed(4) }} · highest {{ cold.max.toFixed(4) }} · lowest {{ cold.min.toFixed(4) }}</p>
          </template>
          <WhatThisDoes><p><code>PROBE_ACCURACY</code> is a built-in Klipper command: it probes the same spot ten times and prints the range. Under 0.0125 mm is excellent, under 0.02 mm is good, over 0.05 mm means don't trust a mesh yet. These are guidance, not a limit.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'warm'">
          <p class="q">Optional: does it change when the bed is warm?</p>
          <p class="plain">Some probes read differently hot. Heat the bed to the temperature you print at, let it settle, and measure again. This heats the bed, and Klipper waits for it (several minutes).</p>
          <p class="row">
            <label class="tm-lbl">Bed temperature (C) <input v-model.number="bedTemp" type="number" min="30" :max="BED_MAX" step="5" class="tm-inp num"></label>
            <RsButton variant="primary" :disabled="heating || running || !cold || !!bedProblem || !!textProblem" @click="measureWarm">{{ heating || running ? 'Working…' : 'Heat the bed and measure' }}</RsButton>
            <RsButton :disabled="heating" @click="bedOff">Turn the bed off</RsButton>
          </p>
          <p v-if="bedProblem" class="tm-err">{{ bedProblem }}</p>
          <p v-if="!cold" class="plain muted">Measure cold first (step 3).</p>
          <p v-if="runError" class="tm-err">{{ runError }}</p>
          <p v-if="cold && warm" class="plain">{{ driftSentence(cold, warm, bedTemp) }}</p>
          <WhatThisDoes><p>This sends <code>M190 S{{ bedTemp }}</code> (heat the bed and wait), then the same G-code again. It never goes above the bed's limit of {{ BED_MAX }} C. Turn the bed off when you are done.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'done'">
          <p class="q">{{ cold ? sentence(cold) : 'No measurement yet.' }}</p>
          <p v-if="cold && warm" class="plain">{{ driftSentence(cold, warm, bedTemp) }}</p>
          <p class="plain">If the probe wobbles: check it is mounted firmly, the cable isn't pulling or near a motor wire, and nothing touches it. Then measure again. If it is steady, the bed mesh and Z tilt can be trusted.</p>
          <p class="plain muted">This wizard writes nothing to the Rhino. Run it again after changing the probe or the head.</p>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="running || heating" @click="at--">Back</RsButton>
      <RsButton v-if="step === 'check'" variant="primary" :disabled="!ready" @click="at = 1">Next</RsButton>
      <RsButton v-if="step === 'spot'" variant="primary" :disabled="!!spotProblem" @click="touched = false; at = 2">Next</RsButton>
      <RsButton v-if="step === 'run'" variant="primary" :disabled="!cold || running" @click="at = 3">Next</RsButton>
      <RsButton v-if="step === 'warm'" variant="primary" :disabled="running || heating" @click="at = 4">{{ warm ? 'Next' : 'Skip' }}</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.muted { color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.row { display: flex; flex-wrap: wrap; align-items: end; gap: var(--rs-space-3); margin: 0; }
.num { width: 7em; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.checks li { display: flex; align-items: baseline; gap: var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.checks li > :first-child { flex: none; }
.detail { display: block; font-size: var(--rs-text-sm); color: var(--rs-text-muted); font-weight: normal; }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
