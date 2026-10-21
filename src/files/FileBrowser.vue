<script setup lang="ts">
/**
 * One Moonraker root as a folder browser: Gcode files, Config, or Logs.
 *
 * - Folders with a breadcrumb; sort by name, date or size (folders first).
 * - Upload by button or drag-and-drop (several files, with progress), also
 *   straight onto a folder row. Rows dragged onto a folder move there.
 * - Row menu (right-click, long-press on a phone, or ⋯): Edit/View, Download,
 *   Rename, Duplicate, Move to folder, Delete. New file / New folder buttons.
 * - Gcode files also show the toolhead each job asks for, how its last run
 *   ended, a hollow ring when it has never run, and Start.
 *
 * Safety: Moonraker roots only (the client refuses anything else). The file a
 * job is using, and its folders, can't be edited, renamed, moved or deleted.
 * A config file is copied to studio_backups before it's saved over, and saving
 * never restarts anything: "Restart Klipper to apply" confirms first and is
 * refused during a job. A name that's already taken asks Replace or keep both.
 * Logs are read-only.
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import Icon from '@/icons/Icon.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { lookFor } from '@/toolheads/registry'
import { fetchFileToolhead } from '@/moonraker/gcodeHeader'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useControlStore } from '@/stores/control'
import { careText } from '@/maintenance/summary'
import { lastRuns, type LastRun } from '@/files/lastRun'
import { POWER_ACTIONS } from '@/system/power'
import FileMenu, { type MenuItem } from './FileMenu.vue'
import FileAsk from './FileAsk.vue'
import {
  BACKUP_DIR,
  backupPath,
  backupsToPrune,
  baseName,
  isGcode,
  join,
  keepBothName,
  lockReason,
  openMode,
  parentOf,
  restartFor,
  ROOTS,
  sortEntries,
  uploadProblem,
  type Root,
  type SortBy,
} from './fileOps'

const FileEditor = defineAsyncComponent(() => import('./FileEditor.vue'))

const props = defineProps<{ root: Root }>()
const machine = useMachineStore()
const care = useMaintenanceStore()
const control = useControlStore()
const route = useRoute()
const router = useRouter()
const ask = ref<InstanceType<typeof FileAsk> | null>(null)

const writable = computed(() => ROOTS[props.root].writable)
const gcode = computed(() => props.root === 'gcodes')

// ---- the folder ---------------------------------------------------------
/** Folder inside the root ('' = the root). Kept in the address (?dir=) so Back works. */
const folder = computed(() => (typeof route.query.dir === 'string' ? route.query.dir : ''))
function go(dir: string) {
  void router.push({ query: { ...route.query, dir: dir || undefined, file: undefined } })
}
interface Row {
  name: string
  dir: boolean
  modified: number
  size: number
  /** Moonraker path with the root, e.g. "gcodes/parts/a.gcode" */
  rp: string
  /** Path inside the root, e.g. "parts/a.gcode" */
  rel: string
}
const entries = ref<Row[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const msg = ref<string | null>(null)
const sortBy = ref<SortBy>(gcode.value ? 'date' : 'name')
const desc = ref(gcode.value)
function setSort(by: SortBy) {
  if (sortBy.value === by) desc.value = !desc.value
  else {
    sortBy.value = by
    desc.value = by !== 'name' // newest / biggest first
  }
}
const sorted = computed(() => sortEntries(entries.value, sortBy.value, desc.value))
const takenHere = computed(() => new Set(entries.value.map((e) => e.name)))

async function load() {
  if (!machine.online) return
  loading.value = true
  error.value = null
  try {
    const want = folder.value
    const l = await machine.getDirectory(join(props.root, want))
    if (want !== folder.value) return // moved on meanwhile
    const rows: Row[] = [
      ...l.dirs.filter((d) => !d.dirname.startsWith('.')).map((d) => ({ name: d.dirname, dir: true, modified: d.modified, size: 0 })),
      ...l.files.filter((f) => !f.filename.startsWith('.')).map((f) => ({ name: f.filename, dir: false, modified: f.modified, size: f.size })),
    ].map((r) => ({ ...r, rel: join(want, r.name), rp: join(props.root, want, r.name) }))
    entries.value = rows
    if (gcode.value) {
      runs.value = lastRuns(await machine.listHistory(500))
      void readHeaders()
    }
    const hl = highlight.value
    if (hl) void nextTick(() => document.querySelector('.row.highlight')?.scrollIntoView({ block: 'center' }))
  } catch (e) {
    error.value = (e as Error).message
    entries.value = []
  } finally {
    loading.value = false
  }
}
watch([() => machine.online, folder], ([on]) => (on ? load() : (entries.value = [])), { immediate: true })

const crumbs = computed(() => (folder.value ? folder.value.split('/') : []))

// ---- the running job ----------------------------------------------------
const jobFile = computed(() => (machine.job.state === 'printing' || machine.job.state === 'paused' ? machine.job.filename || null : null))
const lockOf = (r: Row) => lockReason(r.rp, jobFile.value)
const jobRunning = computed(() => machine.job.state === 'printing')

// ---- G-code: toolhead in each file's header, last run -------------------
const runs = ref<Map<string, LastRun>>(new Map())
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
    const entries = Object.entries(h).filter(([, v]) => v !== 'error').slice(-300)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* storage blocked */
  }
})
const hkey = (r: Row) => `${r.rel}@${r.modified}`
const HEADER_LIMIT = 40
let abort: AbortController | null = null
watch(jobRunning, (running, was) => {
  if (running) abort?.abort()
  else if (was) void load()
})
async function readHeaders() {
  if (jobRunning.value || !gcode.value) return
  abort?.abort()
  abort = new AbortController()
  const signal = abort.signal
  const queue = sortEntries(entries.value.filter((r) => !r.dir && isGcode(r.name)), 'date', true)
    .slice(0, HEADER_LIMIT)
    .filter((r) => !(hkey(r) in heads.value))
  const worker = async () => {
    for (let r = queue.shift(); r && !signal.aborted; r = queue.shift()) {
      const url = machine.rootUrl('gcodes', r.rel)
      if (!url) return
      try {
        const found = await fetchFileToolhead(url, signal)
        heads.value = { ...heads.value, [hkey(r)]: found }
      } catch {
        if (!signal.aborted) heads.value = { ...heads.value, [hkey(r)]: 'error' }
      }
    }
  }
  await Promise.all([worker(), worker()])
}
onBeforeUnmount(() => abort?.abort())

