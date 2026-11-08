/**
 * The rhino on the hologram's dial: an homage to the Rhino project. The poses here are plain numbers, tested without a
 * screen; rhino3d.ts builds the 3D rhino they move.
 *
 * It moves like a heavy animal, not an insect: a trot in diagonal pairs on short, thick, nearly straight legs. A
 * planted foot stays put while the body rolls over it; only the swinging leg lifts, its lower leg folding back. The
 * body drops onto each step and rises between them, twice a stride, rocking a little nose to tail, and the head nods
 * against it.
 *
 * It trots at the front of the dial while the dial turns. When a print completes it runs three quarters of a lap: round
 * the right side going away (seen from behind), across the back, and down the left side coming head-on. There it
 * rears, hops and stands proud among some sparkles.
 */

export const TROT_FRAMES = 12
export const FRAME_TROT = Array.from({ length: TROT_FRAMES }, (_, i) => i)
export const FRAME_STAND = TROT_FRAMES
export const FRAME_HOP = TROT_FRAMES + 1
export const FRAME_REAR = TROT_FRAMES + 2
export const FRAME_PROUD = TROT_FRAMES + 3
export const FRAME_GLITCH = TROT_FRAMES + 4
export const FRAME_COUNT = TROT_FRAMES + 5

/** A leg: how far it swings from straight down (radians, + forward) and how far its lower half folds back */
export interface Leg {
  swing: number
  fold: number
}
export interface Pose {
  /** back far, back near, front far, front near */
  legs: [Leg, Leg, Leg, Leg]
  /** the body tips up around the back hips (radians, + nose up): rearing, standing proud, or rocking as it trots */
  tip: number
  /** the body rises off its legs (canvas pixels, + up) */
  rise: number
  /** the head nods around the neck (radians, + nose down) */
  nod: number
}

/** Share of a stride a foot is planted. Over a half, so there's always a pair down: a trot, not a bound. */
export const STANCE = 0.58
const SWING_ANGLE = 0.26
const FOLD = 0.95
/** a diagonal pair is mid-stance here and half a stride later */
const MID_STANCE = STANCE / 2

/** One leg at `phase` (0..1) of its own stride: planted and sweeping back, then lifted and swinging forward */
export function legAt(phase: number): Leg {
  const p = ((phase % 1) + 1) % 1
  if (p < STANCE) return { swing: SWING_ANGLE * (1 - (2 * p) / STANCE), fold: 0 }
  const k = (p - STANCE) / (1 - STANCE)
  // forward in a smooth arc, folding most in the middle of the swing
  return { swing: -SWING_ANGLE + 2 * SWING_ANGLE * (0.5 - 0.5 * Math.cos(k * Math.PI)), fold: FOLD * Math.sin(k * Math.PI) }
}

/** The trot at `phase` (0..1 of a stride) */
export function trotPose(phase: number): Pose {
  // back near with front far, back far with front near, half a stride apart
  const legs: Pose['legs'] = [legAt(phase + 0.5), legAt(phase), legAt(phase), legAt(phase + 0.5)]
  // twice a stride the weight lands: lowest mid-stance, highest as the pairs change over
  const step = Math.cos(4 * Math.PI * (phase - MID_STANCE))
  return {
    legs,
    rise: 3.2 * (0.5 - 0.5 * step),
    // a little rock nose to tail, and the head nodding down as the weight lands
    tip: 0.028 * Math.sin(4 * Math.PI * (phase - MID_STANCE)),
    nod: 0.07 * (0.5 + 0.5 * step),
  }
}

export function framePose(frame: number): Pose {
  const straight: Leg = { swing: 0, fold: 0 }
  if (frame < TROT_FRAMES) return trotPose(frame / TROT_FRAMES) // fractional frames are smooth
  switch (frame) {
    case FRAME_HOP:
      return { legs: [{ swing: -0.2, fold: 1.1 }, { swing: -0.1, fold: 1.2 }, { swing: 0.35, fold: 1.3 }, { swing: 0.45, fold: 1.3 }], tip: 0.05, rise: 4, nod: -0.05 }
    case FRAME_REAR:
      return { legs: [{ swing: -0.2, fold: 0 }, { swing: -0.1, fold: 0 }, { swing: 0.9, fold: 1.5 }, { swing: 1.15, fold: 1.3 }], tip: 0.38, rise: 0, nod: -0.15 }
    case FRAME_PROUD:
      return { legs: [{ swing: -0.06, fold: 0 }, { swing: 0.04, fold: 0 }, { swing: -0.04, fold: 0 }, { swing: 0.06, fold: 0 }], tip: 0.05, rise: 1, nod: -0.12 }
    default:
      return { legs: [straight, { swing: 0.05, fold: 0 }, { swing: -0.05, fold: 0 }, straight], tip: 0, rise: 0, nod: 0.03 }
  }
}

