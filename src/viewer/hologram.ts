/**
 * The Dashboard hologram: the running job's toolpath over the camera, the finished part darker. Plain rules, tested
 * without a browser. Progress comes from Klipper's own file_position, so the line between done and not done is where
 * Klipper really is in the file, not an estimate.
 */

import { FEATURE_INNER_WALL, FEATURE_OUTER_WALL, MOVE_EXTRUDE, type GcodeBounds, type ParsedGcode } from '@/gcode/parse'

/** Read by itself only up to this size; a bigger file asks first, because fetching it adds load on the host during a job */
export const HOLO_MAX_BYTES = 40 * 1048576

/** How many of the file's moves Klipper has read: those whose line starts before file_position */
export function movesDone(offsets: Uint32Array, filePosition: number | null): number {
  if (filePosition === null || filePosition <= 0) return 0
  let lo = 0
  let hi = offsets.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (offsets[mid]! < filePosition) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * How many drawn moves are done, when a big file was thinned to fit the screen. `sourceMove` gives each drawn move's
 * number in the file (null when nothing was thinned, so drawn and file moves are the same).
 */
export function drawnDone(sourceMove: Uint32Array | null, fileDone: number): number {
  if (!sourceMove) return fileDone
  let lo = 0
  let hi = sourceMove.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sourceMove[mid]! < fileDone) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Where the layer holding the last done move starts: that layer is drawn bright, as the one being made now */
export function layerStartOf(layerStarts: Uint32Array, done: number): number {
  if (done <= 0) return 0
  let lo = 0
  let hi = layerStarts.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (layerStarts[mid]! <= done - 1) lo = mid + 1
    else hi = mid
  }
  return lo ? layerStarts[lo - 1]! : 0
}

/**
 * Turning costs a frame every refresh, so it's skipped on the kiosk (Lighter drawing) and for anyone who asked their
 * system for less motion. It still redraws when the job moves on, and can be turned by hand.
 */
export function holoSpins(o: { lighter: boolean; reducedMotion: boolean }): boolean {
  return !o.lighter && !o.reducedMotion
}

const SHOW_KEY = 'rs.dashboard.hologram'
/** Shown unless this viewer turned it off: a per-viewer convenience, nothing about the machine */
export function loadHoloShown(): boolean {
  try {
    return localStorage.getItem(SHOW_KEY) !== '0'
  } catch {
    return true
  }
}
export function saveHoloShown(on: boolean): void {
  try {
    localStorage.setItem(SHOW_KEY, on ? '1' : '0')
  } catch {
    /* storage blocked: it applies to this visit */
  }
}

/** What the hologram draws: printed walls only, each with its move number in the file */
export interface HoloDraw {
  /** six floats per drawn move */
  segments: Float32Array
  /** 255 for every drawn move (the scene's line shade; 0 would mean travel) */
  shades: Uint8Array
  /** first drawn move of each of the file's layers */
  layerStarts: Uint32Array
  /** the file's move number for each drawn move */
  sourceMove: Uint32Array
  drawnMoves: number
  bounds: GcodeBounds | null
  /** which moves were kept, for the screen's description */
  kept: 'outer walls' | 'walls' | 'all printing'
}

/**
 * The hologram's lines: the outer walls only, so the print reads as a stack of clean layer outlines with space between
 * them. Inner walls if the file names no outer ones, and every printed move if it names none at all. Over `budget`
 * moves, every n-th is kept: a ghost needs the shape, not every thread.
 */
export function buildHologram(p: Pick<ParsedGcode, 'moveCount' | 'segments' | 'kinds' | 'features' | 'layerStarts' | 'bounds'>, budget: number): HoloDraw {
  let outer = 0
  let inner = 0
  let printed = 0
  for (let i = 0; i < p.moveCount; i++) {
    if (p.kinds[i] !== MOVE_EXTRUDE) continue
    printed++
    const f = p.features[i]
    if (f === FEATURE_OUTER_WALL) outer++
    else if (f === FEATURE_INNER_WALL) inner++
  }
  const kept: HoloDraw['kept'] = outer ? 'outer walls' : inner ? 'walls' : 'all printing'
  const want = outer ? FEATURE_OUTER_WALL : inner ? FEATURE_INNER_WALL : -1
  const count = outer || inner || printed
  const step = Math.max(1, Math.ceil(count / budget))
  const take = (i: number) => p.kinds[i] === MOVE_EXTRUDE && (want < 0 || p.features[i] === want)

  const n = Math.ceil(count / step)
  const segments = new Float32Array(n * 6)
  const sourceMove = new Uint32Array(n)
  const layerStarts = new Uint32Array(p.layerStarts.length)
  let d = 0
  let seen = 0
  let layer = 0
  for (let i = 0; i < p.moveCount; i++) {
    while (layer < p.layerStarts.length && p.layerStarts[layer]! <= i) layerStarts[layer++] = d
    if (!take(i)) continue
    if (seen++ % step !== 0) continue
    segments.set(p.segments.subarray(i * 6, i * 6 + 6), d * 6)
    sourceMove[d++] = i
  }
  while (layer < p.layerStarts.length) layerStarts[layer++] = d
  return { segments: segments.subarray(0, d * 6), shades: new Uint8Array(d * 2).fill(255), layerStarts, sourceMove: sourceMove.subarray(0, d), drawnMoves: d, bounds: p.bounds, kept }
}

/**
 * The layer being made now, as a range of drawn moves: from the start of the layer holding the last done move to the
 * start of the next. The hologram only redraws when this changes, about once a layer.
 */
export function layerNow(layerStarts: Uint32Array, drawnMoves: number, done: number): { from: number; to: number; layer: number } {
  if (!layerStarts.length || done <= 0) return { from: 0, to: 0, layer: -1 }
  let lo = 0
  let hi = layerStarts.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (layerStarts[mid]! <= done - 1) lo = mid + 1
    else hi = mid
  }
  const layer = Math.max(0, lo - 1)
  return { from: layerStarts[layer]!, to: layer + 1 < layerStarts.length ? layerStarts[layer + 1]! : drawnMoves, layer }
}

/**
 * Where the dial lies under the hologram: centred under the part on the bed, its ring a little wider than the part,
 * and `size` the width of the whole dial square (the ring is DIAL_RING of DIAL_PX across it).
 */
export function dialPlace(b: GcodeBounds, ringShare: number): { x: number; y: number; z: number; size: number } {
  const ring = (Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2) * 1.08 + 2
  // just under the first layer, so the part never hides behind its own dial
  return { x: (b.min[0] + b.max[0]) / 2, y: (b.min[1] + b.max[1]) / 2, z: b.min[2] - 0.05, size: ring / ringShare }
}

const GLOW_KEY = 'rs.dashboard.hologramGlow'
/** Bloom on or off for this viewer (on unless turned off): a per-viewer convenience */
export function loadHoloGlow(): boolean {
  try {
    return localStorage.getItem(GLOW_KEY) !== '0'
  } catch {
    return true
  }
}
export function saveHoloGlow(on: boolean): void {
  try {
    localStorage.setItem(GLOW_KEY, on ? '1' : '0')
  } catch {
    /* storage blocked: it applies to this visit */
  }
}