function jobInfo(r: Row) {
  const h = heads.value[hkey(r)]
  const tool = h && h !== 'error' ? h : null
  return {
    pending: h === undefined,
    unreadable: h === 'error',
    tool,
    look: tool ? lookFor(tool, machine.knownTools.find((t) => t.name === tool)?.type ?? undefined) : null,
    needsSwap: !!tool && machine.mountedVerified && tool !== machine.mountedName,
    matches: !!tool && machine.mountedVerified && tool === machine.mountedName,
    care: tool ? care.forTool(tool) : null,
    start: control.startCheck(r.rel, h === 'error' ? null : (h ?? null)),
    run: runs.value.get(r.rel) ?? null,
  }
}

const starting = ref<string | null>(null)
async function start(r: Row) {
  starting.value = r.rel
  try {
    let h = heads.value[hkey(r)]
    if (h === undefined) {
      const url = machine.rootUrl('gcodes', r.rel)
      h = url ? await fetchFileToolhead(url).catch(() => null) : null
      heads.value = { ...heads.value, [hkey(r)]: h }
    }
    const tool = h && h !== 'error' ? h : machine.mountedName
    const c = tool ? care.forTool(tool) : null
    const careNote = c && (c.overdue || c.dueSoon) && c.next ? `Care for ${tool}: ${careText(c)} (${c.next.title}). Nothing is blocked; it's your call.` : null
    const ok = await control.startJob(r.rel, h === 'error' ? null : h, careNote)
    if (ok) setTimeout(load, 1500)
  } finally {
    starting.value = null
  }
}

/** Prepare links here with ?file=<path in gcodes> after sending: that row is marked */
const highlight = computed(() => (typeof route.query.file === 'string' && gcode.value ? route.query.file : null))
watch(
  highlight,
  (f) => {
    if (f && parentOf(f) !== folder.value) void router.replace({ query: { ...route.query, dir: parentOf(f) || undefined } })
  },
  { immediate: true },
)

// ---- upload ---------------------------------------------------------------
const picker = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const dropOn = ref<string | null>(null)
const uploading = ref<{ name: string; progress: number; n: number; of: number } | null>(null)
const accept = computed(() => (gcode.value ? '.gcode,.gco,.g,.nc,.ngc' : '.cfg,.conf,.txt,.json,.md,.sh,.py,.yaml,.yml,.ini,.csv'))

/** Names in a folder (the current one is known; another is asked for). */
async function namesIn(dir: string): Promise<Set<string>> {
  if (dir === folder.value) return takenHere.value
  const l = await machine.getDirectory(join(props.root, dir))
  return new Set([...l.dirs.map((d) => d.dirname), ...l.files.map((f) => f.filename)])
}

