<script setup lang="ts">
/**
 * Chain builder (Job setup › Chain): one placement and the stages that work on it, grouped by job. A new job starts wherever
 * the tool changes, and Studio shows each pause and swap between the cards (src/chain/chain.ts). Saved on the Portal
 * (stores/chains.ts). This build: the stages, the sheet and its place on the bed, the checks. The design, the fixtures, the
 * job files and the run wizard come next (docs/design-process-chain.md).
 */
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChainBed from '@/chain/ChainBed.vue'
import ChainNum from '@/chain/ChainNum.vue'
import { DESIGN_FOLDER, ROLE_LABEL, applyRoles, bodiesFrom, designChecks, designRef, libraryPath, place, rolesAvailable, setRole, sheetFrom, type Body, type BodyRole } from '@/chain/design'
import { loadModelFile } from '@/slicer/engine'
import LaserOps from '@/prepare/LaserOps.vue'
import { buildJobs, kiriSlicer, type BuiltFile } from '@/chain/build'
import { newJob } from '@/slicer/profiles'
import { useMachineStore } from '@/stores/machine'
import { useChainFilesStore } from '@/stores/chainFiles'
import { LASER_TYPES, drawingLoops, laserChecks, laserJobFor, placeLoops } from '@/chain/laser'
import type { Loop } from '@/slicer/laserOps'
import type { LaserOp } from '@/slicer/types'
import { MODEL_TYPES, extOf } from '@/slicer/model'
import {
  PRESETS,
  SHEET_MAX,
  SHEET_MIN,
  chainChecks,
  chipsFor,
  jobsOf,
  newChain,
  planSteps,
  pinnedReason,
  sheetProblem,
  stageLine,
  swapsOf,
  type Chain,
  type Chip,
  type PresetId,
  type SavedChain,
  type Stage,
} from '@/chain/chain'
import RsButton from '@/components/RsButton.vue'
import RsDialog from '@/components/RsDialog.vue'
import { useChainsStore } from '@/stores/chains'
import { useToolMgrStore } from '@/stores/toolmgr'
import { usePrepareStore } from '@/stores/prepare'

const chains = useChainsStore()
const prep = usePrepareStore()
const tm = useToolMgrStore()
const machine = useMachineStore()
const chainFiles = useChainFilesStore()
const STUDIO_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
const route = useRoute()
const router = useRouter()

const draft = ref<Chain | null>(null)
const openId = ref<string | null>(null)
const openRev = ref(0)
const baseline = ref('')
const selected = ref<number | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const startError = ref<string | null>(null)
const askDelete = ref(false)
const tab = ref<'stages' | 'bed'>('stages')

