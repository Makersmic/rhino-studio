<script setup lang="ts">
/**
 * Care › Guide me (Mike, Nov 15): walks one Care task step by step. Gates first (what Klipper must say before you
 * start), then each step ticked in order, a wait where the task needs one, then the Work log entry. Gates are
 * re-checked all the way through: if a job starts or the hotend heats, it holds until that is cleared. It sends
 * nothing to the machine: the steps are things you do by hand. The logic is in src/care/guide.ts (tested).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import MascotRow from '@/components/MascotRow.vue'
import LiveStrip from '@/control/LiveStrip.vue'
import { DONE_POSE } from '@/brand/mascot'
import { GENERIC, checkGates, guideFor, logNote, stepsOf, waitAfter, type GateFacts } from '@/care/guide'
import { today } from '@/maintenance/edit'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'

const route = useRoute()
const care = useMaintenanceStore()
const machine = useMachineStore()
const control = useControlStore()

const id = computed(() => String(route.params.id ?? ''))
const task = computed(() => care.overview?.tasks.find((t) => t.id === id.value) ?? null)
const def = computed(() => guideFor(task.value?.link?.template))
const look = computed(() => def.value ?? { ...GENERIC, template: '' })
const steps = computed(() => stepsOf(task.value?.steps, def.value))

const facts = computed<GateFacts>(() => ({
  klippyReady: machine.klippyReady,
  jobActive: control.jobActive,
  hotendTemp: machine.hotend.temp,
  spindleOn: machine.outputs.spindle ? machine.outputs.spindle.on : null,
  laserArmed: machine.outputs.laser ? machine.outputs.laser.armed : null,
  toolPowerActive: machine.outputs.toolPower ? machine.outputs.toolPower.active : null,
  mountedType: machine.toolState.kind === 'mounted' ? (machine.toolState.type ?? null) : null,
}))
const gates = computed(() => checkGates(look.value.gates, facts.value))
const failing = computed(() => gates.value.filter((g) => !g.ok))

type Phase = 'before' | 'steps' | 'log' | 'done'
const phase = ref<Phase>('before')
const at = ref(0)
const waitLeft = ref(0)
const waitLabel = ref('')
const notes = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (!care.overview) void care.refresh()
})
onBeforeUnmount(() => clearInterval(timer))
// a different task: start again
watch(id, () => {
  phase.value = 'before'
  at.value = 0
  waitLeft.value = 0
  clearInterval(timer)
})

function begin() {
  at.value = 0
  phase.value = 'steps'
}
function startWait(w: { seconds: number; label: string }) {
  waitLeft.value = w.seconds
  waitLabel.value = w.label
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
  const w = waitAfter(def.value, at.value)
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
const canNext = computed(() => failing.value.length === 0 && waitLeft.value === 0)

async function finish() {
  if (!task.value) return
  busy.value = true
  error.value = null
  try {
    await care.logWork(task.value.id, { action: 'done', date: today(), notes: logNote(steps.value.length, notes.value) })
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
            <ul v-if="gates.length" class="gates" aria-label="What the machine must say first">
              <li v-for="g in gates" :key="g.id" :class="{ no: !g.ok }">
                <span class="mark" aria-hidden="true">{{ g.ok ? '✓' : '✗' }}</span>
                <span>{{ g.label }}<template v-if="!g.ok"><br /><small>{{ g.why }}</small></template></span>
              </li>
            </ul>
            <p v-else class="small">Nothing for the machine to check first. {{ steps.length }} step{{ steps.length === 1 ? '' : 's' }} follow.</p>
            <div class="row"><RsButton variant="primary" :disabled="failing.length > 0" @click="begin">Start</RsButton></div>
          </template>

          <!-- steps -->
          <template v-else-if="phase === 'steps'">
            <div class="bar" role="progressbar" :aria-valuenow="at + 1" :aria-valuemax="steps.length"><i :style="{ width: ((at + 1) / steps.length) * 100 + '%' }" /></div>
            <p class="step">{{ steps[at] }}</p>
            <p v-if="failing.length" class="warn" role="alert"><b>Holding.</b> {{ failing[0]!.why }}</p>
            <p v-if="waitLeft > 0" class="wait" role="timer">{{ waitLabel }}: <b class="mono">{{ mmss(waitLeft) }}</b> left. Don’t go on until it reaches zero.</p>
            <div class="row">
              <RsButton variant="quiet" :disabled="waitLeft > 0" @click="back">Back</RsButton>
              <RsButton variant="primary" :disabled="!canNext" @click="next">{{ at === steps.length - 1 ? 'Done, go to the log' : 'Done, next' }}</RsButton>
            </div>
          </template>

          <!-- log -->
          <template v-else-if="phase === 'log'">
            <h2 class="h">Log it</h2>
            <p class="small">All {{ steps.length }} step{{ steps.length === 1 ? '' : 's' }} ticked. Anything you found or replaced?</p>
            <label class="field"><span class="small">Notes</span><textarea v-model="notes" rows="3" maxlength="900" placeholder="What you found or replaced (optional)" /></label>
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
.back { display: inline-block; margin-bottom: var(--rs-space-2); font-size: var(--rs-text-sm); color: var(--rs-text-muted); text-decoration: none; }
.muted { color: var(--rs-text-muted); }
.h { margin: 0; font-family: var(--rs-font-display-ui, var(--rs-font-ui)); font-size: 1.15rem; }
.small { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.warn { margin: 0; padding: 6px 10px; border-left: 3px solid var(--rs-line-strong); background: var(--rs-surface-2); font-size: var(--rs-text-sm); }
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
