/**
 * The extruder block on Control: flow, pressure advance, feeding filament and
 * (SwitchFly) which filament path feeds the hotend.
 *
 * Pure builders and checks, so they can be tested without a machine. The
 * control store sends what these return.
 *
 * Safety (agreed with Mike, 2026-10-18):
 * - Feeding (Extrude / Retract) does not ask: one tap is one move of the
 *   length shown. It needs Klipper ready, a confirmed print head, no job,
 *   no swap, and Klipper's own can_extrude (hotend at min_extrude_temp).
 *   The script only ever moves E, in relative extrusion (M83), and restores
 *   the G-code state afterwards.
 * - Flow (M221) and pressure advance are live, job or not: tuning mid-print
 *   is the point.
 * - Switching the SwitchFly path runs SWITCH_T0/T1, which lifts Z, retracts,
 *   moves the selector servo, may heat, loads and purges. It always asks
 *   (commands.ts classes it as "power") and is refused during a job.
 * - SwitchFly has one extruder stepper for both paths; the config's G0/G1
 *   override reverses E on path 1 using save_variables
 *   set_material_toolhead / set_material_extruder_index. If that record
 *   names a different head than the one Klipper says is mounted, the
 *   direction could be wrong, so feeding is refused until it agrees.
 */

export const FILAMENT_DIAMETER = 1.75
/** Klipper's default; the real gate is the extruder's can_extrude */
export const MIN_EXTRUDE_TEMP = 170

export const FLOW = { min: 50, max: 150, step: 1 } as const
export const ADVANCE = { min: 0, max: 1, step: 0.001 } as const
export const SMOOTH = { min: 0.005, max: 0.2, step: 0.005 } as const
export const FEED_SPEED = { min: 1, max: 20, step: 1 } as const
export const FEED_LENGTHS = [50, 25, 10, 5, 1] as const
export const MAX_FEED_LENGTH = 100

export type Built = { script: string } | { error: string }

const round = (v: number, step: number) => {
  const d = Math.max(0, Math.ceil(-Math.log10(step)))
  return Number((Math.round(v / step) * step).toFixed(d))
}

/** Keep a stepper value on its step and inside its range. */
export function clampStep(v: number, r: { min: number; max: number; step: number }): number {
  if (!Number.isFinite(v)) return r.min
  return round(Math.min(r.max, Math.max(r.min, v)), r.step)
}

export function flowScript(percent: number): Built {
  if (!Number.isFinite(percent) || percent < FLOW.min || percent > FLOW.max) return { error: `Flow is ${FLOW.min} to ${FLOW.max}%` }
  return { script: `M221 S${Math.round(percent)}` }
}

export function pressureAdvanceScript(advance: number, smooth: number): Built {
  if (!Number.isFinite(advance) || advance < ADVANCE.min || advance > ADVANCE.max) return { error: `Pressure advance is ${ADVANCE.min} to ${ADVANCE.max} s` }
  if (!Number.isFinite(smooth) || smooth < SMOOTH.min || smooth > SMOOTH.max) return { error: `Smooth time is ${SMOOTH.min} to ${SMOOTH.max} s` }
  return { script: `SET_PRESSURE_ADVANCE ADVANCE=${round(advance, ADVANCE.step)} SMOOTH_TIME=${round(smooth, SMOOTH.step)}` }
}

/**
 * Feed or pull back filament. Relative extrusion only (M83), never an X/Y/Z
 * word, and the G-code state is put back so a job file that follows isn't
 * affected. Uses G1 (not G1.1) so the Rhino G1 override can reverse E on
 * SwitchFly path 1.
 */
export function feedScript(direction: 'extrude' | 'retract', length: number, speedMmS: number): Built {
  if (!Number.isFinite(length) || length <= 0 || length > MAX_FEED_LENGTH) return { error: `Length is 1 to ${MAX_FEED_LENGTH} mm` }
  if (!Number.isFinite(speedMmS) || speedMmS < FEED_SPEED.min || speedMmS > FEED_SPEED.max) return { error: `Speed is ${FEED_SPEED.min} to ${FEED_SPEED.max} mm/s` }
  const e = (direction === 'retract' ? -1 : 1) * Number(length.toFixed(2))
  return {
    script: ['SAVE_GCODE_STATE NAME=_rs_feed', 'M83', `G1 E${e} F${Math.round(speedMmS * 60)}`, 'RESTORE_GCODE_STATE NAME=_rs_feed'].join('\n'),
  }
}

