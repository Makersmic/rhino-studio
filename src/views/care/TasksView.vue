<script setup lang="ts">
/**
 * Every maintenance task, grouped by what it's for (machine areas, then
 * toolheads, then system hardware), most urgent first in each group. Each
 * group folds. Filter by state, by what it's for, or by typing.
 * Select a task to edit it; Log work and Set status work from the row.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import Readout from '@/components/Readout.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { lookFor } from '@/toolheads/registry'
import CareBar from '@/maintenance/CareBar.vue'
import LogWorkDialog from '@/maintenance/LogWorkDialog.vue'
import StatusDialog from '@/maintenance/StatusDialog.vue'
import TaskState from '@/maintenance/TaskState.vue'
import { assetChoices, filterCounts, grouped, taskGroups, toolOf, type TaskFilter } from '@/maintenance/edit'
import { attentionOf, careText, fmtMeter } from '@/maintenance/summary'
import type { MaintTask } from '@/maintenance/types'
import { useMaintenanceStore } from '@/stores/maintenance'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const care = useMaintenanceStore()
const route = useRoute()
const router = useRouter()

const FILTERS: [TaskFilter, string][] = [['all', 'Every task'], ['due', 'Due'], ['held', 'With a status'], ['paused', 'Paused'], ['archived', 'Archived']]
const filter = computed<TaskFilter>(() => (FILTERS.some(([k]) => k === route.query.show) ? (route.query.show as TaskFilter) : 'all'))
const forAsset = computed(() => (typeof route.query.for === 'string' ? route.query.for : ''))
const q = ref('')
const setQuery = (k: 'show' | 'for', v: string) => router.replace({ query: { ...route.query, [k]: v && v !== 'all' ? v : undefined } })

const counts = computed(() => filterCounts(care.overview))
const choices = computed(() => assetChoices(care.overview))
const groups = computed(() => taskGroups(care.overview, filter.value, forAsset.value, q.value))

// folds: with every task showing, groups that need nothing start folded so what's due stands out;
// a filter, a search or one asset opens them all. "Fold all" / "Open all" overrides.
const shut = ref<Record<string, boolean>>({})
const narrowed = computed(() => filter.value !== 'all' || !!forAsset.value || !!q.value.trim())
function defaults() {
  shut.value = narrowed.value ? {} : Object.fromEntries(groups.value.filter((g) => level(g.tasks) === 'ok' && !g.tasks.some((t) => t.status?.hold)).map((g) => [g.asset, true]))
}
const allShut = computed(() => groups.value.length > 0 && groups.value.every((g) => shut.value[g.asset]))
const foldAll = () => (shut.value = allShut.value ? {} : Object.fromEntries(groups.value.map((g) => [g.asset, true])))
watch([filter, forAsset, () => !!q.value.trim(), () => !!care.overview], defaults, { immediate: true })

const summary = (tasks: MaintTask[]) => {
  const due = tasks.filter((t) => attentionOf(t) === 'overdue' || attentionOf(t) === 'due_soon')
  return careText({ overdue: due.filter((t) => attentionOf(t) === 'overdue').length, dueSoon: due.filter((t) => attentionOf(t) === 'due_soon').length, total: tasks.length })
}
const worst = (tasks: MaintTask[]) => Math.min(1, Math.max(0, ...tasks.filter((t) => !t.status?.hold).map((t) => t.status?.fraction ?? 0)))
function level(tasks: MaintTask[]) {
  return tasks.some((t) => attentionOf(t) === 'overdue') ? 'overdue' : tasks.some((t) => attentionOf(t) === 'due_soon') ? 'due_soon' : 'ok'
}
const fmtDay = (s: number) => new Date(s * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// one asset picked: its meters above the list
const meters = computed(() => {
  if (!forAsset.value || !care.overview) return []
  const t = toolOf(forAsset.value)
  return t ? (care.overview.meters.tools[t] ?? []) : forAsset.value.startsWith('machine:') ? care.overview.meters.machine.slice(0, 4) : []
})

const logging = ref<MaintTask | null>(null)
const statusFor = ref<MaintTask | null>(null)
const flash = ref<string | null>(null)
function say(msg: string) {
  flash.value = msg
  setTimeout(() => (flash.value = null), 5000)
}
const open = (t: MaintTask) => router.push(`/care/tasks/${encodeURIComponent(t.id)}`)
const newTask = () => router.push({ path: '/care/tasks/new', query: forAsset.value ? { for: forAsset.value } : {} })
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Tasks</h1>
        <p>Every maintenance task, grouped by what it's for. Select one to change its schedule, steps or parts. Tasks from the Task Library are edited there, once for every copy.</p>
      </div>
      <div class="acts"><RsButton variant="primary" @click="newTask">New task</RsButton></div>
    </div>

    <div class="sx-bar">
      <div class="sx-seg" role="group" aria-label="Show">
        <button v-for="[k, l] in FILTERS" :key="k" type="button" :class="{ on: filter === k }" :aria-pressed="filter === k" @click="setQuery('show', k)">
          {{ l }} <span class="n">{{ counts[k] }}</span>
        </button>
      </div>
      <select class="tm-sel sx-sel" aria-label="For" :value="forAsset" @change="setQuery('for', ($event.target as HTMLSelectElement).value)">
        <option value="">Everything</option>
        <optgroup v-for="[g, cs] in grouped(choices)" :key="g" :label="g">
          <option v-for="c in cs" :key="c.value" :value="c.value">{{ c.label }}</option>
        </optgroup>
      </select>
      <input v-model="q" class="tm-in sx-search" type="search" placeholder="Find a task…" aria-label="Find a task" />
      <span class="grow" />
      <button v-if="groups.length > 1" type="button" class="sx-link" @click="foldAll">{{ allShut ? 'Open all' : 'Fold all' }}</button>
    </div>

    <p v-if="flash" class="sx-flash" role="status">{{ flash }}</p>

    <div v-if="meters.length" class="meters">
      <Readout v-for="m in meters" :key="m.meter" :label="m.label" :value="String(m.unit ? Math.round(m.value) : Math.round(m.value))" :unit="m.unit" :detail="m.per_day ? `About ${fmtMeter(m.per_day, m.unit)} a day` : ''" />
    </div>

    <p v-if="!care.overview" class="muted">{{ care.source === 'unavailable' ? `Can't reach the Rhino Portal: ${care.error}` : 'Loading tasks from the Portal…' }}</p>
    <div v-else-if="!groups.length" class="sx-empty">
      <template v-if="filter === 'all' && !forAsset && !q">
        <strong>No tasks yet.</strong>
        <span>Assign a Task Book to the machine and each toolhead from the Task Library, then tune the intervals. Or add a task of your own.</span>
        <RsButton @click="router.push('/care/library')">Open the Task Library</RsButton>
      </template>
      <span v-else>Nothing matches. <button type="button" class="sx-link" @click="router.replace({ query: {} }); q = ''">Show every task</button></span>
    </div>

    <section v-for="g in groups" :key="g.asset" class="sx-fold" :class="{ open: !shut[g.asset] }">
      <button type="button" class="fh" :aria-expanded="!shut[g.asset]" @click="shut = { ...shut, [g.asset]: !shut[g.asset] }">
        <span class="sx-chev" />
        <ToolheadBadge v-if="toolOf(g.asset)" :look="lookFor(toolOf(g.asset)!)" size="sm" />
        <span v-else class="who">
          <span class="ft">{{ g.label }}</span>
          <span class="fm">{{ g.group }}</span>
        </span>
        <span class="fr">
          <span class="fm sum">{{ summary(g.tasks) }}</span>
          <CareBar class="gbar" :fraction="worst(g.tasks)" :level="level(g.tasks)" :label="`${g.label}: furthest task`" />
          <span class="sx-count" :class="{ strong: level(g.tasks) === 'overdue' }">{{ g.tasks.length }}</span>
        </span>
      </button>
      <div v-show="!shut[g.asset]" class="fb">
        <div class="sx-colhead cols"><span>Task</span><span>Schedule</span><span>State</span><span>Last done</span><span /></div>
        <ul class="sx-rows">
          <li v-for="t in g.tasks" :key="t.id" class="row cols">
            <span class="task">
              <RouterLink :to="`/care/tasks/${encodeURIComponent(t.id)}`" class="tt">{{ t.title }}</RouterLink>
              <span v-if="t.link_info" class="lib">Library{{ t.link_info.book_name ? ` · ${t.link_info.book_name}` : '' }}</span>
            </span>
            <span class="sched">{{ t.status?.rules?.map((r) => r.summary).join(' or ') || '—' }}</span>
            <span class="state">
              <TaskState :task="t" />
              <span v-if="t.status?.next?.text && !t.archived" class="next">{{ t.status.next.text }}</span>
            </span>
            <span class="last">{{ t.last?.at ? fmtDay(t.last.at) : 'Never' }}</span>
            <span class="acts">
              <RsButton v-if="t.status && !t.archived" size="sm" @click="logging = t">Log work</RsButton>
              <RsButton v-if="t.status && !t.archived" size="sm" variant="quiet" @click="statusFor = t">{{ t.status.hold ? 'Change status' : 'Set status' }}</RsButton>
              <RsButton v-if="t.archived" size="sm" variant="quiet" @click="open(t)">Open</RsButton>
            </span>
          </li>
        </ul>
        <button type="button" class="sx-link add" @click="router.push({ path: '/care/tasks/new', query: { for: g.asset } })">+ Add a task for {{ g.label }}</button>
      </div>
    </section>

    <LogWorkDialog :task="logging" @close="logging = null" @saved="(t) => say(`Logged: ${t}`)" />
    <StatusDialog :task="statusFor" @close="statusFor = null" @saved="say" />
  </div>
</template>

<style scoped>
.meters { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.who { display: flex; flex-direction: column; gap: 1px; }
.sum { white-space: nowrap; }
.gbar { width: 90px; }
.cols { grid-template-columns: minmax(200px, 1.6fr) minmax(150px, 1.2fr) minmax(170px, 1.3fr) 110px 210px; align-items: start; }
.row { display: grid; gap: var(--rs-space-4); padding: var(--rs-space-3) 0; font-size: var(--rs-text-sm); }
.task { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tt { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); text-decoration: none; }
.tt:hover { text-decoration: underline; text-underline-offset: 3px; }
.lib, .next, .last, .sched { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.sched { color: var(--rs-text); font-size: var(--rs-text-sm); }
.last { padding-top: 3px; font-family: var(--rs-font-code); }
.state { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.acts { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
.add { align-self: flex-start; }
@media (max-width: 1100px) {
  .sx-colhead { display: none; }
  .cols { grid-template-columns: 1fr auto; }
  .sched, .last { grid-column: 1; }
  .state { grid-column: 1; }
  .acts { grid-column: 2; grid-row: 1 / span 4; flex-direction: column; align-items: flex-end; }
  .last::before { content: 'Last done '; font-family: var(--rs-font-ui); }
}
@media (max-width: 560px) {
  .sum, .gbar { display: none; }
  .cols { grid-template-columns: 1fr; }
  .acts { grid-column: 1; grid-row: auto; flex-direction: row; justify-content: flex-start; }
}
</style>
