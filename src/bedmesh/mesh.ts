/**
 * Bed mesh: reading Klipper's bed_mesh object and making sense of it.
 *
 * Pure functions (no Vue), so every number on the Bed mesh page is unit
 * tested. What this file answers, and the forum complaints behind each:
 *
 * - Where each probed point is. Matrix rows run front (min Y) to back, columns
 *   left (min X) to right. Point i of n sits at min + (max - min) * i / (n - 1):
 *   n - 1 gaps, not n (Mainsail had this wrong once: mainsail #1520).
 * - How flat the bed is, in plain terms: range in mm and as a share of a first
 *   layer (a 0.08 mm mesh is not a mountain, whatever colours say).
 * - Tilt or warp: a least-squares plane through the points is the tilt
 *   (Z_TILT_ADJUST fixes it); what is left over is the warp the mesh has to
 *   carry. Forum threads chase "bad meshes" that are really a tilted gantry.
 * - A colour scale that does not stretch: it starts at a fixed ±0.25 mm and
 *   only steps up when a mesh needs it, so a flat bed looks flat.
 * - Which saved mesh a print at a given bed temperature will use, the same way
 *   the Rhino's _RHINO_JOB_MESH macro picks it (myrhino/bed_mesh.cfg).
 * - The difference between two meshes (cold vs hot shows the heat warp alone).
 */

export interface MeshParams {
  minX: number
  maxX: number
  minY: number
  maxY: number
  xCount: number
  yCount: number
}

export interface MeshMeta {
  /** Bed temperature the mesh was made at (°C, 0 = cold) */
  bed: number
  /** Toolhead that probed it */
  tool: string
  /** Seconds since 1970; 0 when the Rhino didn't know (a mesh made at a print start) */
  when: number
}

export interface Profile {
  name: string
  points: number[][]
  params: MeshParams
  meta: MeshMeta | null
  /** Klipper's one-print adaptive mesh (adaptive-XXXXXXXX): never saved or reused */
  adaptive: boolean
}

export interface BedMeshState {
  /** [bed_mesh] is in the config (Klipper has a bed_mesh object) */
  configured: boolean
  /** Name of the loaded mesh, '' when none: moves are not compensated */
  loaded: string
  /** The loaded mesh as probed (may be an adaptive one, not in profiles) */
  current: { points: number[][]; params: MeshParams } | null
  profiles: Profile[]
  /** SAVE_CONFIG has something to write */
  savePending: boolean
  /** What SAVE_CONFIG would write: section names (e.g. "bed_mesh bed-60", "probe") */
  pendingSections: string[]
  /** RHINO_MESH macro settings, when the Rhino config has them (Tool Manager 1.6.0+) */
  rhino: { matchC: number; coldC: number; soakMin: number } | null
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, d = NaN) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d)

export const isAdaptive = (name: string) => /^adaptive-/i.test(name)

/** A usable matrix: at least one row, all rows the same length, all numbers. */
export function validMatrix(m: unknown): m is number[][] {
  if (!Array.isArray(m) || m.length === 0) return false
  const w = Array.isArray(m[0]) ? (m[0] as unknown[]).length : 0
  if (w === 0) return false
  return m.every((r) => Array.isArray(r) && r.length === w && r.every((v) => typeof v === 'number' && Number.isFinite(v)))
}

function paramsFrom(p: unknown, points: number[][]): MeshParams | null {
  if (!isObj(p)) return null
  const minX = num(p.min_x), maxX = num(p.max_x), minY = num(p.min_y), maxY = num(p.max_y)
  if (![minX, maxX, minY, maxY].every(Number.isFinite) || maxX < minX || maxY < minY) return null
  return { minX, maxX, minY, maxY, xCount: points[0]!.length, yCount: points.length }
}

/** mesh_meta from save_variables: only well-formed entries. */
export function parseMeta(v: unknown): Record<string, MeshMeta> {
  const out: Record<string, MeshMeta> = {}
  if (!isObj(v)) return out
  for (const [k, e] of Object.entries(v)) {
    if (!isObj(e)) continue
    const bed = num(e.bed)
    if (!Number.isFinite(bed)) continue
    out[k] = { bed, tool: typeof e.tool === 'string' ? e.tool : '', when: Math.max(0, Math.trunc(num(e.when, 0))) }
  }
  return out
}

