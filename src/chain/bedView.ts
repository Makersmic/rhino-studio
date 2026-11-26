/**
 * The chain builder's bed picture: which part of the bed the drawing shows. "Whole bed" is the 550 × 400 area with a small
 * margin; "Zoom to part" frames the sheet (and whatever else the stage draws) with room around it, at the bed's own
 * proportions so nothing is squashed, and never past the bed's edges. Machine Y points up and a drawing's Y points down, so
 * every Y goes through `flipY`.
 */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface View {
  x: number
  y: number
  w: number
  h: number
}

export const flipY = (bedY: number, y: number) => bedY - y
const MARGIN = 6
/** least room kept round a zoomed part (mm) and the share of its size */
const ROOM_MIN = 20
const ROOM_SHARE = 0.25

export function viewFor(bed: { x: number; y: number }, focus: Box | null, zoom: boolean): View {
  const whole: View = { x: -MARGIN, y: -MARGIN, w: bed.x + 2 * MARGIN, h: bed.y + 2 * MARGIN }
  if (!zoom || !focus) return whole
  const fw = focus.x1 - focus.x0
  const fh = focus.y1 - focus.y0
  if (!(fw > 0 && fh > 0) || ![focus.x0, focus.y0, focus.x1, focus.y1].every(Number.isFinite)) return whole
  const room = Math.max(ROOM_MIN, Math.max(fw, fh) * ROOM_SHARE)
  let w = fw + 2 * room
  let h = fh + 2 * room
  const aspect = bed.x / bed.y
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  if (w >= bed.x || h >= bed.y) return whole
  const cx = (focus.x0 + focus.x1) / 2
  const cy = flipY(bed.y, (focus.y0 + focus.y1) / 2)
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return { x: clamp(cx - w / 2, 0, bed.x - w), y: clamp(cy - h / 2, 0, bed.y - h), w, h }
}

export const viewBoxText = (v: View) => `${r(v.x)} ${r(v.y)} ${r(v.w)} ${r(v.h)}`
const r = (n: number) => Math.round(n * 100) / 100
