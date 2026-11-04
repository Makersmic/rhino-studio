/**
 * Small, pure helpers for the loaded part: turning and scaling its triangles,
 * and the outline seen from above for the bed view. The part is always kept
 * centred on X/Y with its bottom at Z 0; where it sits on the bed is the job's
 * placement, applied when slicing.
 */
import type { PartInfo } from './types'

/** Several parts of one file become one part (Kiri's engine slices one object). */
export function merge(parts: Float32Array[]): Float32Array {
  const n = parts.reduce((a, p) => a + p.length, 0)
  const out = new Float32Array(n)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function bounds(v: Float32Array) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < v.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const c = v[i + k]!
      if (c < min[k]!) min[k] = c
      if (c > max[k]!) max[k] = c
    }
  }
  return { min, max }
}

/**
 * Scale, tilt around X then Y, and turn around Z (degrees), then centre X/Y on 0 and put the bottom on Z 0.
 * Returns a new array; the original stays as loaded.
 */
export function transform(src: Float32Array, rotateDeg: number, scale: number, tiltXDeg = 0, tiltYDeg = 0): Float32Array {
  const v = new Float32Array(src.length)
  const a = (rotateDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const ax = (tiltXDeg * Math.PI) / 180
  const cx1 = Math.cos(ax)
  const sx1 = Math.sin(ax)
  const ay = (tiltYDeg * Math.PI) / 180
  const cy1 = Math.cos(ay)
  const sy1 = Math.sin(ay)
  const k = scale > 0 ? scale : 1
  for (let i = 0; i + 2 < src.length; i += 3) {
    const x0 = src[i]! * k
    const y0 = src[i + 1]! * k
    const z0 = src[i + 2]! * k
    // around X
    const y1 = y0 * cx1 - z0 * sx1
    const z1 = y0 * sx1 + z0 * cx1
    // around Y
    const x2 = x0 * cy1 + z1 * sy1
    const z2 = -x0 * sy1 + z1 * cy1
    // around Z
    v[i] = x2 * c - y1 * s
    v[i + 1] = x2 * s + y1 * c
    v[i + 2] = z2
  }
  const b = bounds(v)
  const cx = (b.min[0]! + b.max[0]!) / 2
  const cy = (b.min[1]! + b.max[1]!) / 2
  const cz = b.min[2]!
  for (let i = 0; i + 2 < v.length; i += 3) {
    v[i] = v[i]! - cx
    v[i + 1] = v[i + 1]! - cy
    v[i + 2] = v[i + 2]! - cz
  }
  return v
}

/**
 * Several parts on the bed as one model for the engine: each is moved to where it sits, and the whole lot is centred on
 * X/Y. x and y say where that middle goes on the bed. Each part is centred on X/Y with its bottom on Z 0 already.
 */
export function combine(parts: Array<{ vertices: Float32Array; x: number; y: number }>): { vertices: Float32Array; x: number; y: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of parts) {
    const b = bounds(p.vertices)
    x0 = Math.min(x0, b.min[0]! + p.x)
    y0 = Math.min(y0, b.min[1]! + p.y)
    x1 = Math.max(x1, b.max[0]! + p.x)
    y1 = Math.max(y1, b.max[1]! + p.y)
  }
  const x = (x0 + x1) / 2
  const y = (y0 + y1) / 2
  const out = merge(parts.map((p) => p.vertices))
  let o = 0
  for (const p of parts) {
    const dx = p.x - x
    const dy = p.y - y
    for (let i = 0; i + 2 < p.vertices.length; i += 3, o += 3) {
      out[o] = p.vertices[i]! + dx
      out[o + 1] = p.vertices[i + 1]! + dy
    }
  }
  return { vertices: out, x, y }
}

/** Convex hull of the points seen from above (Andrew's monotone chain). */
export function footprint(v: Float32Array, maxPoints = 20000): Array<[number, number]> {
  const step = Math.max(1, Math.floor(v.length / 3 / maxPoints))
  const pts: Array<[number, number]> = []
  for (let i = 0; i + 2 < v.length; i += 3 * step) pts.push([Math.round(v[i]! * 100) / 100, Math.round(v[i + 1]! * 100) / 100])
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Array<[number, number]> = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

export function partInfo(name: string, v: Float32Array, flat: boolean): PartInfo {
  const b = bounds(v)
  const r = (n: number) => Math.round(n * 1000) / 1000
  return {
    name,
    size: { x: r(b.max[0]! - b.min[0]!), y: r(b.max[1]! - b.min[1]!), z: r(b.max[2]! - b.min[2]!) },
    triangles: Math.floor(v.length / 9),
    footprint: footprint(v),
    flat,
  }
}

export const MODEL_TYPES = ['stl', 'obj', '3mf', 'svg', 'dxf'] as const
export const FLAT_TYPES = new Set(['svg', 'dxf'])
export const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? ''
