<script setup lang="ts">
/**
 * Care › Guide me (Mike, Nov 15): walks one Care task step by step. Gates first (what Klipper must say before you
 * start), then each step in order: a tick, a pick (what happened), or a Do (a command Studio builds itself and sends
 * through the same check and confirm as the console). A wait where the task needs one, then the Work log entry.
 * Gates are re-checked all the way through: if a job starts or the hotend heats, it holds until that is cleared.
 * The logic is in src/care/ (tested); this page only drives it and draws.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import MascotRow from '@/components/MascotRow.vue'
import LiveStrip from '@/control/LiveStrip.vue'
import { DONE_POSE } from '@/brand/mascot'
import { DOS, GENERIC, checkGates, guideSteps, logNote, stepKey, waitAfter, type Answers, type GateFacts, type GuideStep } from '@/care/guide'
import { findGuide } from '@/care/guides'
import { FlexWatch } from '@/care/flex'
import { levelFacts, passLines } from '@/care/level'
import { lastTiltRun } from '@/bed/zscrews'
import { today } from '@/maintenance/edit'
import { useControlStore } from '@/stores/control'
import { useGuideStore } from '@/stores/guide'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'

const route = useRoute()
const care = useMaintenanceStore()
const machine = useMachineStore()
const control = useControlStore()
const saved = useGuideStore()

const id = computed(() => String(route.params.id ?? ''))
const task = computed(() => care.overview?.tasks.find((t) => t.id === id.value) ?? null)
const def = computed(() => findGuide(task.value?.link?.template))
const look = computed(() => def.value ?? { ...GENERIC, template: '' })

const tiltRun = computed(() => lastTiltRun(control.lines))
const facts = computed<GateFacts>(() => ({
  klippyReady: machine.klippyReady,
  jobActive: control.jobActive,
  hotendTemp: machine.hotend.temp,
  hotendTarget: machine.hotend.target,
  spindleOn: machine.outputs.spindle ? machine.outputs.spindle.on : null,
  spindleThrottle: machine.outputs.spindle ? machine.outputs.spindle.throttle : null,
  spindleRpm: machine.outputs.spindle ? machine.outputs.spindle.rpm : null,
  laserArmed: machine.outputs.laser ? machine.outputs.laser.armed : null,
  toolPowerActive: machine.outputs.toolPower ? machine.outputs.toolPower.active : null,
  mountedType: machine.toolState.kind === 'mounted' ? (machine.toolState.type ?? null) : null,
  homedXyz: ['x', 'y', 'z'].every((a) => machine.position.homed.includes(a)),
  heatersOn: (machine.hotend.target ?? 0) > 0 || (machine.bed.target ?? 0) > 0,
  toolMismatch: machine.toolState.kind === 'mismatch',
  ...levelFacts(tiltRun.value),
}))
const homedNow = computed(() => ['x', 'y', 'z'].every((a) => machine.position.homed.includes(a)))
const tiltLines = computed(() => passLines(tiltRun.value))
const gates = computed(() => checkGates(look.value.gates, facts.value))
const failing = computed(() => gates.value.filter((g) => !g.ok))
/** the first screen also shows the checks that only apply to starting */
const startGates = computed(() => checkGates([...look.value.gates, ...(def.value?.startGates ?? [])], facts.value))
const startFailing = computed(() => startGates.value.filter((g) => !g.ok))

type Phase = 'before' | 'steps' | 'log' | 'done'
const phase = ref<Phase>('before')
const at = ref(0)
const answers = ref<Answers>({})
const steps = computed(() => guideSteps(def.value, task.value?.steps, answers.value, facts.value))
const cur = computed(() => steps.value[at.value] ?? null)
const waitLeft = ref(0)
const waitLabel = ref('')
const waitUntil = ref(0)
const notes = ref('')
const busy = ref(false)
const doing = ref(false)
/** the command steps actually run in this guide: a gate that was already true can't stand in for doing it */
const ran = ref<Set<string>>(new Set())
/** the ones pressed at all, even if Klipper refused: a failure message belongs after a try, a hint before it */
const tried = ref<Set<string>>(new Set())
const error = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | undefined

