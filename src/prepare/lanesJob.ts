/**
 * Filament lanes in a job (design-dual-filament.md, step 2). Plain logic, tested; the store holds the state and the screens draw it.
 *
 * A tool has one lane unless its materials come from several paths (SwitchFly: path 0 and 1); an external switcher will have more.
 * A job with lanes keeps, per lane, the material chosen, and which lane prints the supports and their interface layers.
 * Which lane each *part* prints in lives on the part (it lasts as long as the part list does).
 *
 * What each engine can do, from the Nov 22 test slices:
 *   PrusaSlicer: parts on different lanes, supports on a lane, interface on a lane.
 *   Kiri:Moto: the whole job on one lane, supports on a lane, no separate interface filament.
 */
import type { Material } from '@/slicer/profiles'
import type { JobLanes } from '@/slicer/types'
import { MAX_LANES, laneName } from './laneKeys'

export type { JobLanes }

/**
 * Two-lane jobs slice (step 3: the Portal's 3MF with a lane per part, the change markers, the purge). The flag stays so a slicer
 * problem found later can switch them off again without a release of the whole screen.
 */
export const LANES_SLICE_READY = true

/** How many lanes a tool has: how many different filament paths its materials name, at least one */
export function laneCount(materials: readonly Pick<Material, 'path'>[]): number {
  const paths = new Set(materials.filter((m) => m.path !== undefined).map((m) => m.path))
  return Math.min(MAX_LANES, Math.max(1, paths.size))
}

/** The materials a lane can hold: on a multi-lane tool those of its own path, else all of them */
export function materialsOfLane<M extends Pick<Material, 'path'>>(materials: readonly M[], lane: number, count: number): M[] {
  return count > 1 ? materials.filter((m) => m.path === lane) : [...materials]
}

