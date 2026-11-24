<script setup lang="ts">
/**
 * Wizards > Motor check (Tool Manager docs/proposal-tuning-wizards-2.md, item 3): the end switches, the motor drivers and the
 * motors. The first two only read (QUERY_ENDSTOPS, DUMP_TMC). The motor test runs STEPPER_BUZZ (one motor 1 mm and back, ten
 * times) after the bed is lowered and the head is centred, and the person says whether it moved the right way. Writes nothing.
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
import { MOTOR_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { answered, buzzScript, driversFrom, findings, labelOf, parseEndstops, prepScript, validStepper, worst, type Driver, type Endstop, type Finding } from '@/checks/motorCheck'

const STEPS = [
  { id: 'switches', label: 'End switches', help: 'Press each by hand' },
  { id: 'drivers', label: 'Drivers', help: 'Read, nothing moves' },
  { id: 'motors', label: 'Motors', help: 'Each moves 1 mm and back' },
  { id: 'done', label: 'Summary', help: 'What was found' },
] as const
type StepId = (typeof STEPS)[number]['id']

const machine = useMachineStore()
const control = useControlStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)
const homed = computed(() => /x/.test(machine.position.homed.toLowerCase()) && /y/.test(machine.position.homed.toLowerCase()) && /z/.test(machine.position.homed.toLowerCase()))
const baseBlock = computed(() => (!machine.klippyReady ? 'Klipper isn\'t ready.' : control.jobActive ? 'A job is running.' : null))

// ---- 1 switches
const switches = ref<Endstop[]>([])
const seen = ref<Record<string, boolean>>({})
const watching = ref(false)
const switchError = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let busy = false
async function readSwitches() {
  if (busy) return
  busy = true
  try {
    const r = await control.runCapture('QUERY_ENDSTOPS', { label: 'Read the end switches' }, 300)
    const e = parseEndstops(r.lines)
    if (!r.ok || !e.length) switchError.value = 'Klipper didn\'t answer QUERY_ENDSTOPS. Look in Control for what it said.'
    else {
      switchError.value = null
      switches.value = e
      for (const s of e) if (s.triggered) seen.value = { ...seen.value, [s.name]: true }
    }
  } finally {
    busy = false
  }
}
function toggleWatch() {
  watching.value = !watching.value
  if (timer) (clearInterval(timer), (timer = null))
  if (watching.value) {
    void readSwitches()
    timer = setInterval(() => void readSwitches(), 1500)
  }
}
onBeforeUnmount(() => timer && clearInterval(timer))

// ---- 2 drivers
const drivers = computed<Driver[]>(() => driversFrom(machine.objects))
const reports = ref<Record<string, { found: Finding[]; ok: boolean }>>({})
const reading = ref(false)
const dumpText = ref<Record<string, string>>({})
async function readDrivers() {
  reading.value = true
  try {
    for (const d of drivers.value) {
      if (!validStepper(d.stepper)) continue
      const r = await control.runCapture(`DUMP_TMC STEPPER=${d.stepper}`, { label: `Read the ${labelOf(d.stepper)} driver` }, 400)
      dumpText.value = { ...dumpText.value, [d.stepper]: r.lines.join('\n') }
      reports.value = { ...reports.value, [d.stepper]: { found: findings(r.lines), ok: r.ok && answered(r.lines) } }
    }
  } finally {
    reading.value = false
  }
}
const driverLevel = (s: string) => {
  const r = reports.value[s]
  return !r ? null : !r.ok ? 'bad' : worst(r.found)
}
const TONE = { ok: 'ok', warn: 'warn', bad: 'danger' } as const
const WORD = { ok: 'Fine', warn: 'Look', bad: 'Problem' } as const

// ---- 3 motors
const lim = computed(() => (machine.limits.min && machine.limits.max ? { min: machine.limits.min, max: machine.limits.max } : null))
const prep = computed(() => prepScript(lim.value, machine.position.xyz?.[2] ?? null))
const prepared = ref(false)
const motorBlock = computed(() => baseBlock.value ?? (!homed.value ? 'Home the machine first (Control).' : !prep.value ? 'The machine\'s travel isn\'t known yet.' : null))
const result = ref<Record<string, 'ok' | 'wrong' | 'none' | 'error'>>({})
const working = ref<string | null>(null)
async function prepare() {
  if (!prep.value) return
  working.value = 'prep'
  try {
    prepared.value = await control.send(prep.value, { label: 'Motor check: bed down, head to the middle', confirmTitle: 'Lower the bed and centre the head?', confirmBody: 'The bed lowers by up to 10 mm, then the head moves to the middle. Keep the bed and the area around the head clear. Keep a hand near Stop.', confirmLabel: 'Go' })
  } finally {
    working.value = null
  }
}
async function buzz(stepper: string) {
  if (!validStepper(stepper)) return
  working.value = stepper
  try {
    const ok = await control.send(buzzScript(stepper), { label: `Motor check: ${labelOf(stepper)}`, confirmTitle: `Buzz the ${labelOf(stepper)}?`, confirmBody: 'The motor moves 1 mm one way and back, ten times. Watch it and listen. Keep a hand near Stop.', confirmLabel: 'Buzz it' })
    if (!ok) result.value = { ...result.value, [stepper]: 'error' }
  } finally {
    working.value = null
  }
}
const say = (s: string, v: 'ok' | 'wrong' | 'none') => (result.value = { ...result.value, [s]: v })
const motors = computed(() => (drivers.value.length ? drivers.value.map((d) => d.stepper) : ['stepper_x', 'stepper_y', 'stepper_z']))
const RESULT_WORD = { ok: 'Moved and came back', wrong: 'Wrong way or odd', none: 'Didn\'t move', error: 'Klipper refused' } as const
const RESULT_TONE = { ok: 'ok', wrong: 'warn', none: 'danger', error: 'danger' } as const
const problems = computed(() => {
  const out: string[] = []
  for (const [s, r] of Object.entries(reports.value)) {
    if (!r.ok) out.push(`${labelOf(s)}: the driver didn't answer.`)
    for (const f of r.found) out.push(`${labelOf(s)}: ${f.say}`)
  }
  for (const [s, v] of Object.entries(result.value)) if (v !== 'ok') out.push(`${labelOf(s)}: ${RESULT_WORD[v].toLowerCase()}.`)
  for (const s of switches.value) if (!seen.value[s.name] && watching.value === false && Object.keys(seen.value).length) out.push(`The ${s.name} switch was never seen triggered.`)
  return out
})
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="motorcheck.step">
      <MascotRow :pose="MOTOR_STEP_POSE[step]">
        <template v-if="step === 'switches'">
          <p class="q">Does each end switch answer?</p>
          <p class="plain">Press Watch, then press each end switch by hand (and touch the probe). A switch turns <b>triggered</b> when you press it and a tick stays so you can see it worked. Nothing moves.</p>
          <p class="row"><RsButton variant="primary" :disabled="!!baseBlock" @click="toggleWatch">{{ watching ? 'Stop watching' : 'Watch the switches' }}</RsButton><RsButton :disabled="!!baseBlock || watching" @click="readSwitches">Read once</RsButton></p>
          <p v-if="baseBlock" class="tm-err">{{ baseBlock }}</p>
          <p v-if="switchError" class="tm-err">{{ switchError }}</p>
          <ul v-if="switches.length" class="list">
            <li v-for="s in switches" :key="s.name"><StatusChip :tone="s.triggered ? 'warn' : 'neutral'">{{ s.triggered ? 'Triggered' : 'Open' }}</StatusChip> <b class="mono">{{ s.name }}</b><span v-if="seen[s.name]" class="plain muted"> ✓ seen working</span></li>
          </ul>
          <WhatThisDoes><p>This sends <code>QUERY_ENDSTOPS</code> every second and a half while you watch. It only reads. A switch that never changes is wired wrong, broken, or not the one you think it is.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'drivers'">
          <p class="q">Are the motor drivers healthy?</p>
          <p v-if="!drivers.length" class="plain">Klipper has no TMC drivers configured here, so there is nothing to read.</p>
          <p v-else class="plain">This reads each driver's status. Nothing moves and nothing is changed.</p>
          <p class="row"><RsButton variant="primary" :disabled="reading || !!baseBlock || !drivers.length" @click="readDrivers">{{ reading ? 'Reading…' : Object.keys(reports).length ? 'Read again' : 'Read the drivers' }}</RsButton></p>
          <p v-if="baseBlock" class="tm-err">{{ baseBlock }}</p>
          <ul class="list">
            <li v-for="d in drivers" :key="d.stepper" class="drv">
              <span class="head"><StatusChip v-if="driverLevel(d.stepper)" :tone="TONE[driverLevel(d.stepper)!]">{{ WORD[driverLevel(d.stepper)!] }}</StatusChip><b>{{ labelOf(d.stepper) }}</b> <span class="muted">{{ d.kind }}</span></span>
              <span v-if="reports[d.stepper] && !reports[d.stepper]!.ok" class="detail">The driver didn't answer. Check its wiring and that the board is powered.</span>
              <span v-for="f in reports[d.stepper]?.found ?? []" :key="f.flag" class="detail">{{ f.say }}</span>
            </li>
          </ul>
          <WhatThisDoes>
            <p>This sends <code>DUMP_TMC STEPPER=&lt;name&gt;</code> for each driver and reads its status flags (too hot, short, open load, power dip). It only reads. The full text Klipper printed:</p>
            <pre v-for="(t, k) in dumpText" :key="k" class="dump">{{ labelOf(String(k)) }}
{{ t }}</pre>
          </WhatThisDoes>
        </template>

        <template v-if="step === 'motors'">
          <p class="q">Does each motor move, the right way?</p>
          <p class="plain">First the bed lowers (up to 10 mm) and the head goes to the middle, so nothing can touch. Then each motor moves 1 mm one way and back, ten times. Watch it and say what you saw. Keep a hand near Stop.</p>
          <p v-if="motorBlock" class="tm-err">{{ motorBlock }}</p>
          <p class="row"><RsButton variant="primary" :disabled="!!motorBlock || !!working" @click="prepare">{{ prepared ? 'Do it again' : 'Lower the bed and centre the head' }}</RsButton></p>
          <ul class="list">
            <li v-for="m in motors" :key="m" class="mot">
              <b>{{ labelOf(m) }}</b>
              <RsButton size="sm" :disabled="!prepared || !!working || !!motorBlock" @click="buzz(m)">{{ working === m ? 'Moving…' : 'Buzz it' }}</RsButton>
              <span v-if="prepared" class="ans">
                <RsButton size="sm" variant="quiet" @click="say(m, 'ok')">Moved, came back</RsButton>
                <RsButton size="sm" variant="quiet" @click="say(m, 'wrong')">Wrong way or odd</RsButton>
                <RsButton size="sm" variant="quiet" @click="say(m, 'none')">Didn't move</RsButton>
              </span>
              <StatusChip v-if="result[m]" :tone="RESULT_TONE[result[m]!]">{{ RESULT_WORD[result[m]!] }}</StatusChip>
            </li>
          </ul>
          <WhatThisDoes><p>The lines are <code>{{ prep?.replace(/\n/g, ' ; ') ?? '(needs the machine homed)' }}</code> and then <code>STEPPER_BUZZ STEPPER=&lt;name&gt;</code> for each motor you press. A motor that goes the wrong way is wired the wrong way round; one that doesn't move has a loose plug, no power or a driver fault (see the Drivers step).</p></WhatThisDoes>
        </template>

        <template v-if="step === 'done'">
          <p class="q">{{ problems.length ? `${problems.length} thing${problems.length === 1 ? '' : 's'} to look at.` : Object.keys(reports).length || Object.keys(result).length ? 'Everything you checked looks fine.' : 'Nothing was checked yet.' }}</p>
          <ul v-if="problems.length" class="list"><li v-for="(p, i) in problems" :key="i" class="plain">{{ p }}</li></ul>
          <p class="plain muted">This wizard writes nothing. Run it again after wiring work.</p>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="!!working || reading" @click="at--">Back</RsButton>
      <RsButton v-if="step !== 'done'" variant="primary" :disabled="!!working || reading" @click="at++">{{ step === 'motors' ? 'Summary' : 'Next' }}</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.muted { color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-code); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.drv { display: flex; flex-direction: column; gap: 2px; }
.drv .head, .mot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); }
.ans { display: flex; flex-wrap: wrap; gap: 4px; }
.detail { color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.dump { margin: 8px 0 0; padding: 8px; font: 12px/1.4 var(--rs-font-code); background: var(--rs-surface-sunken, transparent); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm, 4px); white-space: pre-wrap; overflow-wrap: anywhere; }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
