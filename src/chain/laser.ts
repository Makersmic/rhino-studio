/**
 * The laser stage of a chain: a flat drawing (SVG or DXF) whose loops the person picks operations for, with LaserOps.vue
 * (the same list Job setup uses). Kiri slices the drawing once to find the loops; the drawing sits on the sheet's centre.
 * A chain's laser marks a sheet that must stay whole, so loops no operation picked are left alone
 * (assembleLaser's leaveRest), and a cut-through operation is a warning (docs/design-process-chain.md, section 4e).
 * Pure parts are tested in laser.test.ts; the slicing needs the engine and is driven in the browser.
 */
import type { Check } from '@/slicer/check'
import { kiriJob } from '@/slicer/kiriSettings'
import { drawingBox, laserLoops, newOp, type Loop } from '@/slicer/laserOps'
import { loadModelFile, runKiri } from '@/slicer/engine'
import { merge, partInfo, transform } from '@/slicer/model'
import { newJob, type Material } from '@/slicer/profiles'
import { engineBody } from '@/slicer/rhinoFile'
import type { LaserOp, LaserSettings, MachineInfo, PrepareJob } from '@/slicer/types'
import { sheetBox, type Chain } from './chain'

export const LASER_TYPES = ['svg', 'dxf'] as const

/** The drawing's loops where they will be cut: Kiri writes the cut from its lower-left corner and the file centres it on `at` */
export function placeLoops(loops: readonly Loop[], at: { x: number; y: number }): Loop[] {
  if (!loops.length) return []
  const b = drawingBox(loops as Loop[])
  const dx = at.x - (b.x0 + b.x1) / 2
  const dy = at.y - (b.y0 + b.y1) / 2
  return loops.map((l) => ({
    pts: l.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]),
    closed: l.closed,
    box: { x0: l.box.x0 + dx, y0: l.box.y0 + dy, x1: l.box.x1 + dx, y1: l.box.y1 + dy },
  }))
}

/** The laser job a chain slices to find loops and writes its file from: the chosen material (never another one's numbers), at `at` */
export function laserJobFor(tool: string, material: Material | null, at: { x: number; y: number }): PrepareJob {
  const j = newJob(tool, 'laser', material ? [material] : [])
  j.placement = { x: at.x, y: at.y, rotate: 0, scale: 1 }
  return j
}

/** Read a drawing and find its loops with Kiri's laser cut (the engine runs in the browser) */
export async function drawingLoops(file: File, job: PrepareJob, machine: MachineInfo): Promise<Loop[]> {
  const parts = await loadModelFile(file)
  const v = merge(parts.map((p) => p.vertices).filter((x) => x && x.length >= 9))
  if (!v.length) throw new Error('there is nothing to cut in it')
  const shaped = transform(v, 0, 1)
  const kiri = await runKiri(shaped, kiriJob(job, partInfo(file.name, shaped, true), machine), () => {})
  const loops = laserLoops(engineBody(kiri))
  if (!loops.length) throw new Error('Kiri found no outlines in it')
  return loops
}

/** Checks for the laser stage. `placed` are the loops where they land (null until the drawing has been read). */
export function laserChecks(chain: Pick<Chain, 'stages' | 'sheet' | 'laser'>, placed: readonly Loop[] | null, ready: boolean): Check[] {
  if (!chain.stages.some((s) => s.kind === 'laser')) return []
  const out: Check[] = []
  const lz = chain.laser
  if (!lz) {
    out.push({ id: 'laser-file', level: 'error', label: 'The laser stage has a drawing', detail: 'Load an SVG or DXF drawing for the laser, then pick what each operation marks.' })
    return out
  }
  if (!placed?.length) {
    if (ready) out.push({ id: 'laser-file', level: 'error', label: 'The laser drawing could be read', detail: 'Load it again.' })
    return out
  }
  out.push({ id: 'laser-file', level: 'ok', label: `The laser drawing has ${placed.length} loop${placed.length === 1 ? '' : 's'}` })
  if (chain.sheet && chain.stages.some((s) => s.role === 'place')) {
    const [x0, y0, x1, y1] = sheetBox(chain.sheet)
    const b = drawingBox(placed as Loop[])
    if (b.x0 < x0 - 0.05 || b.y0 < y0 - 0.05 || b.x1 > x1 + 0.05 || b.y1 > y1 + 0.05)
      out.push({ id: 'laser-sheet', level: 'error', label: 'The laser work is on the sheet', detail: `The drawing is ${Math.round((b.x1 - b.x0) * 10) / 10} × ${Math.round((b.y1 - b.y0) * 10) / 10} mm and reaches past the sheet’s edge. Make the sheet bigger or the drawing smaller.` })
    else out.push({ id: 'laser-sheet', level: 'ok', label: 'The laser work is on the sheet' })
  }
  const picked = lz.ops.some((o) => o.loops.length)
  if (!picked) out.push({ id: 'laser-ops', level: 'warn', label: 'The laser has something to do', detail: 'No operation has a loop picked, so the laser stage would do nothing. Add an operation and pick loops.' })
  else out.push({ id: 'laser-ops', level: 'ok', label: `${lz.ops.filter((o) => o.loops.length).length} laser operation${lz.ops.filter((o) => o.loops.length).length === 1 ? '' : 's'} with loops picked` })
  if (lz.ops.some((o) => o.kind === 'cut' && o.loops.length))
    out.push({ id: 'laser-cut', level: 'warn', label: 'A cut goes through the sheet', detail: 'A cut operation burns through the sheet onto what is under it. Use Score or Engrave fill to mark it, or protect the bed.' })
  return out
}