/** Everything the page needs from Klipper's status. */
export function readBedMesh(status: Record<string, Obj | undefined>): BedMeshState {
  const bm = status.bed_mesh
  const cf = status.configfile
  const sv = status.save_variables?.variables
  const rm = status['gcode_macro RHINO_MESH']
  const pendingItems = isObj(cf?.save_config_pending_items) ? Object.keys(cf!.save_config_pending_items as Obj) : []
  const base = {
    savePending: cf?.save_config_pending === true,
    pendingSections: pendingItems.sort(),
    rhino: rm ? { matchC: num(rm.match_c, 5), coldC: num(rm.cold_c, 40), soakMin: num(rm.soak_min, 5) } : null,
  }
  if (!bm) return { configured: false, loaded: '', current: null, profiles: [], ...base }

  const meta = parseMeta(isObj(sv) ? (sv as Obj).mesh_meta : undefined)
  const profiles: Profile[] = []
  if (isObj(bm.profiles)) {
    for (const [name, p] of Object.entries(bm.profiles)) {
      if (!isObj(p) || !validMatrix(p.points)) continue
      const params = paramsFrom(p.mesh_params, p.points)
      if (!params) continue
      profiles.push({ name, points: p.points, params, meta: meta[name] ?? null, adaptive: isAdaptive(name) })
    }
  }
  profiles.sort((a, b) => Number(a.adaptive) - Number(b.adaptive) || a.name.localeCompare(b.name, undefined, { numeric: true }))

  const loaded = typeof bm.profile_name === 'string' ? bm.profile_name : ''
  let current: BedMeshState['current'] = null
  const mn = bm.mesh_min, mx = bm.mesh_max
  if (loaded && validMatrix(bm.probed_matrix) && Array.isArray(mn) && Array.isArray(mx)) {
    const params = paramsFrom({ min_x: mn[0], min_y: mn[1], max_x: mx[0], max_y: mx[1] }, bm.probed_matrix)
    if (params) current = { points: bm.probed_matrix, params }
  }
  if (loaded && !current) {
    const p = profiles.find((x) => x.name === loaded)
    if (p) current = { points: p.points, params: p.params }
  }
  return { configured: true, loaded, current, profiles, ...base }
}

// ---- geometry --------------------------------------------------------------

/** X of column i (fencepost-correct: n points span n - 1 gaps). */
export function xAt(p: MeshParams, i: number): number {
  return p.xCount <= 1 ? p.minX : p.minX + ((p.maxX - p.minX) * i) / (p.xCount - 1)
}
/** Y of row j (row 0 is the front, min Y). */
export function yAt(p: MeshParams, j: number): number {
  return p.yCount <= 1 ? p.minY : p.minY + ((p.maxY - p.minY) * j) / (p.yCount - 1)
}

export interface Extreme { value: number; x: number; y: number }

export interface MeshStats {
  min: Extreme
  max: Extreme
  /** max - min (Mainsail calls this "variance") */
  range: number
  mean: number
  /** Largest distance from the mean: what the colour scale must cover */
  maxDev: number
  count: number
}

export function stats(points: number[][], p: MeshParams): MeshStats {
  let min: Extreme = { value: Infinity, x: 0, y: 0 }
  let max: Extreme = { value: -Infinity, x: 0, y: 0 }
  let sum = 0
  let n = 0
  points.forEach((row, j) =>
    row.forEach((v, i) => {
      if (v < min.value) min = { value: v, x: xAt(p, i), y: yAt(p, j) }
      if (v > max.value) max = { value: v, x: xAt(p, i), y: yAt(p, j) }
      sum += v
      n++
    }),
  )
  const mean = n ? sum / n : 0
  let maxDev = 0
  for (const row of points) for (const v of row) maxDev = Math.max(maxDev, Math.abs(v - mean))
  return { min, max, range: n ? max.value - min.value : 0, mean, maxDev, count: n }
}

export interface PlaneFit {
  /** Z change per 100 mm going right (+X) and going back (+Y) */
  slopeX: number
  slopeY: number
  /** How far the plane rises across the mesh area, corner to corner (mm) */
  tiltRange: number
  /** The points with the plane taken out: what is left is warp */
  residual: number[][]
  /** Range of the residual (mm) */
  warpRange: number
}

/**
 * Least-squares plane z = a + b·x + c·y through the probed points.
 * Centred coordinates keep the 3x3 system well conditioned; a single row or
 * column has no slope along it (that slope is reported as 0).
 */
