<script setup lang="ts">
/**
 * Wizards > Run a chain: runs a saved chain's job files in order. It starts nothing by itself. Each button uses the existing path with
 * its own confirmation: Swap (the swap confirm), Start (a print asks; a laser file opens the laser start wizard with its checklist,
 * Z zero, frame and test fire), Resume (its confirm). Which step is next comes from the machine (Klipper's mounted tool, print_stats,
 * Moonraker's job history), never from a note kept here (src/chain/run.ts). A laser file with travel lifts is refused until machine
 * check CH14 passes. Docs: docs/design-process-chain.md, 4g; docs/wizard-rules.md.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import { CHAIN_RUN_POSE } from '@/brand/mascot'
import { LIFT_BLOCK, fileHasLifts, nextStep, runJobs, type RunStep } from '@/chain/run'
import type { HistoryJob } from '@/moonraker/client'
import { fetchFileText } from '@/moonraker/gcodeHeader'
import { useChainFilesStore } from '@/stores/chainFiles'
import { useChainsStore } from '@/stores/chains'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { usePrepareStore } from '@/stores/prepare'

const STEPS = [
  { id: 'look', label: 'Look', help: 'The chain and the machine' },
  { id: 'files', label: 'Files', help: 'On the Rhino?' },
  { id: 'run', label: 'Run', help: 'One job at a time' },
  { id: 'done', label: 'Done', help: 'What is left' },
] as const
type StepId = (typeof STEPS)[number]['id']

const route = useRoute()
const router = useRouter()
const chains = useChainsStore()
const machine = useMachineStore()
const control = useControlStore()
const prep = usePrepareStore()
const kept = useChainFilesStore()

const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)
const chainId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null))
const chain = computed(() => chains.list.find((c) => c.id === chainId.value) ?? null)
const jobs = computed(() => (chain.value ? runJobs(chain.value) : []))

// ---- what the machine says (read only): files, history, headers, live state
const history = ref<HistoryJob[]>([])
const onRhino = ref<Set<string>>(new Set())
const hasLifts = ref<Map<string, boolean>>(new Map())
const readError = ref<string | null>(null)
let timer: number | undefined
const headSeen = new Map<string, boolean>()

async function refresh() {
  try {
    const [files, hist] = await Promise.all([machine.listFiles(), machine.listHistory(60)])
    onRhino.value = new Set(files.map((f) => f.path))
    history.value = hist
    readError.value = null
    for (const j of jobs.value) {
      const entry = files.find((f) => f.path === j.file)
      if (!entry || j.kind !== 'laser') continue
      const key = `${entry.path}:${entry.size}:${entry.modified}`
      if (headSeen.has(key)) {
        hasLifts.value.set(j.file, headSeen.get(key)!)
        continue
      }
      const url = machine.fileUrl(entry.path)
      if (!url) continue
      try {
        const text = await fetchFileText(url)
        headSeen.set(key, fileHasLifts(text))
        hasLifts.value.set(j.file, headSeen.get(key)!)
      } catch {
        /* stays "reading the file": the laser job is not offered until it can be read */
      }
    }
    hasLifts.value = new Map(hasLifts.value)
  } catch (e) {
    readError.value = `Couldn't read the Rhino's files or job history: ${(e as Error).message}`
  }
}
onMounted(() => {
  void chains.load()
  void refresh()
  timer = window.setInterval(() => void refresh(), 3000)
})
onBeforeUnmount(() => window.clearInterval(timer))
watch(() => jobs.value.length, () => void refresh())

// ---- where the run began: history newer than the newest entry when "Begin the run" was pressed (Moonraker's clock, not this screen's)
const sinceKey = computed(() => `rs.chainrun.${chainId.value}`)
const since = ref<number | null>(readSince())
function readSince(): number | null {
  try {
    const v = sessionStorage.getItem(`rs.chainrun.${chainId.value}`)
    return v == null ? null : Number(v)
  } catch {
    return null
  }
}
function begin() {
  const newest = Math.max(0, ...history.value.map((h) => h.start_time))
  since.value = newest + 0.001
  try {
    sessionStorage.setItem(sinceKey.value, String(since.value))
  } catch {
    /* a convenience: without it the wizard asks again */
  }
  at.value = missing.value.length ? 1 : 2
}

// ---- 0 look
const mounted = computed(() => (machine.mountedVerified ? machine.mountedName : null))
const look = computed(() => {
  const out: { level: 'PASS' | 'FAIL'; what: string; detail?: string }[] = []
  out.push(machine.klippyReady ? { level: 'PASS', what: 'Klipper is ready' } : { level: 'FAIL', what: 'Klipper isn’t ready', detail: 'Look in Control, or restart Klipper from Settings > Host.' })
  out.push(control.jobActive ? { level: 'FAIL', what: 'A job is running', detail: 'Wait for it, or cancel it from Control. The chain starts when the machine is idle.' } : { level: 'PASS', what: 'No job is running' })
  out.push(mounted.value ? { level: 'PASS', what: `${mounted.value} is mounted` } : { level: 'FAIL', what: 'No toolhead is confirmed as mounted', detail: 'Confirm it in Control (the swap steps ask for it).' })
  return out
})

