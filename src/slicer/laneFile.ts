/**
 * A two-lane job file: what the slicers write at a lane change, turned into what Studio's file says.
 *
 * PrusaSlicer writes the comment our INI template gives it (`;RHINO_LANE n`, 0-based lane) and, after it, a bare `T0` / `T1` that Klipper
 * rejects on this machine; Kiri:Moto writes the change command itself from its `gcodeChange` template. Both end up as
 * `SWITCH_LANE LANE=n`. The machine's own lane-change macro isn't written yet (Mike's hardware redesign): until the printer has a
 * `SWITCH_LANE` macro, the file checks refuse to send a file that uses it, because Klipper only reports an unknown command and carries on,
 * which would print the second lane's parts with the first lane's filament.
 *
 * Temperatures stay the machine's: the heat commands PrusaSlicer writes at a change are dropped (START_JOB and the change macro heat
 * from the material table; the file never sets a heater).
 */

export const LANE_MARKER = ';RHINO_LANE '
/** the INI template the Portal accepts (rhino/prusa.py LANE_MARK) */
export const LANE_TEMPLATE = ';RHINO_LANE {next_extruder}'
export const LANE_COMMAND = 'SWITCH_LANE'

/** Does the engine's output change lanes? */
export const hasLaneChanges = (text: string) => /^(;RHINO_LANE \d+|SWITCH_LANE\b)/m.test(text)

const HEAT = /^M(104|109|140|190)\b/
const BARE_TOOL = /^T\d+\s*$/

export interface LaneBody {
  lines: string[]
  /** the lane the print begins in when the slicer says (PrusaSlicer), else null: the part's lane */
  start: number | null
  /** lane changes after the first selection */
  changes: number
  /** lanes the file prints with */
  lanes: number[]
}

/** The body lines of a two-lane job with the markers made into the change command and the machine's own lines left out */
export function laneBody(lines: readonly string[]): LaneBody {
  const out: string[] = []
  const seen = new Set<number>()
  let start: number | null = null
  let n = 0
  for (const l of lines) {
    // PrusaSlicer's first marker picks the lane the print begins in; Kiri:Moto starts in the part's lane and only writes the changes
    const pm = /^;RHINO_LANE (\d+)\s*$/.exec(l)
    const m = pm ?? /^SWITCH_LANE LANE=(\d+)\s*$/.exec(l)
    if (m) {
      const lane = Number(m[1])
      if (pm && start === null) start = lane
      else n++
      seen.add(lane)
      out.push(`${LANE_COMMAND} LANE=${lane}`)
    } else if (BARE_TOOL.test(l) || HEAT.test(l)) continue
    else out.push(l)
  }
  return { lines: out, start, changes: n, lanes: [...seen].sort((a, b) => a - b) }
}
