<script setup lang="ts">
/**
 * G-code files on the Pi, with the toolhead each one asks for.
 * Upload files, and start a job once Studio has checked the file's toolhead
 * against the mounted one (see src/control/jobs.ts). Nothing is deleted here.
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
import { useMaintenanceStore } from '@/stores/maintenance'
import { useControlStore } from '@/stores/control'
import { careText } from '@/maintenance/summary'

const machine = useMachineStore()
const care = useMaintenanceStore()
const control = useControlStore()
const files = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
/**
 * path@modified -> toolhead name, null = not declared, 'error' = couldn't read.
 * Kept in this browser too, so the toolhead column is filled in even when the
 * page opens during a job (when Studio doesn't read files, to spare the Pi).
 */
const CACHE_KEY = 'rs.fileHeads'
function loadHeads(): Record<string, string | null> {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
const heads = ref<Record<string, string | null>>(loadHeads())
watch(heads, (h) => {
  try {
    // keep the newest 300 entries, and never cache read errors
    const entries = Object.entries(h).filter(([, v]) => v !== 'error').slice(-300)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* storage blocked */
  }
})
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
      care: tool ? care.forTool(tool) : null,
      start: control.startCheck(f.path, h === 'error' ? null : h),
    }
  }),
)

// ---- start --------------------------------------------------------------
const starting = ref<string | null>(null)
async function start(f: FileEntry) {
  starting.value = f.path
  try {
    // Files past the newest 40 haven't been read yet: read this one now
    let h = heads.value[key(f)]
    if (h === undefined) {
      const url = machine.fileUrl(f.path)
      h = url ? await fetchFileToolhead(url).catch(() => null) : null
      heads.value = { ...heads.value, [key(f)]: h }
    }
    const tool = h && h !== 'error' ? h : machine.mountedName
    const c = tool ? care.forTool(tool) : null
    const careNote = c && (c.overdue || c.dueSoon) && c.next ? `Care for ${tool}: ${careText(c)} (${c.next.title}). Nothing is blocked; it's your call.` : null
    const ok = await control.startJob(f.path, h === 'error' ? null : h, careNote)
    if (ok) setTimeout(load, 1500)
  } finally {
    starting.value = null
  }
}

// ---- upload -------------------------------------------------------------
const uploading = ref<{ name: string; progress: number } | null>(null)
const uploadMsg = ref<string | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const ALLOWED = /\.(gcode|gco|g|nc|ngc)$/i

async function upload(list: FileList | null) {
  const file = list?.[0]
  if (!file) return
  if (!ALLOWED.test(file.name)) {
    uploadMsg.value = `${file.name} isn't a G-code file (.gcode, .nc, .ngc, .gco, .g)`
    return
  }
  if (files.value.some((f) => f.path === file.name)) {
    const ok = await control.confirm({
      title: `Replace ${file.name}?`,
      body: 'A file with this name is already on the Pi. Uploading replaces it.',
      confirmLabel: 'Replace',
      tone: 'normal',
    })
    if (!ok) return
  }
  uploading.value = { name: file.name, progress: 0 }
  uploadMsg.value = null
  try {
    const path = await machine.uploadFile(file, (p) => uploading.value && (uploading.value.progress = p))
    uploadMsg.value = `Uploaded ${path}. It isn't started; press Start when you're ready.`
    await load()
  } catch (e) {
    uploadMsg.value = (e as Error).message
  } finally {
    uploading.value = null
    if (picker.value) picker.value.value = ''
  }
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void upload(e.dataTransfer?.files ?? null)
}

