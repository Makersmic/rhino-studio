<script setup lang="ts">
/**
 * Dashboard: a landscape "lock screen" for the Rhino.
 *
 * One big display with the camera as its background, read like a phone's
 * lock screen:
 *   top-left    the mounted tool          top-right  machine state
 *   bottom-left notices, then the job % (large) with the job's file
 *               and times beside it; nothing there when no job is running
 *   bottom rail every other reading on one line: temperatures or tool
 *               outputs, position, care, camera
 * Everything sits on two margins and one bottom rail; the middle stays clear
 * for the picture.
 * Nothing here acts on the machine: every value is a link to the screen
 * with the details. The E-stop stays in the top bar.
 *
 * Scroll down for the reports (dashboard/DashReports.vue): use per toolhead,
 * maintenance and jobs per week, the same figures as the Portal's Dashboard.
 *
 * Text sits straight on live video, so it uses the overlay tokens: white
 * with a soft shadow, red only for what needs attention.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import Icon from '@/icons/Icon.vue'
import WebcamView from '@/webcams/WebcamView.vue'
import DashReports from '@/dashboard/DashReports.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useWebcamsStore } from '@/stores/webcams'
import { careText } from '@/maintenance/summary'
import { plausible } from '@/control/tempHistory'
import { formatDuration, notices, operationName, remainingSeconds, runningDetail } from '@/dashboard/notices'

const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()
const webcams = useWebcamsStore()

// "Now", for the finish time
const now = ref(new Date())
const tick = setInterval(() => (now.value = new Date()), 5000)
onBeforeUnmount(() => clearInterval(tick))

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

const job = computed(() => machine.job)
const jobActive = computed(() => job.value.state === 'printing' || job.value.state === 'paused')
const pct = computed(() => Math.round((job.value.progress ?? 0) * 100))
const left = computed(() => (job.value.state === 'printing' ? remainingSeconds(job.value.progress, job.value.duration) : null))
const doneAt = computed(() => (left.value == null ? '—' : new Date(now.value.getTime() + left.value * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })))
const op = computed(() => operationName(tool.value?.type))

const workPos = computed(() => machine.plan.position === 'work')
const pos = computed(() => (workPos.value ? machine.workPosition : machine.position.xyz))
const homed = computed(() => machine.position.homed.toLowerCase())

/** One word for what the machine is doing, top right. */
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


/** The bottom rail: every reading on one line, label over value. */
interface RailItem { id: string; label: string; value: string; sub?: string; alert?: boolean; to: string; mono?: boolean }
const rail = computed<RailItem[]>(() => {
  const items: RailItem[] = stats.value.map((st) => ({
    id: st.id,
    label: st.label,
    value: st.value == null ? '—' : `${st.value}${st.unit}`,
    sub: st.sub,
    alert: st.alert,
    to: '/control',
  }))
  const p = pos.value
  items.push({
    id: 'pos',
    label: `${workPos.value ? 'Work position' : 'Position'}${homed.value ? '' : ' · not homed'}`,
    value: p ? p.map((v, i) => `${'XYZ'[i]} ${v.toFixed(1)}`).join('  ') : '—',
    to: '/control',
    mono: true,
  })
  const c = care.counts
  items.push({
    id: 'care',
    label: 'Care',
    value: c.overdue ? `${c.overdue} overdue` : c.due_soon ? `${c.due_soon} due soon` : 'Up to date',
    alert: c.overdue > 0,
    to: '/care',
  })
  return items
})
const elapsed = computed(() => formatDuration(job.value.duration))