// ---- the design: one 3D file's bodies, kept in the browser only (the chain keeps just the sheet it sets)
const bodies = ref<Body[]>([])
const designFile = ref('')
const designError = ref<string | null>(null)
const loading = ref(false)
/** where the file goes in the model library, and the file itself until a save has put it there */
const designPath = ref<string | null>(null)
const pendingFile = ref<File | null>(null)
async function loadDesign(file: File | undefined) {
  if (!file || !draft.value) return
  designError.value = null
  if (!(MODEL_TYPES as readonly string[]).includes(extOf(file.name)) || ['svg', 'dxf'].includes(extOf(file.name)))
    return void (designError.value = `${file.name} isn’t a 3D model. Use a 3MF, STL or OBJ file; laser artwork comes in a later step.`)
  loading.value = true
  try {
    const parts = await loadModelFile(file)
    const next = bodiesFrom(parts, draft.value)
    if (!next.length) throw new Error('no solid bodies in it')
    bodies.value = next
    designFile.value = file.name
    pendingFile.value = file
    designPath.value = libraryPath(draft.value.name, file.name)
    syncDesign()
  } catch (e) {
    designError.value = `Couldn’t read ${file.name}: ${e instanceof Error ? e.message : String(e)}.`
  } finally {
    loading.value = false
  }
}
function pickDesign(e: Event) {
  const input = e.target as HTMLInputElement
  void loadDesign(input.files?.[0])
  input.value = ''
}
/** forget the design on screen only (a chain being opened); the chain's own design is left alone */
function resetDesign() {
  bodies.value = []
  designFile.value = ''
  designError.value = null
  designPath.value = null
  pendingFile.value = null
}
/** the person's Clear: the chain forgets its design too */
function clearDesign() {
  resetDesign()
  if (draft.value) draft.value.design = null
}
/** keep the chain's design (file and the part of each body) in step with what is on screen */
function syncDesign() {
  if (draft.value && designPath.value) draft.value.design = designRef(designPath.value, bodies.value)
}
function changeRole(id: number, role: BodyRole) {
  bodies.value = setRole(bodies.value, id, role)
  syncDesign()
}
/** read a reopened chain's design back from the model library */
async function restoreDesign(c: Chain) {
  if (!c.design) return
  const ref = c.design
  loading.value = true
  try {
    const file = await tm.client().libraryFile(ref.file)
    const parts = await loadModelFile(file)
    if (draft.value !== c && draft.value?.design?.file !== ref.file) return
    bodies.value = applyRoles(bodiesFrom(parts, c), ref.roles, c)
    designFile.value = ref.file.slice(ref.file.lastIndexOf('/') + 1)
    designPath.value = ref.file
  } catch (e) {
    designError.value = `The design file isn’t in the model library any more (${ref.file}). Load it again. ${e instanceof Error ? e.message : ''}`.trim()
  } finally {
    loading.value = false
  }
}
// ---- the laser stage's drawing (an SVG or DXF), kept in the model library like the design
const laserName = ref('')
const laserPath = ref<string | null>(null)
const laserPending = ref<File | null>(null)
const laserSrc = shallowRef<File | null>(null)
const laserFound = shallowRef<Loop[] | null>(null)
const laserFinding = ref(false)
const laserError = ref<string | null>(null)
const laserTried = ref(false)
const hasLaser = computed(() => !!draft.value?.stages.some((s) => s.kind === 'laser'))
const laserTool = computed(() => draft.value?.stages.find((s) => s.kind === 'laser')?.tool ?? toolsOf('laser')[0] ?? '')
const laserJob = computed(() => laserJobFor(laserTool.value, prep.materialsOf(laserTool.value), anchor.value))
const laserOps = computed<LaserOp[]>({
  get: () => draft.value?.laser?.ops ?? [],
  set: (v) => {
    if (draft.value?.laser) draft.value.laser = { ...draft.value.laser, ops: v }
  },
})
const laserPlaced = computed(() => (laserFound.value ? placeLoops(laserFound.value, anchor.value) : null))
function resetLaser() {
  laserName.value = ''
  laserPath.value = null
  laserPending.value = null
  laserSrc.value = null
  laserFound.value = null
  laserError.value = null
  laserTried.value = false
}
async function findLaserLoops() {
  const f = laserSrc.value
  if (!f || laserFinding.value) return
  laserFinding.value = true
  laserError.value = null
  try {
    laserFound.value = await drawingLoops(f, laserJob.value, prep.machineInfo)
  } catch (e) {
    laserFound.value = null
    laserError.value = `Couldn’t read ${f.name}: ${e instanceof Error ? e.message : String(e)}.`
  } finally {
    laserTried.value = true
    laserFinding.value = false
  }
}
async function loadLaser(file: File | undefined) {
  if (!file || !draft.value) return
  laserError.value = null
  if (!(LASER_TYPES as readonly string[]).includes(extOf(file.name))) return void (laserError.value = `${file.name} isn’t a flat drawing. Use an SVG or DXF file.`)
  laserSrc.value = file
  laserName.value = file.name
  laserPending.value = file
  laserPath.value = libraryPath(draft.value.name, file.name)
  draft.value.laser = { file: laserPath.value, ops: [] }
  await findLaserLoops()
}
function pickLaser(e: Event) {
  const input = e.target as HTMLInputElement
  void loadLaser(input.files?.[0])
  input.value = ''
}
function clearLaser() {
  resetLaser()
  if (draft.value) draft.value.laser = null
}
async function restoreLaser(c: Chain) {
  if (!c.laser) return
  const ref = c.laser
  try {
    laserSrc.value = await tm.client().libraryFile(ref.file)
    laserName.value = ref.file.slice(ref.file.lastIndexOf('/') + 1)
    laserPath.value = ref.file
  } catch (e) {
    laserError.value = `The laser drawing isn’t in the model library any more (${ref.file}). Load it again. ${e instanceof Error ? e.message : ''}`.trim()
    laserTried.value = true
    return
  }
  if (draft.value === c) await findLaserLoops()
}

// ---- the job files: built here, then downloaded or sent to the Rhino (never started)
const built = ref<BuiltFile[] | null>(null)
const building = ref(false)
const buildError = ref<string | null>(null)
const sentFiles = ref<Record<string, string>>({})
const sending = ref<string | null>(null)
const sendError = ref<string | null>(null)
/** what the files were made from: anything that changes it makes them stale */
const buildKey = computed(() => (draft.value ? JSON.stringify({ ...draft.value, jobs: 0, name: 0 }) + draft.value.name + bodies.value.map((b) => b.role).join() : ''))
watch(buildKey, () => {
  built.value = null
  sentFiles.value = {}
})
async function buildFiles() {
  const c = draft.value
  if (!c || building.value) return
  building.value = true
  buildError.value = null
  sendError.value = null
  try {
    const pt = c.stages.find((s) => s.kind === 'print')?.tool
    const printJob = pt ? { ...newJob(pt, 'fdm', prep.materialsOf(pt)), engine: 'kiri' as const } : null
    const files = await buildJobs(
      { chain: c, bodies: bodies.value, placed: placed.value, printJob, laserJob: c.laser ? laserJob.value : null, laserSrc: laserSrc.value, machine: prep.machineInfo, studioVersion: STUDIO_VERSION },
      kiriSlicer,
    )
    built.value = files
    c.jobs = files.filter((f) => f.text && !f.problem).map((f) => ({ file: f.file, tool: f.tool, stages: f.stages }))
    if (openId.value) chainFiles.keep(openId.value, files.filter((f) => f.text && !f.problem).map(textFile))
  } catch (e) {
    buildError.value = (e as Error).message
  } finally {
    building.value = false
  }
}
const textFile = (f: BuiltFile) => new File([f.text ?? ''], f.file, { type: 'text/plain' })
function downloadFile(f: BuiltFile) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(textFile(f))
  a.download = f.file
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
async function sendFile(f: BuiltFile) {
  if (!f.text || f.problem || sending.value) return
  sending.value = f.file
  sendError.value = null
  try {
    sentFiles.value = { ...sentFiles.value, [f.file]: await machine.uploadFile(textFile(f)) }
  } catch (e) {
    sendError.value = (e as Error).message
  } finally {
    sending.value = null
  }
}