async function upload(list: FileList | File[] | null, into = folder.value) {
  const picked = [...(list ?? [])]
  if (!picked.length || !writable.value) return
  if (!(await okDuringJob(`Upload ${picked.length === 1 ? picked[0]!.name : `${picked.length} files`} now?`))) return
  msg.value = null
  const skipped = picked.filter((f) => uploadProblem(props.root, f.name)).map((f) => `${f.name} (${uploadProblem(props.root, f.name)})`)
  const good = picked.filter((f) => !uploadProblem(props.root, f.name))
  const done: string[] = []
  let taken: Set<string>
  try {
    taken = new Set(await namesIn(into))
  } catch (e) {
    msg.value = `Couldn't open ${into}: ${(e as Error).message}`
    return
  }
  for (const [i, file] of good.entries()) {
    let name = file.name
    if (taken.has(name)) {
      const target = join(props.root, into, name)
      const lock = lockReason(target, jobFile.value)
      if (lock) {
        skipped.push(`${name} (${lock.toLowerCase()})`)
        continue
      }
      const a = await ask.value?.open({ kind: 'replace', name, folder: into })
      if (!a) continue
      if ('choice' in a && a.choice === 'keep') name = keepBothName(name, taken)
    }
    uploading.value = { name, progress: 0, n: i + 1, of: good.length }
    try {
      await machine.uploadTo(props.root, into, file, name, (p) => uploading.value && (uploading.value.progress = p))
      taken.add(name)
      done.push(name)
    } catch (e) {
      msg.value = `${name}: ${(e as Error).message}`
      break
    } finally {
      uploading.value = null
    }
  }
  if (picker.value) picker.value.value = ''
  const where = into ? ` to ${into}` : ''
  const parts: string[] = []
  if (done.length) parts.push(`Uploaded ${done.length === 1 ? done[0] : `${done.length} files`}${where}.${gcode.value ? ' Nothing is started; press Start when you’re ready.' : ''}`)
  if (skipped.length) parts.push(`Skipped ${skipped.join(', ')}.`)
  if (parts.length) msg.value = [msg.value, ...parts].filter(Boolean).join(' ')
  if (done.length) await load()
}

// drag-and-drop: files from the computer upload; a row dragged onto a folder moves there
const ROW_TYPE = 'application/x-rhino-file'
function onDragOver(e: DragEvent) {
  if (!writable.value) return
  e.preventDefault()
  dragging.value = true
}
function onDrop(e: DragEvent) {
  dragging.value = false
  if (!writable.value || e.dataTransfer?.types.includes(ROW_TYPE)) return
  void upload(e.dataTransfer?.files ?? null)
}
function rowDragStart(e: DragEvent, r: Row) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(ROW_TYPE, r.rel)
  e.dataTransfer.effectAllowed = 'copyMove'
  // dragging a file out of the browser (Chrome, Edge) downloads it
  const url = !r.dir ? machine.rootUrl(props.root, r.rel) : null
  if (url) e.dataTransfer.setData('DownloadURL', `application/octet-stream:${r.name}:${new URL(url, window.location.href).href}`)
}
function folderDragOver(e: DragEvent, r: Row) {
  if (!writable.value || !r.dir) return
  e.preventDefault()
  e.stopPropagation()
  dropOn.value = r.rel
}
function folderDrop(e: DragEvent, r: Row) {
  dropOn.value = null
  dragging.value = false
  if (!writable.value || !r.dir) return
  e.preventDefault()
  e.stopPropagation()
  const moving = e.dataTransfer?.getData(ROW_TYPE)
  if (moving) {
    const src = entries.value.find((x) => x.rel === moving)
    if (src && src.rel !== r.rel) void moveTo(src, r.rel)
  } else void upload(e.dataTransfer?.files ?? null, r.rel)
}

// ---- open, download --------------------------------------------------------
const editing = ref<{ rp: string; rel: string; text: string; readOnly: boolean; why: string | null } | null>(null)
const saving = ref(false)
const savedNote = ref<string | null>(null)
const editorDirty = ref(false)

function download(r: Row) {
  const url = machine.rootUrl(props.root, r.rel)
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = r.name
  document.body.appendChild(a)
  a.click()
  a.remove()
}
async function open(r: Row) {
  if (r.dir) return go(r.rel)
  const m = openMode(props.root, r.name, r.size)
  if (m.mode === 'download') {
    msg.value = `${r.name}: ${m.why}`
    return download(r)
  }
  const url = machine.rootUrl(props.root, r.rel)
  if (!url) return
  if (r.size > BIG_DURING_JOB && !(await okDuringJob(`Open ${r.name} (${fmtSize(r.size)}) now?`))) return
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const lock = lockOf(r)
    savedNote.value = null
    editing.value = { rp: r.rp, rel: r.rel, text, readOnly: m.mode === 'view' || !!lock, why: lock ?? m.why }
  } catch (e) {
    msg.value = `Couldn't open ${r.name}: ${(e as Error).message}`
  }
}

/**
 * While a job prints, the host's storage is feeding Klipper: on a small host (a Pi 3B's SD card) a big
 * read or an upload can stall it ("Timer too close"). So those ask first. Small files just open.
 */
const BIG_DURING_JOB = 1024 * 1024
async function okDuringJob(title: string): Promise<boolean> {
  if (machine.job.state !== 'printing') return true
  return control.confirm({
    title,
    body: `${machine.job.filename || 'A job'} is printing. Reading or writing big files makes the host's storage busy, which can make a small host like a Pi 3B stutter. You can also wait until the job ends.`,
    confirmLabel: 'Go ahead',
    tone: 'normal',
  })
}

