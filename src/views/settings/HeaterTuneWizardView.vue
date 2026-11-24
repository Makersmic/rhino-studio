<script setup lang="ts">
/**
 * Wizards > Tune a heater (Tool Manager docs/proposal-tuning-wizards-2.md, item 2): PID for the hotend, the bed and a chamber
 * heater. Runs PID_CALIBRATE (the heater runs on its own for minutes: stay near), reads the numbers Klipper prints, shows old and
 * new, and on Keep the Portal writes them into myrhino/tuned.cfg. SAVE_CONFIG is never sent: Klipper refuses a saved value that
 * conflicts with one in an included file, and the Rhino's PID values are in one. Klipper can't change PID live, so a restart applies it.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onBeforeUnmount, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import EditableText from '@/components/EditableText.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import { HEATER_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { HEAT_LIMITS } from '@/control/heatLimits'
import { LEVEL_TONE, LEVEL_WORD } from '@/system/healthCheck'
import type { TunedState } from '@/portal/client'
import { MINUTES, SUGGEST, compare, explain, heatersFrom, parsePid, sane, script, startProblem, targetProblem, textProblem, tunedLines, type Heater, type Pid } from '@/checks/heaterTune'

const STEPS = [
  { id: 'check', label: 'Check', help: 'Which heater' },
  { id: 'pick', label: 'Target', help: 'The temperature' },
  { id: 'review', label: 'Review', help: 'The G-code, editable' },
  { id: 'tune', label: 'Tune', help: 'It runs on its own' },
  { id: 'keep', label: 'Keep it', help: 'Old and new' },
] as const
type StepId = (typeof STEPS)[number]['id']

const machine = useMachineStore()
const control = useControlStore()
const maint = useMaintenanceStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)

// ---- 1 check
const heaters = computed(() => heatersFrom(machine.objects))
const picked = ref<string | null>(null)
const heater = computed<Heater | null>(() => heaters.value.find((h) => h.object === picked.value) ?? null)
const hasChamberHeater = computed(() => heaters.value.some((h) => h.kind === 'chamber'))
const tuned = ref<TunedState | null>(null)
const tunedError = ref<string | null>(null)
async function loadTuned() {
  try {
    tuned.value = await maint.portal()?.tunedState() ?? null
    tunedError.value = tuned.value ? null : 'The Rhino Portal isn\'t connected, so a tuned value can\'t be kept.'
  } catch (e) {
    tunedError.value = `The Rhino can't keep tuned values yet (${(e as Error).message}). Install the latest release first.`
  }
}
void loadTuned()
const checks = computed(() => {
  const out: { level: 'PASS' | 'FAIL'; what: string; detail?: string }[] = []
  out.push(machine.klippyReady ? { level: 'PASS', what: 'Klipper is ready' } : { level: 'FAIL', what: 'Klipper isn\'t ready', detail: 'Look in Control, or restart Klipper from Settings > Host.' })
  out.push(control.jobActive ? { level: 'FAIL', what: 'A job is running', detail: 'Tune when nothing is printing.' } : { level: 'PASS', what: 'No job is running' })
  out.push(tunedError.value ? { level: 'FAIL', what: 'Tuned values can\'t be kept', detail: tunedError.value } : { level: 'PASS', what: 'The Rhino can keep the result' })
  out.push(heaters.value.length ? { level: 'PASS', what: `${heaters.value.length} heater${heaters.value.length === 1 ? '' : 's'} found` } : { level: 'FAIL', what: 'No heater found' })
  return out
})
const ready = computed(() => checks.value.every((c) => c.level === 'PASS'))

// ---- 2 target
const target = ref(NaN)
const limit = ref<number | undefined>(undefined)
const now = ref<number | null>(null)
async function choose(h: Heater) {
  picked.value = h.object
  target.value = SUGGEST[h.kind]
  limit.value = h.kind === 'hotend' ? HEAT_LIMITS.hotend : h.kind === 'bed' ? HEAT_LIMITS.bed : undefined
  now.value = (await machine.heaterNow(h.object).catch(() => ({ temperature: null }))).temperature
}
const tProblem = computed(() => (heater.value ? targetProblem(heater.value, target.value, limit.value) ?? startProblem(heater.value, now.value, target.value) : null))

// ---- 3 review
const generated = computed(() => (heater.value ? script(heater.value, target.value) : ''))
const edited = ref('')
const touched = ref(false)
const text = computed({
  get: () => (touched.value ? edited.value : generated.value),
  set: (v: string) => ((edited.value = v), (touched.value = true)),
})
const tx = computed(() => (heater.value ? textProblem(text.value, heater.value) : null))

// ---- 4 tune
const running = ref(false)
const result = ref<Pid | null>(null)
const runError = ref<string | null>(null)
const live = ref<number | null>(null)
let poll: ReturnType<typeof setInterval> | null = null
async function tune() {
  const h = heater.value
  if (!h) return
  running.value = true
  runError.value = null
  result.value = null
  poll = setInterval(async () => (live.value = (await machine.heaterNow(h.object).catch(() => ({ temperature: null }))).temperature), 3000)
  try {
    const r = await control.runCapture(text.value, {
      label: `Tune the ${h.label.toLowerCase()}`,
      confirmTitle: `Tune the ${h.label.toLowerCase()}?`,
      confirmBody: `The ${h.label.toLowerCase()} heats on its own for about ${MINUTES[h.kind]} minutes. Stay nearby; Stop cuts the heater. Nothing is kept until you say so.`,
      confirmLabel: 'Start the tune',
    }, 1500)
    const p = parsePid(r.lines)
    if (!r.ok || !p || !sane(p)) runError.value = r.lines.find((l) => l.startsWith('!!'))?.replace(/^!!\s*/, '') ?? 'Klipper gave no result. Look in Control for what it said. Nothing was changed.'
    else (result.value = p, (at.value = 4))
  } finally {
    running.value = false
    if (poll) (clearInterval(poll), (poll = null))
  }
}
onBeforeUnmount(() => poll && clearInterval(poll))