/** pick up where you left off: the step, the answers, and a wait that kept running while you were away */
function restore() {
  const p = saved.get(id.value)
  if (!p || p.phase === 'done') return
  phase.value = p.phase
  at.value = p.at
  answers.value = { ...p.answers }
  ran.value = new Set(p.ran)
  tried.value = new Set(p.tried)
  notes.value = p.notes
  const left = Math.ceil((p.waitUntil - Date.now()) / 1000)
  if (left > 0) startWait({ seconds: left, label: p.waitLabel })
}
function persist() {
  if (phase.value === 'done' || (phase.value === 'before' && !Object.keys(answers.value).length)) {
    saved.clear(id.value)
    return
  }
  saved.set(id.value, {
    phase: phase.value,
    at: at.value,
    answers: { ...answers.value },
    ran: [...ran.value],
    tried: [...tried.value],
    notes: notes.value,
    waitUntil: waitUntil.value,
    waitLabel: waitLabel.value,
  })
}
function reset() {
  phase.value = 'before'
  at.value = 0
  answers.value = {}
  ran.value = new Set()
  tried.value = new Set()
  notes.value = ''
  waitLeft.value = 0
  waitUntil.value = 0
  clearInterval(timer)
}
function startOver() {
  reset()
  saved.clear(id.value)
}
onMounted(() => {
  if (!care.overview) void care.refresh()
  restore()
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(watchTimer)
})
watch(id, () => {
  reset()
  restore()
})
watch([phase, at, answers, ran, tried, notes, waitUntil], persist, { deep: true })

