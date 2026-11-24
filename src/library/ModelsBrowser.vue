<script setup lang="ts">
/**
 * Files > Models: the model library on the Rhino (Tool Manager 1.9.46). STL, OBJ, 3MF, SVG and DXF files kept in a folder
 * the Portal owns. Drop files here to keep them, drag a row onto a folder to move it, and press "Set up a job" to hand
 * a model to job setup exactly as if it had been dropped there (a selected folder goes as one assembly).
 * Delete is straight away after a confirm: there is no trash. The rules live in rhino/library.py; the plain logic
 * (sorting, what a drop keeps, the sentences) is in ./models.ts.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import Icon from '@/icons/Icon.vue'
import { useMaintenanceStore } from '@/stores/maintenance'
import { usePrepareStore } from '@/stores/prepare'
import { nameProblem } from '@/files/fileOps'
import type { LibraryEntry, LibraryListing } from '@/portal/client'
import { cached, draw, keep, project, thumbKey, THUMB_MAX_BYTES } from './thumb'
import { loadModelFile } from '@/slicer/engine'
import { MAX_DEPTH, SORTS, arrange, deleteSentence, depthOf, join, parentOf, planUpload, setupPaths, sizeText, skippedText, spaceText, fromLibrary, type SortKey } from './models'

const maint = useMaintenanceStore()
const prep = usePrepareStore()
const router = useRouter()
/** The Portal client, or a clear error the callers' try/catch shows. */
const portal = () => {
  const p = maint.portal()
  if (!p) throw new Error('The Rhino Portal isn’t connected, so the library can’t be reached from here.')
  return p
}

const folder = ref('')
const listing = ref<LibraryListing | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const msg = ref<string | null>(null)
const busy = ref<string | null>(null)
const query = ref('')
const sortBy = ref<SortKey>('name')
const desc = ref(false)
const picked = ref<Set<string>>(new Set())
const dragging = ref(false)
const dropOn = ref<string | null>(null)
const picker = ref<HTMLInputElement | null>(null)

const entries = computed(() => arrange(listing.value?.entries ?? [], sortBy.value, desc.value, query.value))
const chosen = computed(() => entries.value.filter((e) => picked.value.has(e.name)))
const crumbs = computed(() => (folder.value ? folder.value.split('/') : []))
const space = computed(() => (listing.value ? spaceText(listing.value.usage) : ''))
const MODEL_ACCEPT = '.stl,.obj,.3mf,.svg,.dxf'

async function load() {
  loading.value = true
  error.value = null
  try {
    listing.value = await portal().libraryList(folder.value)
    picked.value = new Set([...picked.value].filter((n) => listing.value!.entries.some((e) => e.name === n)))
  } catch (e) {
    error.value = (e as Error).message
    listing.value = null
  } finally {
    loading.value = false
  }
}
function go(p: string) {
  folder.value = p
  picked.value = new Set()
  query.value = ''
  void load()
}
function toggle(name: string) {
  const s = new Set(picked.value)
  if (!s.delete(name)) s.add(name)
  picked.value = s
}
function setSort(k: SortKey) {
  if (sortBy.value === k) desc.value = !desc.value
  else (sortBy.value = k, (desc.value = false))
}
const when = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// ---- the one dialog: a name, a clash, a delete
type Ask =
  | { kind: 'name'; title: string; label: string; value: string; ok: string; taken: string[] }
  | { kind: 'clash'; name: string }
  | { kind: 'delete'; text: string }
const dlg = ref<HTMLDialogElement | null>(null)
const ask = ref<Ask | null>(null)
const nameValue = ref('')
let answer: ((a: string | null) => void) | null = null
const nameBlock = computed(() => (ask.value?.kind === 'name' ? nameProblem(nameValue.value)?.replace(' (Moonraker hides those)', '') ?? (ask.value.taken.includes(nameValue.value) ? 'Something here already has that name' : null) : null))
function open(a: Ask): Promise<string | null> {
  ask.value = a
  if (a.kind === 'name') nameValue.value = a.value
  void nextTick(() => dlg.value?.showModal())
  return new Promise((r) => (answer = r))
}
function close(a: string | null) {
  dlg.value?.close()
  ask.value = null
  answer?.(a)
  answer = null
}

