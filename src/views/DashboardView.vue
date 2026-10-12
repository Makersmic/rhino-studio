<script setup lang="ts">
/**
 * Dashboard: a landscape "lock screen" for the Rhino.
 *
 * One big display with the camera as its background. The stats sit around
 * the border (toolhead, temperatures, position, job, clock and machine
 * state) and a short stack of notices says what the mounted tool is doing.
 * Nothing here acts on the machine: every value is a link to the screen
 * with the details. The E-stop stays in the top bar.
 *
 * Text sits straight on live video, so it uses the overlay tokens: white
 * with a soft shadow, red only for what needs attention.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import Icon from '@/icons/Icon.vue'
import WebcamView from '@/webcams/WebcamView.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useWebcamsStore } from '@/stores/webcams'
import { careText } from '@/maintenance/summary'
import { plausible } from '@/control/tempHistory'
import { formatDuration, notices, operationName, remainingSeconds } from '@/dashboard/notices'

const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()
const webcams = useWebcamsStore()

// The clock, and everything worked out from "now"
const now = ref(new Date())
const tick = setInterval(() => (now.value = new Date()), 5000)
onBeforeUnmount(() => clearInterval(tick))
const clock = computed(() => now.value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, ''))
const ampm = computed(() => /[AP]M$/i.exec(now.value.toLocaleTimeString([], { hour: 'numeric' }))?.[0] ?? '')
const date = computed(() => now.value.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))

const tool = computed(() => (machine.toolState.kind === 'mounted' ? machine.toolState : null))
const toolLine = computed(() => {
  switch (machine.toolState.kind) {
    case 'mounted': return `Slot ${machine.toolState.slot} · confirmed`
    case 'swapping': return 'Swap in progress'
    case 'none-confirmed': return 'Not confirmed'
    case 'unmapped': return `Slot ${machine.toolState.slot} unknown`
    default: return machine.online ? 'Waiting for Klipper' : 'Not connected'
  }
})
const toolAlert = computed(() => machine.online && (machine.toolState.kind === 'none-confirmed' || machine.toolState.kind === 'unmapped'))

// A tool without a hotend shows its body temperature: its thermistor shares the T0 input
const t = (n: number | null) => (n == null ? null : n.toFixed(0))
const setLine = (h: { temp: number | null; target: number | null }) => (h.target ? `Set ${t(h.target)}°` : h.temp == null ? '—' : 'Off')

/** The readouts that apply to the mounted tool, worded for the overlay. */
interface Stat { id: string; label: string; value: string | null; unit: string; sub: string; alert?: boolean }
const stats = computed<Stat[]>(() => {
  const o = machine.outputs
  const pc = (v: number) => Math.round(v * 100).toString()
  return machine.plan.readouts.map((r): Stat => {
    switch (r) {
      case 'hotend': return { id: r, label: 'Hotend', value: t(machine.hotend.temp), unit: '°', sub: setLine(machine.hotend) }
      case 'body': return { id: r, label: 'Body temperature', value: plausible(machine.hotend.temp) ? t(machine.hotend.temp) : null, unit: '°', sub: 'Tool body' }
      case 'hotend-on': return { id: r, label: (machine.hotend.target ?? 0) > 0 ? 'Hotend heater on' : 'Hotend still hot', value: t(machine.hotend.temp), unit: '°', sub: setLine(machine.hotend), alert: (machine.hotend.target ?? 0) > 0 }
      case 'bed': return { id: r, label: 'Bed', value: t(machine.bed.temp), unit: '°', sub: setLine(machine.bed) }
      case 'bed-warm': return { id: r, label: (machine.bed.target ?? 0) > 0 ? 'Bed heating' : 'Bed still warm', value: t(machine.bed.temp), unit: '°', sub: setLine(machine.bed), alert: (machine.bed.target ?? 0) > 0 }
      case 'fan': return { id: r, label: 'Part fan', value: o.fan == null ? null : pc(o.fan), unit: '%', sub: 'Cooling' }
      case 'laser': return { id: r, label: 'Laser', value: o.laser?.armed ? pc(o.laser.power) : '0', unit: '%', sub: o.laser?.armed ? (o.laser.power > 0 ? 'Firing' : 'Armed') : 'Off', alert: !!o.laser?.armed }
      case 'spindle': return { id: r, label: 'Spindle', value: o.spindle?.on ? pc(o.spindle.throttle) : '0', unit: '%', sub: o.spindle?.on ? 'Running · throttle' : 'Off' }
      case 'power': return { id: r, label: 'Tool power', value: o.toolPower?.active ? pc(o.toolPower.level) : '0', unit: '%', sub: o.toolPower?.active ? 'On' : 'Off' }
    }
  })
})
const topCols = computed(() => `minmax(220px, 1.4fr) ${'minmax(100px, 0.7fr) '.repeat(stats.value.length)}minmax(170px, 1fr) minmax(200px, 1fr)`)