// ---- 1 files
const missing = computed(() => jobs.value.filter((j) => !onRhino.value.has(j.file)))
const sending = ref<string | null>(null)
const sendError = ref<string | null>(null)
async function send(file: string) {
  const f = chain.value ? kept.forChain(chain.value.id)[file] : undefined
  if (!f || sending.value) return
  sending.value = file
  sendError.value = null
  try {
    await machine.uploadFile(f)
    await refresh()
  } catch (e) {
    sendError.value = (e as Error).message
  } finally {
    sending.value = null
  }
}
const canSend = (file: string) => !!chain.value && !!kept.forChain(chain.value.id)[file]

// ---- 2 run
const next = computed<RunStep | null>(() =>
  chain.value && since.value != null
    ? nextStep({ jobs: jobs.value, history: history.value, since: since.value, live: { state: machine.job.state, file: machine.job.filename }, onRhino: onRhino.value, mounted: mounted.value, klippyReady: machine.klippyReady, hasLifts: hasLifts.value })
    : null,
)
const busy = ref(false)
const slotOf = (tool: string) => prep.tools.find((t) => t.name === tool)?.slot ?? null
async function act(fn: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  try {
    await fn()
  } finally {
    busy.value = false
  }
}
const swap = (to: string) => {
  const slot = slotOf(to)
  if (slot == null) return
  void act(() => control.swapTo(slot, to))
}
const start = (file: string, tool: string) => void act(() => control.startJob(file, tool, null))
const resume = () => void act(() => control.resumeJob())
const restartBed = ref(false)
watch(next, (n) => {
  if (n?.kind === 'finished' && step.value === 'run') at.value = 3
})
function openControl() {
  void router.push('/control')
}

const sheetLine = computed(() => {
  const s = chain.value?.sheet
  const t = chain.value?.thickness
  return s ? `${s.width} × ${s.depth} mm${t ? `, ${t} mm thick` : ''}, centred at X${s.x} Y${s.y}` : 'as drawn on the chain screen'
})
</script>

