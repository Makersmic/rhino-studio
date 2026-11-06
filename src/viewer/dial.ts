/**
 * The dial under the Dashboard hologram: a ring on the bed with the job's numbers written around it (how far along,
 * with a bar, the toolhead's speed and the material), turning with the part. Drawn on a canvas that the scene lays flat
 * on the bed as light. The layout is plain numbers, tested without a screen; drawDial needs a browser.
 */

export interface DialValues {
  /** 0..1, Klipper's progress through the file */
  progress: number | null
  /** mm/s, the toolhead's measured speed */
  speed: number | null
  material: string | null
}

/** The words on the dial: what each reads, and how full the bar is */
export function dialText(v: DialValues): { done: string; speed: string; material: string; fill: number } {
  const p = v.progress === null || !Number.isFinite(v.progress) ? null : Math.min(1, Math.max(0, v.progress))
  return {
    done: p === null ? '— %' : `${Math.round(p * 100)} %`,
    speed: v.speed === null || !Number.isFinite(v.speed) ? '— mm/s' : `${Math.round(v.speed)} mm/s`,
    material: (v.material ?? '—').toUpperCase().slice(0, 12),
    fill: p ?? 0,
  }
}

/**
 * Where each letter of a word sits along a circle, centred on `centreDeg` (canvas degrees: 0 right, 90 down). Letters
 * run with the angle falling, tops towards the centre, so a word reads the right way round when its part of the dial is
 * at the front. `rotate` is each letter's turn in radians.
 */
export function arcLetters(widths: number[], radius: number, centreDeg: number): Array<{ angle: number; rotate: number }> {
  const total = widths.reduce((a, w) => a + w, 0)
  let at = (centreDeg * Math.PI) / 180 + total / 2 / radius
  return widths.map((w) => {
    const angle = at - w / 2 / radius
    at -= w / radius
    return { angle, rotate: angle - Math.PI / 2 }
  })
}

/** Canvas size, and the ring's radius on it: the scene sizes the flat plane from these */
export const DIAL_PX = 1024
export const DIAL_RING = DIAL_PX * 0.3

/** The three readings sit a third of a turn apart, so one is always near the front as the dial turns */
const AT = { done: 90, speed: 210, material: 330 }
const BAR_HALF = 48

/** Draw the dial on a DIAL_PX square canvas, in `colour` (CSS) on clear. `fonts`: interface and number families. */
export function drawDial(g: CanvasRenderingContext2D, v: DialValues, colour: string, fonts: { ui: string; mono: string }): void {
  const t = dialText(v)
  const c = DIAL_PX / 2
  const R = DIAL_RING
  const rad = (d: number) => (d * Math.PI) / 180
  g.clearRect(0, 0, DIAL_PX, DIAL_PX)
  g.strokeStyle = g.fillStyle = colour
  g.lineCap = 'round'

  // the ring, and a faint inner one
  g.globalAlpha = 0.9
  g.lineWidth = 3
  g.beginPath()
  g.arc(c, c, R, 0, Math.PI * 2)
  g.stroke()
  g.globalAlpha = 0.35
  g.lineWidth = 2
  g.beginPath()
  g.arc(c, c, R * 0.94, 0, Math.PI * 2)
  g.stroke()

  // the bar: a faint track, filled left to right (as seen from the front)
  const from = rad(AT.done + BAR_HALF)
  const to = rad(AT.done - BAR_HALF)
  g.lineWidth = 18
  g.globalAlpha = 0.25
  g.beginPath()
  g.arc(c, c, R + 34, to, from)
  g.stroke()
  if (t.fill > 0) {
    g.globalAlpha = 1
    g.beginPath()
    g.arc(c, c, R + 34, from - (from - to) * t.fill, from)
    g.stroke()
  }

  const word = (text: string, radius: number, centreDeg: number, font: string, alpha: number, spacing = 0) => {
    g.font = font
    g.globalAlpha = alpha
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const letters = [...text]
    const widths = letters.map((ch) => g.measureText(ch).width + spacing)
    arcLetters(widths, radius, centreDeg).forEach((p, i) => {
      g.save()
      g.translate(c + radius * Math.cos(p.angle), c + radius * Math.sin(p.angle))
      g.rotate(p.rotate)
      g.fillText(letters[i]!, 0, 0)
      g.restore()
    })
  }
  // big enough to read on a phone, where the whole dial is a couple of hundred pixels wide and seen at a slant
  const caption = `600 38px ${fonts.ui}`
  const value = `600 76px ${fonts.mono}`
  word(t.done, R + 104, AT.done, value, 1)
  word('DONE', R + 166, AT.done, caption, 0.75, 8)
  word(t.speed, R + 58, AT.speed, value, 1)
  word('SPEED', R + 124, AT.speed, caption, 0.75, 8)
  word(t.material, R + 58, AT.material, value, 1)
  word('MATERIAL', R + 124, AT.material, caption, 0.75, 8)
  g.globalAlpha = 1
}