const list = computed(() =>
  notices({
    online: machine.online,
    klippy: machine.klippy,
    klippyMessage: machine.klippyMessage,
    toolState: machine.toolState,
    autoTools: machine.adapter.style === 'automatic',
    busy: machine.busy,
    running: control.running,
    promptTitle: control.prompt?.title ?? null,
    job: job.value,
    hotend: machine.hotend,
    bed: machine.bed,
    care: care.mountedCare ? { overdue: care.mountedCare.overdue, dueSoon: care.mountedCare.dueSoon, text: careText(care.mountedCare) } : null,
  })
    // The hero already says the job is running and how far along; keep the job notice only when it needs you
    .filter((n) => !(n.id === 'job' && n.tone === 'info' && jobActive.value))
    .slice(0, 4),
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

      <!-- top: the tool on the left, the machine state on the right -->
      <header class="top">
        <RouterLink to="/toolheads" class="tool" :style="{ '--accent': `var(${machine.mountedLook.accentVar})` }" :class="{ alert: toolAlert, unverified: !machine.mountedVerified }">
          <span class="emblem"><Icon :tool="machine.mountedLook.icon" :size="30" /></span>
          <span class="col">
            <strong class="name">{{ machine.mountedVerified ? machine.mountedName : 'Unknown tool' }}</strong>
            <span class="sub">{{ toolLine }}</span>
          </span>
        </RouterLink>
        <div class="corner">
          <span class="state" :class="{ alert: state.alert, live: state.live }" aria-live="polite"><i aria-hidden="true" />{{ state.text }}</span>
        </div>
      </header>

      <!-- bottom-left: notices, then the one big number -->
      <div class="lower">
        <ul class="notices" aria-label="Notices" aria-live="polite">
          <li v-for="n in list" :key="n.id" :class="n.tone">
            <RouterLink :to="n.to">
              <strong>{{ n.title }}</strong>
              <span v-if="n.detail">{{ n.detail }}</span>
            </RouterLink>
          </li>
        </ul>

        <RouterLink v-if="jobActive" to="/control" class="hero" :class="{ alert: job.state === 'paused' }">
          <span class="big rs-num">{{ pct }}<small>%</small></span>
          <span class="about">
            <span class="k">{{ op }} · {{ job.state === 'paused' ? 'paused' : 'running' }}</span>
            <span class="file">{{ job.filename }}</span>
            <span class="times">{{ left == null ? 'Working out time left' : `${formatDuration(left)} left · done ${doneAt}` }} · {{ elapsed }} in</span>
            <span v-if="job.state === 'printing'" class="safety">{{ runningDetail(tool?.type) }}</span>
          </span>
        </RouterLink>
        <!-- no job: nothing here, the picture stays clear -->
        <span v-if="jobActive" class="bar" :class="{ alert: job.state === 'paused' }" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" aria-label="Job progress"><span :style="{ width: `${pct}%` }" /></span>
      </div>

      <!-- bottom rail: every other reading, one line -->
      <footer class="rail">
        <RouterLink v-for="it in rail" :key="it.id" :to="it.to" class="item" :class="{ alert: it.alert }">
          <span class="k">{{ it.label }}</span>
          <span class="val" :class="{ mono: it.mono }">{{ it.value }}<em v-if="it.sub">{{ it.sub }}</em></span>
        </RouterLink>
        <span v-if="webcams.current" class="camname">{{ webcams.current.name }} camera<template v-if="webcams.cameras.length > 1"> · {{ webcams.index + 1 }}/{{ webcams.cameras.length }}</template></span>
      </footer>
    </section>

    <!-- under the screen: the reports from the Portal's Dashboard -->
    <DashReports />
  </div>
</template>

<style scoped>
.dash { max-width: none; flex: 1; padding-bottom: var(--rs-space-5); }
.screen {
  --m: var(--rs-space-6); /* the one margin everything sits on */
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
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
.bottom-scrim { bottom: 0; height: 52%; background: var(--rs-overlay-scrim-bottom); }

a { color: inherit; text-decoration: none; }
a:focus-visible { outline: 2px solid var(--rs-overlay-text); outline-offset: 3px; border-radius: 4px; }
.k { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-overlay-muted); white-space: nowrap; }
.sub { font-size: var(--rs-text-xs); color: var(--rs-overlay-muted); white-space: nowrap; }

/* ---- top ---- */
.top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--rs-space-4); padding: var(--rs-space-5) var(--m) 0; }
.tool { display: flex; align-items: center; gap: var(--rs-space-3); min-width: 0; }
.tool .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.emblem {
  position: relative; display: grid; place-items: center; width: 46px; height: 46px; flex: none;
  border-radius: var(--rs-radius-md); border: 1px solid var(--rs-overlay-faint); background: var(--rs-overlay-button);
  color: var(--rs-overlay-text); overflow: hidden; filter: var(--rs-overlay-icon-shadow);
}
.emblem::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
.unverified .emblem::after { display: none; }
.name { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-semibold, 600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tool:hover .name { text-decoration: underline; text-underline-offset: 4px; }
.tool.alert .sub, .tool.alert .name { color: var(--rs-overlay-alert); }
.corner { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.state { display: inline-flex; align-items: center; gap: 8px; font-size: var(--rs-text-md); font-weight: var(--rs-weight-semibold, 600); letter-spacing: 0.02em; }
.state i { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid currentColor; box-shadow: var(--rs-overlay-shadow); }
.state.live i { background: currentColor; animation: pulse 1.6s ease-in-out infinite; }
.state.alert { color: var(--rs-overlay-alert); }
.state.alert i { background: currentColor; }
@keyframes pulse { 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .state.live i { animation: none; } }

/* ---- lower: notices + hero ---- */
.lower { grid-row: 3; display: flex; flex-direction: column; gap: var(--rs-space-5); padding: 0 var(--m); position: relative; }
.notices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--rs-space-3); max-width: 520px; }
.notices a { display: flex; flex-direction: column; gap: 2px; padding: 1px 0 1px 12px; border-left: 2px solid var(--rs-overlay-text); }
.notices strong { font-size: var(--rs-text-md); font-weight: var(--rs-weight-semibold, 600); }
.notices span { font-size: var(--rs-text-sm); color: var(--rs-overlay-muted); }
.notices .alert a { border-left-color: var(--rs-overlay-alert); }
.notices .alert strong { color: var(--rs-overlay-alert); }
.notices a:hover strong { text-decoration: underline; text-underline-offset: 4px; }