export function planeFit(points: number[][], p: MeshParams): PlaneFit {
  const pts: [number, number, number][] = []
  points.forEach((row, j) => row.forEach((v, i) => pts.push([xAt(p, i), yAt(p, j), v])))
  const n = pts.length
  const cx = pts.reduce((s, q) => s + q[0], 0) / n
  const cy = pts.reduce((s, q) => s + q[1], 0) / n
  const cz = pts.reduce((s, q) => s + q[2], 0) / n
  let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0
  for (const [x, y, z] of pts) {
    const dx = x - cx, dy = y - cy, dz = z - cz
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxz += dx * dz; syz += dy * dz
  }
  let b = 0, c = 0
  const det = sxx * syy - sxy * sxy
  if (det > 1e-9) {
    b = (sxz * syy - syz * sxy) / det
    c = (syz * sxx - sxz * sxy) / det
  } else if (sxx > 1e-9) b = sxz / sxx
  else if (syy > 1e-9) c = syz / syy
  const plane = (x: number, y: number) => cz + b * (x - cx) + c * (y - cy)
  const residual = points.map((row, j) => row.map((v, i) => v - plane(xAt(p, i), yAt(p, j))))
  let lo = Infinity, hi = -Infinity
  for (const row of residual) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  return {
    slopeX: b * 100,
    slopeY: c * 100,
    tiltRange: Math.abs(b) * (p.maxX - p.minX) + Math.abs(c) * (p.maxY - p.minY),
    residual,
    warpRange: hi - lo,
  }
}

// ---- what it means ------------------------------------------------------------

export type Verdict = 'flat' | 'fine' | 'tilt' | 'warp'

export interface Reading {
  verdict: Verdict
  /** Range as a share of the first layer (1 = one whole first layer) */
  layers: number
  headline: string
  advice: string
}

/**
 * What the numbers mean for a print. firstLayer: first layer height (mm).
 * - flat: under a quarter of a first layer, nothing to do
 * - tilt: most of the range is tilt and the tilt alone is over a quarter layer: level first
 * - warp: what's left after the tilt is over one first layer: the mesh copes, but look at the bed
 * - fine: anything else: the mesh handles it
 */
export function readMesh(s: MeshStats, f: PlaneFit, firstLayer = 0.2): Reading {
  const layers = firstLayer > 0 ? s.range / firstLayer : 0
  const q = firstLayer / 4
  if (s.range < q)
    return { verdict: 'flat', layers, headline: 'Flat', advice: 'Less than a quarter of a first layer from lowest to highest. Nothing to do.' }
  if (f.tiltRange >= q && f.tiltRange >= 0.6 * s.range)
    return {
      verdict: 'tilt',
      layers,
      headline: 'Mostly tilt',
      advice: `About ${fmtMm(f.tiltRange)} of it is the bed sitting at an angle. Level the gantry (Z_TILT_ADJUST, in Make a mesh) and probe again; the mesh then only has to carry the ${fmtMm(f.warpRange)} of warp.`,
    }
  if (f.warpRange > firstLayer)
    return {
      verdict: 'warp',
      layers,
      headline: 'Warped',
      advice: `With the tilt taken out, ${fmtMm(f.warpRange)} of warp is left: more than a first layer. The mesh will follow it, but check the bed sheet is clean and seated and the bed mounting isn't pulling it out of shape.`,
    }
  return { verdict: 'fine', layers, headline: 'Good', advice: 'Within what the mesh corrects easily.' }
}

/** "0.08 mm" (two decimals; three under 0.01). */
export function fmtMm(v: number): string {
  const a = Math.abs(v)
  return `${a < 0.01 && a > 0 ? v.toFixed(3) : v.toFixed(2)} mm`
}

// ---- colour scale -------------------------------------------------------------

/** Fixed steps: a flat bed stays pale on ±0.25 mm; only a mesh that needs it gets a wider scale. */
export const SCALE_STEPS = [0.25, 0.5, 1, 2] as const

/** Half-width of the scale (mm either side of the mean) for a mesh. */
export function scaleFor(maxDev: number): number {
  for (const s of SCALE_STEPS) if (maxDev <= s + 1e-9) return s
  return Math.ceil(maxDev)
}

/** -1..1 position on the scale (clamped), for colouring. */
export function scalePos(v: number, mean: number, half: number): number {
  if (half <= 0) return 0
  return Math.max(-1, Math.min(1, (v - mean) / half))
}

// ---- comparing two meshes -------------------------------------------------------

export function sameGrid(a: MeshParams, b: MeshParams): boolean {
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.01
  return a.xCount === b.xCount && a.yCount === b.yCount && eq(a.minX, b.minX) && eq(a.maxX, b.maxX) && eq(a.minY, b.minY) && eq(a.maxY, b.maxY)
}

/** b minus a, point by point; null when they weren't probed on the same points. */
export function difference(a: Profile | { points: number[][]; params: MeshParams }, b: Profile | { points: number[][]; params: MeshParams }): number[][] | null {
  if (!sameGrid(a.params, b.params)) return null
  return b.points.map((row, j) => row.map((v, i) => v - a.points[j]![i]!))
}

// ---- which mesh a print uses ------------------------------------------------------

export interface PrintMesh {
  /** The mesh a print at this bed temperature loads, or null: the print will ask */
  use: Profile | null
  /** With none: the closest recorded mesh the question offers */
  closest: Profile | null
}