const job = computed(() => machine.job)
const jobActive = computed(() => job.value.state === 'printing' || job.value.state === 'paused')
const pct = computed(() => Math.round((job.value.progress ?? 0) * 100))
const left = computed(() => (job.value.state === 'printing' ? remainingSeconds(job.value.progress, job.value.duration) : null))
const doneAt = computed(() => (left.value == null ? '—' : new Date(now.value.getTime() + left.value * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })))
const op = computed(() => operationName(tool.value?.type))

const workPos = computed(() => machine.plan.position === 'work')
const pos = computed(() => (workPos.value ? machine.workPosition : machine.position.xyz))
const homed = computed(() => machine.position.homed.toLowerCase())

/** One word for what the machine is doing, top right under the clock. */
const state = computed<{ text: string; alert?: boolean; live?: boolean }>(() => {
  if (!machine.online) return { text: 'Offline', alert: true }
  if (machine.klippy === 'shutdown' || machine.klippy === 'error') return { text: 'Stopped', alert: true }
  if (machine.klippy !== 'ready') return { text: 'Starting' }
  if (job.value.state === 'paused') return { text: 'Paused', alert: true }
  if (job.value.state === 'printing') return { text: op.value === 'Print' ? 'Printing' : 'Running', live: true }
  if (machine.toolState.kind === 'swapping') return { text: 'Swapping', live: true }
  if (machine.busy || control.running) return { text: 'Busy', live: true }
  return { text: 'Idle' }
})

const list = computed(() =>
  notices({
    online: machine.online,
    klippy: machine.klippy,
    klippyMessage: machine.klippyMessage,
    toolState: machine.toolState,
    busy: machine.busy,
    running: control.running,
    promptTitle: control.prompt?.title ?? null,
    job: job.value,
    hotend: machine.hotend,
    bed: machine.bed,
    care: care.mountedCare ? { overdue: care.mountedCare.overdue, dueSoon: care.mountedCare.dueSoon, text: careText(care.mountedCare) } : null,
  }).slice(0, 5),
)
</script>

