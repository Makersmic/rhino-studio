/**
 * The laser stage of a chain: a flat drawing (SVG or DXF) whose loops the person picks operations for, with LaserOps.vue
 * (the same list Job setup uses). Kiri slices the drawing once to find the loops; the drawing sits on the sheet's centre.
 * A chain's laser marks a sheet that must stay whole, so loops no operation picked are left alone
 * (assembleLaser's leaveRest), and a cut-through operation is a warning (docs/design-process-chain.md, section 4e).
 * Pure parts are tested in laser.test.ts; the slicing needs the engine and is driven in the browser.
 */
import type { Check } from '@/slicer/check'
import { kiriJob } from '@/slicer/kiriSettings'
import { drawingBox, laserLoops, type Loop } from '@/slicer/laserOps'
import { loadModelFile, runKiri } from '@/slicer/engine'
import { merge, partInfo, transform } from '@/slicer/model'
import { newJob, type Material } from '@/slicer/profiles'
import { engineBody } from '@/slicer/rhinoFile'
import type { MachineInfo, PrepareJob } from '@/slicer/types'
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

/** The laser job a chain slices to find loops (and later to write its file): the laser head's own first material, at `at` */
export function laserJobFor(tool: string, materials: Material[], at: { x: number; y: number }): PrepareJob {
  const j = newJob(tool, 'laser', materials)
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
