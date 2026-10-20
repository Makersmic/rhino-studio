<script setup lang="ts">
/**
 * Files > Job history: Moonraker's job history (the same list Mainsail shows),
 * newest first, with totals. Reprint starts the file again through the same
 * checks as Start in Gcode files (mounted tool, Klipper ready, no job).
 * Nothing here deletes history.
 */
import { computed, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { describeRun } from './lastRun'
import { fetchFileToolhead } from '@/moonraker/gcodeHeader'
import type { HistoryJob, HistoryTotals } from '@/moonraker/client'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'

const machine = useMachineStore()
const control = useControlStore()
const jobs = ref<HistoryJob[]>([])
const totals = ref<HistoryTotals | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const msg = ref<string | null>(null)
const SHOWN = 200

async function load() {
  if (!machine.online) return
  loading.value = true
  error.value = null
  try {
    const [list, t] = await Promise.all([machine.listHistory(SHOWN), machine.historyTotals()])
    jobs.value = list
    totals.value = t
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(() => machine.online, (on) => (on ? load() : (jobs.value = [])), { immediate: true })
// a job that ends shows up straight away
watch(() => machine.job.state, (s, was) => (was === 'printing' || was === 'paused') && s !== 'printing' && s !== 'paused' && setTimeout(load, 1500))

const rows = computed(() => jobs.value.map((j) => ({ j, run: describeRun(j) })))

const starting = ref<string | null>(null)
async function reprint(j: HistoryJob) {
  starting.value = j.job_id
  msg.value = null
  try {
    const url = machine.rootUrl('gcodes', j.filename)
    const head = url ? await fetchFileToolhead(url).catch(() => null) : null
    await control.startJob(j.filename, head, null)
  } catch (e) {
    msg.value = `${j.filename}: ${(e as Error).message}`
  } finally {
    starting.value = null
  }
}

function dur(s: number | undefined) {
  if (!s || s < 1) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}
const metres = (mm: number | undefined) => (!mm ? '—' : mm >= 1000 ? `${(mm / 1000).toFixed(1)} m` : `${Math.round(mm)} mm`)
const when = (s: number) => new Date(s * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div class="hist">
    <div class="totals" v-if="totals">
      <div class="cell"><span class="lbl">Jobs</span><span class="val rs-num">{{ totals.total_jobs }}</span></div>
      <div class="cell"><span class="lbl">Printing time</span><span class="val">{{ dur(totals.total_print_time) }}</span></div>
      <div class="cell"><span class="lbl">Filament used</span><span class="val">{{ metres(totals.total_filament_used) }}</span></div>
      <div class="cell"><span class="lbl">Longest job</span><span class="val">{{ dur(totals.longest_job) }}</span></div>
      <RsButton variant="quiet" class="refresh" :disabled="loading" @click="load">Refresh</RsButton>
    </div>
    <p v-if="msg" class="msg" role="status">{{ msg }}</p>
    <p v-if="error" class="error">Couldn't read the job history: {{ error }}</p>
    <p v-else-if="!loading && !jobs.length" class="muted">No jobs yet. Finished, cancelled and failed jobs show up here.</p>
    <div v-else class="list" role="table" aria-label="Job history">
      <div class="row head" role="row">
        <span role="columnheader">File</span><span role="columnheader">Ended</span><span role="columnheader">Started</span>
        <span role="columnheader">Printing</span><span role="columnheader">Filament</span><span role="columnheader" class="sr-only">Reprint</span>
      </div>
      <div v-for="{ j, run } in rows" :key="j.job_id" class="row" role="row">
        <span class="file" role="cell">
          <RouterLink v-if="j.exists !== false" :to="{ path: '/files', query: { tab: 'gcodes', file: j.filename } }">{{ j.filename }}</RouterLink>
          <span v-else class="gone" title="The file has been deleted or moved since">{{ j.filename }}</span>
        </span>
        <span class="run" :class="run.kind" role="cell" :title="run.detail">
          <span class="mark" aria-hidden="true">{{ run.kind === 'completed' ? '✓' : run.kind === 'failed' ? '✕' : run.kind === 'running' ? '•' : '–' }}</span>{{ run.label }}
        </span>
        <span class="meta" role="cell">{{ when(j.start_time) }}</span>
        <span class="meta" role="cell">{{ dur(j.print_duration) }}</span>
        <span class="meta" role="cell">{{ metres(j.filament_used) }}</span>
        <span class="go" role="cell">
          <RsButton
            v-if="run.kind !== 'running'"
            :disabled="j.exists === false || control.jobActive || starting === j.job_id"
            :title="j.exists === false ? 'The file is gone' : control.jobActive ? 'A job is running' : 'Start this file again (checks the toolhead first)'"
            @click="reprint(j)"
          >Reprint</RsButton>
        </span>
      </div>
      <p v-if="jobs.length >= SHOWN" class="muted small">The newest {{ SHOWN }} jobs. The totals count every job Moonraker has kept.</p>
    </div>
  </div>
</template>

<style scoped>
.totals { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--rs-space-5, 28px); margin-bottom: var(--rs-space-4); padding-bottom: var(--rs-space-3); border-bottom: 1px dotted var(--rs-line-strong); }
.cell { display: flex; flex-direction: column; gap: 2px; }
.lbl { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); line-height: 18px; }
.val { font-size: 1.3rem; color: var(--rs-text-strong); }
.val.rs-num { font-size: 1.6rem; }
.refresh { margin-left: auto; align-self: center; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) 130px 140px 110px 90px 110px; align-items: center; gap: var(--rs-space-4); padding: 8px 6px; border-top: 1px solid var(--rs-line); }
.row.head { padding-top: 0; border-top: 0; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.file { overflow-wrap: anywhere; }
.file a { color: var(--rs-text-strong); text-underline-offset: 3px; }
.gone { color: var(--rs-text-muted); text-decoration: line-through; }
.run { font-size: var(--rs-text-sm); color: var(--rs-text-strong); white-space: nowrap; }
.run .mark { display: inline-block; width: 1.1em; font-weight: var(--rs-weight-medium); }
.run.cancelled { color: var(--rs-text-muted); }
.run.failed { color: var(--rs-danger); }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.go { display: flex; justify-content: flex-end; }
.msg { font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.error { color: var(--rs-danger); }
.small { font-size: var(--rs-text-sm); margin-top: var(--rs-space-3); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 900px) {
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; }
  .row.head { display: none; }
  .file { grid-column: 1 / -1; }
  .go { grid-column: 2; grid-row: 2 / span 4; align-self: center; }
}
</style>