/** Same rules as _RHINO_JOB_MESH: within matchC °C (both cold counts as equal), closest, then newest; never adaptive. */
export function meshForPrint(profiles: Profile[], bed: number, matchC = 5, coldC = 40): PrintMesh {
  const cold = bed < coldC
  let best: Profile | null = null, bestD = Infinity, bestW = -1
  let near: Profile | null = null, nearD = Infinity
  for (const p of profiles) {
    if (p.adaptive || !p.meta) continue
    const d = cold && p.meta.bed < coldC ? 0 : Math.abs(p.meta.bed - bed)
    if (d <= matchC && (d < bestD || (d === bestD && p.meta.when > bestW))) {
      best = p; bestD = d; bestW = p.meta.when
    }
    if (d < nearD) { near = p; nearD = d }
  }
  return { use: best, closest: best ? null : near }
}

// ---- names, ages, temperatures -------------------------------------------------------

/** Same rule as RHINO_MESH_CALIBRATE: 1-32 of letters, digits, - _ . and not adaptive-* */
export function profileNameProblem(name: string): string | null {
  if (!name) return 'Give the mesh a name'
  if (name.length > 32) return '32 characters at most'
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'Letters, digits, - _ and . only (no spaces)'
  if (isAdaptive(name)) return 'adaptive- names are Klipper’s one-print meshes'
  return null
}

/** The name the Rhino gives a mesh made at a print start for this temperature. */
export function defaultName(bed: number, coldC = 40): string {
  return bed < coldC ? 'bed-cold' : `bed-${Math.trunc(bed)}`
}

/** "today", "yesterday", "3 days ago", "5 weeks ago", "4 months ago". */
export function age(when: number, now = Date.now() / 1000): string {
  const days = Math.floor((now - when) / 86400)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 61) return `${Math.round(days / 7)} weeks ago`
  if (days < 730) return `${Math.round(days / 30.4)} months ago`
  return `${Math.round(days / 365)} years ago`
}

export function tempLabel(bed: number, coldC = 40): string {
  return bed < coldC ? 'cold bed' : `${Math.round(bed)}°C`
}

/**
 * A warning when a mesh is used at a bed temperature it wasn't made at
 * (the bed changes shape as it heats). null when it fits or nothing is known.
 */
export function tempMismatch(meta: MeshMeta | null, bedTarget: number, matchC = 5, coldC = 40): string | null {
  if (!meta) return null
  const metaCold = meta.bed < coldC, nowCold = bedTarget < coldC
  if (metaCold && nowCold) return null
  if (Math.abs(meta.bed - bedTarget) <= matchC) return null
  return `Made at ${tempLabel(meta.bed, coldC)}, and the bed is set to ${tempLabel(bedTarget, coldC)}: the bed changes shape as it heats.`
}

/** A short fingerprint of a matrix, to notice a mesh that was probed again under the same name. */
export function fingerprint(points: number[][]): string {
  let h = 2166136261
  const s = points.map((r) => r.map((v) => v.toFixed(4)).join(',')).join(';')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** Pending SAVE_CONFIG sections that are not bed meshes (a probe z_offset, PID values...). */
export function otherPending(sections: string[]): string[] {
  return sections.filter((s) => !/^bed_mesh\b/.test(s))
}

/**
 * Height between probed points for the map's shading: a straight-line blend
 * of the four points around (x, y). Klipper's own interpolation is smoother;
 * the map says so, and the numbers on it are always the probed ones.
 */
export function sampleAt(points: number[][], p: MeshParams, x: number, y: number): number {
  const fx = p.xCount <= 1 ? 0 : ((x - p.minX) / (p.maxX - p.minX)) * (p.xCount - 1)
  const fy = p.yCount <= 1 ? 0 : ((y - p.minY) / (p.maxY - p.minY)) * (p.yCount - 1)
  const cx = Math.max(0, Math.min(p.xCount - 1, fx)), cy = Math.max(0, Math.min(p.yCount - 1, fy))
  const i0 = Math.min(Math.floor(cx), Math.max(0, p.xCount - 2)), j0 = Math.min(Math.floor(cy), Math.max(0, p.yCount - 2))
  const i1 = Math.min(i0 + 1, p.xCount - 1), j1 = Math.min(j0 + 1, p.yCount - 1)
  const tx = i1 === i0 ? 0 : cx - i0, ty = j1 === j0 ? 0 : cy - j0
  const v = (j: number, i: number) => points[j]![i]!
  return (v(j0, i0) * (1 - tx) + v(j0, i1) * tx) * (1 - ty) + (v(j1, i0) * (1 - tx) + v(j1, i1) * tx) * ty
}