const inRange = (v: unknown, count: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < count

/** The per-lane filament options, kept only for lanes that exist (not lane 1) and for plain `key = value` text without a line break */
function cleanSettings(raw: unknown, count: number): { settings?: Record<string, string>[] } {
  if (!Array.isArray(raw)) return {}
  const out = Array.from({ length: count }, (_, i) => {
    const o: Record<string, string> = {}
    const src = i > 0 && raw[i] && typeof raw[i] === 'object' ? (raw[i] as Record<string, unknown>) : {}
    for (const [k, v] of Object.entries(src)) if (/^\w{1,64}$/.test(k) && typeof v === 'string' && !/[\r\n]/.test(v)) o[k] = v
    return o
  })
  return out.some((o) => Object.keys(o).length) ? { settings: out } : {}
}

/** A job's lanes made valid: a material the tool has for each lane (the first if it was missing), supports and interface on lanes that exist */
export function normalizeLanes(raw: unknown, materials: readonly Material[], count: number): JobLanes | undefined {
  if (count < 2) return undefined
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<JobLanes>
  return {
    materials: Array.from({ length: count }, (_, i) => {
      const own = materialsOfLane(materials, i, count)
      const want = Array.isArray(r.materials) ? r.materials[i] : null
      return own.find((m) => m.key === want)?.key ?? own[0]?.key ?? null
    }),
    supportLane: inRange(r.supportLane, count) ? r.supportLane : null,
    interfaceLane: inRange(r.interfaceLane, count) ? r.interfaceLane : null,
    ...(r.purge === 'machine' || r.purge === 'tower' ? { purge: r.purge } : {}),
    ...cleanSettings(r.settings, count),
  }
}

/** The wipe tower's footprint on the bed, kept clear of the parts (PrusaSlicer sizes it from the purge; this is room for it) */
export const TOWER = { x: 70, y: 70 }

export interface LaneUse {
  engine: 'prusa' | 'kiri'
  count: number
  /** the lane of each part, in order */
  partLanes: number[]
  supportsOn: boolean
  lanes: JobLanes | undefined
  /** supports placed by hand are in use */
  hasMarks?: boolean
  /** each lane's nozzle and bed temperature from its material (null: unknown) */
  temps?: { extruder: number | null; bed: number | null }[]
  /** each part's height (mm), and the layer height, for the change estimate */
  partHeights?: number[]
  layerHeight?: number
}

/** Lane changes above which a job is flagged: each costs time, a purge and wear on the lane mechanism */
export const CHANGES_MANY = 40
export const CHANGES_LOTS = 150
/** extra changes for the interface layers alone on another lane (test slice, Nov 22: 5 on a 26 mm part) */
const INTERFACE_CHANGES = 5

/**
 * About how many lane changes a job will have, before slicing. From the Nov 22 test slices a change happens about once per layer in which
 * more than one lane prints (two small parts of different heights: 42 changes over the 40 layers they share; supports from the other lane
 * under a 26 mm part: 133). Supports are assumed to run the part's full height, so this is an upper estimate; the exact count comes
 * with the sliced file.
 */
export function estimateChanges(u: LaneUse): number | null {
  if (u.count < 2 || !u.partHeights?.length || !u.layerHeight || u.layerHeight <= 0) return null
  const layers = u.partHeights.map((h) => Math.max(1, Math.round(h / u.layerHeight!)))
  const tallest = Math.max(...layers)
  const s = supportLanes(u)
  const supports = u.supportsOn && u.lanes ? s : null
  // lanes present on each layer: the parts' lanes while they're tall enough, and the support lane across the whole height
  let changes = 0
  for (let layer = 1; layer <= tallest; layer++) {
    const present = new Set<number>()
    u.partLanes.forEach((lane, i) => {
      if ((layers[i] ?? 0) >= layer) present.add(lane)
    })
    if (supports && u.lanes?.supportLane != null) present.add(supports.support)
    changes += Math.max(0, present.size - 1)
  }
  if (supports && u.lanes?.interfaceLane != null && u.lanes.supportLane == null && u.partLanes.some((l) => l !== supports.interface)) changes += INTERFACE_CHANGES
  return changes
}

/** The budget as words: how many, and whether that is a lot (null when there is nothing to say) */
export function changeBudget(u: LaneUse): { changes: number; level: 'ok' | 'many' | 'lots'; text: string } | null {
  const n = estimateChanges(u)
  if (n === null || lanesUsed(u).length < 2) return null
  const level = n > CHANGES_LOTS ? 'lots' : n > CHANGES_MANY ? 'many' : 'ok'
  const text =
    level === 'ok' ? `About ${n} lane change${n === 1 ? '' : 's'}.`
    : level === 'many' ? `About ${n} lane changes: each one is a purge and some time. Fewer parts sharing layers, or only the interface layers on the other lane, bring it down.`
    : `About ${n} lane changes: that is a lot of purging, time and wear on the lane mechanism. Put the supports on the part's own lane (interface layers only on the other), or print the parts in separate jobs.`
  return { changes: n, level, text }
}

/** Notes about the lanes' temperatures: the nozzle can't cool quickly, and the bed keeps the start lane's temperature */
export function temperatureNotes(u: LaneUse): string[] {
  if (!u.temps || lanesUsed(u).length < 2) return []
  const used = lanesUsed(u).filter((i) => u.temps![i])
  const notes: string[] = []
  const ex = used.map((i) => ({ lane: i, t: u.temps![i]!.extruder })).filter((x): x is { lane: number; t: number } => x.t != null)
  if (ex.length > 1) {
    const hi = ex.reduce((a, b) => (b.t > a.t ? b : a))
    const lo = ex.reduce((a, b) => (b.t < a.t ? b : a))
    if (hi.t - lo.t >= 15) notes.push(`${laneName(lo.lane)} prints at ${lo.t}° and ${laneName(hi.lane)} at ${hi.t}°: changing to the hotter lane waits for the nozzle to heat, and to the cooler one waits for it to cool, which is slow. Expect a pause at each change.`)
  }
  const bed = used.map((i) => u.temps![i]!.bed).filter((t): t is number => t != null)
  if (bed.length > 1 && Math.max(...bed) - Math.min(...bed) >= 5) notes.push(`The lanes want different bed temperatures (${Math.min(...bed)}° and ${Math.max(...bed)}°): the bed stays at the starting lane's temperature for the whole job.`)
  return notes
}

/** What each engine can do with lanes */
export const engineLanes = (engine: 'prusa' | 'kiri') =>
  engine === 'prusa' ? { partsOnLanes: true, interfaceLane: true } : { partsOnLanes: false, interfaceLane: false }

/** The lane that prints the supports, and the one that prints the interface layers, for this engine */
export function supportLanes(u: LaneUse): { support: number; interface: number } {
  const part = u.partLanes[0] ?? 0
  const support = u.lanes?.supportLane ?? part
  const iface = engineLanes(u.engine).interfaceLane ? (u.lanes?.interfaceLane ?? support) : support
  return { support, interface: iface }
}

/**
* How a lane change is purged. PrusaSlicer can't build its wipe tower when supports or their interface print from a different lane than
 * their part (test slices, Nov 22), so then the machine has to purge; Kiri:Moto can do both. Otherwise the job's choice, the tower by default.
 */
export function purgeMode(u: LaneUse): { mode: 'tower' | 'machine'; forced: boolean } {
  const s = supportLanes(u)
  const other = u.engine === 'prusa' && u.supportsOn && (u.lanes?.supportLane != null || u.lanes?.interfaceLane != null) && u.partLanes.some((l) => l !== s.support || l !== s.interface)
  if (other) return { mode: 'machine', forced: true }
  return { mode: u.lanes?.purge ?? 'tower', forced: false }
}

/** The lanes this job prints with, lowest first */
export function lanesUsed(u: LaneUse): number[] {
  if (u.count < 2) return [0]
  const used = new Set(u.partLanes.length ? u.partLanes : [0])
  if (u.supportsOn) {
    const s = supportLanes(u)
    used.add(s.support)
    used.add(s.interface)
  }
  return [...used].sort((a, b) => a - b)
}

/** Why this job can't go on, and what to know about it; both empty for a one-lane job */
export function laneNotices(u: LaneUse): { blocks: string[]; notes: string[] } {
  const blocks: string[] = []
  const notes: string[] = []
  if (u.count < 2) return { blocks, notes }
  const used = lanesUsed(u)
  const eng = engineLanes(u.engine)
  if (!eng.partsOnLanes && new Set(u.partLanes).size > 1) blocks.push('Kiri:Moto prints the whole job from one lane. Put every part in the same lane, or use PrusaSlicer for parts in different lanes.')
  for (const i of used) if (!u.lanes?.materials[i]) blocks.push(`Choose a filament for lane ${i + 1}.`)
  if (used.length > 1 && u.engine === 'prusa' && u.hasMarks && new Set(u.partLanes).size > 1) blocks.push('Support marks aren’t used with parts in different lanes yet: use automatic supports, or put the parts in one lane.')
  if (used.length > 1 && !LANES_SLICE_READY) blocks.push('Jobs that use two lanes can’t be sliced yet: this part of Studio is still being built. Use one lane for now.')
  if (u.supportsOn && !eng.interfaceLane) notes.push('Kiri:Moto has one support filament; PrusaSlicer can print the interface layers from another lane.')
  // test slices: all supports from the other lane = about 133 lane changes on a 26 mm part; the interface layers alone = 5
  if (u.supportsOn && u.lanes?.supportLane != null && u.lanes.supportLane !== (u.partLanes[0] ?? 0))
    notes.push(`Supports from another lane change lane on every layer that has support: that is a lot of changes${eng.interfaceLane ? '. Leave Supports on the part’s lane and put only the interface layers on the other lane to keep them few' : ''}.`)
  notes.push(...temperatureNotes(u))
  return { blocks, notes }
}
