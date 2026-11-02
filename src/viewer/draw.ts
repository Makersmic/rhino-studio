/**
 * Turns parsed G-code into what the viewer draws: how strong each move is, and a
 * lighter version when a file has more moves than a screen should draw. Plain
 * TypeScript, so it's tested without a browser. It never changes the file.
 */
import { MOVE_EXTRUDE, MOVE_FEED, MOVE_RAPID, type GcodeBounds, type ParsedGcode } from '@/gcode/parse'

/** Moves drawn at most, on a normal screen and in the lighter mode. Starting values: measure on the kiosk. */
export const BUDGET_NORMAL = 1_500_000
export const BUDGET_REDUCED = 300_000

/** A shade of 0 means travel, which the viewer can hide; anything above is work, up to 255 at full strength */
export const SHADE_TRAVEL = 0
export const SHADE_WORK = 255
/** The faintest a powered move is drawn, so low laser power still shows */
const SHADE_MIN_POWER = 90

export interface DrawData {
  /** Six floats per drawn move */
  segments: Float32Array
  /** One value per vertex, so two per drawn move */
  shades: Uint8Array
  /** Direction of each drawn move as x y z in -127..127, per vertex: how a thread catches the light */
  tangents: Int8Array
  /** Thread width of each drawn move in hundredths of a mm; 0 = as thin as the screen can draw */
  widths: Uint8Array
  /** True if a printed file didn't say its line width or nozzle, so the width is an assumption */
  widthAssumed: boolean
  /** First drawn move of each layer */
  layerStarts: Uint32Array
  layerZ: Float32Array
  /** The file's own move number for each drawn move, or null when none were merged */
  sourceMove: Uint32Array | null
  drawnMoves: number
  fileMoves: number
  bounds: GcodeBounds | null
}

/** Used only when a printed file doesn't say, and the screen says so */
export const ASSUMED_NOZZLE = 0.4

/**
 * A printed move's width: the slicer's own figure, else the nozzle. Anything else (travel, laser, knife, CNC)
 * stays a thin line, because the file doesn't say how wide a cut is.
 */
export function widthsOf(p: Pick<ParsedGcode, 'kinds' | 'widths' | 'nozzle' | 'moveCount'>): { widths: Uint8Array; assumed: boolean } {
  const fallback = Math.min(255, Math.round((p.nozzle ?? ASSUMED_NOZZLE) * 100))
  const out = new Uint8Array(p.moveCount)
  let assumed = false
  for (let i = 0; i < p.moveCount; i++) {
    if (p.kinds[i] !== MOVE_EXTRUDE) continue
    const w = p.widths[i]!
    if (w === 0 && p.nozzle === null) assumed = true
    out[i] = w || fallback
  }
  return { widths: out, assumed }
}

/** Each move's direction, the same at both of its ends */
export function tangentsOf(segments: Float32Array, moves: number): Int8Array {
  const out = new Int8Array(moves * 6)
  for (let i = 0; i < moves; i++) {
    const j = i * 6
    const dx = segments[j + 3]! - segments[j]!
    const dy = segments[j + 4]! - segments[j + 1]!
    const dz = segments[j + 5]! - segments[j + 2]!
    const len = Math.hypot(dx, dy, dz)
    if (len === 0) continue
    const x = Math.round((dx / len) * 127)
    const y = Math.round((dy / len) * 127)
    const z = Math.round((dz / len) * 127)
    out[j] = out[j + 3] = x
    out[j + 1] = out[j + 4] = y
    out[j + 2] = out[j + 5] = z
  }
  return out
}

/** How strong a move is. Work is what changes material; everything else is travel. */
export function shadeOf(p: Pick<ParsedGcode, 'hasExtrusion' | 'process'>, kind: number, power: number, maxPower: number): number {
  if (kind === MOVE_EXTRUDE) return SHADE_WORK
  if (p.hasExtrusion) return SHADE_TRAVEL
  if (maxPower > 0) {
    if (p.process === 'cnc') return kind === MOVE_FEED ? SHADE_WORK : SHADE_TRAVEL
    // Laser or unknown: power on means it's cutting, even on a G0
    if (power <= 0) return SHADE_TRAVEL
    return Math.round(SHADE_MIN_POWER + (SHADE_WORK - SHADE_MIN_POWER) * Math.min(1, power / maxPower))
  }
  return kind === MOVE_RAPID ? SHADE_TRAVEL : SHADE_WORK
}

/**
 * Merges runs of connected moves of the same strength, keeping each run's ends, so
 * outlines stay joined instead of turning into dashes. Layers are kept whole.
 * Run length grows until the result fits, because each change of move type breaks a run.
 */
