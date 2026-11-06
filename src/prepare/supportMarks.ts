/**
 * Supports placed by hand: spots marked on a part, where Kiri:Moto builds support under the part and nowhere else
 * (Kiri 4.7's manual support, fed through the widget's anno.paint in slicer/engine.ts).
 *
 * A mark is kept in its part's own coordinates as loaded, so it stays on the same spot of the part when the part is
 * turned, tilted, scaled or moved. These are the same sums as slicer/model.ts `transform`, for one point, and a test
 * holds them to it. Saved with the job for that file (Portal: rhino/slice_profiles.py `_clean_marks`).
 */
import type { SupportMark } from '@/slicer/engine'

export interface Mark {
  /** the part's name (its file name as loaded, made unique) */
  part: string
  /** where, in the part's coordinates as loaded (mm) */
  x: number
  y: number
  z: number
  /** how far round the spot support reaches (mm) */
  r: number
}

/** "Only where I mark": present (even with no marks yet), or null for off or automatic */
export interface SupportMarks {
  marks: Mark[]
}

export const MARK_SIZES = { min: 1, max: 15, start: 4 }
export const MAX_MARKS = 500

export interface Placement {
  rotate: number
  scale: number
  tiltX?: number
  tiltY?: number
}

type V3 = [number, number, number]

/** Turn and scale a point as `transform` turns and scales each corner of the part, before it's recentred */
function turn(p: V3, pl: Placement): V3 {
  const k = pl.scale > 0 ? pl.scale : 1
  const a = (pl.rotate * Math.PI) / 180
  const ax = ((pl.tiltX ?? 0) * Math.PI) / 180
  const ay = ((pl.tiltY ?? 0) * Math.PI) / 180
  const [x0, y0, z0] = [p[0] * k, p[1] * k, p[2] * k]
  const y1 = y0 * Math.cos(ax) - z0 * Math.sin(ax)
  const z1 = y0 * Math.sin(ax) + z0 * Math.cos(ax)
  const x2 = x0 * Math.cos(ay) + z1 * Math.sin(ay)
  const z2 = -x0 * Math.sin(ay) + z1 * Math.cos(ay)
  return [x2 * Math.cos(a) - y1 * Math.sin(a), x2 * Math.sin(a) + y1 * Math.cos(a), z2]
}

/** The same turn backwards */
function unturn(q: V3, pl: Placement): V3 {
  const k = pl.scale > 0 ? pl.scale : 1
  const a = (pl.rotate * Math.PI) / 180
  const ax = ((pl.tiltX ?? 0) * Math.PI) / 180
  const ay = ((pl.tiltY ?? 0) * Math.PI) / 180
  const x2 = q[0] * Math.cos(a) + q[1] * Math.sin(a)
  const y1 = -q[0] * Math.sin(a) + q[1] * Math.cos(a)
  const z2 = q[2]
  const x0 = x2 * Math.cos(ay) - z2 * Math.sin(ay)
  const z1 = x2 * Math.sin(ay) + z2 * Math.cos(ay)
  const y0 = y1 * Math.cos(ax) + z1 * Math.sin(ax)
  const z0 = -y1 * Math.sin(ax) + z1 * Math.cos(ax)
  return [x0 / k, y0 / k, z0 / k]
}

/**
 * Between a part as loaded (`raw`) and as it sits now (`shaped`, from `transform`, centred with its bottom on Z 0):
 * the recentring is found from the first corner, so these always agree with the triangles on screen.
 */
export function partFrame(raw: Float32Array, shaped: Float32Array, pl: Placement): { toShaped(p: V3): V3; toRaw(q: V3): V3 } {
  const t0 = turn([raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0], pl)
  const shift: V3 = [t0[0] - (shaped[0] ?? 0), t0[1] - (shaped[1] ?? 0), t0[2] - (shaped[2] ?? 0)]
  return {
    toShaped: (p) => {
      const t = turn(p, pl)
      return [t[0] - shift[0], t[1] - shift[1], t[2] - shift[2]]
    },
    toRaw: (q) => unturn([q[0] + shift[0], q[1] + shift[1], q[2] + shift[2]], pl),
  }
}

export interface MarkPart {
  name: string
  raw: Float32Array
  shaped: Float32Array
  placement: Placement
  /** where its middle sits on the bed */
  x: number
  y: number
}

/** Each mark where it is now, on the bed (for drawing), with its index in the list. Marks on parts not loaded are left out. */
export function marksOnBed(parts: MarkPart[], marks: Mark[]): Array<{ i: number; at: V3; r: number }> {
  const frames = new Map(parts.map((p) => [p.name, { p, f: partFrame(p.raw, p.shaped, p.placement) }]))
  const out: Array<{ i: number; at: V3; r: number }> = []
  marks.forEach((m, i) => {
    const e = frames.get(m.part)
    if (!e) return
    const q = e.f.toShaped([m.x, m.y, m.z])
    out.push({ i, at: [q[0] + e.p.x, q[1] + e.p.y, q[2]], r: m.r * (e.p.placement.scale > 0 ? e.p.placement.scale : 1) })
  })
  return out
}

/** A mark from a point clicked on a part (bed coordinates), kept in that part's coordinates as loaded */
export function markAt(part: MarkPart, bed: V3, r: number): Mark {
  const raw = partFrame(part.raw, part.shaped, part.placement).toRaw([bed[0] - part.x, bed[1] - part.y, bed[2]])
  const k = part.placement.scale > 0 ? part.placement.scale : 1
  const round = (v: number) => Math.round(v * 1000) / 1000
  return { part: part.name, x: round(raw[0]), y: round(raw[1]), z: round(raw[2]), r: round(r / k) }
}

/**
 * The marks for the engine, in the frame of the model it's given: one part on its own (centred, bottom on Z 0), or
 * several combined and centred together at (cx, cy) on the bed.
 */
export function marksForEngine(parts: MarkPart[], marks: Mark[], combinedAt: { x: number; y: number } | null): SupportMark[] {
  return marksOnBed(parts, marks).map((m) => {
    const only = parts.length === 1 ? parts[0]! : null
    const x = combinedAt ? m.at[0] - combinedAt.x : m.at[0] - (only?.x ?? 0)
    const y = combinedAt ? m.at[1] - combinedAt.y : m.at[1] - (only?.y ?? 0)
    return { point: { x, y, z: m.at[2] }, radius: m.r }
  })
}

/** "Only where I mark" with nothing marked: say so, because it means no support at all */
export function marksNote(s: SupportMarks | null, supports: boolean): string | null {
  if (!supports || !s) return null
  if (!s.marks.length) return 'No spots marked yet, so nothing will be supported. Choose Mark supports, then click the part above where it needs holding up.'
  return `${s.marks.length} ${s.marks.length === 1 ? 'spot' : 'spots'} marked for support.`
}
