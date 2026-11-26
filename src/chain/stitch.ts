/**
 * The print file of a chain's first job: the fixtures, a pause to place the sheet, then the features raised by the sheet's thickness.
 * Both engines can only slice a body from the bed (docs/design-process-chain.md, section 3), so the features are sliced from the bed
 * like any part and lifted with the machine's Z offset after the pause:
 *
 *   ;RHINO_CHAIN fixtures      the fixtures body
 *   ;RHINO_CHAIN place         M117, a notice, PAUSE
 *   SET_GCODE_OFFSET Z_ADJUST=<thickness> MOVE=0     straight after PAUSE: Klipper's RESUME puts back the offsets from the moment of the
 *                                                    pause, so a line before it would be undone, and one after it holds
 *   ;RHINO_CHAIN features      the features body
 *
 * Z_ADJUST adds to the offset the job already has, so the Rhino's own Z offset is kept; END_PRINT sets the offsets back to 0.
 * The file check (slicer/check.ts) refuses every other SET_GCODE_OFFSET; `chainRaise` is its one narrow exception.
 */
import { SHEET_MAX, SHEET_MIN } from './chain'

export const CHAIN_MARK = ';RHINO_CHAIN '
const RAISE = /^SET_GCODE_OFFSET Z_ADJUST=(\d+(?:\.\d+)?) MOVE=0$/i

/**
 * Is this line the chain's raise? Only the exact line, straight after PAUSE, once, within the sheet limits.
 * -> the new total raise, or null when it is not an accepted raise (the caller then treats the line as forbidden).
 */
export function chainRaise(line: string, previousCommand: string, already: number): number | null {
  const m = RAISE.exec(line)
  if (!m || previousCommand !== 'PAUSE' || already !== 0) return null
  const v = Number(m[1])
  return v >= SHEET_MIN && v <= SHEET_MAX ? v : null
}

const BANNED = /^(SET_GCODE_OFFSET|PAUSE|RESUME|G28|SWAP_TOOL|START_JOB|END_PRINT)\b/i

export type Stitched = { lines: string[] } | { error: string }

/** The two bodies are the engines' moves only (engineBody), without START_JOB or END_PRINT: the file wrapper adds those. */
export function stitchPrint(o: { fixtures: readonly string[]; features: readonly string[]; thickness: number | null }): Stitched {
  const t = o.thickness
  if (t == null || !Number.isFinite(t) || t < SHEET_MIN || t > SHEET_MAX) return { error: `The sheet's thickness must be between ${SHEET_MIN} and ${SHEET_MAX} mm.` }
  if (!o.fixtures.some((l) => /^G[01]\b/.test(l))) return { error: 'The fixtures body has no moves.' }
  if (!o.features.some((l) => /^G[01]\b/.test(l))) return { error: 'The features body has no moves.' }
  for (const [name, body] of [['fixtures', o.fixtures], ['features', o.features]] as const) {
    const bad = body.find((l) => BANNED.test(l.trim()))
    if (bad) return { error: `The ${name} body contains ${bad.trim().split(/\s+/)[0]}, which only the chain may write.` }
  }
  const raise = `SET_GCODE_OFFSET Z_ADJUST=${Number(t.toFixed(3))} MOVE=0`
  return {
    lines: [
      `${CHAIN_MARK}fixtures`,
      ...o.fixtures,
      `${CHAIN_MARK}place`,
      'M117 Place the sheet',
      'RESPOND TYPE=command MSG="action:notify Place the sheet, then press Resume"',
      'PAUSE',
      raise,
      `${CHAIN_MARK}features`,
      ...o.features,
    ],
  }
}

// ---- travel lifts in a chain's laser file (docs/proposal-chain-laser-lifts.md; approved by Mike, Nov 26)

/** The Z lines a chain laser file may hold, and the only ones (every other Z word in a laser file is still an error) */
export const LIFT_FEED = 600
const LIFT_LINE = new RegExp(`^G1 Z(-?\\d+(?:\\.\\d+)?) F${LIFT_FEED} ;RHINO_CHAIN (lift|drop)$`)
const FEATURES_HDR = /^;\s*rhino_chain_features\s*=\s*(\S+)\s*$/m
const LIFT_HDR = /^;\s*rhino_chain_lift\s*=\s*(\S+)\s*$/m
/** how tall the tallest printed feature may be, and the clearance over it */
export const FEATURE_MAX = 20
export const CLEARANCE = 2

export const liftLines = (height: number): { up: string; down: string } => ({
  up: `G1 Z${Number(height.toFixed(3))} F${LIFT_FEED} ;RHINO_CHAIN lift`,
  down: `G1 Z0 F${LIFT_FEED} ;RHINO_CHAIN drop`,
})

