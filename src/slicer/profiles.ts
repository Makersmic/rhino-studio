/**
 * Starting settings for each process, and the materials each toolhead knows.
 *
 * Materials come from Klipper when connected: VARIABLES.toolheads[<tool>].materials
 * (variables.cfg), the same table START_JOB, PREHEAT and the setup wizards use,
 * so a power, feed or temperature is never typed in twice. The built-in list
 * below is only a fallback for working without the machine, and matches the
 * shipped variables.cfg.
 *
 * FDM numbers follow Mike's OrcaSlicer profiles (slicer/orca in the config
 * repo): 0.2 mm layers, 15 mm/s first layer, 60 mm/s walls and infill.
 */
import type { CncOp, CncSettings, FdmSettings, KnifeSettings, LaserSettings, PrepareJob, Process } from './types'

export interface Material {
  /** key in the table, e.g. PLA_0_4 or PLYWOOD */
  key: string
  /** what Studio shows and passes as MATERIAL= (PLA for PLA_0_4) */
  name: string
  nozzle?: number
  /** SwitchFly path (T0 / T1 in the key) */
  path?: 0 | 1
  extruderTemp?: number
  bedTemp?: number
  fan?: number
  laserPower?: number
  spindleSpeed?: number
  feed?: number
}

export const PROCESS_FOR_TYPE: Record<string, Process> = {
  DEPOSITION: 'fdm',
  LASER: 'laser',
  CNC: 'cnc',
  DRAG_KNIFE: 'dragknife',
}

export function processFor(type: string | null | undefined): Process | null {
  return (type && PROCESS_FOR_TYPE[type]) || null
}

export const DEFAULT_FDM: FdmSettings = {
  nozzle: 0.4,
  path: 0,
  layerHeight: 0.2,
  firstLayer: 0.2,
  walls: 3,
  topLayers: 4,
  bottomLayers: 3,
  infill: 0.15,
  infillType: 'grid',
  supports: false,
  brim: 0,
  speed: 60,
  firstLayerSpeed: 15,
  retract: 0.4,
  fan: 0.5,
  // advanced: Kiri:Moto's defaults, except where the Orca profile says otherwise
  lineWidth: 0,
  adaptive: false,
  minLayer: 0.08,
  wallOrder: 'in-out',
  seam: 'last',
  thinWalls: 'basic',
  fillAngle: 45,
  fillOverlap: 0.35,
  outerSpeed: 60,
  travelSpeed: 150,
  minSpeed: 5,
  maxFlow: 12,
  retractSpeed: 30,
  zHop: 0,
  wipe: 0,
  coast: 0,
  retractEachLayer: false,
  avoidCrossing: true,
  supportAngle: 50,
  supportDensity: 0.1,
  supportGapXY: 1,
  supportGapZ: true,
  supportOutline: true,
  fanFromLayer: 1,
  minLayerTime: 10,
  skirtGap: 2,
  raft: false,
  raftSpacing: 0.2,
  vase: false,
}

export const DEFAULT_LASER: LaserSettings = { power: 0.8, feed: 600, passes: 1, cutHeight: 1, kerf: 0.1, smooth: 0.1, outerOnly: false }
export const DEFAULT_KNIFE: KnifeSettings = { feed: 1000, depth: 0.3, passes: 1, tip: 0.5, plunge: 200, cutHeight: 1, smooth: 0.1, outerOnly: false }

/** A CNC step with sensible starting numbers */
export function newOp(kind: CncOp['kind']): CncOp {
  return {
    kind,
    on: true,
    stepDown: kind === 'level' ? 0.5 : 1,
    stepOver: kind === 'level' ? 0.6 : 0.4,
    feed: 0,
    leave: kind === 'rough' ? 0.3 : 0,
    depth: 1,
    side: 'outside',
    direction: 'climb',
  }
}

