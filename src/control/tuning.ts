/**
 * Live tuning on Control (print heads): speed factor, Z offset baby-steps,
 * velocity and acceleration limits. Pure builders, tested without a machine.
 *
 * Safety (agreed with Mike, 2026-10-19):
 * - The panel has a red padlock. Locked: nothing here can be used. Unlocked:
 *   every control works without asking, job or not; unlocking is the
 *   confirmation. It locks again when you leave Control, Klipper isn't ready,
 *   the tool changes or a print head isn't confirmed (control store).
 * - A Z step moves the nozzle by the step and nothing else
 *   (SET_GCODE_OFFSET Z_ADJUST=… MOVE=1), at most 0.05 mm per tap, and the
 *   total offset is kept within ±2 mm. Z must be homed.
 * - Print heads only: on the spindle and knife the Z origin is the work zero.
 * - Nothing here writes printer.cfg or restarts Klipper. Limits set here last
 *   until Klipper restarts.
 */
import type { Built } from './extruder'

export const SPEED = { min: 10, max: 300, step: 5 } as const
export const Z_STEPS = [0.005, 0.01, 0.025, 0.05] as const
export const Z_TOTAL_MAX = 2
export const VELOCITY = { min: 10, max: 1000, step: 10 } as const
export const ACCEL = { min: 100, max: 30000, step: 100 } as const

export function speedScript(percent: number): Built {
  if (!Number.isFinite(percent) || percent < SPEED.min || percent > SPEED.max) return { error: `Speed is ${SPEED.min} to ${SPEED.max}%` }
  return { script: `M220 S${Math.round(percent)}` }
}

/** One baby-step. current = the Z offset now (gcode_move.homing_origin[2]). */
export function zStepScript(delta: number, current: number | null, homed: string): Built {
  if (!homed.toLowerCase().includes('z')) return { error: 'Home Z first' }
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > Math.max(...Z_STEPS) + 1e-9) return { error: 'Step out of range' }
  const now = current ?? 0
  if (Math.abs(now + delta) > Z_TOTAL_MAX + 1e-9) return { error: `Z offset stays within ±${Z_TOTAL_MAX} mm` }
  return { script: `SET_GCODE_OFFSET Z_ADJUST=${Number(delta.toFixed(3))} MOVE=1` }
}

/** Put the Z offset back to 0 (moves the nozzle by the current offset). */
export function zResetScript(current: number | null, homed: string): Built {
  if (!homed.toLowerCase().includes('z')) return { error: 'Home Z first' }
  if (current == null || Math.abs(current) < 0.0005) return { error: 'The Z offset is already 0' }
  if (Math.abs(current) > Z_TOTAL_MAX + 1e-9) return { error: 'Offset larger than tuning sets; change it from the console' }
  return { script: 'SET_GCODE_OFFSET Z=0 MOVE=1' }
}

export function limitsScript(velocity: number | null, accel: number | null): Built {
  const parts: string[] = []
  if (velocity != null) {
    if (!Number.isFinite(velocity) || velocity < VELOCITY.min || velocity > VELOCITY.max) return { error: `Velocity is ${VELOCITY.min} to ${VELOCITY.max} mm/s` }
    parts.push(`VELOCITY=${Math.round(velocity)}`)
  }
  if (accel != null) {
    if (!Number.isFinite(accel) || accel < ACCEL.min || accel > ACCEL.max) return { error: `Acceleration is ${ACCEL.min} to ${ACCEL.max} mm/s²` }
    parts.push(`ACCEL=${Math.round(accel)}`)
  }
  if (!parts.length) return { error: 'Nothing to set' }
  return { script: `SET_VELOCITY_LIMIT ${parts.join(' ')}` }
}

/** Only these may go out through the unlocked tuning path. */
export function isTuningScript(script: string): boolean {
  return /^(M220 S\d+|SET_GCODE_OFFSET Z_ADJUST=-?\d+(\.\d+)? MOVE=1|SET_GCODE_OFFSET Z=0 MOVE=1|SET_VELOCITY_LIMIT( (VELOCITY|ACCEL)=\d+){1,2})$/.test(script)
}
