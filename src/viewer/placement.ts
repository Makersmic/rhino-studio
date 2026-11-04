/**
 * Where a part sits and which way up, as plain maths: no drawing and nothing that reaches the machine.
 * A part's way up is three angles, applied around X, then Y, then Z (see transform in slicer/model.ts).
 * Any way up can be written like that, so a turn or Lay flat just works out the new angles.
 */
import { cncStock } from '@/slicer/kiriSettings'
import type { MachineInfo, PartInfo, Placement, PrepareJob } from '@/slicer/types'

type Vec = [number, number, number]
type Mat = [Vec, Vec, Vec]

const RAD = Math.PI / 180

function mul(a: Mat, b: Mat): Mat {
  const row = (r: Vec): Vec => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2],
  ]
  return [row(a[0]), row(a[1]), row(a[2])]
}
const rotX = (d: number): Mat => {
  const c = Math.cos(d * RAD)
  const s = Math.sin(d * RAD)
  return [[1, 0, 0], [0, c, -s], [0, s, c]]
}
const rotY = (d: number): Mat => {
  const c = Math.cos(d * RAD)
  const s = Math.sin(d * RAD)
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
}
const rotZ = (d: number): Mat => {
  const c = Math.cos(d * RAD)
  const s = Math.sin(d * RAD)
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]]
}
const matrixOf = (p: Placement): Mat => mul(rotZ(p.rotate), mul(rotY(p.tiltY ?? 0), rotX(p.tiltX ?? 0)))

/** Rounded to 0.001 degrees: off by under 0.002 mm across a 100 mm part */
function angle(d: number): number {
  const r = Math.round(d * 1000) / 1000
  return r === 0 ? 0 : r
}

function withMatrix(p: Placement, m: Mat): Placement {
  // m = Rz Ry Rx. At Y = +-90 degrees Z and X do the same thing, so that case keeps Z at 0.
  const sy = Math.max(-1, Math.min(1, -m[2][0]))
  const y = Math.asin(sy) / RAD
  let x: number
  let z: number
  if (Math.abs(sy) > 0.999999) {
    z = 0
    x = Math.atan2(sy > 0 ? m[0][1] : -m[0][1], m[1][1]) / RAD
  } else {
    x = Math.atan2(m[2][1], m[2][2]) / RAD
    z = Math.atan2(m[1][0], m[0][0]) / RAD
  }
  const out: Placement = { x: p.x, y: p.y, rotate: angle(((z % 360) + 360) % 360) % 360, scale: p.scale }
  const tx = angle(x)
  const ty = angle(y)
  if (tx) out.tiltX = tx
  if (ty) out.tiltY = ty
  return out
}

/** Turned by this many degrees around the bed's own X, Y or Z, whatever way up the part already is */
export function turned(p: Placement, axis: 'x' | 'y' | 'z', degrees: number): Placement {
  const r = axis === 'x' ? rotX(degrees) : axis === 'y' ? rotY(degrees) : rotZ(degrees)
  return withMatrix(p, mul(r, matrixOf(p)))
}

/** The part turned so a face pointing along `normal` (as drawn on the bed now) faces straight down */
export function laidFlat(p: Placement, normal: Vec): Placement {
  const len = Math.hypot(normal[0], normal[1], normal[2])
  if (!(len > 0)) return p
  const n: Vec = [normal[0] / len, normal[1] / len, normal[2] / len]
  // Turn n onto -Z around the axis at right angles to both (Rodrigues' formula)
  const cos = -n[2]
  if (cos > 0.9999999) return p
  if (cos < -0.9999999) return withMatrix(p, mul(rotX(180), matrixOf(p)))
  const ax = -n[1]
  const ay = n[0]
  const k = 1 / (1 + cos)
  const r: Mat = [
    [cos + ax * ax * k, ax * ay * k, ay],
    [ax * ay * k, cos + ay * ay * k, -ax],
    [-ay, ax, cos],
  ]
  return withMatrix(p, mul(r, matrixOf(p)))
}

/** The part's middle kept where its box stays on the bed, to the nearest 0.5 mm. A part wider than the bed goes central. */
export function clampCentre(v: number, partSize: number, bedSize: number): number {
  const half = partSize / 2
  const low = Math.min(half, bedSize / 2)
  const high = Math.max(bedSize - half, bedSize / 2)
  return Math.round(Math.min(Math.max(v, low), high) * 2) / 2
}

type Rect = { x0: number; y0: number; x1: number; y1: number }

/** Does a convex outline touch a rectangle? (No gap along either of the rectangle's axes or the outline's edges) */
export function hullHitsRect(hull: Array<[number, number]>, r: Rect): boolean {
  if (!hull.length) return false
  const xs = hull.map((p) => p[0])
  const ys = hull.map((p) => p[1])
  if (Math.max(...xs) <= r.x0 || Math.min(...xs) >= r.x1 || Math.max(...ys) <= r.y0 || Math.min(...ys) >= r.y1) return false
  const corners: Array<[number, number]> = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!
    const b = hull[(i + 1) % hull.length]!
    const nx = b[1] - a[1]
    const ny = a[0] - b[0]
    const side = (p: [number, number]) => (p[0] - a[0]) * nx + (p[1] - a[1]) * ny
    const hullSide = hull.map(side)
    const rectSide = corners.map(side)
    if (Math.max(...hullSide) <= Math.min(...rectSide) || Math.min(...hullSide) >= Math.max(...rectSide)) return false
  }
  return true
}

