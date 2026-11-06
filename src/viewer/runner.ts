/**
 * The rhino on the hologram's dial: an homage to the Rhino project. An original drawing, made from smooth shapes and
 * styled as a hologram: a see-through turquoise body fading towards the feet, scan lines, glowing edges, a white rim
 * of light along the back, and a glowing eye and horn tip. Now and then it glitches, as holograms do.
 *
 * It moves like a heavy animal, not an insect: a trot in diagonal pairs on short, thick, nearly straight legs. A
 * planted foot stays put while the body rolls over it; only the swinging leg lifts, its lower leg folding back. The
 * body drops onto each step and rises between them, twice a stride, rocking a little nose to tail, and the head nods
 * against it.
 *
 * It trots at the front of the dial while the dial turns. When a print completes it rears up, hops, runs a lap round
 * the dial and stands proud among some sparkles. The scene stands it upright on the ring, facing the way it runs.
 *
 * The poses are plain numbers, tested without a screen; drawRunnerStrip needs a browser.
 */

/** One frame's size on the canvas strip: the rhino faces right, feet on the bottom edge */
export const FRAME_W = 256
export const FRAME_H = 160

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
  if (frame < TROT_FRAMES) return trotPose(frame / TROT_FRAMES)
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

/** A glitch now and then: a tenth of a second, about every 7 s, at a time that isn't the same on every screen */
export function glitching(seconds: number, seed = 0): boolean {
  const period = 7
  const t = (seconds + seed * 3.1) % period
  return t > period - 0.12
}

/**
 * The finish, `t` seconds after the print completed:
 *   0 - 1.2 s   rears up
 *   1.2 - 2.7   three hops on the spot
 *   2.7 - 6.2   a lap round the dial, trotting faster
 *   after       standing proud, head up, with sparkles
 * `angle` is how far round the dial from the front (radians), `lift` how high off the ring in rhino heights.
 */
export function finishPose(t: number): { frame: number; angle: number; lift: number; sparkles: boolean } {
  if (t < 1.2) return { frame: FRAME_REAR, angle: 0, lift: 0, sparkles: false }
  if (t < 2.7) {
    const k = ((t - 1.2) % 0.5) / 0.5
    const lift = Math.sin(k * Math.PI) * 0.35
    return { frame: lift > 0.07 ? FRAME_HOP : FRAME_STAND, angle: 0, lift, sparkles: false }
  }
  if (t < 6.2) {
    const k = (t - 2.7) / 3.5
    // ease in and out, so it sets off and pulls up rather than jumping to speed
    const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    return { frame: trotFrame(t, 2), angle: eased * Math.PI * 2, lift: 0, sparkles: false }
  }
  return { frame: FRAME_PROUD, angle: 0, lift: 0, sparkles: true }
}
/** When the finish's moving part is over */
export const FINISH_SECONDS = 6.3

/** Whether to face right, from how the front of the dial is moving: it trots the way the dial turns under it */
export function facesRight(azimuthChange: number, wasRight: boolean): boolean {
  if (Math.abs(azimuthChange) < 1e-5) return wasRight
  return azimuthChange > 0
}

// ---- drawing (browser only) ------------------------------------------------------------------------------------

const GROUND = FRAME_H - 6
/** back hips: the body tips around this point */
const PIVOT: [number, number] = [86, 104]
/** the neck: the head nods around this point */
const NECK: [number, number] = [182, 82]
/** where each leg leaves the body: back far, back near, front far, front near. The tops are hidden in the body. */
const HIPS: Array<[number, number]> = [[78, 100], [93, 102], [150, 104], [165, 104]]
const UPPER = 22
const LOWER = 18
/** leg half-widths at the top, the joint and the foot: thick, like a pillar */
const WIDE = [12, 9.5, 9]

