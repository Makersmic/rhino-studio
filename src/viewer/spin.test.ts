import { describe, expect, it } from 'vitest'
import { footprints, frameSeconds, modelBox, partsBox, spinMode } from './spin'

describe('spinMode', () => {
  it('turns by default', () => {
    expect(spinMode({ lighter: false, reducedMotion: false, failed: false })).toBe('spin')
  })
  it('stands still when the system asks for less motion', () => {
    expect(spinMode({ lighter: false, reducedMotion: true, failed: false })).toBe('still')
  })
  it('keeps the flat outline with Lighter drawing or when 3D fails', () => {
    expect(spinMode({ lighter: true, reducedMotion: false, failed: false })).toBe('flat')
    expect(spinMode({ lighter: false, reducedMotion: false, failed: true })).toBe('flat')
  })
})

describe('modelBox', () => {
  it('centres on X/Y with the bottom on Z 0', () => {
    expect(modelBox({ x: 20, y: 10, z: 5 })).toEqual({ min: [-10, -5, 0], max: [10, 5, 5] })
  })
  it('gives a flat part a little height so the camera can frame it', () => {
    expect(modelBox({ x: 20, y: 10, z: 0 }).max[2]).toBe(0.5)
  })
})

describe('frameSeconds', () => {
  it('is 0 on the first frame', () => expect(frameSeconds(null, 1000)).toBe(0))
  it('measures normal frames', () => expect(frameSeconds(1000, 1016)).toBeCloseTo(0.016))
  it('caps a long gap', () => expect(frameSeconds(1000, 9000)).toBe(0.1))
  it('never goes backwards', () => expect(frameSeconds(1000, 900)).toBe(0))
})

describe('partsBox and footprints', () => {
  const sq = (s: number): Array<[number, number]> => [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]]
  const a = { x: 100, y: 100, info: { size: { x: 20, y: 20, z: 10 }, footprint: sq(20) } }
  const b = { x: 130, y: 100, info: { size: { x: 10, y: 10, z: 30 }, footprint: sq(10) } }
  it('wraps every part', () => {
    expect(partsBox([a, b])).toEqual({ min: [90, 90, 0], max: [135, 110, 30] })
  })
  it('draws each outline where it sits, Y turned down', () => {
    const f = footprints([a, b])
    expect(f.paths).toHaveLength(2)
    expect(f.paths[0]!.startsWith('M0.00 20.00')).toBe(true)
    expect(f.paths[1]!.startsWith('M35.00 15.00')).toBe(true)
  })
})
