import { describe, expect, it } from 'vitest'
import { drawnDone, holoSpins, layerStartOf, movesDone } from './hologram'

describe('movesDone', () => {
  const offsets = new Uint32Array([10, 30, 55, 80])
  it('counts moves whose line starts before the position', () => {
    expect(movesDone(offsets, 0)).toBe(0)
    expect(movesDone(offsets, 10)).toBe(0)
    expect(movesDone(offsets, 11)).toBe(1)
    expect(movesDone(offsets, 56)).toBe(3)
    expect(movesDone(offsets, 10_000)).toBe(4)
  })
  it('nothing done without a position', () => expect(movesDone(offsets, null)).toBe(0))
})

describe('drawnDone', () => {
  it('is the same number when nothing was thinned', () => expect(drawnDone(null, 7)).toBe(7))
  it('maps file moves to drawn moves when thinned', () => {
    const src = new Uint32Array([0, 4, 9, 15])
    expect(drawnDone(src, 0)).toBe(0)
    expect(drawnDone(src, 5)).toBe(2)
    expect(drawnDone(src, 16)).toBe(4)
  })
})

describe('holoSpins', () => {
  it('turns by default', () => expect(holoSpins({ lighter: false, reducedMotion: false })).toBe(true))
  it('stands still on the kiosk or with less motion', () => {
    expect(holoSpins({ lighter: true, reducedMotion: false })).toBe(false)
    expect(holoSpins({ lighter: false, reducedMotion: true })).toBe(false)
  })
})

describe('layerStartOf', () => {
  const starts = new Uint32Array([0, 10, 25])
  it('finds the layer of the last done move', () => {
    expect(layerStartOf(starts, 0)).toBe(0)
    expect(layerStartOf(starts, 5)).toBe(0)
    expect(layerStartOf(starts, 11)).toBe(10)
    expect(layerStartOf(starts, 10)).toBe(0)
    expect(layerStartOf(starts, 40)).toBe(25)
  })
})
