/**
 * Small pictures of the models in Files > Models, drawn in the browser from the model itself (no new Portal route, nothing
 * stored on the Rhino): a corner view with simple shading. A picture is made once per screen, the first time a row is seen,
 * then kept in this browser (IndexedDB) under the file's path, size and date, so a changed file gets a new one.
 * `project` is plain maths and is tested; drawing and the cache need a browser.
 */
export interface Tri {
  p: [number, number, number, number, number, number]
  shade: number
  depth: number
}

const LIGHT: [number, number, number] = [0.35, -0.5, 0.8]
const SPIN = (35 * Math.PI) / 180
const TILT = (58 * Math.PI) / 180

/** Triangles (flat x,y,z ×3) turned to a corner view that fits a size × size box, far ones first. At most `max` triangles are used. */
export function project(v: Float32Array, size: number, max = 6000): Tri[] {
  const n = Math.floor(v.length / 9)
  if (n === 0) return []
  const step = Math.max(1, Math.ceil(n / max))
  const cs = Math.cos(SPIN), sn = Math.sin(SPIN), ct = Math.cos(TILT), st = Math.sin(TILT)
  const rot = (x: number, y: number, z: number): [number, number, number] => {
    const a = x * cs - y * sn, b = x * sn + y * cs           // spin about Z
    return [a, b * ct - z * st, b * st + z * ct]               // tilt: screen x, screen y (down), depth
  }
  const norm = Math.hypot(...LIGHT)
  const raw: { q: number[]; shade: number; depth: number }[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let t = 0; t < n; t += step) {
    const o = t * 9
    const q: number[] = []
    for (let k = 0; k < 3; k++) {
      const [x, y, d] = rot(v[o + k * 3]!, v[o + k * 3 + 1]!, v[o + k * 3 + 2]!)
      q.push(x, y, d)
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    const ux = v[o + 3]! - v[o]!, uy = v[o + 4]! - v[o + 1]!, uz = v[o + 5]! - v[o + 2]!
    const wx = v[o + 6]! - v[o]!, wy = v[o + 7]! - v[o + 1]!, wz = v[o + 8]! - v[o + 2]!
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    const lit = Math.abs(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / norm      // both faces lit: a mesh may be wound either way
    raw.push({ q, shade: 0.35 + 0.65 * lit, depth: (q[2]! + q[5]! + q[8]!) / 3 })
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const k = (size * 0.88) / span
  const ox = (size - (maxX - minX) * k) / 2 - minX * k
  const oy = (size - (maxY - minY) * k) / 2 - minY * k
  return raw
    .sort((a, b) => a.depth - b.depth)
    .map((r) => ({ p: [r.q[0]! * k + ox, r.q[1]! * k + oy, r.q[3]! * k + ox, r.q[4]! * k + oy, r.q[6]! * k + ox, r.q[7]! * k + oy], shade: r.shade, depth: r.depth }))
}

/** A PNG data URL of the model, or null when there is nothing to draw or no canvas. */
export function draw(tris: Tri[], size: number, scale = 2): string | null {
  if (!tris.length || typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = size * scale
  const g = c.getContext('2d')
  if (!g) return null
  g.scale(scale, scale)
  g.lineJoin = 'round'
  for (const t of tris) {
    const grey = Math.round(70 + 150 * t.shade)
    g.fillStyle = g.strokeStyle = `rgb(${grey},${grey},${grey + 6})`
    g.lineWidth = 0.6
    g.beginPath()
    g.moveTo(t.p[0], t.p[1]); g.lineTo(t.p[2], t.p[3]); g.lineTo(t.p[4], t.p[5])
    g.closePath(); g.fill(); g.stroke()
  }
  return c.toDataURL('image/png')
}

// ---- the cache in this browser
const DB = 'rhino-studio-model-thumbs'
const mem = new Map<string, string>()
function open(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore('t')
      r.onsuccess = () => res(r.result)
      r.onerror = () => res(null)
    } catch {
      res(null)
    }
  })
}
export async function cached(key: string): Promise<string | null> {
  if (mem.has(key)) return mem.get(key)!
  const db = await open()
  if (!db) return null
  return new Promise((res) => {
    try {
      const q = db.transaction('t').objectStore('t').get(key)
      q.onsuccess = () => res((q.result as string | undefined) ?? null)
      q.onerror = () => res(null)
    } catch {
      res(null)
    }
  })
}
export async function keep(key: string, url: string): Promise<void> {
  mem.set(key, url)
  const db = await open()
  try {
    db?.transaction('t', 'readwrite').objectStore('t').put(url, key)
  } catch { /* the picture just isn't kept; it is drawn again next time */ }
}
export const thumbKey = (path: string, size: number, modified: number) => `${path}|${size}|${Math.round(modified)}`
/** Models above this aren't downloaded just for a picture. */
export const THUMB_MAX_BYTES = 30 * 1048576