<template>
  <div class="view dash">
    <h1 class="visually-hidden">Dashboard</h1>

    <section class="screen" aria-label="Machine at a glance">
      <!-- background: the camera, or quiet e-paper if there isn't one -->
      <WebcamView v-if="webcams.current" :key="webcams.current.uid" class="bg" :cam="webcams.current" fit="cover" fill />
      <div v-else class="bg nocam">
        <Icon nav="camera" :size="34" />
        <span v-if="machine.online">No camera set up. <RouterLink to="/settings">Add one in Settings</RouterLink></span>
        <span v-else>Camera shows once the machine is connected</span>
      </div>
      <div class="scrim top-scrim" aria-hidden="true" />
      <div class="scrim bottom-scrim" aria-hidden="true" />
      <div class="scrim side-scrim" aria-hidden="true" />

      <!-- top border: the stats -->
      <header class="top" :style="{ '--cols': topCols }">
        <RouterLink to="/toolheads" class="stat tool" :style="{ '--accent': `var(${machine.mountedLook.accentVar})` }" :class="{ alert: toolAlert, unverified: !machine.mountedVerified }">
          <span class="emblem"><Icon :tool="machine.mountedLook.icon" :size="34" /></span>
          <span class="col">
            <span class="k">Toolhead</span>
            <strong class="name">{{ machine.mountedVerified ? machine.mountedName : 'Unknown' }}</strong>
            <span class="sub">{{ toolLine }}</span>
          </span>
        </RouterLink>

        <!-- what this tool uses (same rules as Control: src/toolheads/readouts.ts) -->
        <RouterLink v-for="st in stats" :key="st.id" to="/control" class="stat" :class="{ alert: st.alert }">
          <span class="k">{{ st.label }}</span>
          <span class="v rs-num" :class="{ empty: st.value == null }">{{ st.value ?? '—' }}<small v-if="st.value != null">{{ st.unit }}</small></span>
          <span class="sub">{{ st.sub }}</span>
        </RouterLink>

        <RouterLink to="/control" class="stat position">
          <span class="k">{{ workPos ? 'Work position' : 'Position' }} <em>{{ homed ? `homed ${homed.toUpperCase()}` : 'not homed' }}</em></span>
          <span class="xyz">
            <span v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" :class="{ unhomed: !homed.includes(a.toLowerCase()) }">
              <b>{{ a }}</b><span class="rs-num" :class="{ empty: pos?.[i] == null }">{{ pos?.[i] == null ? '—' : pos[i]!.toFixed(1) }}</span>
            </span>
          </span>
        </RouterLink>

        <div class="time" aria-live="off">
          <span class="clock rs-num">{{ clock }}<small>{{ ampm }}</small></span>
          <span class="date">{{ date }}</span>
          <span class="state" :class="{ alert: state.alert, live: state.live }" aria-live="polite"><i aria-hidden="true" />{{ state.text }}</span>
        </div>
      </header>

      <!-- notices: what's happening with the tool, alerts first -->
      <ul class="notices" aria-label="Notices" aria-live="polite">
        <li v-for="n in list" :key="n.id" :class="n.tone">
          <RouterLink :to="n.to">
            <strong>{{ n.title }}</strong>
            <span v-if="n.detail">{{ n.detail }}</span>
          </RouterLink>
        </li>
      </ul>

      <!-- bottom border: the job -->
      <footer class="bottom">
        <RouterLink to="/control" class="jobline" :class="{ alert: job.state === 'paused' || job.state === 'error' }">
          <span class="k">{{ jobActive ? `${op} · ${job.state === 'paused' ? 'paused' : 'running'}` : 'Job' }}</span>
          <span class="file">{{ jobActive ? job.filename : job.filename ? `Last: ${job.filename}` : 'No job running' }}</span>
        </RouterLink>
        <RouterLink v-if="jobActive" to="/control" class="nums">
          <span><span class="k">Done</span><b class="rs-num">{{ pct }}<small>%</small></b></span>
          <span><span class="k">Elapsed</span><b>{{ formatDuration(job.duration) }}</b></span>
          <span><span class="k">Left</span><b>{{ left == null ? '—' : formatDuration(left) }}</b></span>
          <span><span class="k">Finishes</span><b>{{ doneAt }}</b></span>
        </RouterLink>
        <RouterLink v-else to="/care" class="nums">
          <span><span class="k">Care</span><b :class="{ red: care.counts.overdue > 0 }">{{ care.counts.overdue ? `${care.counts.overdue} overdue` : care.counts.due_soon ? `${care.counts.due_soon} due soon` : 'Up to date' }}</b></span>
        </RouterLink>
        <span v-if="webcams.current" class="camname">{{ webcams.current.name }} camera<template v-if="webcams.cameras.length > 1"> · {{ webcams.index + 1 }}/{{ webcams.cameras.length }}</template></span>
        <span v-if="jobActive" class="bar" :class="{ alert: job.state === 'paused' }" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" aria-label="Job progress"><span :style="{ width: `${pct}%` }" /></span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.dash { max-width: none; flex: 1; padding-bottom: var(--rs-space-5); }