/**
 * The one exception to "a laser file has no Z moves". Null when the file has no chain header (nothing is allowed then). Otherwise every
 * Z line must be exactly the lift (to the header's L = H + 2) or the drop (to 0) at 600 mm/min, with the laser off, alternating from low
 * to low; anything else is a problem. `moves` counts the accepted lines, so the caller can see that no other line has a Z word.
 */
export function chainLifts(lines: readonly string[]): { problem: string | null; moves: number } | null {
  const text = lines.join('\n')
  const hf = FEATURES_HDR.exec(text)
  const hl = LIFT_HDR.exec(text)
  if (!hf && !hl) return null
  const H = hf ? Number(hf[1]) : NaN
  const L = hl ? Number(hl[1]) : NaN
  if (!Number.isFinite(H) || !Number.isFinite(L) || H < SHEET_MIN || H > FEATURE_MAX || Math.abs(L - (H + CLEARANCE)) > 0.001)
    return { problem: `The chain header needs the tallest feature (${SHEET_MIN} to ${FEATURE_MAX} mm) and a lift exactly ${CLEARANCE} mm above it.`, moves: 0 }
  let low = true
  let laserOn = false
  let moves = 0
  for (const raw of lines) {
    const l = raw.trim()
    const m = LIFT_LINE.exec(l)
    const code = l.replace(/;.*$/, '').trim().split(/\s+/)[0]!.toUpperCase()
    if (code === 'M3' || code === 'M4') {
      if (!low) return { problem: 'The laser is switched on while the head is lifted.', moves }
      laserOn = true
    } else if (code === 'M5') laserOn = false
    else if (code === 'G91') return { problem: 'Relative moves are not allowed in a file with lifts.', moves }
    if (m) {
      const z = Number(m[1])
      if (laserOn) return { problem: 'The head moves in Z while the laser is on.', moves }
      if (m[2] === 'lift') {
        if (!low || Math.abs(z - L) > 1e-9) return { problem: !low ? 'A lift comes before the last one was dropped.' : `A lift goes to Z${z}, not the header's Z${L}.`, moves }
        low = false
      } else {
        if (low || z !== 0) return { problem: low ? 'A drop with no lift before it.' : 'A drop must go to Z0, the focus height.', moves }
        low = true
      }
      moves++
    } else if (!low && /^G1\b/.test(code) && /\b[XY]-?\d/.test(l) && laserOn) return { problem: 'The laser cuts while the head is lifted.', moves }
  }
  return low ? { problem: null, moves } : { problem: 'The file ends with the head lifted.', moves }
}

export type Box = { x0: number; y0: number; x1: number; y1: number }

/** Does the polyline come within `margin` of the box? (a loop's line: used to refuse a line over a printed body) */
export function pathNearBox(pts: ReadonlyArray<readonly [number, number]>, b: Box, margin: number): boolean {
  for (let i = 0; i + 1 < pts.length; i++) if (nearBox(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], b, margin)) return true
  return pts.length === 1 && nearBox(pts[0]![0], pts[0]![1], pts[0]![0], pts[0]![1], b, margin)
}
/** Does the straight travel come within `margin` of the box? (sampled every 0.5 mm: files travel a few hundred mm at most) */
function nearBox(ax: number, ay: number, bx: number, by: number, b: Box, margin: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5))
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n
    const y = ay + ((by - ay) * i) / n
    if (x >= b.x0 - margin && x <= b.x1 + margin && y >= b.y0 - margin && y <= b.y1 + margin) return true
  }
  return false
}

/**
 * The laser file's lines with a lift and drop around each G0 travel that is the file's first move (the start position is unknown) or that passes
 * within 2 mm of a printed body's outline box. Throws if a travel happens with the laser on. `boxes` are in machine mm.
 */
export function liftTravels(lines: readonly string[], boxes: readonly Box[], height: number): string[] {
  const { up, down } = liftLines(height)
  const out: string[] = []
  let at: [number, number] | null = null
  let laserOn = false
  for (const l of lines) {
    const code = l.replace(/;.*$/, '').trim().split(/\s+/)[0]!.toUpperCase()
    if (code === 'M3' || code === 'M4') laserOn = true
    else if (code === 'M5') laserOn = false
    const x = /\bX(-?\d*\.?\d+)/.exec(l)
    const y = /\bY(-?\d*\.?\d+)/.exec(l)
    const to: [number, number] | null = /^G[01]$/.test(code) ? [x ? +x[1]! : (at?.[0] ?? NaN), y ? +y[1]! : (at?.[1] ?? NaN)] : null
    if (code === 'G0' && to) {
      if (laserOn) throw new Error('A travel move happens while the laser is on.')
      const cross = !at || boxes.some((b) => nearBox(at![0], at![1], to[0], to[1], b, CLEARANCE))
      if (cross) out.push(up, l, down)
      else out.push(l)
    } else out.push(l)
    if (to && Number.isFinite(to[0]) && Number.isFinite(to[1])) at = to
  }
  return out
}
