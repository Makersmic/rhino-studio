<script setup lang="ts">
/**
 * The Dashboard's reports, under the camera screen: everything the Rhino
 * Portal's Dashboard shows (use per toolhead, maintenance state, jobs and
 * work per week), drawn the e-paper way.
 *
 * Look-only like the rest of the Dashboard: links go to Care and Toolheads,
 * nothing here logs work or acts on the machine.
 */
import { computed } from 'vue'
import Icon from '@/icons/Icon.vue'
import Readout from '@/components/Readout.vue'
import RsPanel from '@/components/RsPanel.vue'
import SectionRule from '@/components/SectionRule.vue'
import CareBar from '@/maintenance/CareBar.vue'
import { attentionOf, careText } from '@/maintenance/summary'
import { lookFor } from '@/toolheads/registry'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import HBarChart from './HBarChart.vue'
import ColumnChart from './ColumnChart.vue'
import ReportPanel from './ReportPanel.vue'
import {
  STATE_FILL,
  fmtCount,
  fmtHours,
  hoursByTool,
  jobsByTool,
  jobsWeekly,
  nextUp,
  stats,
  taskStatus,
  tasksByAsset,
  toolGlance,
  toolNames,
  weekLabel,
  weekStarts,
  workWeekly,
} from './reports'
import './fills.css'

const machine = useMachineStore()
const care = useMaintenanceStore()

const ov = computed(() => care.overview)
const weeks = computed(() => (care.jobWeeks?.available === false ? null : (care.jobWeeks?.weeks ?? null)))
const names = computed(() => toolNames(ov.value, machine.knownTools.map((t) => t.name)))
const s = computed(() => stats(ov.value, weeks.value))

// The big numbers use the seven-segment face: plain digits, no thousands separators
const big = (v: number, dp = 0) => (dp ? (Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp) : Math.round(v).toString())
const filament = computed(() => (s.value.filament >= 1000 ? { v: big(s.value.filament / 1000, 2), u: 'km' } : { v: big(s.value.filament), u: 'm' }))

const hours = computed(() => hoursByTool(ov.value, names.value))
const jobs = computed(() => jobsByTool(ov.value, names.value))
const glance = computed(() => toolGlance(ov.value, names.value))
const status = computed(() => taskStatus(ov.value))
const statusTotal = computed(() => status.value.reduce((a, g) => a + g.count, 0))
const needs = computed(() => s.value.overdue + s.value.dueSoon)
const next = computed(() => nextUp(ov.value, 6))
const byAsset = computed(() => tasksByAsset(ov.value))
const jobsCols = computed(() => (weeks.value ? jobsWeekly(weeks.value) : []))
const workCols = computed(() => workWeekly(care.history, weekStarts(weeks.value)))