function torsoPath(): Path2D {
  const p = new Path2D()
  p.moveTo(52, 74)
  p.bezierCurveTo(58, 46, 118, 40, 150, 38) // up the back to the shoulder hump
  p.bezierCurveTo(166, 37, 175, 52, 186, 64) // down to the neck
  p.lineTo(192, 112)
  p.bezierCurveTo(186, 116, 180, 117, 174, 119) // throat
  p.bezierCurveTo(150, 127, 100, 127, 70, 118) // belly, low and heavy
  p.bezierCurveTo(52, 111, 45, 92, 52, 74)
  p.closePath()
  return p
}

/** The head, horns and ear: drawn on its own so it can nod */
function headPath(): Path2D {
  const p = new Path2D()
  p.moveTo(178, 60)
  p.bezierCurveTo(196, 61, 216, 73, 236, 92) // along the head to the snout
  p.lineTo(241, 104)
  p.bezierCurveTo(239, 112, 228, 115, 216, 113) // chin
  p.bezierCurveTo(204, 111, 194, 113, 184, 116)
  p.lineTo(176, 70)
  p.closePath()
  // the big horn, curving up and forward off the snout, and the small one behind it
  p.moveTo(222, 86)
  p.bezierCurveTo(226, 66, 233, 52, 245, 38)
  p.bezierCurveTo(242, 56, 240, 74, 237, 92)
  p.closePath()
  p.moveTo(204, 75)
  p.bezierCurveTo(206, 67, 210, 61, 215, 57)
  p.bezierCurveTo(215, 65, 214, 72, 213, 79)
  p.closePath()
  // ear
  p.moveTo(180, 61)
  p.bezierCurveTo(177, 50, 180, 43, 187, 40)
  p.bezierCurveTo(189, 48, 189, 55, 187, 62)
  p.closePath()
  return p
}

/** A leg as one smooth, tapered shape: no segments showing. Its lower half folds back (towards the tail) when lifted. */
function legPath(hip: [number, number], leg: Leg): { path: Path2D; foot: [number, number] } {
  const joint: [number, number] = [hip[0] + Math.sin(leg.swing) * UPPER, hip[1] + Math.cos(leg.swing) * UPPER]
  const lowerAngle = leg.swing - leg.fold
  const foot: [number, number] = [joint[0] + Math.sin(lowerAngle) * LOWER, joint[1] + Math.cos(lowerAngle) * LOWER]
  // the outline: down the front, round the foot, up the back
  const side = (a: [number, number], b: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] as [number, number]
  }
  const n1 = side(hip, joint)
  const n2 = side(joint, foot)
  const nj: [number, number] = [(n1[0] + n2[0]) / 2, (n1[1] + n2[1]) / 2]
  const p = new Path2D()
  p.moveTo(hip[0] - n1[0] * WIDE[0]!, hip[1] - n1[1] * WIDE[0]!)
  p.quadraticCurveTo(joint[0] - nj[0] * WIDE[1]! * 1.15, joint[1] - nj[1] * WIDE[1]! * 1.15, foot[0] - n2[0] * WIDE[2]!, foot[1] - n2[1] * WIDE[2]!)
  // a broad, flat-bottomed foot
  p.quadraticCurveTo(foot[0], foot[1] + 5, foot[0] + n2[0] * WIDE[2]!, foot[1] + n2[1] * WIDE[2]!)
  p.quadraticCurveTo(joint[0] + nj[0] * WIDE[1]! * 1.15, joint[1] + nj[1] * WIDE[1]! * 1.15, hip[0] + n1[0] * WIDE[0]!, hip[1] + n1[1] * WIDE[0]!)
  p.closePath()
  return { path: p, foot: [foot[0], foot[1] + 4] }
}

/** Turn the drawing so far around `at` by `angle` (radians, + counter-clockwise on screen, so nose up) */
function around(ctx: CanvasRenderingContext2D, at: [number, number], angle: number): void {
  ctx.translate(at[0], at[1])
  ctx.rotate(-angle)
  ctx.translate(-at[0], -at[1])
}

