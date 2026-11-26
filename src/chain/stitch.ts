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