// ---- 5 keep
const old = computed<Pid | null>(() => {
  const k = tuned.value?.pid[heater.value?.object ?? '']
  return k ? { kp: k.kp, ki: k.ki, kd: k.kd } : null
})
const saving = ref(false)
const kept = ref(false)
const keepError = ref<string | null>(null)
async function keep() {
  const h = heater.value, p = result.value, portal = maint.portal()
  if (!h || !p || !portal || !tuned.value) return
  saving.value = true
  keepError.value = null
  try {
    tuned.value = await portal.tunedPid(tuned.value.rev, h.object, p)
    kept.value = true
  } catch (e) {
    keepError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
async function putBack() {
  const h = heater.value, portal = maint.portal()
  if (!h || !portal || !tuned.value) return
  saving.value = true
  try {
    tuned.value = await portal.tunedClear(tuned.value.rev, h.object)
    kept.value = false
  } catch (e) {
    keepError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />
    <RestartBanner />

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="heatertune.step">
      <MascotRow :pose="HEATER_STEP_POSE[step]">
        <template v-if="step === 'check'">
          <p class="q">Which heater should learn its own power?</p>
          <ul class="list checks">
            <li v-for="(c, i) in checks" :key="i"><StatusChip :tone="LEVEL_TONE[c.level]">{{ LEVEL_WORD[c.level] }}</StatusChip><span>{{ c.what }}<span v-if="c.detail" class="detail">{{ c.detail }}</span></span></li>
          </ul>
          <div class="pick">
            <button v-for="h in heaters" :key="h.object" type="button" class="opt" :class="{ on: picked === h.object }" @click="choose(h)">
              <b>{{ h.label }}</b><span class="detail">{{ h.kind === 'hotend' ? 'Tune with the part fan on, as in a print.' : h.kind === 'bed' ? 'Use the temperature you print at most.' : `Slow: ${MINUTES.chamber} minutes. Close the door.` }}</span>
            </button>
          </div>
          <p v-if="!hasChamberHeater" class="plain muted">No chamber heater is set up yet. When you add one (Add hardware, a heater), it shows here.</p>
          <WhatThisDoes><p>Nothing is heated in this step. A PID tune lets Klipper learn how much power the heater needs to hold a temperature without swinging. The heaters are the ones Klipper has: the hotend, the bed, and any <code>heater_generic</code> (a chamber).</p></WhatThisDoes>
        </template>

        <template v-if="step === 'pick' && heater">
          <p class="q">What temperature should the {{ heater.label.toLowerCase() }} hold?</p>
          <p class="plain">The {{ heater.kind === 'hotend' ? 'temperature you print at' : heater.kind === 'bed' ? 'bed temperature you use most' : 'chamber temperature you want to hold' }}. The tune runs at this temperature and takes about {{ MINUTES[heater.kind] }} minutes.</p>
          <p class="row"><label class="tm-lbl">Temperature (C) <input v-model.number="target" type="number" step="5" class="tm-inp num"></label><span class="plain muted">now {{ now === null ? '—' : now.toFixed(0) + ' C' }}</span></p>
          <p v-if="tProblem" class="tm-err">{{ tProblem }}</p>
          <p v-if="heater.kind === 'chamber'" class="plain">Close the door and set any chamber fan or vent the way a print uses them. Say whether the bed may be on: a hot bed warms the chamber and changes the result. The wizard doesn't turn the bed on.</p>
          <WhatThisDoes><p>The temperature is limited to the heater's own maximum (and 120 C for a chamber), with a little room under it. The heater's safety checks (<code>verify_heater</code>) stay on and are not touched.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'review' && heater">
          <p class="q">This is the G-code that runs.</p>
          <EditableText v-model="text" :generated="generated" :problem="tx" label="The G-code this runs" :rows="4" />
          <p class="plain">The heater turns itself on and off many times to measure how it reacts. It takes {{ MINUTES[heater.kind] }} minutes. Stay nearby; Stop cuts the heater.</p>
          <WhatThisDoes><p><code>PID_CALIBRATE</code> is built into Klipper. It ends by asking for <code>SAVE_CONFIG</code>; this wizard never sends that. Klipper refuses to start if a saved value conflicts with one in an included file, and your hotend and bed values are in one. Instead the Rhino keeps the numbers in its own <code>myrhino/tuned.cfg</code>, which Klipper reads after the others.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'tune' && heater">
          <p class="q">Run the tune.</p>
          <p class="row"><RsButton variant="primary" :disabled="running || !ready || !!tx || !!tProblem" @click="tune">{{ running ? 'Tuning…' : 'Start the tune' }}</RsButton><span v-if="running" class="plain">{{ heater.label }} {{ live === null ? '' : live.toFixed(1) + ' C' }}: it can take {{ MINUTES[heater.kind] }} minutes.</span></p>
          <p v-if="runError" class="tm-err">{{ runError }}</p>
          <p class="plain muted">If Klipper stops with a heater error, nothing was changed. Fix the cause (a loose thermistor or cartridge) and run it again.</p>
        </template>

        <template v-if="step === 'keep' && heater && result">
          <p class="q">Keep these values?</p>
          <ul class="list mono"><li v-for="(l, i) in compare(old, result)" :key="i">{{ l }}</li></ul>
          <p class="plain">{{ explain(old, result) }}</p>
          <p v-if="!kept" class="row"><RsButton variant="primary" :disabled="saving" @click="keep">Keep it</RsButton><span class="plain muted">Or leave this page: nothing is changed unless you keep it.</span></p>
          <p v-else class="tm-ok">Kept. Klipper uses the new values after it restarts (the banner above offers the restart). <RsButton variant="quiet" :disabled="saving" @click="putBack">Put back what it had</RsButton></p>
          <p v-if="keepError" class="tm-err">{{ keepError }}</p>
          <WhatThisDoes><p>Keep writes this into <code>myrhino/tuned.cfg</code>:</p><pre class="dump">{{ tunedLines(heater, result).join('\n') }}</pre><p>The old values are remembered so Put back can restore them. The restart is yours to choose; the wizard never restarts Klipper by itself.</p></WhatThisDoes>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="running || saving" @click="at--">Back</RsButton>
      <RsButton v-if="step === 'check'" variant="primary" :disabled="!ready || !heater" @click="at = 1">Next</RsButton>
      <RsButton v-if="step === 'pick'" variant="primary" :disabled="!!tProblem" @click="touched = false; at = 2">Next</RsButton>
      <RsButton v-if="step === 'review'" variant="primary" :disabled="!!tx" @click="at = 3">Next</RsButton>
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
.opt { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left; padding: 10px 12px; min-width: 200px; flex: 1 1 200px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); cursor: pointer; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.opt.on { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.dump { margin: 8px 0; padding: 8px; font: 12px/1.4 var(--rs-font-code); background: var(--rs-surface-sunken, transparent); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm, 4px); white-space: pre-wrap; }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
