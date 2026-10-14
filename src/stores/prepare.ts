/**
 * Prepare: one part, one toolhead, one job file at a time.
 *
 *   load a model  ->  pick the toolhead and material  ->  place it  ->
 *   Prepare (Kiri:Moto in this browser)  ->  checks  ->  Send to the Pi
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
import { applyMaterial, materialsFor, newJob, processFor, type Material } from '@/slicer/profiles'
import { kiriJob } from '@/slicer/kiriSettings'
import { rhinoFile, type RhinoFile } from '@/slicer/rhinoFile'
import { checkFile, blocking, type Check, type FileStats } from '@/slicer/check'
import { FLAT_TYPES, extOf, merge, partInfo, transform } from '@/slicer/model'
import { DEFAULT_MACHINE, type MachineInfo, type PartInfo, type PrepareJob, type Process } from '@/slicer/types'
import { loadModelFile, runKiri, kiriVersion, type Phase } from '@/slicer/engine'

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

const SAVE_KEY = 'rs.prepare.jobs'
const STUDIO_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

function loadSaved(): Record<string, PrepareJob> {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as Record<string, PrepareJob>
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

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

  // ---- the job
  const saved = loadSaved()
  const job = ref<PrepareJob | null>(null)
  const materials = computed<{ list: Material[]; live: boolean }>(() => (job.value ? materialsFor(job.value.toolhead, toolheadsTable.value) : { list: [], live: false }))

  function pickTool(name: string) {
    const t = tools.value.find((x) => x.name === name)
    if (!t) return
    const mats = materialsFor(t.name, toolheadsTable.value).list
    const prev = saved[t.name]
    let j: PrepareJob
    if (prev && prev.schema === 1 && prev.process === t.process) {
      j = clone(prev)
      if (!mats.some((m) => m.key === j.material) && mats[0]) applyMaterial(j, mats[0])
    } else j = newJob(t.name, t.process, mats)
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

  // Remember settings per tool on this device
  watch(
    job,
    (j) => {
      if (!j) return
      saved[j.toolhead] = clone(j)
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(saved))
      } catch {
        /* storage blocked: settings just aren't remembered */
      }
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
      const parts = await loadModelFile(file)
      const verts = merge(parts.map((p) => p.vertices).filter((v) => v && v.length >= 9))
      if (verts.length < 9) throw new Error('No triangles in this file.')
      raw.value = verts
      fileName.value = file.name
      flat.value = FLAT_TYPES.has(ext)
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
    fileName.value = null
    result.value = null
  }

  function centre() {
    if (!job.value) return
    job.value.placement.x = machineInfo.value.workArea.x / 2
    job.value.placement.y = machineInfo.value.workArea.y / 2
  }

  // ---- prepare (slice) and send
  const phase = ref<Phase | null>(null)
  const progress = ref<number | null>(null)
  const result = shallowRef<PrepResult | null>(null)
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
      result.value = null
      sentPath.value = null
      sendError.value = null
      phase.value = null
    },
    { deep: true },
  )

  const blocked = computed(() => (result.value ? blocking(result.value.checks) : []))

  async function prepare() {
    if (!job.value || !vertices.value || !part.value) return
    const id = ++runId
    const j = clone(job.value)
    const p = part.value
    const m = machineInfo.value
    prepError.value = null
    result.value = null
    progress.value = null
    try {
      const kiri = await runKiri(vertices.value, kiriJob(j, p, m), (ph, f) => {
        if (id !== runId) return
        phase.value = ph
        progress.value = f ?? null
      })
      if (id !== runId) return
      const file = rhinoFile(kiri, j, p, m, STUDIO_VERSION)
      const { checks, stats } = checkFile(file.text, j, p, m)
      const t = /print time: (\d+)s/.exec(kiri)
      const fl = /filament used: ([\d.]+) mm/.exec(kiri)
      result.value = { file, checks, stats, kiri: await kiriVersion(), kiriSeconds: t ? +t[1]! : null, kiriFilament: fl ? +fl[1]! : null }
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

  return {
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
  }
})