// ---- the laser material (docs/design-process-chain.md, 4h): the head's own material table and tuned values; no second list

/** Laser power is a safety value. With no tested power for a material, start here (5 %) and say so: never assume one. */
export const SAFE_POWER = 0.05
export const SAFE_FEED = 600
const ENGRAVE_MAX = 0.3

export interface Tuned {
  power?: number
  feed?: number
  passes?: number
}

/**
 * A new operation's starting numbers (the person edits them): tuned cut values first, else the material's table, else the safe
 * ones. Score is low power at speed (newOp's rule); an engrave fill uses the tuned engrave values, else the material's power
 * capped at 30 %. The power of an unknown material is SAFE_POWER, never Job setup's old 80 % default.
 */
export function starterOp(kind: LaserOp['kind'], mat: Material | null, tuned: Tuned | null, engrave: { power?: number; feed?: number } | null): LaserOp {
  const power = tuned?.power ?? mat?.laserPower ?? SAFE_POWER
  const feed = tuned?.feed ?? mat?.feed ?? SAFE_FEED
  const base = { power, feed, passes: Math.max(1, Math.round(tuned?.passes ?? 1)) } as LaserSettings
  return newOp(kind, base, { power: engrave?.power ?? Math.min(power, ENGRAVE_MAX), feed: engrave?.feed ?? feed })
}

/** The checks for the laser material: chosen, still in the table, a known power, and no operation above the cut power */
export function materialChecks(work: { material?: string; ops: readonly LaserOp[] } | null | undefined, table: readonly Material[]): Check[] {
  if (!work) return []
  const key = work.material
  if (!key) return [{ id: 'laser-material', level: 'error', label: 'The laser material is chosen', detail: 'Pick the material of the sheet. The laser file isn’t built until you do: its power starts from that material, and an unknown one is never guessed.' }]
  const mat = table.find((m) => m.key === key)
  if (!mat) return [{ id: 'laser-material', level: 'error', label: 'The laser material is in the head’s table', detail: `${key} isn’t in the laser head’s materials any more. Pick another, or add it to the head in Assets.` }]
  const out: Check[] = []
  if (mat.laserPower === undefined)
    out.push({ id: 'laser-material', level: 'warn', label: `${mat.name} has no tested laser power`, detail: `New operations start at ${Math.round(SAFE_POWER * 100)} %. Run the laser tests (Tune the laser) and check with a test fire on a spare margin before burning the sheet.` })
  else out.push({ id: 'laser-material', level: 'ok', label: `Laser material: ${mat.name} (cut power ${Math.round(mat.laserPower * 100)} %${mat.feed ? `, ${mat.feed} mm/min` : ''})` })
  if (mat.laserPower !== undefined) {
    const over = work.ops.filter((o) => o.power > mat.laserPower! + 1e-9)
    if (over.length) out.push({ id: 'laser-power', level: 'warn', label: `${over.length === 1 ? 'An operation uses' : `${over.length} operations use`} more power than ${mat.name}’s cut power`, detail: `${mat.name} is set up to cut at ${Math.round(mat.laserPower * 100)} %. More than that burns the sheet; lower the power or slow down on purpose, and test on a margin first.` })
  }
  return out
}