const rolesHere = computed(() => (draft.value ? rolesAvailable(draft.value) : []))
const anchor = computed(() => (draft.value?.sheet ? { x: draft.value.sheet.x, y: draft.value.sheet.y } : { x: prep.machineInfo.workArea.x / 2, y: prep.machineInfo.workArea.y / 2 }))
const placed = computed(() => place(bodies.value, anchor.value))
const sheetBody = computed(() => placed.value.find((p) => p.role === 'sheet') ?? null)
function useAsSheet() {
  if (!draft.value || !sheetBody.value) return
  const f = sheetFrom(sheetBody.value)
  draft.value.sheet = f.sheet
  draft.value.thickness = f.thickness
}
const bodyTall = (b: Body) => placed.value.find((p) => p.id === b.id)?.height


const ZOOM_KEY = 'rs.chain.zoom'
const zoom = ref(readZoom())
function readZoom(): boolean {
  try {
    return localStorage.getItem(ZOOM_KEY) === '1'
  } catch {
    return false
  }
}
watch(zoom, (z) => {
  try {
    localStorage.setItem(ZOOM_KEY, z ? '1' : '0')
  } catch {
    /* a convenience only */
  }
})

const toolsOf = (process: string) => prep.tools.filter((t) => t.process === process).map((t) => t.name)
const PROCESS_OF: Record<Stage['kind'], string | null> = { print: 'fdm', laser: 'laser', knife: 'dragknife', cnc: 'cnc', manual: null }
const optionsFor = (s: Stage) => (PROCESS_OF[s.kind] ? toolsOf(PROCESS_OF[s.kind]!) : [])

const ctx = computed(() => ({ tools: new Set(prep.tools.map((t) => t.name)), workArea: prep.machineInfo.workArea, keepOut: prep.machineInfo.keepOut }))
const checks = computed(() => (draft.value ? [...chainChecks(draft.value, ctx.value), ...(bodies.value.length ? designChecks(placed.value, draft.value, ctx.value.workArea, ctx.value.keepOut) : []), ...laserChecks(draft.value, laserPlaced.value, laserTried.value)] : []))
const stageRole = computed(() => (selected.value != null ? (byId.value.get(selected.value)?.role ?? null) : null))
const steps = computed(() => (draft.value ? planSteps(draft.value.stages) : []))
const chips = computed(() => (draft.value ? chipsFor(draft.value.stages) : []))
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== baseline.value)
const blocked = computed(() => checks.value.filter((c) => c.level === 'error').length)
const byId = computed(() => new Map((draft.value?.stages ?? []).map((s) => [s.id, s])))
const sheetBad = computed(() => !!draft.value?.sheet && !!sheetProblem(draft.value.sheet, ctx.value.workArea, ctx.value.keepOut))
const placeIndex = computed(() => draft.value?.stages.findIndex((s) => s.role === 'place') ?? -1)
const sheetShown = computed(() => {
  const d = draft.value
  if (!d || placeIndex.value < 0 || selected.value == null) return !!d && placeIndex.value >= 0
  return d.stages.findIndex((s) => s.id === selected.value) >= placeIndex.value
})
const selectedName = computed(() => {
  const s = selected.value != null ? byId.value.get(selected.value) : null
  return s ? `${String(draft.value!.stages.indexOf(s) + 1).padStart(2, '0')} ${s.what}` : 'Placement'
})
const bedNote = computed(() => (bodies.value.length ? 'The design is drawn from above, to scale, where it will print. Pick a stage to see what it makes; earlier stages show faint. Laser marks come in a later step.' : 'Load a design to see it here.'))

const num = (s: Stage) => String((draft.value?.stages.findIndex((x) => x.id === s.id) ?? 0) + 1).padStart(2, '0')
const chipsAfter = (id: number, kinds: Chip['kind'][]) => chips.value.filter((c) => c.after === id && kinds.includes(c.kind))
const lastOf = (stagesIds: number[]) => stagesIds[stagesIds.length - 1]!
const jobIndex = (j: ReturnType<typeof jobsOf>[number]) => jobsOf(steps.value).indexOf(j) + 1
const TONES = new Set(['blockone', 'switchfly', 'lightsaber', 'hotjoe', 'dragknife'])
/** a built-in tool's accent, or the custom-tool one */
function toneVar(tool: string): string {
  const k = tool.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `var(--th-${TONES.has(k) ? k : 'custom'})`
}

function newName(base: string): string {
  const taken = new Set(chains.list.map((c) => c.name.toLowerCase()))
  let n = 1
  while (taken.has(`${base} ${n}`.toLowerCase())) n++
  return `${base} ${n}`
}

function startNew(preset: PresetId) {
  startError.value = null
  const print = toolsOf('fdm')[0]
  const laser = toolsOf('laser')[0]
  if (!print || !laser) {
    startError.value = `${!print ? 'A print head' : 'A laser'} is needed for this chain and the machine doesn’t list one.`
    return
  }
  const c = newChain(newName('Chain'), preset, { print, laser })
  if (preset === 'sheet-print-laser') {
    const a = prep.machineInfo.workArea
    c.sheet = { width: 160, depth: 110, x: Math.round(a.x / 2), y: Math.round(a.y / 2) }
  }
  adopt(c, null, 0)
  router.replace({ query: {} })
}