// ---- keeping files
async function upload(files: File[], into = folder.value) {
  msg.value = null
  const lib = listing.value?.usage
  const plan = planUpload(files, lib?.max_file ?? 210 * 1048576)
  const notes: string[] = []
  let n = 0
  try {
    for (const i of plan.keep) {
      const f = files[i]!
      busy.value = `Keeping ${f.name} (${++n} of ${plan.keep.length})…`
      let mode: '' | 'replace' | 'both' = ''
      for (;;) {
        try {
          const r = await portal().libraryUpload(into, f, mode)
          if (r.status === 'same') notes.push(`${f.name} was already here`)
          break
        } catch (e) {
          if (!(e as { clash?: boolean }).clash || mode) throw e
          const a = await open({ kind: 'clash', name: f.name })
          if (a === 'replace' || a === 'both') mode = a
          else break
        }
      }
    }
  } catch (e) {
    msg.value = `Stopped at ${files[plan.keep[n - 1] ?? 0]?.name ?? 'the first file'}: ${(e as Error).message}`
    busy.value = null
    await load()
    return
  }
  busy.value = null
  msg.value = [`Kept ${n - notes.length} of ${files.length} file${files.length === 1 ? '' : 's'}.`, ...notes, skippedText(plan.skipped)].filter(Boolean).join(' ')
  await load()
}
function onPick(list: FileList | null) {
  const files = [...(list ?? [])]
  if (files.length) void upload(files)
  if (picker.value) picker.value.value = ''
}
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
function onDragOver(e: DragEvent) {
  if (hasFiles(e)) {
    e.preventDefault()
    dragging.value = true
  }
}
function onDrop(e: DragEvent) {
  dragging.value = false
  if (!hasFiles(e)) return
  e.preventDefault()
  void upload([...(e.dataTransfer?.files ?? [])])
}

// ---- row drags: move into a folder
function rowDragStart(e: DragEvent, r: LibraryEntry) {
  e.dataTransfer?.setData('application/x-rhino-model', join(folder.value, r.name))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function folderOver(e: DragEvent, r: LibraryEntry) {
  if (!r.dir) return
  if (hasFiles(e) || e.dataTransfer?.types.includes('application/x-rhino-model')) {
    e.preventDefault()
    e.stopPropagation()
    dropOn.value = r.name
  }
}
async function folderDrop(e: DragEvent, r: LibraryEntry) {
  dropOn.value = null
  if (!r.dir) return
  e.preventDefault()
  e.stopPropagation()
  dragging.value = false
  const into = join(folder.value, r.name)
  if (hasFiles(e)) return void upload([...(e.dataTransfer?.files ?? [])], into)
  const from = e.dataTransfer?.getData('application/x-rhino-model')
  if (from) await moveTo(from, into)
}
async function moveTo(from: string, to: string) {
  msg.value = null
  try {
    await portal().libraryMove(from, to)
  } catch (e) {
    msg.value = (e as Error).message
  }
  await load()
}
const moveUpOne = (r: LibraryEntry) => moveTo(join(folder.value, r.name), parentOf(folder.value))

// ---- folders, rename, delete
async function newFolder() {
  if (depthOf(folder.value) + 1 > MAX_DEPTH) return void (msg.value = `Folders go ${MAX_DEPTH} deep at most.`)
  const a = await open({ kind: 'name', title: 'New folder', label: 'Folder name', value: '', ok: 'Make folder', taken: entries.value.map((e) => e.name) })
  if (a === null) return
  await run(() => portal().libraryFolder(folder.value, a))
}
async function rename(r: LibraryEntry) {
  const a = await open({ kind: 'name', title: 'Rename', label: 'New name', value: r.name, ok: 'Rename', taken: entries.value.map((e) => e.name).filter((n) => n !== r.name) })
  if (a === null || a === r.name) return
  await run(() => portal().libraryRename(join(folder.value, r.name), a))
}
async function remove(list: LibraryEntry[]) {
  if (!list.length) return
  const c = { files: 0, folders: 0 }
  try {
    for (const r of list) {
      const x = await portal().libraryCount(join(folder.value, r.name))
      c.files += x.files
      c.folders += x.folders
    }
  } catch (e) {
    return void (msg.value = (e as Error).message)
  }
  const a = await open({ kind: 'delete', text: deleteSentence(list.map((r) => r.name), c) })
  if (a !== 'yes') return
  await run(async () => {
    for (const r of list) await portal().libraryDelete(join(folder.value, r.name))
  })
  picked.value = new Set()
}
async function run(fn: () => Promise<unknown>) {
  msg.value = null
  try {
    await fn()
  } catch (e) {
    msg.value = (e as Error).message
  }
  await load()
}

// ---- set up a job
async function setUp(list: LibraryEntry[]) {
  msg.value = null
  busy.value = 'Getting the model from the Rhino…'
  try {
    const folderFiles: Record<string, string[]> = {}
    for (const e of list.filter((x) => x.dir)) {
      const l = await portal().libraryList(join(folder.value, e.name))
      folderFiles[e.name] = l.entries.filter((x) => !x.dir).map((x) => x.name)
    }
    const paths = setupPaths(folder.value, list, folderFiles)
    if (!paths.length) throw new Error('There are no models in that folder to set up.')
    const files: File[] = []
    for (const p of paths) {
      const f = await portal().libraryFile(p)
      fromLibrary.add(f)
      files.push(f)
    }
    await prep.loadFiles(files)       // exactly as if they had been dropped on job setup
    await router.push('/setup')
  } catch (e) {
    msg.value = `Couldn't set up a job: ${(e as Error).message}`
  } finally {
    busy.value = null
  }
}

// ---- pictures: drawn here the first time a row is seen, kept in this browser
const pics = ref<Record<string, string>>({})
const pending = new Set<string>()
let chain: Promise<void> = Promise.resolve()
const vVisible = {
  mounted(el: HTMLElement, b: { value: () => void }) {
    if (typeof IntersectionObserver === 'undefined') return b.value()
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (o.disconnect(), b.value()), { rootMargin: '120px' })
    o.observe(el)
  },
}
function wantPic(r: LibraryEntry) {
  if (r.dir || !['stl', 'obj', '3mf'].includes(r.kind ?? '') || (r.size ?? 0) > THUMB_MAX_BYTES) return
  const path = join(folder.value, r.name)
  const key = thumbKey(path, r.size ?? 0, r.modified)
  if (pics.value[key] || pending.has(key)) return
  pending.add(key)
  chain = chain.then(async () => {                    // one at a time: a model is downloaded and read for each
    try {
      let url = await cached(key)
      if (!url) {
        const parts = await loadModelFile(await portal().libraryFile(path))
        const v = parts[0] && parts.length === 1 ? parts[0].vertices : new Float32Array(parts.flatMap((p) => [...p.vertices]))
        url = draw(project(v, 56), 56)
        if (url) await keep(key, url)
      }
      if (url) pics.value = { ...pics.value, [key]: url }
    } catch { /* no picture for this one; the row works without */ }
    pending.delete(key)
  })
}
const picOf = (r: LibraryEntry) => pics.value[thumbKey(join(folder.value, r.name), r.size ?? 0, r.modified)]

