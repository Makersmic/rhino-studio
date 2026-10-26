/**
 * Prepare: one part, one toolhead, one job file at a time.
 *
 *   load a model  ->  pick the toolhead and material  ->  place it  ->
 *   Prepare  ->  checks  ->  Send to the Pi
 *
 * FDM slices with PrusaSlicer on the Rhino (through the Portal, every PrusaSlicer
 * option; src/slicer/prusa) or Kiri:Moto in this browser; laser, knife and CNC
 * use Kiri:Moto.
 *
 * A ready-made G-code file (sliced in Orca, LightBurn, Fusion...) takes the same
 * steps without the slicing: Studio reads which toolhead it's for, you confirm
 * it, and it is checked and drawn on the bed before you send it.
 *
 * Sending only uploads the file. Starting it stays on the Files screen, where
 * the toolhead check and the setup wizards (laser, CNC, knife) run, exactly as
 * for any other file. Any setting change throws the prepared file away, so
 * what is sent is always what the screen shows.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useMachineStore } from './machine'
import { BUILT_IN_TOOLHEADS, lookFor, type ToolheadLook } from '@/toolheads/registry'
import { applyMaterial, materialsFor, newJob, normalizeJob, processFor, type Material } from '@/slicer/profiles'
import { kiriJob } from '@/slicer/kiriSettings'
import { rhinoFile, type RhinoFile } from '@/slicer/rhinoFile'
import { checkFile, blocking, type Check, type FileStats } from '@/slicer/check'
import { FLAT_TYPES, extOf, merge, partInfo, transform } from '@/slicer/model'
import { DEFAULT_MACHINE, type MachineInfo, type PartInfo, type PrepareJob, type Process } from '@/slicer/types'
import { loadModelFile, runKiri, kiriVersion, type Phase } from '@/slicer/engine'
import { GCODE_TYPES, readJobFile, withToolhead, type JobFileInfo } from '@/slicer/gcodeFile'
import { buildIni, loadSchema, valueOf, type RhinoCtx, type Schema } from '@/slicer/prusa/config'
import { runPrusa, type SlicerState } from '@/slicer/prusa/portal'
import { useMaintenanceStore } from './maintenance'
import { useSliceProfilesStore } from './sliceProfiles'
import {
  applyProfile, builtinId, defaultsFor, diffSettings, engineOf, isBuiltin, jobSettings, profileStatus, setJobSettings,
  type AnySettings, type SavedJob,
} from '@/slicer/sliceProfiles'

/** Flat drawings (SVG, DXF) are outlines: only cut processes can use them. */
export function suits(process: Process, flat: boolean): boolean {
  return flat ? process === 'laser' || process === 'dragknife' : true
}

/** Safe for FILE= on the setup wizards and for Moonraker: letters, digits, - _ . only */
export function safeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'job'
  return `${base}${dot > 0 ? name.slice(dot).toLowerCase() : '.gcode'}`
}

export interface PrepTool {
  name: string
  slot: number | null
  type: string
  process: Process
  look: ToolheadLook
}

export interface PrepResult {
  file: RhinoFile
  checks: Check[]
  stats: FileStats
  kiri: string
  /** Kiri's own time estimate (FDM), seconds */
  kiriSeconds: number | null
  /** Kiri's filament estimate (FDM), mm */
  kiriFilament: number | null
}

// Phase 1: saved settings live on the Rhino (stores/sliceProfiles.ts), not in this browser.
// The store below keeps only this session's memory of each tool's last settings.
const STUDIO_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
/** Plain copy of a job (reactive proxies can't go through structuredClone) */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