const STATE_LEGEND = [
  { name: 'Overdue', fill: STATE_FILL.overdue! },
  { name: 'On hold', fill: STATE_FILL.held! },
  { name: 'Due soon', fill: STATE_FILL.due_soon! },
  { name: 'Snoozed', fill: STATE_FILL.snoozed! },
  { name: 'Scheduled', fill: STATE_FILL.ok! },
]
const usedStates = computed(() => STATE_LEGEND.filter((_l, i) => byAsset.value.some((r) => r.parts[i]!.v > 0)))
const barLevel = (a: string) => (a === 'overdue' || a === 'due_soon' || a === 'held' ? a : 'ok')
const mounted = (n: string) => machine.mountedVerified && machine.mountedName === n
const updated = computed(() => (care.updatedAt ? new Date(care.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null))
</script>

<template>
  <section class="reports" aria-labelledby="reportsH">
    <div class="head">
      <SectionRule id="reportsH" label="Reports" />
      <span v-if="updated" class="upd">From the Rhino Portal · updated {{ updated }}</span>
    </div>

    <p v-if="care.source === 'unavailable'" class="empty">
      The reports come from the Rhino Portal on the Pi (port 5000), and it isn't answering<template v-if="care.error">: {{ care.error }}</template>.
      They come back when it does.
    </p>
    <p v-else-if="!ov" class="empty">Loading the reports…</p>

    <template v-else>
      <!-- the numbers that matter at a glance -->
      <div class="tiles">
        <Readout label="Production hours" :value="big(s.prodHours)" unit="h" :detail="s.hoursPerDay ? `about ${big(s.hoursPerDay, 1)} h a day` : 'jobs running, pauses not counted'" />
        <Readout label="Jobs" :value="big(s.jobs)" :detail="s.finishedShare == null ? 'finished jobs' : `${Math.round(s.finishedShare * 100)}% finished, last 12 weeks`" />
        <Readout label="Filament used" :value="filament.v" :unit="filament.u" :detail="`${fmtCount(s.swaps)} tool swaps`" />
        <RouterLink to="/care" class="tilelink"><Readout label="Overdue" :value="big(s.overdue)" :detail="s.overdue ? 'maintenance past due' : 'nothing past due'" :class="{ bad: s.overdue }" /></RouterLink>
        <RouterLink to="/care" class="tilelink"><Readout label="Due soon" :value="big(s.dueSoon)" :detail="s.held ? `${s.held} on hold` : 'inside the early alarm'" /></RouterLink>
      </div>

      <div class="cols">
        <!-- toolheads -->
        <div class="col">
          <h2 class="colh">Toolheads</h2>
          <ReportPanel
            title="Hours by toolhead"
            panel-id="dash.hours"
            sub="Time each tool has been mounted, and how much of it was spent on jobs"
            :legend="[{ name: 'Producing', fill: 'ink' }, { name: 'Mounted, not producing', fill: 'dither' }]"
            :table="{ head: ['Toolhead', 'Producing', 'Mounted'], rows: hours.map((r) => [r.label, fmtHours(r.parts[0]!.v), fmtHours(r.total)]) }"
          >
            <HBarChart :rows="hours" :fmt="fmtHours" label="Hours by toolhead" />
          </ReportPanel>

          <ReportPanel
            title="Jobs by toolhead"
            panel-id="dash.jobs"
            sub="Finished jobs run with each tool, and its share"
            :table="{ head: ['Toolhead', 'Jobs', 'Share'], rows: jobs.map((r) => [r.label, fmtCount(r.total), r.note!.split('· ')[1]!]) }"
          >
            <HBarChart :rows="jobs" label="Jobs by toolhead" :axis="false" />
          </ReportPanel>

          <RsPanel title="Toolheads at a glance" panel-id="dash.glance">
            <p class="sub">Use per tool and its most urgent care task</p>
            <ul class="glance">
              <li v-for="g in glance" :key="g.name">
                <RouterLink to="/care" class="gl" :class="{ on: mounted(g.name) }">
                  <span class="gtop">
                    <span class="disc" :style="{ '--accent': `var(${lookFor(g.name).accentVar})` }"><Icon :tool="lookFor(g.name).icon" :size="22" /></span>
                    <strong>{{ g.name }}</strong>
                    <span v-if="mounted(g.name)" class="chip">Mounted</span>
                  </span>
                  <span class="gstats"><b>{{ fmtCount(g.jobs) }}</b> jobs · <b>{{ fmtHours(g.prodHours) }}</b> producing · <b>{{ fmtCount(g.mounts) }}</b> mounts</span>
                  <template v-if="g.care.total">
                    <span class="gcare">{{ careText(g.care) }}<template v-if="g.care.next"> · next: {{ g.care.next.title }}</template></span>
                    <CareBar :fraction="g.care.worstFraction" :level="g.care.level" :label="`${g.name}: closest care task`" />
                  </template>
                  <span v-else class="gcare muted">No care tasks yet – assign a Task Book in the Portal</span>
                </RouterLink>
              </li>
            </ul>
          </RsPanel>

          <ReportPanel
            v-if="weeks"
            title="Jobs per week"
            panel-id="dash.jobsweek"
            sub="Last 12 weeks, from Moonraker's job history"
            :legend="[{ name: 'Finished', fill: 'ink' }, { name: 'Cancelled', fill: 'dither' }, { name: 'Failed', fill: 'hatch' }]"
            :table="{ head: ['Week of', 'Finished', 'Cancelled', 'Failed', 'Job hours'], rows: weeks.map((w) => [weekLabel(w.start), w.completed, w.cancelled, w.error, fmtHours(w.hours)]) }"
          >
            <ColumnChart :columns="jobsCols" label="Jobs per week" />
          </ReportPanel>
          <RsPanel v-else title="Jobs per week" panel-id="dash.jobsweek"><p class="sub">Moonraker's job history isn't available.</p></RsPanel>
        </div>

        <!-- maintenance -->
        <div class="col">
          <h2 class="colh">Maintenance</h2>
          <ReportPanel
            title="Task status"
            panel-id="dash.status"
            :sub="`${fmtCount(statusTotal)} active tasks on the machine and its tools`"
            :table="{ head: ['Status', 'Tasks'], rows: status.map((g) => [g.label, g.count]) }"
          >
            <div class="status">
              <div class="need">
                <span class="rs-num">{{ needs }}</span>
                <span class="needl">{{ needs === 1 ? 'needs attention' : 'need attention' }}</span>
              </div>
              <div class="stack" role="img" :aria-label="status.map((g) => `${g.label} ${g.count}`).join(', ')">
                <span v-for="g in status" :key="g.label" :class="`fill-${g.fill}`" :style="{ flexGrow: g.count }" />
              </div>
              <ul class="slist">
                <li v-for="g in status" :key="g.label"><i :class="`fill-${g.fill}`" /><span>{{ g.label }}</span><b>{{ g.count }}</b></li>
                <li v-if="!status.length" class="muted">No tasks yet</li>
              </ul>
            </div>
          </ReportPanel>

          <RsPanel title="Next up" panel-id="dash.next">
            <template #actions><RouterLink to="/care" class="all">All tasks</RouterLink></template>
            <p class="sub">The most urgent tasks; the bar shows how far each is through its interval</p>
            <ul v-if="next.length" class="next">
              <li v-for="t in next" :key="t.id">
                <span class="nh"><strong>{{ t.title }}</strong><span class="state" :class="attentionOf(t)">{{ attentionOf(t) === 'held' ? t.status?.hold?.label : status.find((g) => g.key === attentionOf(t))?.label }}</span></span>
                <span class="na">{{ t.asset_label }}</span>
                <CareBar :fraction="t.status?.fraction ?? 0" :level="barLevel(attentionOf(t))" :label="`${t.title}: interval used`" />
                <span class="nt">{{ t.status?.next?.text }}</span>
              </li>
            </ul>
            <p v-else class="sub">No maintenance tasks yet.</p>
          </RsPanel>

          <ReportPanel
            title="Tasks by machine and toolhead"
            panel-id="dash.assets"
            sub="How many tasks each has, by status"
            :legend="usedStates"
            :table="{ head: ['', ...STATE_LEGEND.map((l) => l.name)], rows: byAsset.map((r) => [r.label, ...r.parts.map((p) => p.v)]) }"
          >
            <HBarChart v-if="byAsset.length" :rows="byAsset" label="Tasks by machine and toolhead" />
            <p v-else class="sub">No tasks yet.</p>
          </ReportPanel>

          <ReportPanel
            title="Maintenance logged per week"
            panel-id="dash.workweek"
            sub="Last 12 weeks, from the work log"
            :legend="[{ name: 'Done', fill: 'ink' }, { name: 'Skipped', fill: 'dither' }]"
            :table="{ head: ['Week of', 'Done', 'Skipped'], rows: workCols.map((c) => [c.label, c.parts[0]!.v, c.parts[1]!.v]) }"
          >
            <ColumnChart :columns="workCols" label="Maintenance logged per week" />
          </ReportPanel>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.reports { display: flex; flex-direction: column; gap: var(--rs-space-4); margin-top: var(--rs-space-6); }
.head { display: flex; align-items: baseline; gap: var(--rs-space-4); }
.head > :first-child { flex: 1; }
.upd { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.empty { color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.muted { color: var(--rs-text-muted); }

.tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--rs-space-3); }
.tilelink { color: inherit; text-decoration: none; display: grid; }
.tilelink:hover :deep(.label) { text-decoration: underline; text-underline-offset: 3px; }
.tilelink :deep(.readout.bad) { background: var(--rs-ink); }
.tilelink :deep(.readout.bad .label), .tilelink :deep(.readout.bad .detail), .tilelink :deep(.readout.bad .value) { color: var(--rs-on-ink); }

.cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--rs-space-4); align-items: start; }
.col { display: flex; flex-direction: column; gap: var(--rs-space-4); min-width: 0; }
.colh { margin: var(--rs-space-2) 0 0; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); letter-spacing: 0.08em; text-transform: uppercase; color: var(--rs-text-muted); }
.sub { margin: 0 0 var(--rs-space-3); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }

/* toolheads at a glance */
.glance { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: var(--rs-space-3); }
.gl { display: flex; flex-direction: column; gap: 6px; padding: var(--rs-space-3); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); color: inherit; text-decoration: none; height: 100%; }
.gl:hover { border-color: var(--rs-line-strong); }
.gl.on { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.gtop { display: flex; align-items: center; gap: 8px; }
.gtop strong { font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.disc { position: relative; display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--rs-radius-sm); border: 1px solid var(--rs-line); overflow: hidden; color: var(--rs-text-strong); }
.disc::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--accent); }
.chip { margin-left: auto; font-size: 10px; font-weight: var(--rs-weight-medium); padding: 1px 6px; border-radius: var(--rs-radius-pill); background: var(--rs-ink); color: var(--rs-on-ink); }
.gstats { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.gstats b { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.gcare { font-size: var(--rs-text-xs); color: var(--rs-text-strong); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* task status */
.status { display: grid; grid-template-columns: auto 1fr; gap: var(--rs-space-3) var(--rs-space-5); align-items: center; }
.need { display: flex; flex-direction: column; gap: 4px; grid-row: span 2; }
.need .rs-num { font-size: 2.4rem; line-height: 0.9; }
.needl { font-size: 11px; color: var(--rs-text-muted); white-space: nowrap; }
.stack { display: flex; gap: 2px; height: 16px; }
.stack span { min-width: 3px; border-radius: 1px; }
.slist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px var(--rs-space-4); }
.slist li { display: flex; align-items: center; gap: 8px; font-size: var(--rs-text-xs); color: var(--rs-text-strong); }
.slist i { width: 12px; height: 10px; border-radius: 2px; flex: none; }
.slist b { margin-left: auto; font-weight: var(--rs-weight-medium); font-variant-numeric: tabular-nums; }

/* next up */
.all { font-size: var(--rs-text-xs); color: var(--rs-text-strong); }
.next { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.next li { display: flex; flex-direction: column; gap: 4px; padding: var(--rs-space-3) 0; border-top: 1px dotted var(--rs-line); }
.next li:first-child { border-top: 0; padding-top: 0; }
.nh { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rs-space-3); }
.nh strong { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.state { flex: none; font-size: 10px; font-weight: var(--rs-weight-medium); padding: 1px 7px; border-radius: var(--rs-radius-pill); border: 1px solid var(--rs-line-strong); color: var(--rs-text-strong); white-space: nowrap; }
.state.overdue { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.state.due_soon { border-color: var(--rs-ink); border-width: 1.5px; }
.state.held { border-style: dashed; }
.na, .nt { font-size: 11px; color: var(--rs-text-muted); }

@media (max-width: 1100px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) { .cols { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .status { grid-template-columns: minmax(0, 1fr); } .need { grid-row: auto; flex-direction: row; align-items: baseline; gap: 8px; } }
</style>