.hero { display: flex; align-items: flex-end; gap: var(--rs-space-5); min-width: 0; }
.big { font-size: 5.6rem; line-height: 0.8; color: var(--rs-overlay-text); }
.big small { font-family: var(--rs-font-ui); font-weight: var(--rs-weight-medium); font-size: 0.26em; margin-left: 2px; vertical-align: top; color: var(--rs-overlay-muted); }
.about { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-bottom: 2px; }
.file { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-semibold, 600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.safety { font-size: var(--rs-text-xs); color: var(--rs-overlay-muted); }
.times { font-size: var(--rs-text-sm); color: var(--rs-overlay-muted); font-variant-numeric: tabular-nums; }
.hero.alert .k, .hero.alert .file, .hero.alert .big { color: var(--rs-overlay-alert); }
a.hero:hover .file { text-decoration: underline; text-underline-offset: 4px; }
.bar { display: block; height: 3px; border-radius: 2px; background: var(--rs-overlay-faint); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--rs-overlay-text); box-shadow: var(--rs-overlay-glow); }
.bar.alert span { background: var(--rs-overlay-alert); box-shadow: none; }

/* ---- bottom rail ---- */
.rail {
  grid-row: 4;
  display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--rs-space-3) var(--rs-space-6);
  margin: var(--rs-space-4) var(--m) 0; padding: var(--rs-space-3) 0 var(--rs-space-5);
  border-top: 1px solid var(--rs-overlay-faint);
}
.item { display: flex; flex-direction: column; gap: 2px; }
.val { font-size: var(--rs-text-md); font-weight: var(--rs-weight-semibold, 600); font-variant-numeric: tabular-nums; white-space: nowrap; }
.val.mono { font-family: var(--rs-font-code); font-weight: 500; font-size: var(--rs-text-sm); line-height: 1.55; letter-spacing: -0.01em; }
.val em { font-style: normal; font-weight: var(--rs-weight-regular, 400); font-size: var(--rs-text-xs); color: var(--rs-overlay-muted); margin-left: 6px; }
.item:hover .val { text-decoration: underline; text-underline-offset: 4px; }
.item.alert .k, .item.alert .val { color: var(--rs-overlay-alert); }
.camname { margin-left: auto; align-self: flex-end; font-size: var(--rs-text-xs); color: var(--rs-overlay-muted); white-space: nowrap; }

@media (max-width: 720px) {
  .dash { padding: var(--rs-space-3) var(--rs-space-3) 96px; }
  .screen { --m: var(--rs-space-4); min-height: 600px; }
  .top { padding-top: var(--rs-space-4); }
  .big { font-size: 3.8rem; }
  .hero { flex-direction: column; align-items: flex-start; gap: var(--rs-space-2); }
  .rail { display: grid; grid-template-columns: 1fr 1fr; }
  .camname { grid-column: 1 / -1; margin-left: 0; }
  .bottom-scrim { height: 70%; }
}
</style>