/** mm³/s through the nozzle at this filament feed speed */
export function volumetric(speedMmS: number, diameter = FILAMENT_DIAMETER): number {
  return Math.PI * (diameter / 2) ** 2 * speedMmS
}

// ---- state --------------------------------------------------------------

export interface ExtruderStatus {
  /** gcode_move.extrude_factor, 1 = 100 % */
  factor: number | null
  advance: number | null
  smooth: number | null
  canExtrude: boolean | null
  temp: number | null
  /** SwitchFly path in use (0 / 1), when the record is for SwitchFly */
  path: 0 | 1 | null
  /** Material remembered for each SwitchFly path (short name, e.g. PLA) */
  pathMaterial: [string | null, string | null]
  /** save_variables.set_material_toolhead: whose E direction the G1 override applies */
  recordHead: string | null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/^'+|'+$/g, '') : null)

export function readExtruder(status: Record<string, Record<string, unknown> | undefined>): ExtruderStatus {
  const ex = status.extruder ?? {}
  const sv = (status.save_variables?.variables ?? {}) as Record<string, unknown>
  const recordHead = str(sv.set_material_toolhead)
  const idx = num(sv.set_material_extruder_index)
  const ce = ex.can_extrude
  return {
    factor: num(status.gcode_move?.extrude_factor),
    advance: num(ex.pressure_advance),
    smooth: num(ex.smooth_time),
    canExtrude: typeof ce === 'boolean' ? ce : null,
    temp: num(ex.temperature),
    path: recordHead === 'SwitchFly' && (idx === 0 || idx === 1) ? idx : null,
    pathMaterial: [str(sv.switchfly_material_t0)?.toUpperCase() ?? null, str(sv.switchfly_material_t1)?.toUpperCase() ?? null],
    recordHead,
  }
}

export interface FeedContext {
  klippyReady: boolean
  /** Confirmed print head (DEPOSITION) mounted */
  printHead: boolean
  mountedName: string | null
  jobActive: boolean
  swapping: boolean
  ex: ExtruderStatus
}

/** Why Extrude / Retract can't be used right now, or null when they can. */
export function feedBlock(c: FeedContext): string | null {
  if (!c.klippyReady) return 'Klipper is not ready'
  if (!c.printHead) return 'Confirm a print head first'
  if (c.swapping) return 'A tool swap is in progress'
  if (c.jobActive) return 'Not while a job is running'
  // The G1 override decides E from this record: reversed for SwitchFly path 1,
  // dropped for HotJoe. Refuse whenever it would treat E differently from the
  // head that is actually mounted.
  const rec = c.ex.recordHead
  if (c.mountedName === 'SwitchFly') {
    if (rec !== 'SwitchFly' || c.ex.path == null) return 'Pick a path first'
  } else if ((rec === 'SwitchFly' && c.ex.path === 1) || rec === 'HotJoe') {
    return `Klipper still has ${rec} recorded; start a ${c.mountedName ?? 'print'} job first`
  }
  if (c.ex.canExtrude === false) return 'Hotend cold'
  if (c.ex.canExtrude == null && (c.ex.temp ?? 0) < MIN_EXTRUDE_TEMP) return 'Hotend cold'
  return null
}

/** Why the SwitchFly path can't be changed, or null when it can. */
export function pathBlock(c: Omit<FeedContext, 'ex'>): string | null {
  if (c.mountedName !== 'SwitchFly') return 'SwitchFly only'
  if (!c.klippyReady) return 'Klipper is not ready'
  if (c.swapping) return 'A tool swap is in progress'
  if (c.jobActive) return 'Not while a job is running'
  return null
}