export function buildDraw(p: ParsedGcode, budget: number): DrawData {
  let maxPower = 0
  if (p.power) for (let i = 0; i < p.moveCount; i++) if (p.power[i]! > maxPower) maxPower = p.power[i]!
  const shade = (i: number) => shadeOf(p, p.kinds[i]!, p.power ? p.power[i]! : 0, maxPower)
  const { widths: moveWidths, assumed: widthAssumed } = widthsOf(p)

  if (p.moveCount <= budget) {
    const shades = new Uint8Array(p.moveCount * 2)
    for (let i = 0; i < p.moveCount; i++) shades[i * 2] = shades[i * 2 + 1] = shade(i)
    return { segments: p.segments, shades, tangents: tangentsOf(p.segments, p.moveCount), widths: moveWidths, widthAssumed, layerStarts: p.layerStarts, layerZ: p.layerZ, sourceMove: null, drawnMoves: p.moveCount, fileMoves: p.moveCount, bounds: p.bounds }
  }

  const src = p.segments
  // Largest count the merge can produce at this run length; found by trying, since it depends on the file
  for (let run = Math.ceil(p.moveCount / budget); ; run *= 2) {
    let drawn = 0
    let left = 0
    let prev = -1
    let layer = 0
    for (let i = 0; i < p.moveCount; i++) {
      const s = shade(i)
      const newLayer = layer < p.layerStarts.length && p.layerStarts[layer] === i
      if (newLayer) layer++
      const joined = i > 0 && !newLayer && s === prev && left > 0 && src[i * 6] === src[i * 6 - 3] && src[i * 6 + 1] === src[i * 6 - 2] && src[i * 6 + 2] === src[i * 6 - 1]
      if (joined) left--
      else {
        drawn++
        left = run - 1
      }
      prev = s
    }
    if (drawn > budget && run < p.moveCount) continue

    const segments = new Float32Array(drawn * 6)
    const shades = new Uint8Array(drawn * 2)
    const sourceMove = new Uint32Array(drawn)
    const widths = new Uint8Array(drawn)
    const layerStarts = new Uint32Array(p.layerStarts.length)
    let n = -1
    left = 0
    prev = -1
    layer = 0
    for (let i = 0; i < p.moveCount; i++) {
      const s = shade(i)
      const newLayer = layer < p.layerStarts.length && p.layerStarts[layer] === i
      const joined = i > 0 && !newLayer && s === prev && left > 0 && src[i * 6] === src[i * 6 - 3] && src[i * 6 + 1] === src[i * 6 - 2] && src[i * 6 + 2] === src[i * 6 - 1]
      if (joined) left--
      else {
        n++
        segments[n * 6] = src[i * 6]!
        segments[n * 6 + 1] = src[i * 6 + 1]!
        segments[n * 6 + 2] = src[i * 6 + 2]!
        shades[n * 2] = shades[n * 2 + 1] = s
        sourceMove[n] = i
        widths[n] = moveWidths[i]!
        left = run - 1
      }
      if (newLayer) layerStarts[layer++] = n
      segments[n * 6 + 3] = src[i * 6 + 3]!
      segments[n * 6 + 4] = src[i * 6 + 4]!
      segments[n * 6 + 5] = src[i * 6 + 5]!
      prev = s
    }
    return { segments, shades, tangents: tangentsOf(segments, drawn), widths, widthAssumed, layerStarts, layerZ: p.layerZ, sourceMove, drawnMoves: drawn, fileMoves: p.moveCount, bounds: p.bounds }
  }
}

/** Which drawn moves show for a layer and how far through it: `end` is one past the last, `dimBefore` the layer's start */
export function visibleRange(d: Pick<DrawData, 'layerStarts' | 'drawnMoves'>, layer: number, fraction = 1): { end: number; dimBefore: number } {
  const count = d.layerStarts.length
  if (!count) return { end: d.drawnMoves, dimBefore: 0 }
  const i = Math.max(0, Math.min(count - 1, layer))
  const start = i === 0 ? 0 : d.layerStarts[i]!
  const stop = i + 1 < count ? d.layerStarts[i + 1]! : d.drawnMoves
  const f = Math.max(0, Math.min(1, fraction))
  return { end: start + Math.round((stop - start) * f), dimBefore: start }
}

/** Plain warnings about where the drawing can't match the job */
export function previewNotes(p: Pick<ParsedGcode, 'stats'>, d: Pick<DrawData, 'drawnMoves' | 'fileMoves' | 'widthAssumed'>): string[] {
  const notes: string[] = []
  if (d.widthAssumed) notes.push(`This file doesn't say its line width or nozzle, so threads are drawn ${ASSUMED_NOZZLE} mm wide.`)
  if (d.drawnMoves < d.fileMoves) notes.push(`Showing a simplified drawing: ${d.drawnMoves.toLocaleString()} lines for ${d.fileMoves.toLocaleString()} moves, to keep this screen quick. The file isn't changed.`)
  if (p.stats.skipped > 0) notes.push("The preview doesn't run macros, so anything they move, such as a prime line, isn't shown.")
  if (p.stats.straightArcs > 0) notes.push(`${p.stats.straightArcs.toLocaleString()} arcs can't be drawn as curves here, so they show as straight lines.`)
  if (p.stats.ignoredPower > 0) notes.push(`${p.stats.ignoredPower.toLocaleString()} move lines have an S value. Klipper ignores S on a move, so tool power comes only from M3, M4 and M5, and this drawing does the same.`)
  return notes
}

/** The moves' position in the drawing as a file move number, for showing where you are */
export const fileMoveAt = (d: Pick<DrawData, 'sourceMove'>, drawn: number) => (d.sourceMove ? d.sourceMove[drawn] ?? d.sourceMove[d.sourceMove.length - 1] ?? 0 : drawn)
