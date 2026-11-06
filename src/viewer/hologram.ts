/**
 * The Dashboard hologram: the running job's toolpath over the camera, the finished part darker. Plain rules, tested
 * without a browser. Progress comes from Klipper's own file_position, so the line between done and not done is where
 * Klipper really is in the file, not an estimate.
 */

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