onMounted(load)
</script>

<template>
  <div class="models" :class="{ dragging }" @dragover="onDragOver" @dragleave.self="dragging = false" @drop="onDrop">
    <div class="top">
      <nav class="crumbs" aria-label="Folder">
        <button type="button" :class="{ on: !folder }" @click="go('')">Models</button>
        <template v-for="(c, i) in crumbs" :key="i">
          <span class="sep" aria-hidden="true">›</span>
          <button type="button" :class="{ on: i === crumbs.length - 1 }" @click="go(crumbs.slice(0, i + 1).join('/'))">{{ c }}</button>
        </template>
      </nav>
      <div class="tools">
        <input ref="picker" type="file" multiple :accept="MODEL_ACCEPT" class="visually-hidden" @change="onPick(($event.target as HTMLInputElement).files)" />
        <RsButton :disabled="!!busy" @click="picker?.click()">Add models</RsButton>
        <RsButton @click="newFolder">New folder</RsButton>
        <RsButton variant="quiet" :disabled="loading" @click="load">Refresh</RsButton>
      </div>
    </div>

    <p v-if="listing" class="space">{{ space }}</p>

    <button type="button" class="dropzone" :class="{ dragging }" :disabled="!!busy" @click="picker?.click()">
      <Icon nav="files" :size="24" />
      <span class="big">{{ busy ?? 'Drop models here, or click to choose' }}</span>
      <span class="small">.stl, .obj, .3mf, .svg, .dxf · up to {{ sizeText(listing?.usage.max_file ?? 210 * 1048576) }} each{{ folder ? ` · into ${folder}` : '' }}</span>
    </button>

    <p v-if="msg" class="msg" role="status">{{ msg }}</p>
    <p v-if="error" class="error">Couldn't list the models: {{ error }}</p>

    <template v-else-if="listing">
      <div class="find">
        <input v-model="query" type="search" class="search" placeholder="Search this folder" aria-label="Search this folder" />
        <span class="sorts">
          <button v-for="[k, l] in SORTS" :key="k" type="button" class="sort" :class="{ on: sortBy === k }" :aria-pressed="sortBy === k" @click="setSort(k)">
            {{ l }}<span aria-hidden="true">{{ sortBy === k ? (desc ? ' ↓' : ' ↑') : '' }}</span>
          </button>
        </span>
      </div>

      <div v-if="chosen.length" class="bar" role="status">
        <strong>{{ chosen.length }} selected</strong>
        <RsButton variant="primary" size="sm" :disabled="!!busy" @click="setUp(chosen)">{{ chosen.length > 1 || chosen[0]!.dir ? 'Set up as one job' : 'Set up a job' }}</RsButton>
        <RsButton variant="danger-outline" size="sm" @click="remove(chosen)">Delete</RsButton>
        <RsButton variant="quiet" size="sm" @click="picked = new Set()">Clear</RsButton>
      </div>

      <div class="list" role="list" :aria-label="`Models${folder ? ` / ${folder}` : ''}`">
        <p v-if="!entries.length" class="empty">{{ query ? 'Nothing here matches that search.' : folder ? 'This folder is empty. Drop models onto it.' : 'No models yet. Drop an STL, 3MF, OBJ, SVG or DXF here to keep it on the Rhino.' }}</p>
        <div
          v-for="r in entries"
          :key="r.name"
          class="row"
          :class="{ dir: r.dir, drop: dropOn === r.name, on: picked.has(r.name) }"
          role="listitem"
          draggable="true"
          @dragstart="rowDragStart($event, r)"
          @dragover="folderOver($event, r)"
          @dragleave="dropOn = dropOn === r.name ? null : dropOn"
          @drop="folderDrop($event, r)"
        >
          <input type="checkbox" :checked="picked.has(r.name)" :aria-label="`Select ${r.name}`" @change="toggle(r.name)" />
 <span v-if="!r.dir" v-visible="() => wantPic(r)" class="pic" aria-hidden="true"><img v-if="picOf(r)" :src="picOf(r)" alt="" /><span v-else>{{ (r.kind ?? '').toUpperCase() }}</span></span>
          <button v-if="r.dir" type="button" class="name" @click="go(join(folder, r.name))"><span class="glyph" aria-hidden="true">▸</span> {{ r.name }}</button>
          <span v-else class="name plain">{{ r.name }}</span>
          <span class="meta">{{ r.dir ? `${r.items ?? 0} item${r.items === 1 ? '' : 's'}` : `${(r.kind ?? '').toUpperCase()} · ${sizeText(r.size ?? 0)}` }} · {{ when(r.modified) }}</span>
          <span class="acts">
            <RsButton v-if="!r.dir || (r.items ?? 0) > 0" size="sm" :variant="r.dir ? 'default' : 'primary'" :disabled="!!busy" @click="setUp([r])">{{ r.dir ? 'Set up as one job' : 'Set up a job' }}</RsButton>
            <RsButton v-if="folder" size="sm" variant="quiet" title="Move up one folder" @click="moveUpOne(r)">Up</RsButton>
            <RsButton size="sm" variant="quiet" @click="rename(r)">Rename</RsButton>
            <RsButton size="sm" variant="quiet" @click="remove([r])">Delete</RsButton>
          </span>
        </div>
      </div>
      <p v-if="listing.total > listing.entries.length" class="small-note">Showing the first {{ listing.entries.length }} of {{ listing.total }} items. Use folders to keep a long list short.</p>
    </template>

    <dialog ref="dlg" class="ask" aria-labelledby="ask-title" @cancel.prevent="close(null)">
      <form v-if="ask" method="dialog" @submit.prevent="ask.kind === 'name' ? !nameBlock && close(nameValue) : close('yes')">
        <template v-if="ask.kind === 'name'">
          <h2 id="ask-title">{{ ask.title }}</h2>
          <label>{{ ask.label }}<input v-model="nameValue" type="text" autocomplete="off" /></label>
          <p v-if="nameBlock" class="error">{{ nameBlock }}</p>
          <div class="btns"><RsButton variant="quiet" @click="close(null)">Cancel</RsButton><RsButton variant="primary" type="submit" :disabled="!!nameBlock">{{ ask.ok }}</RsButton></div>
        </template>
        <template v-else-if="ask.kind === 'clash'">
          <h2 id="ask-title">“{{ ask.name }}” is already here</h2>
          <p>A different file has this name. Replace it, keep both (the new one gets “(2)”), or leave the new file out.</p>
          <div class="btns"><RsButton variant="quiet" @click="close(null)">Leave it out</RsButton><RsButton @click="close('both')">Keep both</RsButton><RsButton variant="danger" @click="close('replace')">Replace</RsButton></div>
        </template>
        <template v-else>
          <h2 id="ask-title">Delete</h2>
          <p>{{ ask.text }}</p>
          <div class="btns"><RsButton variant="quiet" @click="close(null)">Cancel</RsButton><RsButton variant="danger" type="submit">Delete now</RsButton></div>
        </template>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.models { display: flex; flex-direction: column; gap: var(--rs-space-3); position: relative; }