/** Little four-point sparkles around the rhino at the finish, as offsets in rhino heights, and when each one blinks */
export const SPARKLES: Array<{ x: number; y: number; phase: number }> = [
  { x: -0.9, y: 0.8, phase: 0 },
  { x: 0.9, y: 1.1, phase: 0.33 },
  { x: 0.1, y: 1.35, phase: 0.66 },
  { x: -0.5, y: 1.25, phase: 0.5 },
  { x: 1.2, y: 0.45, phase: 0.15 },
]

/** Which trot frame shows at `seconds`, at `strides` strides a second: unhurried, it's a heavy animal */
export function trotFrame(seconds: number, strides = 1.15): number {
  return Math.floor(seconds * strides * TROT_FRAMES) % TROT_FRAMES
}

/** Where in the trot it is at `seconds`, as a fractional frame (0 up to TROT_FRAMES): smooth for the 3D rhino */
export function trotPhase(seconds: number, strides = 1.15): number {
  return (seconds * strides * TROT_FRAMES) % TROT_FRAMES
}

/** A glitch now and then: a tenth of a second, about every 7 s, at a time that isn't the same on every screen */
export function glitching(seconds: number, seed = 0): boolean {
  const period = 7
  const t = (seconds + seed * 3.1) % period
  return t > period - 0.12
}

/** Where the lap ends: three quarters round from the front, on the left side as seen, coming head-on */
export const LAP_END = (Math.PI * 3) / 2
const LAP_S = 3.6
const REAR_S = 1.0
const HOPS_S = 1.5

/**
 * The finish, `t` seconds after the print completed (Mike, Nov 7):
 *   0 - 3.6 s    trots faster round the dial, counter-clockwise from above: right side going away, across the back,
 *                down the left side coming head-on
 *   3.6 - 4.6    rears up
 *   4.6 - 6.1    three hops
 *   after        standing proud, head up, with sparkles
 * `angle` is how far round the dial from the front (radians, counter-clockwise), `lift` how high off the ring in rhino
 * heights. `frame` may be fractional while it trots. `face`: it turns to look straight at the viewer for its dance.
 */
export function finishPose(t: number): { frame: number; angle: number; lift: number; sparkles: boolean; face: boolean } {
  if (t < LAP_S) {
    const k = t / LAP_S
    // ease in and out, so it sets off and pulls up rather than jumping to speed
    const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    return { frame: trotPhase(t, 2), angle: eased * LAP_END, lift: 0, sparkles: false, face: false }
  }
  if (t < LAP_S + REAR_S) return { frame: FRAME_REAR, angle: LAP_END, lift: 0, sparkles: false, face: true }
  if (t < LAP_S + REAR_S + HOPS_S) {
    const k = ((t - LAP_S - REAR_S) % 0.5) / 0.5
    const lift = Math.sin(k * Math.PI) * 0.35
    return { frame: lift > 0.07 ? FRAME_HOP : FRAME_STAND, angle: LAP_END, lift, sparkles: false, face: true }
  }
  return { frame: FRAME_PROUD, angle: LAP_END, lift: 0, sparkles: true, face: true }
}
/** When the finish's moving part is over */
export const FINISH_SECONDS = LAP_S + REAR_S + HOPS_S + 0.1

/**
 * Where on the ring the rhino stands, and which way it faces (yaw, radians round +z from +x), for a camera at azimuth
 * `camAz` round the dial's centre. `angle` is how far round from the point nearest the camera, `dir` 1 for
 * counter-clockwise seen from above. Counter-clockwise, a quarter round is the camera's right, heading away from it,
 * and three quarters round is its left, heading straight at it.
 */
export function ringPlace(camAz: number, angle: number, dir: 1 | -1, radius: number): { x: number; y: number; yaw: number } {
  const a = camAz + dir * angle
  return { x: radius * Math.cos(a), y: radius * Math.sin(a), yaw: a + (dir * Math.PI) / 2 }
}

/** Whether to face right, from how the front of the dial is moving: it trots the way the dial turns under it */
export function facesRight(azimuthChange: number, wasRight: boolean): boolean {
  if (Math.abs(azimuthChange) < 1e-5) return wasRight
  return azimuthChange > 0
}
