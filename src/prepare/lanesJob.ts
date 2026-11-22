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
import { MAX_LANES } from './laneKeys'

export type { JobLanes }

/**
 * Two-lane jobs are built and shown but not sliced yet: step 3 builds the slice (change command, purge, 3MF with a lane per part)
 * and turns this on. Until then Prepare says why it won't.
 */
export const LANES_SLICE_READY = false

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
  }
}

export interface LaneUse {
  engine: 'prusa' | 'kiri'
  count: number
  /** the lane of each part, in order */
  partLanes: number[]
  supportsOn: boolean
  lanes: JobLanes | undefined
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
  if (used.length > 1 && !LANES_SLICE_READY) blocks.push('Jobs that use two lanes can’t be sliced yet: this part of Studio is still being built. Use one lane for now.')
  if (u.supportsOn && !eng.interfaceLane) notes.push('Kiri:Moto has one support filament; PrusaSlicer can print the interface layers from another lane.')
  // test slices: all supports from the other lane = about 133 lane changes on a 26 mm part; the interface layers alone = 5
  if (u.supportsOn && u.lanes?.supportLane != null && u.lanes.supportLane !== (u.partLanes[0] ?? 0))
    notes.push(`Supports from another lane change lane on every layer that has support: that is a lot of changes${eng.interfaceLane ? '. Leave Supports on the part’s lane and put only the interface layers on the other lane to keep them few' : ''}.`)
  return { blocks, notes }
}