.models.dragging { outline: 2px dashed var(--rs-ink); outline-offset: 4px; }
.top { display: flex; flex-wrap: wrap; gap: var(--rs-space-3); align-items: center; justify-content: space-between; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.crumbs button { background: none; border: 0; padding: 4px 6px; font: inherit; color: var(--rs-text-muted); cursor: pointer; border-radius: var(--rs-radius-sm, 4px); }
.crumbs button.on { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.crumbs .sep { color: var(--rs-text-muted); }
.tools { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); }
.space { margin: 0; color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.dropzone { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: var(--rs-space-4); border: 1px dashed var(--rs-line-strong); border-radius: var(--rs-radius-md, 8px); background: var(--rs-surface-sunken, transparent); color: var(--rs-text); font: inherit; cursor: pointer; }
.dropzone.dragging, .dropzone:hover:not(:disabled) { border-color: var(--rs-ink); }
.dropzone .big { font-weight: var(--rs-weight-medium); }
.dropzone .small { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.msg { margin: 0; padding: 8px 12px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm, 4px); }
.error { margin: 0; color: var(--rs-danger, #b3261e); }
.find { display: flex; flex-wrap: wrap; gap: var(--rs-space-3); align-items: center; }
.search { flex: 1 1 200px; min-width: 0; padding: 8px 10px; font: inherit; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm, 4px); background: var(--rs-surface); color: var(--rs-text); }
.sorts { display: flex; gap: 4px; }
.sort { padding: 6px 10px; border: 1px solid transparent; background: none; font: inherit; font-size: var(--rs-text-sm); color: var(--rs-text-muted); cursor: pointer; border-radius: var(--rs-radius-sm, 4px); }
.sort.on { color: var(--rs-text-strong); border-color: var(--rs-line-strong); }
.bar { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); align-items: center; padding: 8px 12px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm, 4px); }
.list { display: flex; flex-direction: column; border-top: 1px solid var(--rs-line); }
.row { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: 'c p n a' 'c p m a'; gap: 2px var(--rs-space-3); align-items: center; padding: 8px 4px; border-bottom: 1px solid var(--rs-line); }
.row.on { background: var(--rs-surface-sunken, transparent); }
.row.drop { outline: 2px solid var(--rs-ink); outline-offset: -2px; }
.row input { grid-area: c; }
.row.dir { grid-template-columns: auto minmax(0, 1fr) auto; }
.pic { grid-area: p; width: 56px; height: 56px; display: grid; place-items: center; border-radius: var(--rs-radius-sm, 4px); background: var(--rs-surface-sunken, transparent); border: 1px solid var(--rs-line); font-size: 11px; color: var(--rs-text-muted); overflow: hidden; }
.pic img { width: 100%; height: 100%; object-fit: contain; }
.row.dir { grid-template-areas: 'c n n a' 'c m m a'; }
.name { grid-area: n; text-align: left; overflow-wrap: anywhere; font: inherit; color: var(--rs-text-strong); background: none; border: 0; padding: 0; }
button.name { cursor: pointer; font-weight: var(--rs-weight-medium); }
.meta { grid-area: m; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.acts { grid-area: a; display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.empty, .small-note { margin: var(--rs-space-4) 0; color: var(--rs-text-muted); }
.ask { border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md, 8px); background: var(--rs-surface); color: var(--rs-text); padding: var(--rs-space-4); max-width: min(92vw, 440px); }
.ask::backdrop { background: rgba(0, 0, 0, 0.4); }
.ask h2 { margin: 0 0 var(--rs-space-3); font-size: var(--rs-text-lg, 1.1rem); }
.ask label { display: flex; flex-direction: column; gap: 4px; }
.ask input[type='text'] { padding: 8px 10px; font: inherit; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm, 4px); background: var(--rs-surface); color: var(--rs-text); }
.btns { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); justify-content: flex-end; margin-top: var(--rs-space-3); }
@media (max-width: 760px) { .row { grid-template-areas: 'c p n' 'c p m' '. a a'; } .row.dir { grid-template-areas: 'c n n' 'c m m' '. a a'; } .acts { justify-content: flex-start; } }
</style>