const fmtDate = (s: number) => new Date(s * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Files</h1>
      <p>G-code on the Pi, with the toolhead each job asks for. Start checks the file against the mounted toolhead; laser, spindle and knife jobs start through their Rhino setup wizard.</p>
    </div>

    <EmptyState v-if="!machine.online" title="Connect to see files on the Pi">
      <template #art><Icon nav="files" :size="64" /></template>
      The list comes from Moonraker's gcodes folder. Each file shows the toolhead from its START_JOB line, so you can see at a glance what needs to be mounted.
    </EmptyState>

    <RsPanel
      v-else
      panel-id="files.list"
      :title="`${files.length} files`"
      class="drop"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <template #actions>
        <input ref="picker" type="file" accept=".gcode,.gco,.g,.nc,.ngc" class="visually-hidden" @change="upload(($event.target as HTMLInputElement).files)" />
        <RsButton :disabled="!!uploading" @click="picker?.click()">Upload</RsButton>
        <RsButton variant="quiet" :disabled="loading" @click="load">Refresh</RsButton>
      </template>

      <p v-if="uploading" class="upl" role="status">
        Uploading {{ uploading.name }}… {{ Math.round(uploading.progress * 100) }}%
        <span class="bar"><span :style="{ width: `${uploading.progress * 100}%` }" /></span>
      </p>
      <p v-else-if="uploadMsg" class="upl" role="status">{{ uploadMsg }}</p>
      <p v-else class="muted small hint">Drop a G-code file here to upload it. Uploading never starts it.</p>
      <p v-if="control.jobActive" class="busy" role="status">
        Start is off while <strong>{{ machine.job.filename }}</strong> {{ machine.job.state === 'paused' ? 'is paused' : 'runs' }}.
        <template v-if="jobRunning">Files not read yet are checked once it finishes, to keep the Pi free for the job.</template>
      </p>

      <p v-if="error" class="error">Couldn't list files: {{ error }}</p>
      <p v-else-if="!loading && !files.length" class="muted">No G-code files in the gcodes folder yet.</p>

      <ul v-else class="list">
        <li v-for="r in rows" :key="r.f.path" class="file">
          <span class="tool">
            <ToolheadBadge v-if="r.look" :look="r.look" size="sm" />
            <span v-else class="muted small">{{ r.pending ? (jobRunning ? 'Not read yet' : 'Reading…') : r.unreadable ? "Couldn't read" : 'Not declared' }}</span>
          </span>
          <span class="name">{{ r.f.path }}</span>
          <span class="meta">{{ fmtDate(r.f.modified) }} · {{ fmtSize(r.f.size) }}</span>
          <span class="fit">
            <RouterLink
              v-if="r.care && (r.care.overdue || r.care.dueSoon)"
              to="/care"
              class="tag care"
              :title="r.care.next?.title"
            >{{ r.care.overdue ? 'Care overdue' : 'Care due' }}</RouterLink>
            <span v-if="r.needsSwap" class="tag swap">Needs {{ r.tool }}</span>
            <span v-else-if="r.matches" class="tag ok">Fits mounted tool</span>
          </span>
          <span class="go">
            <RsButton
              v-if="r.start.swapTo != null && r.tool"
              variant="quiet"
              :disabled="control.jobActive || !machine.klippyReady"
              @click="control.swapTo(r.start.swapTo, r.tool)"
            >Swap to {{ r.tool }}</RsButton>
            <RsButton
              v-else
              :disabled="starting === r.f.path || (!r.start.ok && r.start.block !== 'Still reading the file')"
              :title="r.start.block ?? 'Check and start this job'"
              @click="start(r.f)"
            >Start</RsButton>
          </span>
        </li>
      </ul>
      <p v-if="files.length > 40" class="muted small note">Toolheads are read for the newest 40 files, to keep the load on the Pi light.</p>
    </RsPanel>
  </div>
</template>

<style scoped>
.busy { margin: 0 0 var(--rs-space-3); padding: 8px 12px; font-size: var(--rs-text-sm); color: var(--rs-text); border-left: 3px solid var(--rs-ink); background: var(--rs-dither-faint); }
.busy strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.list { list-style: none; margin: 0; padding: 0; }
.file {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) auto auto 150px;
  align-items: center;
  gap: var(--rs-space-4);
  padding: var(--rs-space-3) 0;
  border-top: 1px solid var(--rs-line);
}
.file:first-child { border-top: 0; }
.name { overflow-wrap: anywhere; color: var(--rs-text-strong); }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.fit { min-width: 130px; display: flex; justify-content: flex-end; gap: 6px; }
.tag { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 3px 10px; border-radius: var(--rs-radius-pill); white-space: nowrap; }
.tag.swap { background: var(--rs-paper); color: var(--rs-paper-ink); }
.tag.ok { border: 1.5px solid var(--rs-line-strong); }
.tag.care { background: var(--rs-warn-fill); color: var(--th-ink); text-decoration: none; }
.small { font-size: var(--rs-text-sm); }
.go { display: flex; justify-content: flex-end; }
.hint, .upl { margin-bottom: var(--rs-space-3); }
.upl { font-size: var(--rs-text-sm); color: var(--rs-text-strong); display: flex; flex-direction: column; gap: 6px; }
.upl .bar { height: 6px; border-radius: var(--rs-radius-pill); background: var(--rs-surface-2); overflow: hidden; }
.upl .bar span { display: block; height: 100%; background: var(--rs-active); }
.drop.dragging { outline: 2px dashed var(--rs-text-strong); outline-offset: -8px; }
.note { margin-top: var(--rs-space-3); }
.error { color: var(--rs-danger); }
@media (max-width: 820px) {
  .file { grid-template-columns: 1fr auto; }
  .name { grid-column: 1 / -1; order: -1; }
  .fit { min-width: 0; }
  .go { grid-column: 1 / -1; justify-content: flex-start; }
}
</style>
