/** The turning model on Job setup's "which toolhead" step: plain rules, kept out of the component so they're tested. */

/** How the picture is drawn: turning in 3D, still in 3D, or the flat outline from above */
export type SpinMode = 'spin' | 'still' | 'flat'

/**
 * Lighter drawing (the viewer's own choice, and the kiosk's default) keeps the flat outline, as before.
 * Someone who asked the system for less motion gets the 3D model standing still; they can still turn it by hand.
 */
export function spinMode(o: { lighter: boolean; reducedMotion: boolean; failed: boolean }): SpinMode {
  if (o.lighter || o.failed) return 'flat'
  return o.reducedMotion ? 'still' : 'spin'
}

/** The box the camera frames: a part's triangles are centred on X/Y with the bottom on Z 0 */
export function modelBox(size: { x: number; y: number; z: number }): { min: [number, number, number]; max: [number, number, number] } {
  return { min: [-size.x / 2, -size.y / 2, 0], max: [size.x / 2, size.y / 2, Math.max(size.z, 0.5)] }
}

/** Seconds since the last frame, capped so a tab coming back from the background doesn't jump the turn */
export function frameSeconds(lastMs: number | null, nowMs: number): number {
  if (lastMs === null) return 0
  return Math.min(Math.max((nowMs - lastMs) / 1000, 0), 0.1)
}

type Placed = { x: number; y: number; info: { size: { x: number; y: number; z: number }; footprint: Array<[number, number]> } }

/** The box around every part where it sits (bed millimetres), for the camera and the size line */
export function partsBox(parts: Placed[]): { min: [number, number, number]; max: [number, number, number] } {
  if (!parts.length) return modelBox({ x: 1, y: 1, z: 1 })
  const min: [number, number, number] = [Infinity, Infinity, 0]
  const max: [number, number, number] = [-Infinity, -Infinity, 0.5]
  for (const p of parts) {
    const s = p.info.size
    min[0] = Math.min(min[0], p.x - s.x / 2)
    min[1] = Math.min(min[1], p.y - s.y / 2)
    max[0] = Math.max(max[0], p.x + s.x / 2)
    max[1] = Math.max(max[1], p.y + s.y / 2)
    max[2] = Math.max(max[2], s.z)
  }
  return { min, max }
}

/** Every part's outline from above as SVG paths (Y up turned to SVG's Y down), and the view box around them */
export function footprints(parts: Placed[]): { paths: string[]; view: string } {
  const b = partsBox(parts)
  const w = Math.max(b.max[0] - b.min[0], 1)
  const h = Math.max(b.max[1] - b.min[1], 1)
  const pad = Math.max(w, h) * 0.06
  const paths = parts
    .filter((p) => p.info.footprint.length)
    .map((p) => p.info.footprint.map(([x, y], i) => `${i ? 'L' : 'M'}${(p.x + x - b.min[0]).toFixed(2)} ${(b.max[1] - (p.y + y)).toFixed(2)}`).join(' ') + ' Z')
  return { paths, view: `${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}` }
}