<template>
  <div class="set-page">
    <RsPanel v-if="!chain" title="Which chain?" panel-id="chainrun.pick">
      <p class="plain muted" v-if="!chains.loaded">Loading…</p>
      <p class="plain muted" v-else-if="!chains.list.length">There are no saved chains. Make one in Job setup > Chain, build its job files, then come back.</p>
      <ul v-else class="list pick">
        <li v-for="c in chains.list" :key="c.id"><RouterLink :to="{ path: '/wizards/chain-run', query: { id: c.id } }">{{ c.name }}</RouterLink> <span class="muted">· {{ runJobs(c).length }} job{{ runJobs(c).length === 1 ? '' : 's' }}</span></li>
      </ul>
      <WhatThisDoes><p>Read only. Pick the chain to run; nothing is sent until you press a button in a later step.</p></WhatThisDoes>
    </RsPanel>

    <template v-else>
      <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />
      <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label} · ${chain.name}`" panel-id="chainrun.step">
        <MascotRow :pose="CHAIN_RUN_POSE[step]">
          <template v-if="step === 'look'">
            <p class="q">Run “{{ chain.name }}”: {{ jobs.length }} job{{ jobs.length === 1 ? '' : 's' }}, in this order.</p>
            <ol class="list jobs">
              <li v-for="j in jobs" :key="j.file"><b>Job {{ j.n }}</b> · {{ j.kind === 'print' ? 'print' : j.kind }} with {{ j.tool }}{{ j.pauses ? ', pauses for you to place the sheet' : '' }}<span class="detail mono">{{ j.file }}{{ j.built ? '' : ' (not built)' }}</span></li>
            </ol>
            <ul class="list checks">
              <li v-for="(c, i) in look" :key="i"><StatusChip :tone="c.level === 'PASS' ? 'ok' : 'danger'">{{ c.level === 'PASS' ? 'OK' : 'Fix' }}</StatusChip><span>{{ c.what }}<span v-if="c.detail" class="detail">{{ c.detail }}</span></span></li>
            </ul>
            <p v-if="readError" class="tm-err">{{ readError }}</p>
            <p v-if="since != null" class="plain">A run is in progress in this browser. <RsButton variant="quiet" @click="at = 2">Go to the run</RsButton></p>
            <p class="plain">Keep a hand near Stop. The e-stop stays in the top bar the whole time.</p>
            <p class="row"><RsButton variant="primary" :disabled="!look.every((c) => c.level === 'PASS') && !jobs.length" @click="begin">{{ since != null ? 'Begin again' : 'Begin the run' }}</RsButton></p>
            <WhatThisDoes><p>Read only. “Begin the run” only notes, in this browser, where Moonraker’s job history stood, so jobs from before don’t count. The steps after it work out what is next from Klipper (the mounted tool, the job state) and Moonraker’s job history, so reloading this page, or coming back from the laser start wizard, picks up where you were. No step starts a job, swaps a tool or resumes by itself: each has its own button and its own confirmation.</p></WhatThisDoes>
          </template>

          <template v-if="step === 'files'">
            <p class="q">Are the job files on the Rhino?</p>
            <ul class="list checks">
              <li v-for="j in jobs" :key="j.file">
                <StatusChip :tone="onRhino.has(j.file) ? 'ok' : 'danger'">{{ onRhino.has(j.file) ? 'There' : 'Missing' }}</StatusChip>
                <span><span class="mono">{{ j.file }}</span>
                  <span v-if="!onRhino.has(j.file)" class="detail">{{ canSend(j.file) ? 'Built a moment ago on the chain screen: send it to the Rhino’s gcodes folder (it is not started).' : 'Build the job files on the chain screen, then send them (Job files > Send to the Rhino).' }}</span>
                </span>
                <RsButton v-if="!onRhino.has(j.file) && canSend(j.file)" :disabled="sending === j.file" @click="send(j.file)">{{ sending === j.file ? 'Sending…' : 'Send to the Rhino' }}</RsButton>
              </li>
            </ul>
            <p v-if="sendError" class="tm-err">{{ sendError }}</p>
            <p class="row"><RsButton variant="primary" :disabled="missing.length > 0" @click="at = 2">Next</RsButton><RouterLink class="alt" :to="{ path: '/setup/chain', query: { id: chain.id } }">Open the chain screen</RouterLink></p>
            <WhatThisDoes><p>Reads the Rhino’s gcodes folder. Sending is the same upload as Job setup’s Send to the Rhino and never starts the file.</p></WhatThisDoes>
          </template>

          <template v-if="step === 'run'">
            <template v-if="since == null">
              <p class="q">Begin the run first.</p>
              <p class="row"><RsButton variant="primary" @click="at = 0">Back to the start</RsButton></p>
            </template>
            <template v-else-if="next">
              <ol class="list jobs">
                <li v-for="j in jobs" :key="'s' + j.file" :class="{ now: 'job' in next && next.job.file === j.file }"><b>Job {{ j.n }}</b> · {{ j.tool }}
                  <StatusChip :tone="next.kind === 'finished' || (('job' in next) && next.job.n > j.n) ? 'ok' : 'neutral'">{{ next.kind === 'finished' || (('job' in next) && next.job.n > j.n) ? 'Done' : 'job' in next && next.job.n === j.n ? 'Now' : 'Waiting' }}</StatusChip></li>
              </ol>

              <template v-if="next.kind === 'swap'">
                <p class="q">Swap to {{ next.to }}.</p>
                <p class="plain">Job {{ next.job.n }} needs {{ next.to }}. {{ mounted ? `${mounted} is mounted.` : 'No toolhead is confirmed.' }} The swap asks you to confirm; the print head cools and the bed lowers first, then you change the tool by hand.</p>
                <p class="row"><RsButton variant="primary" :disabled="busy || slotOf(next.to) == null" @click="swap(next.to)">Swap to {{ next.to }}</RsButton></p>
                <WhatThisDoes><p>Runs the Rhino’s <code>SWAP_TOOL</code> through the same Swap path as the top bar, with its own confirmation. This wizard never changes the mounted tool itself: Klipper says which tool is mounted, and the next step appears when it matches.</p></WhatThisDoes>
              </template>

              <template v-else-if="next.kind === 'start'">
                <p class="q">Start job {{ next.job.n }}: {{ next.job.kind === 'print' ? 'print' : next.job.kind }} with {{ next.job.tool }}.</p>
                <p v-if="next.job.kind === 'print'" class="plain">Make sure the bed is clear. The job heats, homes and prints the fixtures, then pauses so you can place the sheet. Keep a hand near Stop.</p>
                <p v-else class="plain">This opens the laser start wizard: safety checklist, Z zero on the sheet top, frame, test fire. Nothing fires until you finish it. When it has started the job, come back here: the wizard picks up from the machine.</p>
                <p class="row"><RsButton variant="primary" :disabled="busy" @click="start(next.job.file, next.job.tool)">{{ next.job.kind === 'print' ? 'Start the print…' : 'Open the laser start…' }}</RsButton></p>
                <WhatThisDoes><p>Uses the same start path as Files: a print goes through <code>START_JOB</code> (its own confirm); a laser file goes through the laser start wizard and <code>LASER_JOB_SETUP FILE={{ next.job.file }}</code>. File: <span class="mono">{{ next.job.file }}</span>.</p></WhatThisDoes>
              </template>

              <template v-else-if="next.kind === 'running'">
                <p class="q">Job {{ next.job.n }} is running.</p>
                <p class="plain">{{ machine.job.filename ?? next.job.file }}{{ machine.job.progress != null ? ` · ${Math.round(machine.job.progress * 100)}%` : '' }}. This page moves on by itself when the machine says it is done.</p>
                <p class="row"><RsButton @click="openControl">Open Control</RsButton></p>
              </template>

              <template v-else-if="next.kind === 'place'">
                <p class="q">Place the sheet, then resume.</p>
                <p class="plain"><b>The fixtures are printed and the job has paused.</b> Place the sheet against the fixtures: {{ sheetLine }}. The head has parked away from the bed; <b>the bed and the nozzle are still hot, so don’t put a hand under the nozzle or on the hot bed</b>. Wait for the head to stop moving first.</p>
                <p class="plain">When the sheet is in place and your hands are clear, press Resume. The features print on top of the sheet.</p>
                <p class="row"><RsButton variant="primary" :disabled="busy" @click="resume">Resume the print…</RsButton></p>
                <p class="plain muted">If you paused this job yourself, this is not the sheet pause: check Control.</p>
                <WhatThisDoes><p>The file paused itself with <code>PAUSE</code>: the Rhino pulls the filament back, lifts and parks the head, and keeps the temperatures. Resume runs <code>RESUME</code> (its own confirm); the file has already raised Z by the sheet’s thickness, so the first feature layer lands on the sheet top. <code>END_PRINT</code> clears the raise at the end.</p></WhatThisDoes>
              </template>

              <template v-else-if="next.kind === 'paused'">
                <p class="q">Job {{ next.job.n }} is paused.</p>
                <p class="plain">Resume or cancel it from Control. This page carries on when it is running again.</p>
                <p class="row"><RsButton @click="openControl">Open Control</RsButton></p>
              </template>

              <template v-else-if="next.kind === 'failed'">
                <p class="q">Job {{ next.job.n }} didn’t finish ({{ next.status }}). The run has stopped.</p>
                <p class="plain">Nothing else runs. Look at what happened in Control or Files > History.{{ next.job.kind === 'print' ? ' If you start the print again, clear the bed first: the fixtures and any printed parts are still on it, and printing on top of them would crash the nozzle.' : '' }}</p>
                <label v-if="next.job.kind === 'print'" class="plain"><input v-model="restartBed" type="checkbox"> I have cleared the bed</label>
                <p class="row"><RsButton variant="primary" :disabled="busy || (next.job.kind === 'print' && !restartBed) || mounted !== next.job.tool || !machine.klippyReady || control.jobActive" @click="start(next.job.file, next.job.tool)">Start job {{ next.job.n }} again…</RsButton></p>
              </template>

              <template v-else-if="next.kind === 'blocked'">
                <p class="q">Job {{ next.job.n }} can’t start yet.</p>
                <p class="plain"><StatusChip tone="danger">Stopped</StatusChip> {{ next.why }}</p>
                <p v-if="next.why === LIFT_BLOCK" class="plain muted">Rebuild the chain without printed features on the sheet, or wait until machine check CH14 has passed.</p>
              </template>

              <template v-else-if="next.kind === 'finished'"><p class="q">Every job is done.</p><p class="row"><RsButton variant="primary" @click="at = 3">Finish</RsButton></p></template>
            </template>
          </template>

          <template v-if="step === 'done'">
            <p class="q">The chain has run.</p>
            <p class="plain">Take the parts and the sheet off the bed when they have cooled. The laser’s rail is off after the job; the bed parks itself.</p>
            <p class="row"><RsButton variant="primary" @click="router.push('/wizards')">Back to Wizards</RsButton><RouterLink class="alt" :to="{ path: '/setup/chain', query: { id: chain.id } }">Open the chain</RouterLink></p>
            <WhatThisDoes><p>Nothing is kept: the run’s history is in Files > History, where each job is listed as a normal job.</p></WhatThisDoes>
          </template>
        </MascotRow>
      </RsPanel>
    </template>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.muted { color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.jobs li { font-size: var(--rs-text-sm); color: var(--rs-text-strong); display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.jobs li.now { font-weight: var(--rs-weight-medium); }
.checks li { display: flex; align-items: baseline; gap: var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); flex-wrap: wrap; }
.checks li > :first-child { flex: none; }
.detail { display: block; font-size: var(--rs-text-sm); color: var(--rs-text-muted); font-weight: normal; }
.alt { font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.pick a { color: var(--rs-text-strong); }
</style>