export const DEFAULT_CNC: CncSettings = {
  ops: [newOp('outline')],
  toolType: 'endmill',
  toolDiameter: 3.175,
  fluteLength: 15,
  extraTop: 0,
  stepDown: 1,
  stepOver: 0.4,
  feed: 1000,
  plunge: 200,
  margin: 6,
  clearance: 5,
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * A job saved by an older Studio, brought up to date: settings added since get
 * their starting values, and the old CNC "operation" choice becomes the steps list.
 */
export function normalizeJob(j: PrepareJob): PrepareJob {
  const fill = <T extends object>(d: T, v: unknown): T => ({ ...d, ...(isObj(v) ? v : {}) }) as T
  const cnc = fill(DEFAULT_CNC, j.cnc)
  if (!Array.isArray((j.cnc as Partial<CncSettings> | undefined)?.ops)) {
    cnc.ops = j.cnc?.operation === 'clear-and-cutout' ? [{ ...newOp('rough'), stepDown: cnc.stepDown, stepOver: cnc.stepOver }, { ...newOp('outline'), stepDown: cnc.stepDown }] : [{ ...newOp('outline'), stepDown: cnc.stepDown }]
  } else cnc.ops = cnc.ops.filter((o) => ['level', 'rough', 'outline'].includes(o?.kind)).map((o) => fill(newOp(o.kind), o))
  delete cnc.operation
  const prusa: Record<string, string> = {}
  if (isObj(j.prusa)) for (const [k, v] of Object.entries(j.prusa)) if (/^\w{1,64}$/.test(k) && typeof v === 'string' && !/[\r\n]/.test(v)) prusa[k] = v
  const engine = j.engine === 'prusa' || j.engine === 'kiri' ? j.engine : 'kiri'
  return { ...j, engine, prusa, fdm: fill(DEFAULT_FDM, j.fdm), laser: fill(DEFAULT_LASER, j.laser), knife: fill(DEFAULT_KNIFE, j.knife), cnc }
}

/** Fallback when Klipper isn't connected: the shipped variables.cfg tables, trimmed. */
export const BUILT_IN_MATERIALS: Record<string, Record<string, Record<string, number>>> = {
  BlockOne: {
    PLA_0_4: { extruder_temp: 210, bed_temp: 65, nozzle_size: 0.4, fan_speed: 0.5 },
    PETG_0_4: { extruder_temp: 245, bed_temp: 90, nozzle_size: 0.4, fan_speed: 0.4 },
    ABS_0_4: { extruder_temp: 235, bed_temp: 85, nozzle_size: 0.4, fan_speed: 0.3 },
    ASA_0_4: { extruder_temp: 240, bed_temp: 85, nozzle_size: 0.4, fan_speed: 0.3 },
    PLA_0_8: { extruder_temp: 210, bed_temp: 65, nozzle_size: 0.8, fan_speed: 0.5 },
    PETG_0_8: { extruder_temp: 245, bed_temp: 90, nozzle_size: 0.8, fan_speed: 0.4 },
  },
  SwitchFly: {
    PLA_0_4_T0: { extruder_temp: 200, bed_temp: 60, nozzle_size: 0.4, fan_speed: 0.5 },
    PLA_0_4_T1: { extruder_temp: 200, bed_temp: 60, nozzle_size: 0.4, fan_speed: 0.5 },
  },
  LightSaber: {
    PLYWOOD: { laser_power: 0.8, feed_rate: 600 },
    ACRYLIC: { laser_power: 0.9, feed_rate: 400 },
    LEATHER: { laser_power: 0.6, feed_rate: 800 },
  },
  HotJoe: {
    SOFT_WOOD: { spindle_speed: 12000, feed_rate: 1000 },
    ALUMINUM: { spindle_speed: 8000, feed_rate: 500 },
    BRASS: { spindle_speed: 10000, feed_rate: 600 },
  },
  DragKnife: {
    VINYL: { feed_rate: 1000 },
    CARDSTOCK: { feed_rate: 800 },
    THIN_FOAM: { feed_rate: 900 },
  },
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** PLA_0_4 -> PLA, PLA_0_4_T1 -> PLA, PLYWOOD -> PLYWOOD */
export function materialName(key: string): string {
  const m = /^(.+?)_\d+_\d+(?:_T\d)?$/.exec(key)
  return m ? m[1]! : key
}

export function parseMaterials(table: unknown): Material[] {
  if (!table || typeof table !== 'object') return []
  const out: Material[] = []
  for (const [key, raw] of Object.entries(table as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const t = /_T(\d)$/.exec(key)
    out.push({
      key,
      name: materialName(key),
      nozzle: num(r.nozzle_size),
      path: t ? (Number(t[1]) === 1 ? 1 : 0) : undefined,
      extruderTemp: num(r.extruder_temp),
      bedTemp: num(r.bed_temp),
      fan: num(r.fan_speed),
      laserPower: num(r.laser_power),
      spindleSpeed: num(r.spindle_speed),
      feed: num(r.feed_rate),
    })
  }
  return out
}

/**
 * The materials for a tool: Klipper's table when we have it, else the built-in one.
 * `toolheads` is VARIABLES.toolheads merged with CUSTOM_TOOLS.toolheads.
 */
export function materialsFor(tool: string, toolheads: Record<string, unknown> | null): { list: Material[]; live: boolean } {
  const t = toolheads?.[tool] as { materials?: unknown } | undefined
  const live = parseMaterials(t?.materials)
  if (live.length) return { list: live, live: true }
  return { list: parseMaterials(BUILT_IN_MATERIALS[tool]), live: false }
}

/** A fresh job for a toolhead, with the first material's numbers filled in. */
export function newJob(tool: string, process: Process, materials: Material[]): PrepareJob {
  const job: PrepareJob = {
    schema: 1,
    toolhead: tool,
    process,
    material: materials[0]?.key ?? '',
    engine: 'prusa',
    prusa: {},
    fdm: { ...DEFAULT_FDM },
    laser: { ...DEFAULT_LASER },
    knife: { ...DEFAULT_KNIFE },
    cnc: { ...DEFAULT_CNC, ops: DEFAULT_CNC.ops.map((o) => ({ ...o })) },
    placement: { x: 275, y: 187.5, rotate: 0, scale: 1 },
  }
  if (materials[0]) applyMaterial(job, materials[0])
  return job
}

/** Copy a material's own numbers (nozzle, fan, power, feed) into the job's settings. */
export function applyMaterial(job: PrepareJob, m: Material): void {
  job.material = m.key
  if (job.process === 'fdm') {
    if (m.nozzle) {
      job.fdm.nozzle = m.nozzle
      // a 0.8 nozzle wants thicker layers
      if (m.nozzle >= 0.6 && job.fdm.layerHeight < 0.3) job.fdm.layerHeight = job.fdm.firstLayer = 0.4
      if (m.nozzle < 0.6 && job.fdm.layerHeight > 0.3) job.fdm.layerHeight = job.fdm.firstLayer = 0.2
    }
    if (m.path !== undefined) job.fdm.path = m.path
    if (m.fan !== undefined) job.fdm.fan = m.fan
  } else if (job.process === 'laser') {
    if (m.laserPower !== undefined) job.laser.power = m.laserPower
    if (m.feed) job.laser.feed = m.feed
  } else if (job.process === 'dragknife') {
    if (m.feed) job.knife.feed = m.feed
  } else if (job.process === 'cnc') {
    if (m.feed) job.cnc.feed = m.feed
  }
}