function adopt(c: Chain, id: string | null, rev: number, keepDesign = false) {
  draft.value = JSON.parse(JSON.stringify(c)) as Chain
  openId.value = id
  openRev.value = rev
  baseline.value = JSON.stringify(draft.value)
  selected.value = draft.value.stages.find((s) => s.role === 'features')?.id ?? draft.value.stages[0]?.id ?? null
  saveError.value = null
  tab.value = 'stages'
  if (!keepDesign) {
    resetDesign()
    resetLaser()
    void restoreDesign(draft.value)
    void restoreLaser(draft.value)
  }
}

function open(s: SavedChain, keepDesign = false) {
  const { id, rev, ...rest } = s
  const { created: _c, updated: _u, ...chain } = rest
  void _c
  void _u
  adopt(chain as Chain, id, rev, keepDesign)
  router.replace({ query: { id } })
}

function closeChain() {
  draft.value = null
  openId.value = null
  router.replace({ query: {} })
}

/** The design file goes into the model library before the chain says it is there (a chain must never name a file that isn't) */
async function keepDesignFile() {
  const todo = [
    { f: pendingFile.value, path: designPath.value, done: () => (pendingFile.value = null) },
    { f: laserPending.value, path: laserPath.value, done: () => (laserPending.value = null) },
  ].filter((t) => t.f && t.path)
  if (!todo.length) return
  const portal = tm.client()
  try {
    await portal.libraryFolder('', DESIGN_FOLDER)
  } catch {
    /* it is already there */
  }
  for (const t of todo) {
    await portal.libraryUpload(DESIGN_FOLDER, new File([t.f!], t.path!.slice(t.path!.lastIndexOf('/') + 1)), 'replace')
    t.done()
  }
}

async function save() {
  if (!draft.value) return
  saving.value = true
  saveError.value = null
  try {
    await keepDesignFile()
    const s = await chains.save(openId.value, draft.value, openRev.value)
    open(s, true)
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!openId.value) return
  try {
    await chains.remove(openId.value)
    askDelete.value = false
    closeChain()
  } catch (e) {
    saveError.value = (e as Error).message
    askDelete.value = false
  }
}

/** One print head and one laser per chain in this build: changing a stage's tool changes every stage of its kind */
function setTool(s: Stage, name: string) {
  for (const x of draft.value!.stages) if (x.kind === s.kind) x.tool = name
}

const sheet = computed(() => draft.value?.sheet ?? null)
function setSheet(k: 'width' | 'depth' | 'x' | 'y', v: number | null) {
  if (!draft.value?.sheet || v == null) return
  draft.value.sheet = { ...draft.value.sheet, [k]: v }
}
const thickness = computed({
  get: () => draft.value?.thickness ?? null,
  set: (v: number | null) => {
    if (draft.value) draft.value.thickness = v
  },
})

onMounted(async () => {
  await chains.load()
  const id = typeof route.query.id === 'string' ? route.query.id : null
  const hit = id ? chains.list.find((c) => c.id === id) : null
  if (hit) open(hit)
})
</script>