/** Save the editor's text. Config files: a backup copy first, then the new text. Never restarts. */
async function save(text: string) {
  const ed = editing.value
  if (!ed || ed.readOnly) return
  const lock = lockReason(ed.rp, jobFile.value)
  if (lock) {
    msg.value = `${baseName(ed.rel)}: ${lock}.`
    return
  }
  saving.value = true
  try {
    let backup: string | null = null
    if (props.root === 'config') {
      backup = await backupConfig(ed.rp)
    }
    await machine.uploadTo(props.root, parentOf(ed.rel), new Blob([text], { type: 'text/plain' }), baseName(ed.rel))
    savedNote.value = backup ? `Saved. The file as it was is in ${backup.replace(/^config\//, '')}.` : 'Saved.'
    void load()
  } catch (e) {
    savedNote.value = null
    msg.value = `Not saved: ${(e as Error).message}`
    alertEditor(`Not saved: ${(e as Error).message}`)
  } finally {
    saving.value = false
  }
}
function alertEditor(text: string) {
  // the editor covers the page: say it there too
  window.setTimeout(() => window.alert(text), 0)
}
/** Copy a config file into studio_backups (made if missing), keep the newest ten copies. */
async function backupConfig(rp: string): Promise<string | null> {
  const dirs = await machine.getDirectory('config')
  if (!dirs.dirs.some((d) => d.dirname === 'studio_backups')) await machine.fileChange('server.files.post_directory', { path: BACKUP_DIR })
  const dest = backupPath(rp, new Date())
  try {
    await machine.fileChange('server.files.copy', { source: rp, dest })
  } catch (e) {
    // a brand-new file has nothing to back up yet
    if (/not exist|not found|404/i.test((e as Error).message)) return null
    throw e
  }
  try {
    const l = await machine.getDirectory(BACKUP_DIR)
    for (const n of backupsToPrune(l.files.map((f) => f.filename), rp)) await machine.fileChange('server.files.delete_file', { path: join(BACKUP_DIR, n) })
  } catch {
    /* pruning is tidy-up only */
  }
  return dest
}

const restart = computed(() => (editing.value ? restartFor(editing.value.rp) : null))
const restartBlock = computed(() => (control.jobActive ? 'A job is running: restart once it ends' : !machine.online ? 'Not connected' : null))
async function doRestart() {
  const r = restart.value
  if (!r || restartBlock.value) return
  const id = r.kind === 'firmware' ? 'firmware' : r.service === 'moonraker' ? 'svc-moonraker' : 'svc-crowsnest'
  const a = POWER_ACTIONS.find((p) => p.id === id)!
  const ok = await control.confirm({ title: a.confirmTitle, body: a.confirmBody, confirmLabel: a.confirmLabel, tone: 'normal' })
  if (!ok) return
  try {
    await machine.power(a.method, a.params)
    savedNote.value = `${savedNote.value ?? 'Saved.'} ${a.label} sent.`
  } catch (e) {
    msg.value = `${a.label}: ${(e as Error).message}`
  }
}
function closeEditor() {
  editing.value = null
  savedNote.value = null
  editorDirty.value = false
}