function begin() {
  at.value = 0
  answers.value = def.value?.start?.({ klippyReady: machine.klippyReady, message: machine.klippyMessage, homed: homedNow.value }) ?? {}
  ran.value = new Set()
  tried.value = new Set()
  phase.value = 'steps'
}
function startWait(w: { seconds: number; label: string }) {
  waitLeft.value = w.seconds
  waitLabel.value = w.label
  waitUntil.value = Date.now() + w.seconds * 1000
  clearInterval(timer)
  timer = setInterval(() => {
    waitLeft.value -= 1
    if (waitLeft.value <= 0) {
      waitLeft.value = 0
      clearInterval(timer)
    }
  }, 1000)
}
function next() {
  const c = cur.value
  // remember the spindle's measured RPM for the log (a tachometer gives one; without it nothing is stored)
  if (c?.capture) answers.value = { ...answers.value, [c.capture.key]: String(machine.outputs.spindle?.rpm ?? '') }
  const w = c?.wait ?? waitAfter(def.value, at.value)
  if (at.value >= steps.value.length - 1) {
    phase.value = 'log'
    return
  }
  at.value += 1
  if (w) startWait(w)
}
function back() {
  if (waitLeft.value > 0) return
  if (at.value > 0) at.value -= 1
  else phase.value = 'before'
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** what must hold before you can go on from this step (the guide's own gates, then the step's) */
const needing = computed(() => checkGates(cur.value?.need ?? [], facts.value).filter((g) => !g.ok))
/** what must hold before a Do button is offered */
const beforeDo = computed(() => checkGates(cur.value?.before ?? [], facts.value).filter((g) => !g.ok))
const picked = computed(() => {
  const c = cur.value
  if (!c?.key) return true
  const v = answers.value[c.key]
  if (c.kind === 'pick') return !!v
  if (c.kind === 'watch') return v !== undefined
  if (c.kind === 'number') {
    const n = Number(v)
    return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= (c.min ?? -Infinity) && n <= (c.max ?? Infinity)
  }
  return true
})

// ---- the flex test: watch the tool's thermistor and tool sensor while you flex the cable
const watching = ref(false)
const watchLeft = ref(0)
let watchTimer: ReturnType<typeof setInterval> | undefined
function startWatch(step: GuideStep) {
  if (!step.key || watching.value) return
  const w = new FlexWatch()
  const total = step.seconds ?? 60
  const t0 = Date.now()
  watching.value = true
  watchLeft.value = total
  watchTimer = setInterval(() => {
    const t = (Date.now() - t0) / 1000
    w.push({ t, temp: machine.hotend.temp, toolOk: machine.toolState.kind === 'mounted' })
    watchLeft.value = Math.max(0, Math.ceil(total - t))
    if (t >= total) {
      clearInterval(watchTimer)
      watching.value = false
      answers.value = { ...answers.value, [step.key!]: String(w.count), flexDetail: w.summary() }
    }
  }, 250)
}
const curKey = computed(() => (cur.value ? stepKey(cur.value) : ''))
const didIt = computed(() => cur.value?.kind !== 'do' || !cur.value.do || ran.value.has(curKey.value))
const canNext = computed(() => failing.value.length === 0 && needing.value.length === 0 && waitLeft.value === 0 && picked.value && didIt.value)

async function runDo(step: GuideStep) {
  const d = step.do
  if (!d) return
  const key = stepKey(step)
  const c = DOS[d]
  doing.value = true
  tried.value = new Set([...tried.value, key])
  if (c.heater) {
    // Control's own heater path: Klipper's max_temp, a confirmed print head; off is always allowed
    const t = d === 'heat' ? Number(answers.value.temp) : 0
    try {
      if (Number.isFinite(t)) await control.setHeater('extruder', t)
      ran.value = new Set([...ran.value, key])
    } finally {
      doing.value = false
    }
    return
  }
  // the same as Bed › Configuration: pressing Level relocks the lead-screw padlock first
  if (d === 'level') control.lockScrews()
  try {
    const sent = await control.send(c.script, { label: c.logLabel ?? c.label, confirmTitle: c.title, confirmBody: c.body, confirmLabel: c.confirmLabel })
    if (sent) ran.value = new Set([...ran.value, key])
  } finally {
    doing.value = false
  }
}

const klippyWords = computed(() => {
  const m = machine.klippyMessage
  return `${machine.klippy}${m ? `: ${m.trim().slice(0, 300)}` : ''}`
})

async function finish() {
  if (!task.value) return
  busy.value = true
  error.value = null
  try {
    const note = def.value?.note ? def.value.note(answers.value, notes.value, facts.value) : logNote(steps.value.length, notes.value)
    await care.logWork(task.value.id, { action: 'done', date: today(), notes: note })
    phase.value = 'done'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="guide">
    <RouterLink to="/care/tasks" class="back">‹ Care tasks</RouterLink>
    <p v-if="!task && care.overview" class="muted">That task isn’t in Care any more. Go back and pick another.</p>
    <p v-else-if="!task" class="muted">Loading the task…</p>

    <template v-else>
      <LiveStrip />
      <RsPanel :title="task.title" :status="phase === 'steps' ? `Step ${at + 1} of ${steps.length}` : undefined">
        <MascotRow :pose="phase === 'done' ? DONE_POSE : look.pose">
          <!-- before -->
          <template v-if="phase === 'before'">
            <h2 class="h">Before you start</h2>
            <p v-if="task.safety" class="warn" role="note"><b>Safety.</b> {{ task.safety }}</p>
            <p v-if="task.parts?.length || task.tools_needed || task.minutes" class="small">
              <template v-if="task.minutes">About {{ task.minutes }} minutes. </template>
              <template v-if="task.parts?.length">Parts: {{ task.parts.join(', ') }}. </template>
              <template v-if="task.tools_needed">Tools: {{ task.tools_needed }}.</template>
            </p>
            <ul v-if="startGates.length" class="gates" aria-label="What the machine must say first">
              <li v-for="g in startGates" :key="g.id" :class="{ no: !g.ok }">
                <span class="mark" aria-hidden="true">{{ g.ok ? '✓' : '✗' }}</span>
                <span>{{ g.label }}<template v-if="!g.ok"><br /><small>{{ g.why }}</small></template></span>
              </li>
            </ul>
            <p v-else-if="def?.build" class="small">Klipper says <b>{{ machine.klippy }}</b>. This guide works through what happened, restarts only if you confirm, and checks the machine moves freely.</p>
            <p v-else class="small">Nothing for the machine to check first. {{ steps.length }} step{{ steps.length === 1 ? '' : 's' }} follow.</p>
            <div class="row"><RsButton variant="primary" :disabled="startFailing.length > 0" @click="begin">Start</RsButton></div>
          </template>

          <!-- steps -->
          <template v-else-if="phase === 'steps' && cur">
            <div class="bar" role="progressbar" :aria-valuenow="at + 1" :aria-valuemax="steps.length"><i :style="{ width: ((at + 1) / steps.length) * 100 + '%' }" /></div>
            <p class="step">{{ cur.text }}</p>

            <p v-if="cur.show === 'klippy'" class="klippy" role="status"><b>Klipper says:</b> {{ klippyWords }}</p>

            <p v-if="cur.command" class="cmd" aria-label="Type this in the console"><code>{{ cur.command }}</code></p>
            <p v-if="cur.show === 'spindle'" class="klippy" role="status">
              <b>Spindle:</b> relay {{ machine.outputs.spindle?.on ? 'on' : 'off' }} · throttle {{ Math.round((machine.outputs.spindle?.throttle ?? 0) * 100) }} %<template v-if="machine.outputs.spindle?.rpm != null"> · {{ Math.round(machine.outputs.spindle.rpm) }} rpm</template>
            </p>
            <label v-if="cur.kind === 'number' && cur.key" class="field">
              <span class="small">Reading ({{ cur.unit }})</span>
              <input v-model="answers[cur.key]" class="num" type="text" inputmode="decimal" autocomplete="off" :aria-label="`Reading in ${cur.unit}`" />
            </label>
            <div v-if="cur.kind === 'watch' && cur.key" class="row">
              <RsButton :disabled="watching || needing.length > 0 || answers[cur.key] !== undefined" @click="startWatch(cur)">{{ watching ? `Watching… ${watchLeft} s` : answers[cur.key] !== undefined ? 'Watched' : 'Start watching' }}</RsButton>
              <span v-if="answers[cur.key] !== undefined" class="small">{{ answers.flexDetail }}</span>
            </div>
            <ul v-if="cur.show === 'tilt' && tiltLines.length" class="passes" aria-label="Each levelling pass">
              <li v-for="l in tiltLines" :key="l">{{ l }}</li>
            </ul>

            <p v-if="cur.links?.length" class="links">
              <RouterLink v-for="l in cur.links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
            </p>

            <fieldset v-if="cur.kind === 'pick' && cur.key && cur.options" class="pick">
              <legend class="small">Pick one</legend>
              <label v-for="o in cur.options" :key="o.id" class="opt">
                <input v-model="answers[cur.key]" type="radio" :name="cur.key" :value="o.id" /> <span>{{ o.label }}</span>
              </label>
            </fieldset>

            <template v-if="cur.kind === 'do' && cur.do">
              <p v-if="beforeDo.length" class="warn" role="note"><b>Not yet.</b> {{ beforeDo[0]!.why }}</p>
              <div class="row">
                <RsButton :disabled="beforeDo.length > 0 || doing" @click="runDo(cur)">{{ DOS[cur.do].label }}</RsButton>
                <span v-if="!beforeDo.length && needing.length && !tried.has(curKey)" class="small">{{ needing[0]!.why }}</span>
              </div>
              <p v-if="!beforeDo.length && needing.length && tried.has(curKey)" class="warn" role="alert"><b>Holding.</b> {{ needing[0]!.why }}</p>
            </template>

            <p v-if="failing.length" class="warn" role="alert"><b>Holding.</b> {{ failing[0]!.why }}</p>
            <p v-else-if="needing.length && cur.kind !== 'do'" class="warn" role="note"><b>Holding.</b> {{ needing[0]!.why }}</p>
            <p v-if="waitLeft > 0" class="wait" role="timer">{{ waitLabel }}: <b class="mono">{{ mmss(waitLeft) }}</b> left. Don’t go on until it reaches zero.</p>
            <div class="row">
              <RsButton variant="quiet" :disabled="waitLeft > 0" @click="back">Back</RsButton>
              <RsButton variant="quiet" @click="startOver">Start over</RsButton>
              <RsButton variant="primary" :disabled="!canNext" @click="next">{{ at === steps.length - 1 ? 'Done, go to the log' : 'Done, next' }}</RsButton>
            </div>
          </template>

          <!-- log -->
          <template v-else-if="phase === 'log'">
            <h2 class="h">Log it</h2>
            <p class="small">All {{ steps.length }} step{{ steps.length === 1 ? '' : 's' }} done. Anything you found or replaced?</p>
            <label class="field"><span class="small">Notes</span><textarea v-model="notes" rows="3" maxlength="700" placeholder="What you found or replaced (optional)" /></label>
            <p v-if="error" class="warn" role="alert">{{ error }}</p>
            <div class="row">
              <RsButton variant="quiet" @click="phase = 'steps'">Back</RsButton>
              <RsButton variant="primary" :disabled="busy" @click="finish">Log the work</RsButton>
            </div>
          </template>

          <!-- done -->
          <template v-else>
            <h2 class="h">Logged</h2>
            <p class="small">The Work log has it, and the task’s next due date has moved on.</p>
            <div class="row"><RouterLink to="/care"><RsButton>Back to Care</RsButton></RouterLink></div>
          </template>
        </MascotRow>
      </RsPanel>
    </template>
  </div>
</template>

<style scoped>
.guide { max-width: 880px; }
/* the phone's bottom bar is fixed: leave room so the last buttons can scroll clear of it */
@media (max-width: 720px) { .guide { padding-bottom: 96px; } }
.back { display: inline-block; margin-bottom: var(--rs-space-2); font-size: var(--rs-text-sm); color: var(--rs-text-muted); text-decoration: none; }
.muted { color: var(--rs-text-muted); }
.h { margin: 0; font-family: var(--rs-font-display-ui, var(--rs-font-ui)); font-size: 1.15rem; }
.small { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.warn { margin: 0; padding: 6px 10px; border-left: 3px solid var(--rs-line-strong); background: var(--rs-surface-2); font-size: var(--rs-text-sm); }
.klippy { margin: 0; padding: 8px 10px; border: 1px solid var(--rs-line-strong); border-radius: 6px; font: var(--rs-text-xs) / 1.5 var(--rs-font-code); overflow-wrap: anywhere; white-space: pre-wrap; }
.passes { list-style: none; margin: 0; padding: 8px 10px; border: 1px solid var(--rs-line-strong); border-radius: 6px; display: grid; gap: 2px; font: var(--rs-text-xs) / 1.5 var(--rs-font-code); }
.links { margin: 0; font-size: var(--rs-text-sm); display: flex; gap: var(--rs-space-3); flex-wrap: wrap; }
.links a { color: var(--rs-text-strong); }
.cmd { margin: 0; }
.cmd code { display: block; padding: 8px 10px; border: 1px solid var(--rs-line-strong); border-radius: 6px; font: var(--rs-text-sm) / 1.5 var(--rs-font-code); user-select: all; overflow-wrap: anywhere; background: var(--rs-surface-2); }
.num { font: inherit; font-family: var(--rs-font-code); padding: 8px; max-width: 12rem; border: 1px solid var(--rs-line-strong); border-radius: 6px; background: var(--rs-surface); color: var(--rs-text-strong); }
.pick { border: 0; padding: 0; margin: 0; display: grid; gap: 6px; }
.opt { display: flex; gap: 8px; align-items: flex-start; font-size: var(--rs-text-sm); cursor: pointer; }
.gates { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.gates li { display: flex; gap: 10px; align-items: flex-start; font-size: var(--rs-text-sm); }
.gates .mark { width: 18px; flex: none; font-weight: 700; }
.gates li.no { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.gates small { font-weight: 400; color: var(--rs-text-muted); }
.row { display: flex; gap: var(--rs-space-2); flex-wrap: wrap; align-items: center; }
.bar { height: 6px; border: 1px solid var(--rs-line-strong); border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--rs-ink); }
.step { margin: 0; font-size: 1.1rem; line-height: 1.45; color: var(--rs-text-strong); }
.wait { margin: 0; font-size: var(--rs-text-sm); }
.mono { font-family: var(--rs-font-code); font-variant-numeric: tabular-nums; }
.field { display: grid; gap: 4px; }
.field textarea { font: inherit; padding: 8px; border: 1px solid var(--rs-line-strong); border-radius: 6px; background: var(--rs-surface); color: var(--rs-text-strong); }
</style>
