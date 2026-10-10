<script setup lang="ts">
/**
 * G-code files on the Pi, with the toolhead each one asks for.
 * Read-only: nothing here starts, deletes or uploads (that's Phase 2b).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import Icon from '@/icons/Icon.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { lookFor } from '@/toolheads/registry'
import { fetchFileToolhead } from '@/moonraker/gcodeHeader'
import type { FileEntry } from '@/moonraker/client'
import { useMachineStore } from '@/stores/machine'

const machine = useMachineStore()
const files = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
/** path@modified -> toolhead name, null = not declared, 'error' = couldn't read */
const heads = ref<Record<string, string | null>>({})
let abort: AbortController | null = null

const key = (f: FileEntry) => `${f.path}@${f.modified}`
const HEADER_LIMIT = 40 // read headers for the newest 40 files only, to go easy on the Pi

async function load() {
  if (!machine.online) return
  loading.value = true
  error.value = null
  try {
    const list = await machine.listFiles()
    files.value = list.filter((f) => /\.(gcode|gco|g|nc|ngc)$/i.test(f.path)).sort((a, b) => b.modified - a.modified)
    void readHeaders()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

/**
 * Two at a time, newest first, cached per file version.
 * Skipped while a job runs: the Pi 3B's SD card is busy feeding Klipper then.
 */
const jobRunning = computed(() => machine.job.state === 'printing')
watch(jobRunning, (running) => {
  if (running) abort?.abort()
  else if (files.value.length) void readHeaders()
})

async function readHeaders() {
  if (jobRunning.value) return
  abort?.abort()
  abort = new AbortController()
  const signal = abort.signal
  const queue = files.value.slice(0, HEADER_LIMIT).filter((f) => !(key(f) in heads.value))
  const worker = async () => {
    for (let f = queue.shift(); f && !signal.aborted; f = queue.shift()) {
      const url = machine.fileUrl(f.path)
      if (!url) return
      try {
        // Await first, then merge: spreading heads.value before the await would
        // drop results the other worker stored in the meantime
        const found = await fetchFileToolhead(url, signal)
        heads.value = { ...heads.value, [key(f)]: found }
      } catch {
        if (!signal.aborted) heads.value = { ...heads.value, [key(f)]: 'error' }
      }
    }
  }
  await Promise.all([worker(), worker()])
}

watch(() => machine.online, (on) => (on ? load() : (files.value = [])), { immediate: true })
onBeforeUnmount(() => abort?.abort())

const rows = computed(() =>
  files.value.map((f, i) => {
    const h = heads.value[key(f)]
    const pending = i < HEADER_LIMIT && h === undefined
    const tool = h && h !== 'error' ? h : null
    return {
      f,
      pending,
      unreadable: h === 'error',
      tool,
      look: tool ? lookFor(tool, machine.knownTools.find((t) => t.name === tool)?.type ?? undefined) : null,
      needsSwap: !!tool && machine.mountedVerified && tool !== machine.mountedName,
      matches: !!tool && machine.mountedVerified && tool === machine.mountedName,
    }
  }),
)

const fmtDate = (s: number) => new Date(s * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Files</h1>
      <p>G-code on the Pi, with the toolhead each job asks for. Starting jobs from here comes in Phase 2b.</p>
    </div>

    <EmptyState v-if="!machine.online" title="Connect to see files on the Pi">
      <template #art><Icon nav="files" :size="64" /></template>
      The list comes from Moonraker's gcodes folder. Each file shows the toolhead from its START_JOB line, so you can see at a glance what needs to be mounted.
    </EmptyState>

    <RsPanel v-else :title="`${files.length} files`">
      <template #actions>
        <RsButton variant="quiet" :disabled="loading" @click="load">Refresh</RsButton>
      </template>

      <p v-if="error" class="error">Couldn't list files: {{ error }}</p>
      <p v-else-if="!loading && !files.length" class="muted">No G-code files in the gcodes folder yet.</p>

      <ul v-else class="list">
        <li v-for="r in rows" :key="r.f.path" class="file">
          <span class="tool">
            <ToolheadBadge v-if="r.look" :look="r.look" size="sm" />
            <span v-else class="muted small">{{ r.pending ? (jobRunning ? 'After the job' : 'Reading…') : r.unreadable ? "Couldn't read" : 'Not declared' }}</span>
          </span>
          <span class="name">{{ r.f.path }}</span>
          <span class="meta">{{ fmtDate(r.f.modified) }} · {{ fmtSize(r.f.size) }}</span>
          <span class="fit">
            <span v-if="r.needsSwap" class="tag swap">Needs {{ r.tool }}</span>
            <span v-else-if="r.matches" class="tag ok">Fits mounted tool</span>
          </span>
        </li>
      </ul>
      <p v-if="files.length > 40" class="muted small note">Toolheads are read for the newest 40 files, to keep the load on the Pi light.</p>
    </RsPanel>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.file {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--rs-space-4);
  padding: var(--rs-space-3) 0;
  border-top: 1px solid var(--rs-line);
}
.file:first-child { border-top: 0; }
.name { overflow-wrap: anywhere; color: var(--rs-text-strong); }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.fit { min-width: 130px; display: flex; justify-content: flex-end; }
.tag { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 3px 10px; border-radius: var(--rs-radius-pill); white-space: nowrap; }
.tag.swap { background: var(--rs-paper); color: var(--rs-paper-ink); }
.tag.ok { border: 1.5px solid var(--rs-line-strong); }
.small { font-size: var(--rs-text-sm); }
.note { margin-top: var(--rs-space-3); }
.error { color: var(--rs-danger); }
@media (max-width: 820px) {
  .file { grid-template-columns: 1fr auto; }
  .name { grid-column: 1 / -1; order: -1; }
  .fit { min-width: 0; }
}
</style>