// ---- new file / folder, rename, duplicate, move, delete -----------------------
async function newFolder() {
  const a = await ask.value?.open({ kind: 'name', title: 'New folder', label: 'Folder name', value: 'new folder', ok: 'Create', taken: takenHere.value })
  if (!a || !('name' in a)) return
  await change(() => machine.fileChange('server.files.post_directory', { path: join(props.root, folder.value, a.name) }), `Folder ${a.name} made.`)
}
async function newFile() {
  const def = gcode.value ? 'new.gcode' : 'new.cfg'
  const a = await ask.value?.open({ kind: 'name', title: 'New file', label: 'File name', value: def, ok: 'Create and edit', taken: takenHere.value, hint: gcode.value ? 'G-code: .gcode, .nc, .ngc' : 'Klipper reads .cfg files only when an [include] names them.' })
  if (!a || !('name' in a)) return
  const bad = uploadProblem(props.root, a.name)
  if (bad) {
    msg.value = `${a.name}: ${bad}.`
    return
  }
  try {
    await machine.uploadTo(props.root, folder.value, new Blob([''], { type: 'text/plain' }), a.name)
    await load()
    const r = entries.value.find((x) => x.name === a.name && !x.dir)
    if (r) await open(r)
  } catch (e) {
    msg.value = `Couldn't make ${a.name}: ${(e as Error).message}`
  }
}
async function rename(r: Row) {
  const taken = new Set([...takenHere.value].filter((n) => n !== r.name))
  const a = await ask.value?.open({ kind: 'name', title: `Rename ${r.name}`, label: 'New name', value: r.name, ok: 'Rename', taken })
  if (!a || !('name' in a) || a.name === r.name) return
  if (!r.dir && props.root === 'gcodes' && !isGcode(a.name)) {
    msg.value = `${a.name}: G-code files keep a G-code ending (.gcode, .nc, .ngc, .gco, .g).`
    return
  }
  await change(() => machine.fileChange('server.files.move', { source: r.rp, dest: join(props.root, folder.value, a.name) }), `Renamed to ${a.name}.`)
}
async function duplicate(r: Row) {
  const name = keepBothName(r.name, takenHere.value)
  await change(() => machine.fileChange('server.files.copy', { source: r.rp, dest: join(props.root, folder.value, name) }), `Copied as ${name}.`)
}
async function moveAsk(r: Row) {
  const a = await ask.value?.open({ kind: 'move', title: `Move ${r.name} to…`, root: props.root, from: folder.value, forbid: r.dir ? r.rel : null })
  if (!a || !('folder' in a)) return
  await moveTo(r, a.folder)
}
async function moveTo(r: Row, dir: string) {
  const lock = lockOf(r)
  if (lock) {
    msg.value = `${r.name}: ${lock}.`
    return
  }
  if (r.dir && (dir === r.rel || dir.startsWith(`${r.rel}/`))) {
    msg.value = `${r.name} can't go inside itself.`
    return
  }
  let name = r.name
  let replace = false
  try {
    const there = await namesIn(dir)
    if (there.has(name)) {
      if (r.dir) {
        msg.value = `${dir || ROOTS[props.root].label} already has a folder called ${name}. Rename one of them first.`
        return
      }
      const destLock = lockReason(join(props.root, dir, name), jobFile.value)
      if (destLock) {
        msg.value = `${name}: ${destLock.toLowerCase()} in ${dir || 'that folder'}.`
        return
      }
      const a = await ask.value?.open({ kind: 'replace', name, folder: dir })
      if (!a || !('choice' in a)) return
      if (a.choice === 'keep') name = keepBothName(name, there)
      else replace = true
    }
  } catch (e) {
    msg.value = `Couldn't open ${dir}: ${(e as Error).message}`
    return
  }
  const dest = join(props.root, dir, name)
  await change(async () => {
    if (replace) await machine.fileChange('server.files.delete_file', { path: dest })
    await machine.fileChange('server.files.move', { source: r.rp, dest })
  }, `Moved ${r.name} to ${dir || ROOTS[props.root].label}${name !== r.name ? ` as ${name}` : ''}.`)
}
async function remove(r: Row) {
  const lock = lockOf(r)
  if (lock) {
    msg.value = `${r.name}: ${lock}.`
    return
  }
  const ok = await control.confirm({
    title: r.dir ? `Delete the folder ${r.name}?` : `Delete ${r.name}?`,
    body: r.dir
      ? `The folder and everything in it are deleted from the Rhino. This can't be undone.`
      : props.root === 'config'
        ? `The file is deleted from the Rhino. If an [include] names it, Klipper won't start until you put it back or remove that line. This can't be undone.`
        : `The file is deleted from the Rhino. This can't be undone.`,
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  await change(
    () => (r.dir ? machine.fileChange('server.files.delete_directory', { path: r.rp, force: true }) : machine.fileChange('server.files.delete_file', { path: r.rp })),
    `${r.name} deleted.`,
  )
}
async function change(run: () => Promise<unknown>, done: string) {
  msg.value = null
  try {
    await run()
    msg.value = done
  } catch (e) {
    msg.value = (e as Error).message
  }
  await load()
}

// ---- the row menu ------------------------------------------------------------
const menu = ref<{ x: number; y: number; row: Row } | null>(null)
function menuItems(r: Row): MenuItem[] {
  const lock = lockOf(r)
  const ro = !writable.value
  if (r.dir) {
    return [
      { label: 'Open', run: () => go(r.rel) },
      ...(ro
        ? []
        : [
            { label: 'Rename', run: () => void rename(r), block: lock },
            { label: 'Duplicate', run: () => void duplicate(r) },
            { label: 'Move to folder…', run: () => void moveAsk(r), block: lock },
            { label: 'Delete', run: () => void remove(r), danger: true, block: lock },
          ]),
    ]
  }
  const m = openMode(props.root, r.name, r.size)
  const items: MenuItem[] = []
  if (m.mode !== 'download') items.push({ label: m.mode === 'edit' && !lock ? 'Edit' : 'View', run: () => void open(r) })
  items.push({ label: 'Download', run: () => download(r) })
  if (!ro) {
    items.push(
      { label: 'Rename', run: () => void rename(r), block: lock },
      { label: 'Duplicate', run: () => void duplicate(r) },
      { label: 'Move to folder…', run: () => void moveAsk(r), block: lock },
      { label: 'Delete', run: () => void remove(r), danger: true, block: lock },
    )
  }
  return items
}
function openMenu(e: MouseEvent | PointerEvent, r: Row) {
  e.preventDefault()
  menu.value = { x: e.clientX, y: e.clientY, row: r }
}
function menuButton(e: MouseEvent, r: Row) {
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = { x: b.right - 200, y: b.bottom + 4, row: r }
}
// long-press on a phone opens the same menu
let press: { t: number; x: number; y: number } | null = null
function pdown(e: PointerEvent, r: Row) {
  if (e.pointerType !== 'touch') return
  const x = e.clientX, y = e.clientY
  press = { t: window.setTimeout(() => (menu.value = { x, y, row: r }), 550), x, y }
}
function pmove(e: PointerEvent) {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) pcancel()
}
function pcancel() {
  if (press) window.clearTimeout(press.t)
  press = null
}

// ---- formatting --------------------------------------------------------------
const fmtWhen = (s: number) => new Date(s * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric' })
const fmtDate = (s: number) => new Date(s * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const SORTS: [SortBy, string][] = [['name', 'Name'], ['date', 'Modified'], ['size', 'Size']]
defineExpose({ load })
</script>

<template>
  <div
    class="browser"
    :class="[root, { dragging }]"
    @dragover="onDragOver"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="top">
      <nav v-if="folder" class="crumbs" aria-label="Folder">
        <button type="button" :class="{ on: !folder }" @click="go('')">{{ ROOTS[root].label }}</button>
        <template v-for="(c, i) in crumbs" :key="i">
          <span class="sep" aria-hidden="true">›</span>
          <button type="button" :class="{ on: i === crumbs.length - 1 }" @click="go(crumbs.slice(0, i + 1).join('/'))">{{ c }}</button>
        </template>
      </nav>
      <span v-else class="count">{{ entries.filter((e) => !e.dir).length }} files{{ entries.some((e) => e.dir) ? ` · ${entries.filter((e) => e.dir).length} folders` : '' }}</span>
      <div class="tools">
        <template v-if="writable">
          <input ref="picker" type="file" multiple :accept="accept" class="visually-hidden" @change="upload(($event.target as HTMLInputElement).files)" />
          <RsButton :disabled="!!uploading" @click="picker?.click()">Upload</RsButton>
          <RsButton @click="newFile">New file</RsButton>
          <RsButton @click="newFolder">New folder</RsButton>
        </template>
        <RsButton variant="quiet" :disabled="loading" @click="load">Refresh</RsButton>
      </div>
    </div>

    <button v-if="writable" type="button" class="dropzone" :class="{ dragging }" :disabled="!!uploading" @click="picker?.click()">
      <template v-if="uploading">
        <span class="big">Uploading {{ uploading.name }}{{ uploading.of > 1 ? ` (${uploading.n} of ${uploading.of})` : '' }}… {{ Math.round(uploading.progress * 100) }}%</span>
        <span class="bar"><span :style="{ width: `${uploading.progress * 100}%` }" /></span>
      </template>
      <template v-else>
        <Icon nav="files" :size="24" />
        <span class="big">Drop {{ gcode ? 'G-code files' : 'config files' }} here, or click to choose</span>
        <span class="small">{{ gcode ? '.gcode, .nc, .ngc, .gco, .g · Uploading never starts a job' : 'Text files: .cfg, .conf, .txt, .json … · Klipper reads them after a restart' }}{{ folder ? ` · into ${folder}` : '' }}</span>
      </template>
    </button>

    <p v-if="msg" class="msg" role="status">{{ msg }}</p>
    <p v-if="jobFile && writable" class="busy" role="status">
      <strong>{{ jobFile }}</strong> is {{ machine.job.state === 'paused' ? 'paused' : 'running' }}: it can't be edited, renamed, moved or deleted until the job ends.
    </p>
    <p v-if="error" class="error">Couldn't list {{ folder || ROOTS[root].label }}: {{ error }}</p>

    <div v-else class="list" role="table" :aria-label="`${ROOTS[root].label}${folder ? ` / ${folder}` : ''}`">
      <div class="row head" :class="{ g: gcode }" role="row">
        <span v-if="gcode" role="columnheader">Toolhead</span>
        <template v-for="[k, l] in SORTS" :key="k">
          <button type="button" role="columnheader" class="sort" :class="[k, { on: sortBy === k }]" :aria-sort="sortBy === k ? (desc ? 'descending' : 'ascending') : 'none'" @click="setSort(k)">
            {{ l }}<span class="arrow" aria-hidden="true">{{ sortBy === k ? (desc ? '↓' : '↑') : '' }}</span>
          </button>
        </template>
        <span v-if="gcode" role="columnheader">Last run</span>
        <span role="columnheader" class="sr-only">Actions</span>
      </div>

      <button v-if="folder" type="button" class="row up" :class="{ g: gcode }" @click="go(parentOf(folder))">
        <span v-if="gcode" />
        <span class="name"><span class="fold" aria-hidden="true" />.. <span class="muted small">(up to {{ parentOf(folder) || ROOTS[root].label }})</span></span>
      </button>

      <p v-if="!loading && !sorted.length" class="muted empty">
        {{ folder ? 'This folder is empty.' : gcode ? 'No G-code files yet. Drop some above, or send a job from Prepare.' : root === 'config' ? 'No config files.' : 'No log files.' }}
      </p>

      <div
        v-for="r in sorted"
        :key="r.rp"
        role="row"
        class="row"
        :class="{ g: gcode, dir: r.dir, drop: dropOn === r.rel, highlight: gcode && r.rel === highlight, locked: !!lockOf(r) }"
        :draggable="writable || !r.dir"
        @dragstart="rowDragStart($event, r)"
        @dragover="folderDragOver($event, r)"
        @dragleave="dropOn = dropOn === r.rel ? null : dropOn"
        @drop="folderDrop($event, r)"
        @contextmenu="openMenu($event, r)"
        @pointerdown="pdown($event, r)"
        @pointermove="pmove"
        @pointerup="pcancel"
        @pointercancel="pcancel"
      >
        <template v-if="gcode">
          <span class="tool" role="cell">
            <template v-if="!r.dir && isGcode(r.name)">
              <span
                v-if="jobInfo(r).look"
                class="pill"
                :class="{ fits: jobInfo(r).matches }"
                :title="jobInfo(r).matches ? 'Uses the mounted toolhead' : jobInfo(r).needsSwap ? `Needs ${jobInfo(r).tool}; ${machine.mountedName} is mounted` : undefined"
              ><ToolheadBadge :look="jobInfo(r).look!" size="sm" /></span>
              <span v-else class="muted small">{{ jobInfo(r).pending ? (jobRunning ? 'Not read yet' : 'Reading…') : jobInfo(r).unreadable ? "Couldn't read" : 'Not declared' }}</span>
            </template>
          </span>
        </template>
        <span class="name" role="cell">
          <button type="button" class="open" :title="r.dir ? `Open ${r.name}` : openMode(root, r.name, r.size).mode === 'download' ? `Download ${r.name}` : `Open ${r.name}`" @click="open(r)">
            <span v-if="r.dir" class="fold" aria-hidden="true" />
            <span class="nm">{{ r.name }}</span>
          </button>
          <span v-if="gcode && !r.dir && !jobInfo(r).run" class="ring" role="img" aria-label="Not run yet" title="Not run yet" />
          <RouterLink v-if="gcode && !r.dir && jobInfo(r).care && (jobInfo(r).care!.overdue || jobInfo(r).care!.dueSoon)" to="/care" class="tag care" :title="jobInfo(r).care!.next?.title">{{ jobInfo(r).care!.overdue ? 'Care overdue' : 'Care due' }}</RouterLink>
          <span v-if="lockOf(r)" class="tag lock" :title="lockOf(r)!">In use</span>
        </span>
        <span class="meta date" role="cell">{{ fmtDate(r.modified) }}</span>
        <span class="meta size" role="cell">{{ r.dir ? '' : fmtSize(r.size) }}</span>
        <template v-if="gcode">
          <span class="run" role="cell" :class="jobInfo(r).run?.kind ?? 'never'">
            <template v-if="!r.dir && jobInfo(r).run">
              <span class="mark" aria-hidden="true">{{ jobInfo(r).run!.kind === 'completed' ? '✓' : jobInfo(r).run!.kind === 'failed' ? '✕' : jobInfo(r).run!.kind === 'running' ? '•' : '–' }}</span>
              {{ jobInfo(r).run!.label }}
              <span class="when">{{ fmtWhen(jobInfo(r).run!.at) }}</span>
            </template>
          </span>
        </template>
        <span class="go" role="cell">
          <template v-if="gcode && !r.dir && isGcode(r.name)">
            <RsButton
              v-if="jobInfo(r).start.swapTo != null && jobInfo(r).tool"
              variant="quiet"
              :disabled="control.jobActive || !machine.klippyReady"
              @click="control.swapTo(jobInfo(r).start.swapTo!, jobInfo(r).tool!)"
            >Swap to {{ jobInfo(r).tool }}</RsButton>
            <RsButton
              v-else
              :disabled="starting === r.rel || (!jobInfo(r).start.ok && jobInfo(r).start.block !== 'Still reading the file')"
              :title="jobInfo(r).start.block ?? 'Check and start this job'"
              @click="start(r)"
            >Start</RsButton>
          </template>
          <button type="button" class="more" :aria-label="`Actions for ${r.name}`" aria-haspopup="menu" @click="menuButton($event, r)">⋯</button>
        </span>
      </div>
    </div>

    <p v-if="gcode && entries.filter((e) => !e.dir).length > 40" class="muted small note">Toolheads are read for the newest 40 files in a folder, to keep the load on the host light.</p>

    <FileMenu v-if="menu" :x="menu.x" :y="menu.y" :title="menu.row.name" :items="menuItems(menu.row)" @close="menu = null" />
    <FileAsk ref="ask" />
    <FileEditor
      v-if="editing"
      :path="editing.rp"
      :text="editing.text"
      :read-only="editing.readOnly"
      :why="editing.why"
      :saving="saving"
      :saved-note="savedNote"
      :restart-label="savedNote && restart ? restart.label : null"
      :restart-block="restartBlock"
      @save="save"
      @close="closeEditor"
      @restart="doRestart"
      @dirty="editorDirty = $event"
    />
  </div>
</template>

<style scoped>
.top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--rs-space-3); margin-bottom: var(--rs-space-3); }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; font-size: var(--rs-text-sm); min-width: 0; }
.crumbs button { border: 0; background: none; padding: 4px 6px; border-radius: 6px; color: var(--rs-text-muted); font: inherit; cursor: pointer; }
.crumbs button:hover { background: var(--rs-surface-2); color: var(--rs-text-strong); }
.crumbs button.on { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.crumbs .sep { color: var(--rs-text-muted); }
.tools { display: flex; flex-wrap: wrap; gap: 8px; }
.count { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }

.dropzone { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 96px; margin-bottom: var(--rs-space-3); padding: var(--rs-space-3); border: 1.5px dashed var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text-muted); font: inherit; cursor: pointer; text-align: center; }
.dropzone:hover:not(:disabled), .dragging .dropzone { border-color: var(--rs-ink); color: var(--rs-text-strong); background: var(--rs-surface-2); }
.dropzone .big { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.dropzone .small { font-size: var(--rs-text-xs); }
.dropzone .bar { width: min(320px, 80%); height: 6px; border-radius: var(--rs-radius-pill); background: var(--rs-surface-2); overflow: hidden; }
.dropzone .bar span { display: block; height: 100%; background: var(--rs-ink); }

.msg { margin: 0 0 var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.busy { margin: 0 0 var(--rs-space-3); padding: 8px 12px; font-size: var(--rs-text-sm); border-left: 3px solid var(--rs-ink); background: var(--rs-dither-faint); }
.busy strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.error { color: var(--rs-danger); }
.empty { padding: var(--rs-space-4) 0; }

/* rows: Name | Modified | Size | ⋯     G-code: Toolhead | Name | Modified | Size | Last run | Start ⋯ */
.row { display: grid; grid-template-columns: minmax(0, 1fr) 150px 80px 120px; align-items: center; gap: var(--rs-space-4); padding: 8px 6px; border-top: 1px solid var(--rs-line); border-radius: 0; }
.row.g { grid-template-columns: 180px minmax(0, 1fr) 130px 70px 150px 170px; }
.row.head { padding-top: 0; padding-bottom: 6px; border-top: 0; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.row.up { width: 100%; border: 0; border-top: 1px solid var(--rs-line); background: none; font: inherit; text-align: left; cursor: pointer; color: var(--rs-text-strong); }
.row.up:hover { background: var(--rs-surface-2); }
.sort { justify-self: start; display: inline-flex; gap: 4px; border: 0; padding: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
.sort.on { color: var(--rs-text-strong); }
.sort .arrow { width: 0.8em; }
.row:not(.head):hover { background: color-mix(in srgb, var(--rs-ink) 3%, transparent); }
.row.drop { outline: 2px dashed var(--rs-ink); outline-offset: -2px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); }
.row.highlight { outline: 2px solid var(--rs-ink); outline-offset: -2px; border-radius: var(--rs-radius-md); }
.name { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.open { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; padding: 2px 0; border: 0; background: none; color: var(--rs-text-strong); font: inherit; text-align: left; cursor: pointer; }
.open .nm { overflow-wrap: anywhere; }
.open:hover .nm { text-decoration: underline; text-underline-offset: 3px; }
.dir .nm { font-weight: var(--rs-weight-medium); }
.fold { flex-shrink: 0; width: 18px; height: 13px; margin-top: 3px; border: 1.5px solid var(--rs-text-strong); border-radius: 2px 2px 3px 3px; position: relative; }
.fold::before { content: ''; position: absolute; left: -1.5px; top: -5px; width: 8px; height: 4px; border: 1.5px solid var(--rs-text-strong); border-bottom: 0; border-radius: 2px 2px 0 0; }
/* never run: a small hollow ring after the name */
.ring { flex-shrink: 0; width: 10px; height: 10px; border: 1.5px solid var(--rs-ink); border-radius: 50%; }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.go { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.more { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--rs-text-strong); font-size: 18px; line-height: 1; cursor: pointer; }
.more:hover, .more:focus-visible { border-color: var(--rs-line-strong); background: var(--rs-surface-2); outline: none; }
.tag { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 2px 9px; border-radius: var(--rs-radius-pill); white-space: nowrap; }
.tag.care { background: var(--rs-warn-fill); color: var(--rs-on-ink); text-decoration: none; }
.tag.lock { border: 1px solid var(--rs-ink); color: var(--rs-text-strong); }
.pill { display: inline-flex; align-items: center; max-width: 100%; padding: 3px 14px 3px 3px; border-radius: var(--rs-radius-pill); }
.pill.fits { background: var(--rs-fit-fill); }
.pill.fits :deep(.name) { color: var(--rs-on-fit); }
.pill.fits :deep(.disc) { border-radius: 999px; }
.run { font-size: var(--rs-text-sm); color: var(--rs-text-strong); white-space: nowrap; }
.run .mark { display: inline-block; width: 1em; font-weight: var(--rs-weight-medium); }
.run .when { margin-left: 4px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.run.cancelled { color: var(--rs-text-muted); }
.run.failed { color: var(--rs-danger); }
.small { font-size: var(--rs-text-sm); }
.note { margin-top: var(--rs-space-3); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: 720px) {
  /* no dragging files on a phone: Upload does it (the area still shows an upload's progress) */
  .dropzone:not(:disabled) { display: none; }
  .top { flex-direction: column; align-items: stretch; }
}
@media (max-width: 900px) {
  .row, .row.g { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; }
  .row.head { display: none; }
  .row .tool { grid-column: 1; grid-row: 2; }
  .row .name { grid-column: 1 / -1; grid-row: 1; }
  .row .date { grid-column: 1; }
  .row .size { display: none; }
  .row .run { grid-column: 1; }
  .row .go { grid-column: 2; grid-row: 2 / span 3; align-self: center; }
  .row.up { grid-template-columns: 1fr; }
}
</style>
