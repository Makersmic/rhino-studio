<script setup lang="ts">
/**
 * G-code files on the Pi, with the toolhead each one asks for and how its
 * last job ended (Moonraker's job history). Upload files (drop area or
 * button), and start a job once Studio has checked the file's toolhead
 * against the mounted one (see src/control/jobs.ts). Nothing is deleted here.
 * A file whose toolhead is the mounted one gets a pastel green pill behind
 * the tool, instead of a separate "fits" column.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
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
import { lastRuns, type LastRun } from '@/files/lastRun'

const machine = useMachineStore()
const care = useMaintenanceStore()
const control = useControlStore()
const route = useRoute()
/** Prepare links here with ?file=<name> after sending: that row is marked and scrolled to */
const highlight = computed(() => (typeof route.query.file === 'string' ? route.query.file : null))
const files = ref<FileEntry[]>([])
const runs = ref<Map<string, LastRun>>(new Map())
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
    const [list, history] = await Promise.all([machine.listFiles(), machine.listHistory(500)])
    runs.value = lastRuns(history)
    files.value = list.filter((f) => /\.(gcode|gco|g|nc|ngc)$/i.test(f.path)).sort((a, b) => b.modified - a.modified)
    void readHeaders()
    if (highlight.value) void nextTick(() => document.querySelector('.file.highlight')?.scrollIntoView({ block: 'center' }))
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
watch(jobRunning, (running, was) => {
  if (running) abort?.abort()
  else if (was) void load() // a job just ended: refresh its result
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
      run: runs.value.get(f.path) ?? null,
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
  const picked = [...(list ?? [])]
  if (!picked.length) return
  const bad = picked.filter((f) => !ALLOWED.test(f.name))
  const good = picked.filter((f) => ALLOWED.test(f.name))
  const done: string[] = []
  for (const file of good) {
    const path = await uploadOne(file)
    if (path === false) break // an upload failed: its message is shown
    if (path) done.push(path)
  }
  if (picker.value) picker.value.value = ''
  const skipped = bad.length ? ` Skipped ${bad.map((f) => f.name).join(', ')}: not G-code (.gcode, .nc, .ngc, .gco, .g).` : ''
  if (done.length) {
    uploadMsg.value = `Uploaded ${done.length === 1 ? done[0] : `${done.length} files`}. Nothing is started; press Start when you're ready.${skipped}`
    await load()
  } else if (bad.length && !uploadMsg.value) uploadMsg.value = skipped.trim()
}

/** null = skipped (kept the old one), false = failed */
async function uploadOne(file: File): Promise<string | null | false> {
  if (files.value.some((f) => f.path === file.name)) {
    const ok = await control.confirm({
      title: `Replace ${file.name}?`,
      body: 'A file with this name is already on the Pi. Uploading replaces it.',
      confirmLabel: 'Replace',
      tone: 'normal',
    })
    if (!ok) return null
  }
  uploading.value = { name: file.name, progress: 0 }
  uploadMsg.value = null
  try {
    return await machine.uploadFile(file, (p) => uploading.value && (uploading.value.progress = p))
  } catch (e) {
    uploadMsg.value = `${file.name}: ${(e as Error).message}`
    return false
  } finally {
    uploading.value = null
  }
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void upload(e.dataTransfer?.files ?? null)
}

const fmtWhen = (s: number) => new Date(s * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric' })
const fmtDate = (s: number) => new Date(s * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Files</h1>
      <p>G-code on the Pi, the toolhead each job asks for (green when it is the mounted one) and how its last run ended. Start checks the file against the mounted toolhead; laser, spindle and knife jobs start through their Rhino setup wizard.</p>
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
        <input ref="picker" type="file" multiple accept=".gcode,.gco,.g,.nc,.ngc" class="visually-hidden" @change="upload(($event.target as HTMLInputElement).files)" />
        <RsButton :disabled="!!uploading" @click="picker?.click()">Upload</RsButton>
        <RsButton variant="quiet" :disabled="loading" @click="load">Refresh</RsButton>
      </template>

      <button type="button" class="dropzone" :class="{ dragging }" :disabled="!!uploading" @click="picker?.click()">
        <template v-if="uploading">
          <span class="big">Uploading {{ uploading.name }}… {{ Math.round(uploading.progress * 100) }}%</span>
          <span class="bar"><span :style="{ width: `${uploading.progress * 100}%` }" /></span>
        </template>
        <template v-else>
          <Icon nav="files" :size="28" />
          <span class="big">Drop G-code files here, or click to choose</span>
          <span class="small">.gcode, .nc, .ngc, .gco, .g · Uploading never starts a job</span>
        </template>
      </button>
      <p v-if="uploadMsg && !uploading" class="upl" role="status">{{ uploadMsg }}</p>
      <p v-if="control.jobActive" class="busy" role="status">
        Start is off while <strong>{{ machine.job.filename }}</strong> {{ machine.job.state === 'paused' ? 'is paused' : 'runs' }}.
        <template v-if="jobRunning">Files not read yet are checked once it finishes, to keep the Pi free for the job.</template>
      </p>

      <p v-if="error" class="error">Couldn't list files: {{ error }}</p>
      <p v-else-if="!loading && !files.length" class="muted">No G-code files in the gcodes folder yet.</p>

      <ul v-else class="list">
        <li class="file head" aria-hidden="true">
          <span>Toolhead</span><span>File</span><span>Modified</span><span>Last run</span><span />
        </li>
        <li v-for="r in rows" :key="r.f.path" class="file" :class="{ highlight: r.f.path === highlight }">
          <span class="tool">
            <span
              v-if="r.look"
              class="pill"
              :class="{ fits: r.matches }"
              :title="r.matches ? 'Uses the mounted toolhead' : r.needsSwap ? `Needs ${r.tool}; ${machine.mountedName} is mounted` : undefined"
            >
              <ToolheadBadge :look="r.look" size="sm" />
            </span>
            <span v-else class="muted small">{{ r.pending ? (jobRunning ? 'Not read yet' : 'Reading…') : r.unreadable ? "Couldn't read" : 'Not declared' }}</span>
          </span>
          <span class="name">
            {{ r.f.path }}
            <RouterLink
              v-if="r.care && (r.care.overdue || r.care.dueSoon)"
              to="/care"
              class="tag care"
              :title="r.care.next?.title"
            >{{ r.care.overdue ? 'Care overdue' : 'Care due' }}</RouterLink>
          </span>
          <span class="meta">{{ fmtDate(r.f.modified) }} · {{ fmtSize(r.f.size) }}</span>
          <span class="run" :class="r.run?.kind ?? 'never'" :title="r.run ? `${r.run.detail}, ${fmtDate(r.run.at)}` : 'No job from this file in the history'">
            <template v-if="r.run">
              <span class="mark" aria-hidden="true">{{ r.run.kind === 'completed' ? '✓' : r.run.kind === 'failed' ? '✕' : r.run.kind === 'running' ? '•' : '–' }}</span>
              {{ r.run.label }}
              <span class="when">{{ fmtWhen(r.run.at) }}</span>
            </template>
            <template v-else>Not run yet</template>
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
  grid-template-columns: 200px minmax(0, 1fr) auto 150px 150px;
  align-items: center;
  gap: var(--rs-space-4);
  padding: var(--rs-space-3) 0;
  border-top: 1px solid var(--rs-line);
}
.file:first-child { border-top: 0; }
.name { overflow-wrap: anywhere; color: var(--rs-text-strong); }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.file.head { padding: 0 0 var(--rs-space-2); font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); border-top: 0; }
.file.head + .file { border-top: 0; }
/* One pill behind icon and name, pastel green when the file uses the mounted tool */
.pill { display: inline-flex; align-items: center; max-width: 100%; padding: 3px 14px 3px 3px; border-radius: var(--rs-radius-pill); }
.pill.fits { background: var(--rs-fit-fill); }
.pill.fits :deep(.name) { color: var(--rs-on-fit); }
.pill.fits :deep(.disc) { border-radius: 999px; }
.name .tag { margin-left: 8px; vertical-align: 1px; }
.run { font-size: var(--rs-text-sm); color: var(--rs-text-strong); white-space: nowrap; }
.run .mark { display: inline-block; width: 1em; font-weight: var(--rs-weight-medium); }
.run .when { margin-left: 4px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.run.never, .run.cancelled { color: var(--rs-text-muted); }
.run.failed { color: var(--rs-danger); }
.dropzone { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 120px; margin-bottom: var(--rs-space-3); padding: var(--rs-space-4); border: 1.5px dashed var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text-muted); font: inherit; cursor: pointer; text-align: center; }
.dropzone:hover:not(:disabled), .dragging .dropzone { border-color: var(--rs-ink); color: var(--rs-text-strong); background: var(--rs-surface-2); }
.dropzone .big { font-size: var(--rs-text-md, 1rem); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.dropzone .bar { width: min(320px, 80%); height: 6px; border-radius: var(--rs-radius-pill); background: var(--rs-surface-2); overflow: hidden; }
.dropzone .bar span { display: block; height: 100%; background: var(--rs-ink); }
.tag { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 3px 10px; border-radius: var(--rs-radius-pill); white-space: nowrap; }
.tag.care { background: var(--rs-warn-fill); color: var(--rs-on-ink); text-decoration: none; }
.small { font-size: var(--rs-text-sm); }
.go { display: flex; justify-content: flex-end; }
.upl { margin-bottom: var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.note { margin-top: var(--rs-space-3); }
.error { color: var(--rs-danger); }
@media (max-width: 820px) {
  .file { grid-template-columns: 1fr auto; }
  .file.head { display: none; }
  .name { grid-column: 1 / -1; order: -1; }
  .go { justify-content: flex-end; }
}
.file.highlight { outline: 2px solid var(--rs-ink); outline-offset: -2px; border-radius: var(--rs-radius-md); }
</style>