<template>
  <main class="view">
    <header class="vhead">
      <div class="title">
        <p class="crumb"><RouterLink to="/setup">Job setup</RouterLink> › Chain</p>
        <template v-if="draft">
          <h1>{{ draft.name || 'Untitled chain' }}</h1>
          <p class="sub">
            {{ PRESETS.find((p) => p.id === draft!.preset)?.label }} · {{ jobsOf(steps).length }} job{{ jobsOf(steps).length === 1 ? '' : 's' }}, {{ swapsOf(steps) }} tool swap{{ swapsOf(steps) === 1 ? '' : 's' }}
            <span v-if="!openId" class="dirty">Not saved yet</span>
            <span v-else-if="dirty" class="dirty">Unsaved changes</span>
          </p>
        </template>
        <template v-else>
          <h1>Chain</h1>
          <p class="sub">Several tools on one placement: print, place material, laser. Studio works out the pauses and swaps.</p>
        </template>
      </div>
      <div v-if="draft" class="vact">
        <RsButton variant="quiet" @click="closeChain">Close</RsButton>
        <RsButton v-if="openId" variant="danger-outline" @click="askDelete = true">Delete</RsButton>
        <RsButton variant="primary" :disabled="saving || (!!openId && !dirty)" @click="save">{{ saving ? 'Saving…' : openId ? 'Save changes' : 'Save chain' }}</RsButton>
      </div>
    </header>

    <p v-if="saveError" class="banner" role="alert">{{ saveError }}</p>

    <!-- nothing open -->
    <section v-if="!draft" class="start">
      <p v-if="chains.loaded && !chains.supported" class="banner" role="status">This Rhino’s Tool Manager is older than 1.9.52, so it can’t keep chains yet. Update it from Settings › Software.</p>
      <p v-else-if="chains.error" class="banner" role="alert">{{ chains.error }}</p>
      <h2 class="section">Start a chain</h2>
      <div class="presets">
        <button v-for="p in PRESETS" :key="p.id" type="button" class="preset" @click="startNew(p.id)">
          <span class="pt">{{ p.label }}</span>
          <span class="pb">{{ p.blurb }}</span>
        </button>
      </div>
      <p v-if="startError" class="banner" role="alert">{{ startError }}</p>
      <h2 class="section">Saved chains</h2>
      <p v-if="!chains.loaded" class="muted">Loading…</p>
      <p v-else-if="!chains.list.length" class="muted">None yet. A chain you save is kept on the Rhino, so any screen can open it.</p>
      <ul v-else class="saved">
        <li v-for="c in chains.list" :key="c.id">
          <button type="button" class="savedbtn" @click="open(c)">
            <span class="pt">{{ c.name }}</span>
            <span class="pb">{{ PRESETS.find((p) => p.id === c.preset)?.label }} · {{ c.stages.length }} stages</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- the builder -->
    <template v-else>
      <div class="tabs" role="tablist" aria-label="Show">
        <button type="button" role="tab" :aria-selected="tab === 'stages'" :class="{ on: tab === 'stages' }" @click="tab = 'stages'">Stages</button>
        <button type="button" role="tab" :aria-selected="tab === 'bed'" :class="{ on: tab === 'bed' }" @click="tab = 'bed'">Bed</button>
      </div>
      <div class="layout" :data-tab="tab">
        <section class="stages" aria-label="Stages">
          <div class="setup">
            <div class="fld namefld">
              <label for="chain-name">Name</label>
              <input id="chain-name" v-model="draft.name" maxlength="60" autocomplete="off" />
            </div>
            <template v-if="draft.stages.some((s) => s.role === 'place')">
              <ChainNum v-model="thickness" label="Sheet thickness" :min="SHEET_MIN" :max="SHEET_MAX" blank placeholder="measure it" />
              <template v-if="sheet">
                <ChainNum :model-value="sheet.width" label="Sheet width" :min="10" :max="600" @update:model-value="setSheet('width', $event)" />
                <ChainNum :model-value="sheet.depth" label="Sheet depth" :min="10" :max="600" @update:model-value="setSheet('depth', $event)" />
                <ChainNum :model-value="sheet.x" label="Centre X" :min="0" :max="700" @update:model-value="setSheet('x', $event)" />
                <ChainNum :model-value="sheet.y" label="Centre Y" :min="0" :max="700" @update:model-value="setSheet('y', $event)" />
              </template>
            </template>
          </div>

          <section class="design" aria-label="Design">
            <div class="dhead">
              <h2 class="section">Design</h2>
              <span v-if="designFile" class="muted dfile">{{ designFile }}</span>
              <label class="filebtn">
                <input type="file" class="visually-hidden" accept=".3mf,.stl,.obj" :disabled="loading" @change="pickDesign" />
                <span class="btn">{{ loading ? 'Reading…' : designFile ? 'Load another' : 'Load a 3D file' }}</span>
              </label>
              <RsButton v-if="designFile" variant="quiet" @click="clearDesign">Clear</RsButton>
            </div>
            <p v-if="designError" class="banner" role="alert">{{ designError }}</p>
            <p v-if="!bodies.length" class="muted">A 3MF, STL or OBJ. Each body in it gets a part to play: the sheet, a fixture, a feature. Studio keeps them where the file puts them, around the sheet’s centre, and saves the file with the chain.</p>
            <ul v-if="bodies.length" class="bodies">
              <li v-for="b in bodies" :key="b.id">
                <span class="bn">{{ b.name }}<small class="muted"> · {{ bodyTall(b) ?? '' }} mm tall</small></span>
                <select :value="b.role" :aria-label="`Part for ${b.name}`" @change="changeRole(b.id, ($event.target as HTMLSelectElement).value as BodyRole)">
                  <option v-for="r in rolesHere" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
                </select>
              </li>
              <li v-if="sheetBody" class="usesheet">
                <span class="muted">The sheet body is {{ sheetFrom(sheetBody).sheet.width }} × {{ sheetFrom(sheetBody).sheet.depth }} mm, {{ sheetFrom(sheetBody).thickness }} mm thick.</span>
                <RsButton @click="useAsSheet">Use as the sheet</RsButton>
              </li>
            </ul>
          </section>

          <section v-if="hasLaser" class="design" aria-label="Laser work">
            <div class="dhead">
              <h2 class="section">Laser work</h2>
              <span v-if="laserName" class="muted dfile">{{ laserName }}</span>
              <label class="filebtn">
                <input type="file" class="visually-hidden" accept=".svg,.dxf" :disabled="laserFinding" @change="pickLaser" />
                <span class="btn">{{ laserFinding ? 'Reading…' : laserName ? 'Load another' : 'Load a drawing' }}</span>
              </label>
              <RsButton v-if="laserName" variant="quiet" @click="clearLaser">Clear</RsButton>
            </div>
            <p v-if="laserError" class="banner" role="alert">{{ laserError }}</p>
            <p v-if="!laserName && !laserError" class="muted">An SVG or DXF drawing for the laser, placed at the sheet’s centre. Pick what to mark: a score or an engrave fill. Loops you don’t pick are not lasered.</p>
            <LaserOps v-if="draft.laser" v-model="laserOps" :settings="laserJob.laser" :loops="laserFound" :finding="laserFinding" :error="null" leave-rest @find="findLaserLoops" />
          </section>

          <template v-for="(st, i) in steps" :key="i">
            <div v-if="st.type === 'job'" class="job">
              <div class="jhead">
                <span class="jn">Job {{ jobIndex(st.job) }}</span>
                <span class="jfile muted">{{ st.job.kind === 'print' ? 'a print file' : `a ${st.job.kind} file` }}</span>
                <span class="jtool"><i class="tab" :style="{ '--c': toneVar(st.job.tool) }" />{{ st.job.tool }}</span>
              </div>
              <template v-for="id in st.job.stages" :key="id">
                <article class="card" :class="{ sel: selected === id }" tabindex="0" :aria-pressed="selected === id" @click="selected = id" @keydown.enter.prevent="selected = id" @keydown.space.prevent="selected = id">
                  <span class="n">{{ num(byId.get(id)!) }}</span>
                  <div class="cbody">
                    <h3>{{ byId.get(id)!.what }}</h3>
                    <p class="line">{{ stageLine(draft, byId.get(id)!) }}</p>
                    <label v-if="optionsFor(byId.get(id)!).length > 1" class="toolpick" @click.stop>
                      <span class="visually-hidden">Tool for {{ byId.get(id)!.what }}</span>
                      <select :value="byId.get(id)!.tool" @change="setTool(byId.get(id)!, ($event.target as HTMLSelectElement).value)">
                        <option v-for="t in optionsFor(byId.get(id)!)" :key="t" :value="t">{{ t }}</option>
                      </select>
                    </label>
                  </div>
                  <span v-if="pinnedReason(byId.get(id)!)" class="pin" :title="pinnedReason(byId.get(id)!)!">Pinned</span>
                </article>
                <div v-for="c in id === lastOf(st.job.stages) ? [] : chipsAfter(id, ['pause', 'resume'])" :key="c.kind" class="chip" :class="c.kind"><span class="dot" />{{ c.text }}</div>
              </template>
            </div>
            <article v-else-if="st.type === 'prompt'" class="card loose" :class="{ sel: selected === st.stage }" tabindex="0" @click="selected = st.stage" @keydown.enter.prevent="selected = st.stage">
              <span class="n">{{ num(byId.get(st.stage)!) }}</span>
              <div class="cbody"><h3>{{ byId.get(st.stage)!.what }}</h3><p class="line">{{ stageLine(draft, byId.get(st.stage)!) }}</p></div>
            </article>
            <template v-if="st.type === 'job'">
              <div v-for="c in chipsAfter(lastOf(st.job.stages), ['swap', 'end'])" :key="c.kind + c.after" class="chip between" :class="c.kind"><span class="dot" />{{ c.text }}</div>
            </template>
          </template>

          <ul class="checks" aria-label="Checks">
            <li v-for="c in checks" :key="c.id" :class="`lvl-${c.level}`">
              <span class="mark" aria-hidden="true">{{ c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕' }}</span>
              <span>
                <span class="visually-hidden">{{ c.level === 'ok' ? 'Pass:' : c.level === 'warn' ? 'Note:' : 'Problem:' }}</span>{{ c.label }}
                <small v-if="c.detail">{{ c.detail }}</small>
              </span>
            </li>
            <li v-if="blocked" class="note"><span class="mark ghost" aria-hidden="true">·</span><span>{{ blocked }} thing{{ blocked === 1 ? '' : 's' }} to fix before this chain can run.</span></li>
          </ul>
          <section class="design files" aria-label="Job files">
            <div class="dhead">
              <h2 class="section">Job files</h2>
              <RsButton variant="primary" :disabled="building || blocked > 0 || !bodies.length && !draft.laser" @click="buildFiles">{{ building ? 'Building…' : built ? 'Build again' : 'Build job files' }}</RsButton>
            </div>
            <p v-if="blocked > 0" class="muted">Fix the red items above first.</p>
            <p v-else-if="!built" class="muted">Slices the design and writes one file per job, checked like any Job setup file. Nothing is started: you run them from Control, one after the other.</p>
            <p v-if="buildError" class="banner" role="alert">{{ buildError }}</p>
            <p v-if="built?.some((f) => f.lifts)" class="banner" role="alert">
              <b>Travel lifts are not proven on the machine.</b> The laser file lifts the head over the printed features, which a laser file has never done. Don’t run it on a real job until machine check CH14 has passed. Download or send it only for that check.
            </p>
            <ul v-if="built" class="bodies filelist">
              <li v-for="f in built" :key="f.file" :class="{ bad: !!f.problem }">
                <span class="bn"><b>{{ f.file }}</b><small class="muted"> · {{ f.tool }}</small>
                  <small v-if="f.problem" class="prob">{{ f.problem }}</small>
                  <small v-else class="muted">Checked: passes. {{ f.lifts ? `${f.lifts} travel lift${f.lifts === 1 ? '' : 's'}: waits for CH14. ` : '' }}{{ sentFiles[f.file] ? `On the Rhino as ${sentFiles[f.file]}.` : '' }}</small>
                </span>
                <span class="fileact">
                  <RsButton :disabled="!f.text || !!f.problem" @click="downloadFile(f)">Download</RsButton>
                  <RsButton :disabled="!f.text || !!f.problem || !machine.online || sending === f.file" @click="sendFile(f)">{{ sending === f.file ? 'Sending…' : 'Send to the Rhino' }}</RsButton>
                </span>
              </li>
            </ul>
            <p v-if="sendError" class="banner" role="alert">{{ sendError }}</p>
            <p v-if="built && openId && !dirty" class="row-run"><RouterLink class="runlink" :to="{ path: '/wizards/chain-run', query: { id: openId } }">Run this chain</RouterLink><span class="muted"> Step by step; every start, swap and resume asks you first.</span></p>
            <p v-else-if="built" class="muted">Save the chain to run it.</p>
          </section>
        </section>

        <section class="bedp" aria-label="Bed">
          <header class="phead">
            <h2>Bed · {{ selectedName }}</h2>
            <span class="seg" role="group" aria-label="Bed view">
              <button type="button" :class="{ on: !zoom }" :aria-pressed="!zoom" @click="zoom = false">Whole bed</button>
              <button type="button" :class="{ on: zoom }" :aria-pressed="zoom" :disabled="!sheet && !bodies.length" @click="zoom = true">Zoom to part</button>
            </span>
          </header>
          <ChainBed :bed="prep.machineInfo.workArea" :keep-out="prep.machineInfo.keepOut" :prime="prep.machineInfo.prime" :sheet="sheet" :sheet-shown="sheetShown" :zoom="zoom" :sheet-bad="sheetBad" :bodies="placed" :stage-role="stageRole" :marks="laserPlaced ?? undefined" />
          <ul class="legend">
            <li v-if="sheet"><i class="l sheetl" />Sheet{{ draft.thickness ? `, ${draft.thickness} mm` : '' }}</li>
            <li><i class="l keepl" />Keep clear</li>
          </ul>
          <p class="note2">{{ bedNote }}</p>
        </section>
      </div>
    </template>

    <RsDialog :open="askDelete" title="Delete this chain?" @close="askDelete = false" @submit="remove">
      <p>“{{ draft?.name }}” is removed from the Rhino. Job files already made are not touched.</p>
      <template #actions>
        <RsButton variant="danger" type="submit">Delete chain</RsButton>
        <RsButton variant="quiet" @click="askDelete = false">Keep it</RsButton>
      </template>
    </RsDialog>
  </main>
</template>

<style scoped>
.view { width: 100%; max-width: 1360px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--rs-gap); }
.vhead { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--rs-space-4); flex-wrap: wrap; }
.crumb { margin: 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.crumb a { color: inherit; }
h1 { margin: 2px 0 0; font-size: var(--rs-text-xl); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); line-height: 1.15; }
.sub { margin: 4px 0 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); display: flex; gap: var(--rs-space-3); flex-wrap: wrap; align-items: center; }
.dirty { padding: 1px 8px; border: 1px dashed var(--rs-line-strong); border-radius: var(--rs-radius-pill); font-size: var(--rs-text-xs); color: var(--rs-text-strong); }
.vact { display: flex; gap: var(--rs-space-2); align-items: center; flex-wrap: wrap; }
.banner { margin: 0; padding: 8px 12px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface-2); color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.banner[role='alert'] { border: 1.5px solid var(--rs-danger); color: var(--rs-danger); background: transparent; }
.muted { color: var(--rs-text-muted); }
.section { margin: var(--rs-space-3) 0 var(--rs-space-2); font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.start { display: flex; flex-direction: column; gap: var(--rs-space-2); }
.presets { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--rs-gap); }
.preset, .savedbtn { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left; width: 100%; padding: var(--rs-space-4); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text); font: inherit; cursor: pointer; }
.preset:hover, .savedbtn:hover { border-color: var(--rs-ink); }
.preset:focus-visible, .savedbtn:focus-visible { outline: none; box-shadow: var(--rs-focus); }
.pt { font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.pb { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.saved { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--rs-space-2); }

.layout { display: grid; grid-template-columns: minmax(360px, 440px) minmax(0, 1fr); gap: var(--rs-gap); align-items: start; }
.stages, .bedp { background: var(--rs-surface); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); padding: var(--rs-space-4); min-width: 0; }
.namefld { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 2px; }
.namefld label { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.namefld input { width: 100%; min-height: 36px; padding: 0 10px; border-radius: var(--rs-radius-sm); border: 1px solid var(--rs-line-strong); font-size: var(--rs-text-sm); }
.setup { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: var(--rs-space-2); padding-bottom: var(--rs-space-4); margin-bottom: var(--rs-space-4); border-bottom: 2px dotted var(--rs-line); }
.job { border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); padding: var(--rs-space-2); display: flex; flex-direction: column; }
.jhead { display: flex; align-items: center; gap: var(--rs-space-2); padding: 2px 4px var(--rs-space-2); font-size: var(--rs-text-xs); flex-wrap: wrap; }
.jn { font-weight: var(--rs-weight-bold); color: var(--rs-text-strong); text-transform: uppercase; letter-spacing: 0.06em; }
.jfile { flex: 1 1 100px; min-width: 0; }
.jtool { display: inline-flex; align-items: center; gap: 6px; font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.tab { width: 4px; height: 14px; border-radius: 2px; background: var(--c); display: inline-block; }
.card { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: var(--rs-space-3); align-items: center; min-height: 64px; padding: 10px var(--rs-space-3); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); cursor: pointer; }
.card.loose { margin: var(--rs-space-2) 0; }
.card:hover { border-color: var(--rs-line-strong); }
.card:focus-visible { outline: none; box-shadow: var(--rs-focus); }
.card.sel { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.n { font-family: var(--rs-font-code); font-size: var(--rs-text-sm); opacity: 0.8; }
.card h3 { margin: 0; font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); color: inherit; }
.card:not(.sel) h3 { color: var(--rs-text-strong); }
.line { margin: 2px 0 0; font-size: var(--rs-text-xs); opacity: 0.78; line-height: 1.35; }
.toolpick select { margin-top: 6px; min-height: 30px; max-width: 100%; border-radius: var(--rs-radius-sm); border: 1px solid var(--rs-line-strong); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-xs); padding: 0 8px; }
.pin { font-size: 11px; color: var(--rs-text-muted); border: 1px dashed var(--rs-line-strong); border-radius: var(--rs-radius-pill); padding: 1px 8px; white-space: nowrap; }
.card.sel .pin { color: var(--rs-on-ink); border-color: currentColor; opacity: 0.8; }
.chip { display: flex; align-items: center; gap: var(--rs-space-2); margin: 0 0 0 14px; padding: 6px 0 6px 18px; border-left: 2px dotted var(--rs-line-strong); font-size: var(--rs-text-xs); color: var(--rs-text-muted); min-height: 28px; }
.chip .dot { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--rs-text-muted); margin-left: -24px; background: var(--rs-surface); flex: none; }
.chip.between { margin: var(--rs-space-2) 0 var(--rs-space-2) 14px; color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.chip.swap .dot { background: var(--rs-ink); border-color: var(--rs-ink); }
.checks { list-style: none; margin: var(--rs-space-4) 0 0; padding: var(--rs-space-4) 0 0; border-top: 2px dotted var(--rs-line); display: flex; flex-direction: column; gap: 6px; }
.checks li { display: flex; gap: 10px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.checks small { display: block; color: var(--rs-text-muted); font-size: var(--rs-text-xs); }
.mark { flex: none; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: var(--rs-weight-bold); border: 1px solid var(--rs-line-strong); }
.lvl-ok .mark { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.lvl-warn .mark { border-width: 2px; border-color: var(--rs-text-strong); }
.lvl-error .mark { background: var(--rs-danger); color: var(--rs-on-danger); border-color: var(--rs-danger); }
.lvl-error small { color: var(--rs-danger); }
.checks .note { color: var(--rs-text-muted); }
.ghost { border-style: dotted; }
.phead { display: flex; justify-content: space-between; align-items: center; gap: var(--rs-space-3); flex-wrap: wrap; min-height: 36px; padding-bottom: var(--rs-space-3); margin-bottom: var(--rs-space-3); border-bottom: 2px dotted var(--rs-line); }
h2 { margin: 0; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.seg { display: inline-flex; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; }
.seg button { font: inherit; font-size: var(--rs-text-sm); min-height: 32px; padding: 0 14px; border: 0; background: transparent; color: var(--rs-text-strong); cursor: pointer; }
.seg button:disabled { opacity: 0.4; cursor: default; }
.seg .on { background: var(--rs-ink); color: var(--rs-on-ink); }
.seg button:focus-visible { outline: none; box-shadow: inset var(--rs-focus); }
.legend { list-style: none; margin: var(--rs-space-3) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.legend li { display: flex; align-items: center; gap: 6px; }
.l { width: 14px; height: 10px; display: inline-block; border-radius: 2px; }
.design { display: grid; gap: 8px; padding: 12px 0; border-top: 1px dotted var(--rs-line-strong); }
.dhead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dhead .section { margin: 0; flex: 1 1 auto; }
.dfile { font-family: var(--rs-font-code); font-size: 12px; overflow-wrap: anywhere; }
.filebtn .btn { display: inline-block; padding: 6px 14px; border: 1px solid var(--rs-ink); border-radius: var(--rs-radius-md); cursor: pointer; }
.filebtn:focus-within .btn { outline: 2px solid var(--rs-ink); outline-offset: 2px; }
.bodies { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.bodies li { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; min-width: 0; }
.bn { min-width: 0; overflow-wrap: anywhere; }
.bodies select { background: var(--rs-field-bg); color: var(--rs-field-text); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); padding: 4px 8px; }
.runlink { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.filelist .bn { display: grid; gap: 2px; }
.prob { color: var(--rs-text-strong); border-left: 3px solid var(--rs-danger); padding-left: 8px; }
.fileact { display: flex; gap: 8px; flex-wrap: wrap; }
.sheetl { border: 1.6px solid var(--rs-ink); }
.keepl { border: 1px dashed var(--rs-line-strong); }
.note2 { margin: var(--rs-space-3) 0 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.tabs { display: none; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; }
.tabs button { flex: 1; font: inherit; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); min-height: 44px; border: 0; background: transparent; color: var(--rs-text-strong); cursor: pointer; }
.tabs button.on { background: var(--rs-ink); color: var(--rs-on-ink); }
@media (max-width: 1060px) {
  .layout { grid-template-columns: 1fr; }
  .tabs { display: flex; }
  .layout[data-tab='stages'] .bedp, .layout[data-tab='bed'] .stages { display: none; }
}
@media (max-width: 720px) { .pin { display: none; } .vact { width: 100%; } }
</style>
