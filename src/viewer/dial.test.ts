import { describe, expect, it } from 'vitest'
import { arcLetters, dialText } from './dial'

describe('dialText', () => {
  it('words the readings', () => {
    expect(dialText({ progress: 0.424, speed: 87.6, material: 'pla' })).toEqual({ done: '42 %', speed: '88 mm/s', material: 'PLA', fill: 0.424 })
  })
  it('says so when a reading is missing', () => {
    expect(dialText({ progress: null, speed: null, material: null })).toEqual({ done: '— %', speed: '— mm/s', material: '—', fill: 0 })
  })
  it('keeps the bar between empty and full', () => {
    expect(dialText({ progress: 1.3, speed: 0, material: 'PETG' }).fill).toBe(1)
  })
})

describe('arcLetters', () => {
  it('centres a word on its angle, running with the angle falling', () => {
    const r = 100
    const at = arcLetters([10, 10, 10, 10], r, 90)
    const mid = (at[1]!.angle + at[2]!.angle) / 2
    expect(mid).toBeCloseTo(Math.PI / 2)
    expect(at[0]!.angle).toBeGreaterThan(at[3]!.angle)
    // at the front (90 degrees) the letters stand upright
    expect(arcLetters([10], r, 90)[0]!.rotate).toBeCloseTo(0)
  })
})