/** One frame, in hologram style, at (ox, 0) on the strip. `colour` is the hologram's turquoise. */
function drawFrame(g: CanvasRenderingContext2D, frame: number, ox: number, colour: string): void {
  const pose = framePose(frame === FRAME_GLITCH ? FRAME_STAND : frame)
  const c = document.createElement('canvas')
  c.width = FRAME_W
  c.height = FRAME_H
  const s = c.getContext('2d')!
  const legs = HIPS.map((h, i) => legPath(h, pose.legs[i]!))
  // feet on the ground: the back legs hang from the hips as they are, the front ones tip with the body
  const tipped = (pt: [number, number]): [number, number] => {
    const [x, y] = [pt[0] - PIVOT[0], pt[1] - PIVOT[1]]
    const ca = Math.cos(-pose.tip)
    const sa = Math.sin(-pose.tip)
    return [PIVOT[0] + x * ca - y * sa, PIVOT[1] + x * sa + y * ca]
  }
  // planted feet set the ground; the body's rise lifts everything above them
  const lowest = Math.max(...legs.map((l, i) => (i < 2 ? l.foot[1] : tipped(l.foot)[1])))
  const drop = GROUND - lowest
  const torso = torsoPath()
  const head = headPath()

  /** draw (fill or stroke) each part in place: legs, then body, then head. `n` numbers the parts 0..5. */
  const parts = (ctx: CanvasRenderingContext2D, paint: (path: Path2D, part: 'far' | 'near' | 'torso' | 'head', n: number) => void) => {
    ctx.save()
    ctx.translate(0, drop)
    let n = 0
    for (const [i, part] of [[0, 'far'], [2, 'far'], [1, 'near'], [3, 'near']] as Array<[number, 'far' | 'near']>) {
      ctx.save()
      if (i >= 2) around(ctx, PIVOT, pose.tip)
      paint(legs[i]!.path, part, n++)
      ctx.restore()
    }
    // the body rides on the legs: up as the pairs change over, down onto each step
    ctx.translate(0, -pose.rise)
    around(ctx, PIVOT, pose.tip)
    paint(torso, 'torso', n++)
    ctx.save()
    around(ctx, NECK, -pose.nod)
    paint(head, 'head', n++)
    ctx.restore()
    ctx.restore()
  }

  // 1. the silhouette: far legs dimmer, for depth
  parts(s, (path, part) => {
    s.globalAlpha = part === 'far' ? 0.55 : 1
    s.fillStyle = '#fff'
    s.fill(path)
  })
  s.globalAlpha = 1
  // the tail, with a tuft
  s.save()
  s.translate(0, drop - pose.rise)
  around(s, PIVOT, pose.tip)
  s.strokeStyle = s.fillStyle = '#fff'
  s.lineWidth = 3
  s.lineCap = 'round'
  s.beginPath()
  s.moveTo(54, 78)
  s.bezierCurveTo(44, 84, 40, 92, 41, 100)
  s.stroke()
  s.beginPath()
  s.ellipse(41, 102, 3, 5, 0, 0, Math.PI * 2)
  s.fill()
  s.restore()

  // 2. its colour, thinning out towards the feet: the light fades, it doesn't darken
  s.globalCompositeOperation = 'source-in'
  s.fillStyle = colour
  s.fillRect(0, 0, FRAME_W, FRAME_H)
  s.globalCompositeOperation = 'destination-out'
  const fade = s.createLinearGradient(0, 40, 0, FRAME_H)
  fade.addColorStop(0, 'rgba(0,0,0,0.35)')
  fade.addColorStop(1, 'rgba(0,0,0,0.7)')
  s.fillStyle = fade
  s.fillRect(0, 0, FRAME_W, FRAME_H)

  // 3. scan lines across it
  s.fillStyle = 'rgba(0,0,0,0.55)'
  for (let y = 0; y < FRAME_H; y += 4) s.fillRect(0, y, FRAME_W, 1.6)

  // 4. glowing outlines, only where a part's edge is on the outside of the rhino: each part's edge is drawn on its
  // own, then wiped wherever another solid part covers it, so leg tops and the neck join don't show through the body
  s.globalCompositeOperation = 'source-over'
  const edge = document.createElement('canvas')
  edge.width = FRAME_W
  edge.height = FRAME_H
  const e = edge.getContext('2d')!
  for (let mine = 0; mine < 6; mine++) {
    e.clearRect(0, 0, FRAME_W, FRAME_H)
    e.globalCompositeOperation = 'source-over'
    e.strokeStyle = colour
    parts(e, (path, part, n) => {
      if (n !== mine) return
      e.globalAlpha = part === 'far' ? 0.45 : 1
      e.lineWidth = part === 'torso' || part === 'head' ? 2.5 : 1.8
      e.stroke(path)
    })
    e.globalAlpha = 1
    // far legs are behind everything; the near ones and the body cover what's behind them
    e.globalCompositeOperation = 'destination-out'
    parts(e, (path, part, n) => {
      if (n === mine) return
      if (part === 'far' && mine >= 2) return
      e.fill(path)
    })
    s.shadowColor = colour
    s.shadowBlur = mine >= 4 ? 10 : 6
    s.drawImage(edge, 0, 0)
  }
  s.shadowBlur = 0
  const fold = (pts: number[]) => {
    s.beginPath()
    s.moveTo(pts[0]!, pts[1]!)
    s.bezierCurveTo(pts[2]!, pts[3]!, pts[4]!, pts[5]!, pts[6]!, pts[7]!)
    s.stroke()
  }
  s.save()
  s.translate(0, drop - pose.rise)
  around(s, PIVOT, pose.tip)
  s.strokeStyle = 'rgba(255,255,255,0.45)'
  s.lineWidth = 1.5
  fold([160, 44, 155, 70, 157, 96, 162, 121]) // behind the shoulder
  fold([84, 52, 78, 76, 80, 100, 86, 120]) // in front of the hips
  fold([95, 108, 120, 112, 142, 112, 160, 107]) // a seam along the flank
  // rim light along the back
  s.strokeStyle = 'rgba(255,255,255,0.85)'
  s.lineWidth = 2
  s.shadowColor = '#fff'
  s.shadowBlur = 6
  s.beginPath()
  s.moveTo(60, 58)
  s.bezierCurveTo(80, 44, 120, 40, 150, 39)
  s.bezierCurveTo(165, 38, 174, 51, 182, 60)
  s.stroke()
  // the head nods: its fold, eye and horn tip go with it
  around(s, NECK, -pose.nod)
  s.shadowBlur = 0
  s.strokeStyle = 'rgba(255,255,255,0.45)'
  s.lineWidth = 1.5
  fold([187, 66, 191, 82, 193, 98, 190, 113]) // where the head meets the neck
  s.fillStyle = '#fff'
  s.shadowBlur = 10
  s.beginPath()
  s.arc(207, 85, 3.2, 0, Math.PI * 2)
  s.fill()
  s.beginPath()
  s.arc(244, 40, 2.6, 0, Math.PI * 2)
  s.fill()
  s.restore()

  // the glitch frame: slices of the rhino slipped sideways, a flash of white
  if (frame === FRAME_GLITCH) {
    const copy = document.createElement('canvas')
    copy.width = FRAME_W
    copy.height = FRAME_H
    copy.getContext('2d')!.drawImage(c, 0, 0)
    s.clearRect(0, 0, FRAME_W, FRAME_H)
    const slices: Array<[number, number, number]> = [[0, 40, 0], [40, 18, 9], [58, 30, -6], [88, 10, 14], [98, 62, -3]]
    for (const [y, h, dx] of slices) s.drawImage(copy, 0, y, FRAME_W, h, dx, y, FRAME_W, h)
    s.globalCompositeOperation = 'source-atop'
    s.fillStyle = 'rgba(255,255,255,0.25)'
    s.fillRect(0, 58, FRAME_W, 30)
    s.globalCompositeOperation = 'source-over'
  }
  g.drawImage(c, ox, 0)
}

/** All frames side by side on one canvas strip (FRAME_COUNT × FRAME_W by FRAME_H), in `colour` */
export function drawRunnerStrip(g: CanvasRenderingContext2D, colour: string): void {
  g.clearRect(0, 0, g.canvas.width, g.canvas.height)
  for (let f = 0; f < FRAME_COUNT; f++) drawFrame(g, f, f * FRAME_W, colour)
}