export const usePrepareStore = defineStore('prepare', () => {
  const machine = useMachineStore()

  // ---- the machine, as Klipper describes it (built-in numbers until connected)
  const machineInfo = computed<MachineInfo>(() => {
    const st = machine.status
    const lim = machine.limits
    const vars = st['gcode_macro VARIABLES'] as Record<string, unknown> | undefined
    const pos = st['gcode_macro RHINO_POSITIONS'] as Record<string, unknown> | undefined
    const tmin = (lim.min ?? DEFAULT_MACHINE.travelMin) as number[]
    const tmax = (lim.max ?? DEFAULT_MACHINE.travelMax) as number[]
    const travelMin: [number, number, number] = [num(tmin[0], 0), num(tmin[1], 0), num(tmin[2], -10)]
    const travelMax: [number, number, number] = [num(tmax[0], 576), num(tmax[1], 406), num(tmax[2], 295)]
    return {
      travelMin,
      travelMax,
      workArea: { x: Math.min(DEFAULT_MACHINE.workArea.x, travelMax[0]), y: Math.min(DEFAULT_MACHINE.workArea.y, travelMax[1]) },
      laserSMax: num(vars?.laser_s_max, DEFAULT_MACHINE.laserSMax),
      keepOut: DEFAULT_MACHINE.keepOut,
      prime: pos ? { x: num(pos.prime_x, 5), y: num(pos.prime_y, 10), length: num(pos.prime_length, 120) } : machine.online ? null : DEFAULT_MACHINE.prime,
    }
  })

  /** Every toolhead Studio can prepare a job for: Klipper's list, or the built-in five offline. */
  const tools = computed<PrepTool[]>(() => {
    const src = machine.knownTools.length
      ? machine.knownTools.map((t) => ({ name: t.name, slot: t.slot, type: t.type ?? '' }))
      : BUILT_IN_TOOLHEADS.map((t) => ({ name: t.name, slot: t.defaultSlot ?? null, type: String(t.type) }))
    return src.flatMap((t) => {
      const p = processFor(t.type)
      return p ? [{ ...t, process: p, look: lookFor(t.name, t.type as never) }] : []
    })
  })

  const toolheadsTable = computed<Record<string, unknown> | null>(() => {
    const st = machine.status
    const a = (st['gcode_macro VARIABLES'] as Record<string, unknown> | undefined)?.toolheads
    const b = (st['gcode_macro CUSTOM_TOOLS'] as Record<string, unknown> | undefined)?.toolheads
    if (!a && !b) return null
    return { ...((a as object) ?? {}), ...((b as object) ?? {}) }
  })

  // ---- the part
  const fileName = ref<string | null>(null)
  const raw = shallowRef<Float32Array | null>(null)
  const flat = ref(false)
  const loading = ref(false)
  const loadError = ref<string | null>(null)

  // ---- the flow: File -> Process -> Set up & send (like an online manufacturing quote)
  /** the process (toolhead) was confirmed for the loaded file */
  const confirmed = ref(false)
  /** a tool card was clicked before any file: use it straight away if the file suits it */
  const preset = ref<string | null>(null)
  /** a ready-made G-code file instead of a model */
  const uploaded = shallowRef<{ name: string; text: string; info: JobFileInfo } | null>(null)
  const step = computed<'file' | 'process' | 'setup'>(() => (!raw.value && !uploaded.value ? 'file' : confirmed.value ? 'setup' : 'process'))

  // ---- the job
  const profilesStore = useSliceProfilesStore()
  /** this session only: each tool's settings as last left (the Rhino keeps the durable copy) */
  const saved: Record<string, PrepareJob> = {}
  const job = ref<PrepareJob | null>(null)
  const materialsOf = (tool: string) => materialsFor(tool, toolheadsTable.value).list
  const materials = computed<{ list: Material[]; live: boolean }>(() => (job.value ? materialsFor(job.value.toolhead, toolheadsTable.value) : { list: [], live: false }))

  /** The settings a job's profile gives, before its own changes: defaults filled in under the profile's */
  function baseSettings(j: PrepareJob): AnySettings {
    const engine = engineOf(j)
    const d = defaultsFor(j.process, engine)
    const p = isBuiltin(j.profileId) ? null : profilesStore.byId(j.profileId)
    if (!p?.settings) return d
    return engine === 'prusa' ? { ...p.settings } : applyProfile(d, p.settings, {})
  }

  /** A job saved on the Rhino (for this file, else this tool's last one) onto j */
  function fromRhino(j: PrepareJob, keys: string[]): boolean {
    const s = keys.map((k) => profilesStore.jobs[k]).find((x) => x && x.process === j.process)
    if (!s) return false
    if (j.process === 'fdm') j.engine = s.engine
    if (s.material && materialsOf(j.toolhead).some((m) => m.key === s.material)) j.material = s.material
    const known = s.profileId && (isBuiltin(s.profileId) || profilesStore.byId(s.profileId))
    j.profileId = known ? s.profileId : builtinId(j.process, engineOf(j))
    j.profileRev = known ? s.profileRev : null
    setJobSettings(j, { ...baseSettings(j), ...s.overrides })
    return true
  }

  function pickTool(name: string) {
    const t = tools.value.find((x) => x.name === name)
    if (!t) return
    const mats = materialsFor(t.name, toolheadsTable.value).list
    const prev = saved[t.name]
    let j: PrepareJob
    if (prev && prev.schema === 1 && prev.process === t.process) {
      j = normalizeJob(clone(prev))
      if (!mats.some((m) => m.key === j.material) && mats[0]) applyMaterial(j, mats[0])
    } else {
      j = newJob(t.name, t.process, mats)
      j.profileId = builtinId(t.process, engineOf(j))
      j.profileRev = null
      fromRhino(j, [...(fileName.value ? [fileName.value] : []), `tool/${t.name}`])
    }
    if (job.value) j.placement = { ...job.value.placement }
    if (t.process === 'laser' || t.process === 'dragknife') {
      j.laser.cutHeight = j.knife.cutHeight = flat.value ? 1 : j.laser.cutHeight
    }
    job.value = j
  }

  function pickMaterial(key: string) {
    const m = materials.value.list.find((x) => x.key === key)
    if (job.value && m) applyMaterial(job.value, m)
  }

  // Start on the mounted tool, else the first one
  watch(
    [() => machine.mountedName, tools],
    () => {
      if (job.value && tools.value.some((t) => t.name === job.value!.toolhead)) return
      const first = tools.value.find((t) => t.name === machine.mountedName) ?? tools.value[0]
      if (first) pickTool(first.name)
    },
    { immediate: true },
  )

  // The Rhino's profiles arrive after the first tool is picked: set it up again from them, unless already edited
  void profilesStore.load()
  watch(
    () => profilesStore.online,
    (on) => {
      const j = job.value
      if (on && j && !saved[j.toolhead] && isBuiltin(j.profileId) && !Object.keys(overrides.value).length) {
        fromRhino(j, [...(fileName.value ? [fileName.value] : []), `tool/${j.toolhead}`])
      }
    },
  )

  // Switching engine (PrusaSlicer / Kiri) switches profiles too: a profile is one engine's settings
  watch(
    () => [job.value?.toolhead, job.value?.engine] as const,
    ([tool, eng], [oldTool, oldEng]) => {
      const j = job.value
      if (j && tool === oldTool && eng !== oldEng) {
        j.profileId = builtinId(j.process, engineOf(j))
        j.profileRev = null
      }
    },
  )

  // ---- profiles: which one, what changed, save
  const overrides = computed<AnySettings>(() => (job.value ? diffSettings(baseSettings(job.value), jobSettings(job.value)) : {}))
  const profile = computed(() => (job.value && !isBuiltin(job.value.profileId) ? profilesStore.byId(job.value.profileId) : null))
  const profileState = computed(() =>
    job.value
      ? profileStatus({
          online: profilesStore.online,
          builtin: !profile.value,
          overrides: Object.keys(overrides.value).length,
          jobRev: job.value.profileRev ?? null,
          profileRev: profile.value?.rev ?? null,
        })
      : null,
  )

  /** Use a profile: its settings replace the current ones (Reset does the same for the one in use) */
  function useProfile(id: string) {
    const j = job.value
    if (!j) return
    j.profileId = id
    j.profileRev = isBuiltin(id) ? null : profilesStore.byId(id)?.rev ?? null
    setJobSettings(j, baseSettings(j))
  }
  const resetToProfile = () => job.value && useProfile(job.value.profileId ?? builtinId(job.value.process, engineOf(job.value)))
  /** Take a newer revision of the profile, keeping this job's own changes on top */
  function takeNewRevision() {
    const j = job.value
    if (!j || !profile.value) return
    const ov = overrides.value
    j.profileRev = profile.value.rev
    setJobSettings(j, { ...baseSettings(j), ...ov })
  }
  async function saveToProfile() {
    const j = job.value
    const p = profile.value
    if (!j || !p) return
    const next = await profilesStore.save(p.id, { name: p.name, engine: p.engine, process: p.process, toolhead: p.toolhead, material: p.material, notes: p.notes, settings: jobSettings(j) }, j.profileRev ?? p.rev)
    j.profileRev = next.rev
  }
  async function saveAsNew(name: string, forThisTool: boolean) {
    const j = job.value
    if (!j) return
    const p = await profilesStore.create({
      name, engine: engineOf(j), process: j.process, toolhead: forThisTool ? j.toolhead : null, material: j.material || null, notes: '', settings: jobSettings(j),
    })
    j.profileId = p.id
    j.profileRev = p.rev
  }

  // Remember settings: this session per tool, and on the Rhino per tool and per file
  watch(
    job,
    (j) => {
      if (!j) return
      saved[j.toolhead] = clone(j)
      const s: SavedJob = {
        profileId: j.profileId ?? builtinId(j.process, engineOf(j)),
        profileRev: j.profileRev ?? null,
        process: j.process,
        engine: engineOf(j),
        toolhead: j.toolhead,
        material: j.material || null,
        overrides: overrides.value,
        placement: { ...j.placement },
      }
      profilesStore.saveJobSoon(`tool/${j.toolhead}`, s)
      if (raw.value && fileName.value) profilesStore.saveJobSoon(fileName.value, s)
    },
    { deep: true },
  )

  const vertices = computed(() => (raw.value && job.value ? transform(raw.value, job.value.placement.rotate, job.value.placement.scale) : null))
  const part = computed<PartInfo | null>(() => (vertices.value && fileName.value ? partInfo(fileName.value, vertices.value, flat.value) : null))

  async function load(file: File) {
    loading.value = true
    loadError.value = null
    try {
      const ext = extOf(file.name)
      if ((GCODE_TYPES as readonly string[]).includes(ext)) {
        const text = await file.text()
        const info = readJobFile(text)
        if (!info.bounds) throw new Error('No moves found in this G-code.')
        raw.value = null
        fileName.value = file.name
        uploaded.value = { name: file.name, text, info }
        confirmed.value = false
        // Started from a tool card: use it, unless the file says it's for another tool
        const want = preset.value ? tools.value.find((t) => t.name === preset.value) : null
        if (want && (!info.toolhead || info.toolhead === want.name)) confirmProcess(want.name)
        else if (info.toolhead && tools.value.some((t) => t.name === info.toolhead)) pickTool(info.toolhead)
        preset.value = null
        return
      }
      const parts = await loadModelFile(file)
      const verts = merge(parts.map((p) => p.vertices).filter((v) => v && v.length >= 9))
      if (verts.length < 9) throw new Error('No triangles in this file.')
      raw.value = verts
      uploaded.value = null
      fileName.value = file.name
      flat.value = FLAT_TYPES.has(ext)
      confirmed.value = false
      // Started from a tool card and the file suits that tool: straight to set up
      const want = preset.value ? tools.value.find((t) => t.name === preset.value) : null
      if (want && suits(want.process, flat.value)) {
        pickTool(want.name)
        confirmed.value = true
      }
      preset.value = null
      if (job.value) {
        job.value.placement = { x: machineInfo.value.workArea.x / 2, y: machineInfo.value.workArea.y / 2, rotate: 0, scale: 1 }
        // a flat drawing (SVG/DXF) is extruded 5 mm by the loader: cut it near the bottom
        if (flat.value) job.value.laser.cutHeight = job.value.knife.cutHeight = 1
      }
    } catch (e) {
      loadError.value = `Couldn't read ${file.name}: ${(e as Error).message ?? e}`
    } finally {
      loading.value = false
    }
  }

  function clearPart() {
    raw.value = null
    uploaded.value = null
    fileName.value = null
    modelResult.value = null
    confirmed.value = false
    preset.value = null
  }

  /** Tool card: remember the tool, then the view opens the file picker */
  function startWith(tool: string) {
    preset.value = tool
    if (raw.value || uploaded.value) confirmProcess(tool)
  }

  function confirmProcess(tool: string) {
    pickTool(tool)
    confirmed.value = true
  }

  function changeProcess() {
    confirmed.value = false
  }

  /**
   * What the Rhino could do with the loaded file, best first:
   * 3D models print (or mill); flat drawings laser or knife cut. A 3D model can
   * also be laser or knife cut along its outline at a height; a flat drawing
   * can't be printed or milled (it's only an outline).
   */
  const options = computed(() => {
    const mounted = machine.mountedName
    const up = uploaded.value
    if (up) {
      // A finished file is for one toolhead: the one it names, or (if it doesn't say) the one you pick
      const named = up.info.toolhead ? tools.value.filter((t) => t.name === up.info.toolhead) : []
      const list = (named.length ? named : tools.value).map((t) => ({ tool: t, recommended: named.length > 0, mounted: t.name === mounted }))
      return list.sort((a, b) => (a.mounted ? 0 : 1) - (b.mounted ? 0 : 1))
    }
    if (!raw.value) return []
    const list = tools.value
      .filter((t) => suits(t.process, flat.value))
      .map((t) => ({ tool: t, recommended: flat.value ? true : t.process === 'fdm' || t.process === 'cnc', mounted: t.name === mounted }))
    const rank = (o: (typeof list)[number]) => (o.recommended ? 0 : 2) + (o.mounted ? 0 : 1)
    return list.sort((a, b) => rank(a) - rank(b))
  })

  function centre() {
    if (!job.value) return
    job.value.placement.x = machineInfo.value.workArea.x / 2
    job.value.placement.y = machineInfo.value.workArea.y / 2
  }

  // ---- prepare (slice) and send
  const phase = ref<Phase | null>(null)
  const progress = ref<number | null>(null)
  const modelResult = shallowRef<PrepResult | null>(null)
  /** an uploaded file is checked as soon as its toolhead is confirmed (nothing to slice) */
  const uploadResult = computed<PrepResult | null>(() => {
    const up = uploaded.value
    if (!up || !confirmed.value || !job.value) return null
    const { checks, stats } = checkFile(up.text, job.value, null, machineInfo.value, { upload: true })
    const b = up.info.bounds!
    return {
      file: { text: withToolhead(up.text, job.value.toolhead), name: safeName(up.name), bounds: { min: [b.min[0], b.min[1], 0], max: [b.max[0], b.max[1], 0] } },
      checks,
      stats,
      kiri: up.info.madeBy ?? 'another program',
      kiriSeconds: up.info.seconds,
      kiriFilament: up.info.filamentMm,
    }
  })
  const result = computed<PrepResult | null>(() => (uploaded.value ? uploadResult.value : modelResult.value))
  const prepError = ref<string | null>(null)
  const sending = ref<number | null>(null)
  const sentPath = ref<string | null>(null)
  const sendError = ref<string | null>(null)
  let runId = 0

  // Anything changes: the prepared file no longer matches the screen
  watch(
    [job, raw],
    () => {
      if (phase.value) runId++ // a newer request wins; the running one is ignored when it finishes
      modelResult.value = null
      sentPath.value = null
      sendError.value = null
      phase.value = null
    },
    { deep: true },
  )

  const blocked = computed(() => (result.value ? blocking(result.value.checks) : []))

  // ---- PrusaSlicer on the Rhino ------------------------------------------------
  const schema = shallowRef<Schema | null>(null)
  const schemaError = ref<string | null>(null)
  const slicer = shallowRef<SlicerState | null>(null)
  const slicerError = ref<string | null>(null)
  let engineKeys: { version: string; keys: ReadonlySet<string> } | null = null

  async function ensureSchema() {
    if (schema.value) return schema.value
    try {
      schema.value = await loadSchema()
      return schema.value
    } catch (e) {
      schemaError.value = (e as Error).message
      throw e
    }
  }
  /** What the Portal says about the engine (installed, busy, refused right now). */
  async function refreshSlicer() {
    const p = useMaintenanceStore().portal()
    if (!p) return (slicerError.value = 'Rhino Portal not set up (Settings > Connection)')
    try {
      slicer.value = await p.slicerState()
      slicerError.value = null
    } catch (e) {
      const m = (e as Error).message
      slicer.value = null
      slicerError.value = /404|not found/i.test(m) ? 'PrusaSlicer on the Rhino needs Rhino Tool Manager 1.5.0 or later.' : m
    }
  }
  const rhinoCtx = computed<RhinoCtx | null>(() =>
    job.value
      ? {
          job: job.value,
          material: materials.value.list.find((x) => x.key === job.value!.material) ?? null,
          machine: machineInfo.value,
          hasExcludeObject: machine.objects.has('exclude_object'),
          hasArcs: machine.objects.has('gcode_arcs'),
        }
      : null,
  )
  watch(
    () => job.value?.process === 'fdm' && job.value.engine === 'prusa',
    (on) => {
      if (on) {
        void ensureSchema().catch(() => {})
        void refreshSlicer()
      }
    },
    { immediate: true },
  )

  async function prepare() {
    if (!job.value || !vertices.value || !part.value) return
    const id = ++runId
    const j = clone(job.value)
    const p = part.value
    const m = machineInfo.value
    prepError.value = null
    modelResult.value = null
    progress.value = null
    const onPhase = (ph: Phase, f?: number) => {
      if (id !== runId) return
      phase.value = ph
      progress.value = f ?? null
    }
    try {
      if (j.process === 'fdm' && j.engine === 'prusa') {
        const portal = useMaintenanceStore().portal()
        if (!portal) throw new Error('PrusaSlicer runs on the Rhino: set the Rhino Portal’s address in Settings > Connection.')
        const sch = await ensureSchema()
        await refreshSlicer()
        const st = slicer.value
        if (!st) throw new Error(slicerError.value ?? 'Can’t reach the Rhino Portal')
        if (!st.engine.installed) throw new Error('PrusaSlicer isn’t installed on the Rhino yet: Settings > Software > PrusaSlicer engine > Install.')
        if (st.refuse) throw new Error(st.refuse)
        if (!engineKeys || engineKeys.version !== st.engine.installed) engineKeys = { version: st.engine.installed, keys: new Set(await portal.slicerKeys()) }
        const ctx: RhinoCtx = { ...rhinoCtx.value!, job: j }
        const ini = buildIni(sch, ctx, engineKeys.keys)
        const out = await runPrusa(portal, vertices.value, ini, p.name, [j.placement.x, j.placement.y], onPhase, () => id === runId)
        if (id !== runId) return
        // CALCULATE_PA and the header read the layer height and speed the engine actually used
        j.fdm.layerHeight = Number(valueOf('layer_height', sch, ctx).value) || j.fdm.layerHeight
        j.fdm.speed = Number(valueOf('perimeter_speed', sch, ctx).value) || j.fdm.speed
        const file = rhinoFile(out.gcode, j, p, m, STUDIO_VERSION, 'PrusaSlicer')
        const { checks, stats } = checkFile(file.text, j, p, m)
        modelResult.value = { file, checks, stats, kiri: `PrusaSlicer ${st.engine.installed}${out.cached ? ' (from the cache)' : ''}`, kiriSeconds: out.seconds, kiriFilament: out.filamentMm }
        return
      }
      const kiri = await runKiri(vertices.value, kiriJob(j, p, m), onPhase)
      if (id !== runId) return
      const file = rhinoFile(kiri, j, p, m, STUDIO_VERSION)
      const { checks, stats } = checkFile(file.text, j, p, m)
      const t = /print time: (\d+)s/.exec(kiri)
      const fl = /filament used: ([\d.]+) mm/.exec(kiri)
      modelResult.value = { file, checks, stats, kiri: await kiriVersion(), kiriSeconds: t ? +t[1]! : null, kiriFilament: fl ? +fl[1]! : null }
    } catch (e) {
      if (id === runId) prepError.value = (e as Error).message ?? String(e)
    } finally {
      if (id === runId) {
        phase.value = null
        progress.value = null
      }
    }
  }

  async function send() {
    const r = result.value
    if (!r || blocked.value.length || !machine.online) return
    sending.value = 0
    sendError.value = null
    try {
      const f = new File([r.file.text], r.file.name, { type: 'text/plain' })
      sentPath.value = await machine.uploadFile(f, (x) => (sending.value = x))
    } catch (e) {
      sendError.value = (e as Error).message
    } finally {
      sending.value = null
    }
  }

  function download() {
    const r = result.value
    if (!r || blocked.value.length) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([r.file.text], { type: 'text/plain' }))
    a.download = r.file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }

  const tool = computed(() => tools.value.find((t) => t.name === job.value?.toolhead) ?? null)
  const fileKind = computed(() => (uploaded.value ? 'Ready-made job file (G-code)' : raw.value ? (flat.value ? '2D drawing' : '3D model') : null))

  return {
    overrides,
    profile,
    profileState,
    useProfile,
    resetToProfile,
    takeNewRevision,
    saveToProfile,
    saveAsNew,
    uploaded,
    step,
    confirmed,
    preset,
    options,
    fileKind,
    startWith,
    materialsOf,
    confirmProcess,
    changeProcess,
    machineInfo,
    tools,
    tool,
    job,
    materials,
    pickTool,
    pickMaterial,
    fileName,
    part,
    vertices,
    flat,
    loading,
    loadError,
    load,
    clearPart,
    centre,
    phase,
    progress,
    result,
    prepError,
    blocked,
    prepare,
    send,
    sending,
    sentPath,
    sendError,
    download,
    schema,
    schemaError,
    slicer,
    slicerError,
    refreshSlicer,
    ensureSchema,
    rhinoCtx,
  }
})