.screen {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  flex: 1;
  min-height: 520px;
  border-radius: var(--rs-radius-lg);
  overflow: hidden;
  background: var(--rs-cam-bg);
  color: var(--rs-overlay-text);
  text-shadow: var(--rs-overlay-shadow);
  isolation: isolate;
}
.bg { position: absolute; inset: 0; z-index: -2; }
.nocam {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  color: var(--rs-overlay-muted); font-size: var(--rs-text-sm);
  background: var(--rs-overlay-dither), var(--rs-cam-bg);
}
.nocam a { color: var(--rs-overlay-text); }
.scrim { position: absolute; left: 0; right: 0; z-index: -1; pointer-events: none; }
.top-scrim { top: 0; height: 200px; background: var(--rs-overlay-scrim-top); }
.bottom-scrim { bottom: 0; height: 170px; background: var(--rs-overlay-scrim-bottom); }
.side-scrim { top: 0; bottom: 0; width: 46%; right: auto; background: var(--rs-overlay-scrim-side); opacity: 0.8; }

a { color: inherit; text-decoration: none; }
a:focus-visible { outline: 2px solid var(--rs-overlay-text); outline-offset: 3px; border-radius: 4px; }
.k { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-overlay-muted); }
.k em { font-style: normal; margin-left: 6px; color: var(--rs-overlay-text); }
.sub { font-size: var(--rs-text-xs); color: var(--rs-overlay-muted); white-space: nowrap; }

/* ---- top border ---- */
.top {
  display: grid;
  grid-template-columns: var(--cols);
  align-items: start;
  gap: var(--rs-space-5);
  padding: var(--rs-space-5) var(--rs-space-6) 0;
}
.stat { display: flex; flex-direction: column; gap: 4px; min-width: 0; border-radius: 6px; }
.stat:hover .v, .stat:hover .name, .stat:hover .xyz { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 6px; }
.v { font-size: 2.6rem; line-height: 1; }
.v small { font-family: var(--rs-font-ui); font-size: 0.36em; vertical-align: top; margin-left: 2px; color: var(--rs-overlay-muted); }
.rs-num { color: var(--rs-overlay-text); }
.rs-num.empty { color: var(--rs-overlay-muted); font-family: var(--rs-font-ui); font-weight: var(--rs-weight-light); }
.tool { flex-direction: row; align-items: center; gap: var(--rs-space-3); }
.tool .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.emblem {
  position: relative; display: grid; place-items: center; width: 58px; height: 58px; flex: none;
  border-radius: var(--rs-radius-md); border: 1px solid var(--rs-overlay-faint); background: var(--rs-overlay-button);
  color: var(--rs-overlay-text); overflow: hidden; filter: var(--rs-overlay-icon-shadow);
}
.emblem::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
.unverified .emblem::after { display: none; }
.name { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-semibold, 600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tool.alert .sub, .tool.alert .name { color: var(--rs-overlay-alert); }
.stat.alert .k, .stat.alert .sub { color: var(--rs-overlay-alert); }
.xyz { display: flex; flex-direction: column; gap: 1px; }
.xyz > span { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rs-space-3); max-width: 170px; }
.xyz b { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-overlay-muted); }
.xyz .rs-num { font-size: 1.25rem; }
.xyz .unhomed .rs-num { color: var(--rs-overlay-muted); }