/** Do two convex outlines overlap? Touching doesn't count. */
export function hullsOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  if (!a.length || !b.length) return false
  const TOUCH = 0.01
  for (const hull of [a, b]) {
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i]!
      const q = hull[(i + 1) % hull.length]!
      const nx = q[1] - p[1]
      const ny = p[0] - q[0]
      const len = Math.hypot(nx, ny)
      if (!(len > 0)) continue
      const side = (v: [number, number]) => ((v[0] - p[0]) * nx + (v[1] - p[1]) * ny) / len
      const sa = a.map(side)
      const sb = b.map(side)
      if (Math.max(...sa) <= Math.min(...sb) + TOUCH || Math.max(...sb) <= Math.min(...sa) + TOUCH) return false
    }
  }
  return true
}

/** Clear space between a new part and whatever is already on the bed */
export const PART_GAP = 5
const SCAN_STEP = 5

export function rectOf(x: number, y: number, size: { x: number; y: number }): Rect {
  return { x0: x - size.x / 2, y0: y - size.y / 2, x1: x + size.x / 2, y1: y + size.y / 2 }
}

/**
 * Where a new part goes: at `want` if that's clear, else the first clear spot from the front-left corner, with PART_GAP
 * around it. A bed with no room gives `want` kept on the bed, with free false, and the overlap warning takes it from there.
 */
export function freeSpot(size: { x: number; y: number }, want: { x: number; y: number }, taken: Rect[], bed: { x: number; y: number }): { x: number; y: number; free: boolean } {
  const clear = (x: number, y: number) => {
    const r = rectOf(x, y, size)
    if (r.x0 < 0 || r.y0 < 0 || r.x1 > bed.x || r.y1 > bed.y) return false
    return !taken.some((t) => r.x0 < t.x1 + PART_GAP && r.x1 > t.x0 - PART_GAP && r.y0 < t.y1 + PART_GAP && r.y1 > t.y0 - PART_GAP)
  }
  if (clear(want.x, want.y)) return { x: want.x, y: want.y, free: true }
  for (let y = Math.ceil(size.y / 2 * 2) / 2; y + size.y / 2 <= bed.y; y += SCAN_STEP) {
    for (let x = Math.ceil(size.x / 2 * 2) / 2; x + size.x / 2 <= bed.x; x += SCAN_STEP) {
      if (clear(x, y)) return { x, y, free: true }
    }
  }
  return { x: clampCentre(want.x, size.x, bed.x), y: clampCentre(want.y, size.y, bed.y), free: false }
}

/** The warnings for every part in a job. They name the part once there's more than one, and say which ones overlap. */
export function partsProblems(parts: Array<{ info: PartInfo; x: number; y: number; placement: Placement }>, job: PrepareJob, m: MachineInfo): string[] {
  if (parts.length === 1) return placementProblems(parts[0]!.info, { ...job, placement: parts[0]!.placement }, m)
  const out = parts.flatMap((p) => placementProblems(p.info, { ...job, placement: p.placement }, m).map((t) => `${p.info.name}: ${t}`))
  const hulls = parts.map((p) => p.info.footprint.map(([x, y]): [number, number] => [x + p.x, y + p.y]))
  for (let i = 0; i < parts.length; i++) {
    for (let k = i + 1; k < parts.length; k++) {
      if (hullsOverlap(hulls[i]!, hulls[k]!)) out.push(`${parts[i]!.info.name} and ${parts[k]!.info.name} overlap. Move them apart.`)
    }
  }
  return out
}

/**
 * What's wrong with where the part is now, in plain words, using the same limits the check after preparing uses
 * (slicer/check.ts). They only warn here: that check still judges the file.
 */
export function placementProblems(part: PartInfo, job: PrepareJob, m: MachineInfo): string[] {
  const out: string[] = []
  const f = (n: number) => String(Math.round(n * 10) / 10)
  if (job.process === 'cnc') {
    const st = cncStock(job, part)
    if (st.x > m.workArea.x || st.y > m.workArea.y) out.push(`The stock (${f(st.x)} × ${f(st.y)} mm) is bigger than the work area. Scale the part down.`)
    return out
  }
  const px = job.placement.x
  const py = job.placement.y
  const hull = part.footprint.map(([x, y]): [number, number] => [x + px, y + py])
  const off = hull.some(([x, y]) => x < -1e-6 || x > m.workArea.x + 1e-6 || y < -1e-6 || y > m.workArea.y + 1e-6)
  if (off) out.push(part.size.x > m.workArea.x || part.size.y > m.workArea.y ? `The part is bigger than the bed (${f(m.workArea.x)} × ${f(m.workArea.y)} mm). Scale it down or turn it.` : 'The part goes off the bed. Move it in.')
  for (const k of m.keepOut) if (hullHitsRect(hull, k)) out.push(`The part is over the ${k.label.toLowerCase()} area. Move it clear.`)
  if (job.process === 'fdm') {
    const p = m.prime
    if (p && hullHitsRect(hull, { x0: p.x - 2, y0: p.y, x1: p.x + 2, y1: p.y + p.length })) out.push('The part is over the prime line. Move it clear.')
    const limit = m.travelMax[2] - 5
    if (part.size.z > limit) out.push(`The part is ${f(part.size.z)} mm tall and the limit is ${f(limit)} mm. Scale it down or lay it another way.`)
  }
  return out
}
