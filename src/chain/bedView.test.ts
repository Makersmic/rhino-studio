import { describe, expect, it } from 'vitest'
import { flipY, viewBoxText, viewFor } from './bedView'

const bed = { x: 550, y: 400 }
const sheet = { x0: 195, y0: 145, x1: 355, y1: 255 }

describe('viewFor', () => {
  it('shows the whole bed with a margin when not zoomed, or with nothing to frame', () => {
    expect(viewFor(bed, sheet, false)).toEqual({ x: -6, y: -6, w: 562, h: 412 })
    expect(viewFor(bed, null, true)).toEqual({ x: -6, y: -6, w: 562, h: 412 })
  })
  it('zooms to the part at the bed\'s proportions, with room around it', () => {
    const v = viewFor(bed, sheet, true)
    expect(v.w / v.h).toBeCloseTo(550 / 400, 6)
    expect(v.w).toBeLessThan(550)
    const cy = flipY(400, 200)
    expect(v.x).toBeLessThanOrEqual(195 - 20)
    expect(v.x + v.w).toBeGreaterThanOrEqual(355 + 20)
    expect(v.y).toBeLessThanOrEqual(cy - 55 - 20)
    expect(v.y + v.h).toBeGreaterThanOrEqual(cy + 55 + 20)
  })
  it('stays inside the bed when the part is near an edge', () => {
    const v = viewFor(bed, { x0: 0, y0: 0, x1: 60, y1: 40 }, true)
    expect(v.x).toBe(0)
    expect(v.y + v.h).toBeCloseTo(400, 6)
    const w = viewFor(bed, { x0: 490, y0: 360, x1: 550, y1: 400 }, true)
    expect(w.x + w.w).toBeCloseTo(550, 6)
    expect(w.y).toBe(0)
  })
  it('falls back to the whole bed when the part is nearly as big as the bed, or is not a box', () => {
    expect(viewFor(bed, { x0: 10, y0: 10, x1: 540, y1: 390 }, true).w).toBe(562)
    expect(viewFor(bed, { x0: 10, y0: 10, x1: 10, y1: 50 }, true).w).toBe(562)
    expect(viewFor(bed, { x0: NaN, y0: 10, x1: 50, y1: 50 }, true).w).toBe(562)
  })
  it('writes the view box as text', () => expect(viewBoxText({ x: 1.234, y: 0, w: 100, h: 72.727 })).toBe('1.23 0 100 72.73'))
  it('flips Y so machine Y points up', () => expect(flipY(400, 0)).toBe(400))
})
