/**
 * SwitchFly lanes (Assets › SwitchFly › Tune): power the path servo's UBEC, try an angle, save each lane's angle
 * and retract. Pure builders and checks, tested without a machine. Agreed with Mike, Nov 16 2026
 * (Tool Manager docs/proposal-switchfly-lanes.md):
 *
 * - The servo's UBEC is fed from PA1 (`Spindle_power`). It is powered for a task, never just because SwitchFly is
 *   mounted. Here the Power button is that task; the Tool Manager's safe-off (end of a job, cancel, swap, e-stop)
 *   cuts it again. A servo without power does not hold its place.
 * - The angle controls work only while the power is on. Try moves the servo and saves nothing. Save keeps a lane's
 *   angle and retract on the Rhino (SWITCHFLY_SET_LANE) and moves nothing.
 * - Only these four commands may go out through the lanes path (isLanesScript), only with SwitchFly mounted and no
 *   job running. Power off is the one that needs no padlock: it only ever cuts power.
 * - Klipper does not report a servo's angle. The "last sent" angle is worked out from the signal pin's duty, the way
 *   SET_SERVO_ANGLE makes it (0.5 ms at 0°, 2.5 ms at 180°, 20 ms cycle).
 */
import type { Built } from './extruder'
import type { Status } from '@/moonraker/client'

export const ANGLE = { min: 0, max: 180 } as const
export const RETRACT = { min: 0, max: 100 } as const
/** What each lane did before anything was saved (the values the Tool Manager had in code). */
export const DEFAULT_ANGLE: readonly [number, number] = [0, 180]

export type Lane = 0 | 1

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round1 = (n: number) => Math.round(n * 10) / 10

export function powerScript(on: boolean): Built {
  return { script: `SWITCHFLY_SERVO_POWER ON=${on ? 1 : 0}` }
}

export function testScript(angle: number): Built {
  if (!Number.isFinite(angle) || angle < ANGLE.min || angle > ANGLE.max) return { error: `The angle is ${ANGLE.min} to ${ANGLE.max}°` }
  return { script: `SWITCHFLY_SERVO_TEST ANGLE=${round1(angle)}` }
}

/** Save a lane's angle and/or retract. A lane is 0 (lane 1, T0) or 1 (lane 2, T1). */
export function laneScript(lane: Lane, v: { angle?: number | null; retract?: number | null }): Built {
  const parts: string[] = []
  if (v.angle != null) {
    if (!Number.isFinite(v.angle) || v.angle < ANGLE.min || v.angle > ANGLE.max) return { error: `The angle is ${ANGLE.min} to ${ANGLE.max}°` }
    parts.push(`ANGLE=${round1(v.angle)}`)
  }
  if (v.retract != null) {
    if (!Number.isFinite(v.retract) || v.retract < RETRACT.min || v.retract > RETRACT.max) return { error: `The retract is ${RETRACT.min} to ${RETRACT.max} mm` }
    parts.push(`RETRACT=${round1(v.retract)}`)
  }
  if (!parts.length) return { error: 'Nothing to save' }
  return { script: `SWITCHFLY_SET_LANE PATH=${lane} ${parts.join(' ')}` }
}

/** Only these may go out through the lanes path. */
export function isLanesScript(script: string): boolean {
  return /^(SWITCHFLY_SERVO_POWER ON=[01]|SWITCHFLY_SERVO_TEST ANGLE=\d{1,3}(\.\d)?|SWITCHFLY_SET_LANE PATH=[01]( ANGLE=\d{1,3}(\.\d)?)?( RETRACT=\d{1,3}(\.\d)?)?)$/.test(script) &&
    !/^SWITCHFLY_SET_LANE PATH=[01]$/.test(script)
}

/** Power off only cuts power, so it needs no padlock. */
export const needsLock = (script: string) => script !== 'SWITCHFLY_SERVO_POWER ON=0'

export function lanesBlock(c: { ready: boolean; toolName: string | null; jobActive: boolean }): string | null {
  if (!c.ready) return 'Klipper is not ready'
  if (c.toolName !== 'SwitchFly') return 'Mount SwitchFly and confirm it first'
  if (c.jobActive) return 'A job is running'
  return null
}

export interface LanesState {
  /** the UBEC's rail (PA1) is on */
  powered: boolean | null
  /** saved angle for each lane, or the default */
  angle: [number, number]
  /** saved retract for each lane in mm; 0 = the material's own */
  retract: [number, number]
  /** the angle last sent to the servo, from the signal pin; null before any move */
  sent: number | null
  /** which lane Klipper has recorded as in use */
  recorded: Lane | null
}

export function lanesState(status: Status): LanesState {
  const sv = ((status.save_variables as { variables?: Record<string, unknown> } | undefined)?.variables ?? {}) as Record<string, unknown>
  const relay = num((status['output_pin Spindle_power'] as { value?: unknown } | undefined)?.value)
  const pin = num((status['output_pin SERVO_LASER'] as { value?: unknown } | undefined)?.value)
  const a = (i: Lane) => num(sv[`switchfly_angle_t${i}`]) ?? DEFAULT_ANGLE[i]
  const r = (i: Lane) => num(sv[`switchfly_retract_t${i}`]) ?? 0
  const idx = num(sv.set_material_extruder_index)
  return {
    powered: relay == null ? null : relay > 0.5,
    angle: [a(0), a(1)],
    retract: [r(0), r(1)],
    sent: pin == null || pin <= 0 ? null : angleFromDuty(pin),
    recorded: idx === 0 || idx === 1 ? idx : null,
  }
}

/** SET_SERVO_ANGLE: pulse = 0.5 ms + 2 ms × angle/180, duty = pulse / 20 ms. */
export function angleFromDuty(duty: number): number | null {
  const a = ((duty * 0.02 - 0.0005) / 0.002) * 180
  return a < -2 || a > ANGLE.max + 2 ? null : round1(Math.max(ANGLE.min, Math.min(ANGLE.max, a)))
}