.time { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; }
.clock { font-size: 3.2rem; line-height: 1; }
.clock small { font-family: var(--rs-font-ui); font-weight: var(--rs-weight-medium); font-size: 0.3em; margin-left: 4px; vertical-align: top; color: var(--rs-overlay-muted); }
.date { font-size: var(--rs-text-sm); color: var(--rs-overlay-muted); }
.state {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 6px;
  font-size: var(--rs-text-md); font-weight: var(--rs-weight-semibold, 600); letter-spacing: 0.02em;
}
.state i { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid currentColor; box-shadow: var(--rs-overlay-shadow); }
.state.live i { background: currentColor; animation: pulse 1.6s ease-in-out infinite; }
.state.alert { color: var(--rs-overlay-alert); }
.state.alert i { background: currentColor; }
@keyframes pulse { 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .state.live i { animation: none; } }

/* ---- notices ---- */
.notices {
  list-style: none; margin: 0; padding: var(--rs-space-6) var(--rs-space-6) var(--rs-space-4);
  align-self: end; display: flex; flex-direction: column; gap: var(--rs-space-3); max-width: 520px;
}
.notices a { display: flex; flex-direction: column; gap: 3px; padding: 2px 0 2px 14px; border-left: 2px solid var(--rs-overlay-text); }
.notices strong { font-size: var(--rs-text-md); font-weight: var(--rs-weight-semibold, 600); }
.notices span { font-size: var(--rs-text-sm); color: var(--rs-overlay-muted); }
.notices .alert a { border-left-color: var(--rs-overlay-alert); }
.notices .alert strong { color: var(--rs-overlay-alert); }
.notices a:hover strong { text-decoration: underline; text-underline-offset: 4px; }

/* ---- bottom border ---- */
.bottom {
  position: relative;
  display: flex; align-items: flex-end; gap: var(--rs-space-6);
  padding: 0 var(--rs-space-6) calc(var(--rs-space-5) + 6px);
}
.jobline { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.jobline .file { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-semibold, 600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jobline.alert .k, .jobline.alert .file { color: var(--rs-overlay-alert); }
.nums { display: flex; gap: var(--rs-space-6); }
.nums > span { display: flex; flex-direction: column; gap: 2px; }
.nums b { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-semibold, 600); white-space: nowrap; }
.nums b.rs-num { font-size: 1.6rem; line-height: 1; font-weight: 900; }
.nums b small { font-family: var(--rs-font-ui); font-size: 0.5em; margin-left: 2px; color: var(--rs-overlay-muted); }
.nums b.red { color: var(--rs-overlay-alert); }
.nums:hover b { text-decoration: underline; text-underline-offset: 4px; }
.camname { font-size: var(--rs-text-xs); color: var(--rs-overlay-muted); white-space: nowrap; align-self: flex-end; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--rs-overlay-faint); }
.bar span { display: block; height: 100%; background: var(--rs-overlay-text); box-shadow: var(--rs-overlay-glow); }
.bar.alert span { background: var(--rs-overlay-alert); box-shadow: none; }

@media (max-width: 1180px) {
  .top { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: var(--rs-space-4); }
  .tool { grid-column: span 2; }
  .time { grid-column: 3; grid-row: 1; }
  .side-scrim { width: 70%; }
}
@media (max-width: 720px) {
  .dash { padding: var(--rs-space-3) var(--rs-space-3) 96px; }
  .screen { min-height: 560px; }
  .top { grid-template-columns: 1fr 1fr; gap: var(--rs-space-3) var(--rs-space-4); padding: var(--rs-space-4) var(--rs-space-4) 0; }
  .tool { grid-column: 1 / -1; grid-row: 2; }
  .time { grid-column: 1 / -1; grid-row: 1; flex-direction: row; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
  .clock { font-size: 2.4rem; }
  .v { font-size: 2.1rem; }
  .position { display: none; }
  .notices { padding: var(--rs-space-5) var(--rs-space-4) var(--rs-space-3); }
  .bottom { flex-wrap: wrap; gap: var(--rs-space-3) var(--rs-space-5); padding: 0 var(--rs-space-4) calc(var(--rs-space-4) + 6px); }
  .jobline { flex-basis: 100%; }
  .nums { gap: var(--rs-space-4); flex-wrap: wrap; }
  .top-scrim { height: 260px; }
}
</style>
