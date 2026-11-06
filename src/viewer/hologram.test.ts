import { describe, expect, it } from 'vitest'
import { buildHologram, drawnDone, holoSpins, layerNow, layerStartOf, movesDone, dialPlace } from './hologram'
import { FEATURE_FILL, FEATURE_INNER_WALL, FEATURE_OUTER_WALL, FEATURE_UNKNOWN, featureOf, parseGcode } from '@/gcode/parse'

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

describe('featureOf', () => {
  it('reads the slicers’ names', () => {
    expect(featureOf('External perimeter')).toBe(FEATURE_OUTER_WALL)
    expect(featureOf('Outer wall')).toBe(FEATURE_OUTER_WALL)
    expect(featureOf('WALL-OUTER')).toBe(FEATURE_OUTER_WALL)
    expect(featureOf('Perimeter')).toBe(FEATURE_INNER_WALL)
    expect(featureOf('WALL-INNER')).toBe(FEATURE_INNER_WALL)
    expect(featureOf('shells')).toBe(FEATURE_INNER_WALL)
    expect(featureOf('Solid infill')).toBe(FEATURE_FILL)
    expect(featureOf('sparse')).toBe(FEATURE_FILL)
    expect(featureOf('Support material')).not.toBe(FEATURE_FILL)
    expect(featureOf('')).toBe(FEATURE_UNKNOWN)
  })
})

const SLICED = [
  'M83', ';LAYER_CHANGE', 'G1 Z0.2', ';TYPE:External perimeter', 'G1 X0 Y0', 'G1 X10 Y0 E1', 'G1 X10 Y10 E1',
  ';TYPE:Perimeter', 'G1 X9 Y9 E1', ';TYPE:Solid infill', 'G1 X1 Y1 E1',
  ';LAYER_CHANGE', 'G1 Z0.4', ';TYPE:External perimeter', 'G1 X0 Y0 E1', ';TYPE:Solid infill', 'G1 X5 Y5 E1',
].join('\n')

describe('the reader marks features', () => {
  it('per printed move', () => {
    const p = parseGcode(SLICED)
    const printed = [...p.features].filter((_, i) => p.kinds[i] === 2)
    expect(printed).toEqual([FEATURE_OUTER_WALL, FEATURE_OUTER_WALL, FEATURE_INNER_WALL, FEATURE_FILL, FEATURE_OUTER_WALL, FEATURE_FILL])
  })
  it('reads Kiri’s "; feature" comments', () => {
    const p = parseGcode('M83\n; feature shells\nG1 X0 Y0\nG1 X5 Y0 E1\n')
    expect(p.features[p.moveCount - 1]).toBe(FEATURE_INNER_WALL)
  })
})

describe('buildHologram', () => {
  it('keeps the outer walls only, and maps the layers', () => {
    const p = parseGcode(SLICED)
    const h = buildHologram(p, 1000)
    expect(h.kept).toBe('outer walls')
    expect(h.drawnMoves).toBe(3)
    expect([...h.layerStarts]).toEqual([0, 2])
    expect(h.sourceMove.every((i) => p.features[i] === FEATURE_OUTER_WALL)).toBe(true)
  })
  it('keeps every printed move when the file names no features', () => {
    const p = parseGcode('M83\nG1 X0 Y0\nG1 X5 Y0 E1\nG1 X5 Y5 E1\n')
    expect(buildHologram(p, 1000)).toMatchObject({ kept: 'all printing', drawnMoves: 2 })
  })
  it('thins evenly over the budget', () => {
    const lines = ['M83', ';TYPE:External perimeter', 'G1 X0 Y0']
    for (let i = 1; i <= 100; i++) lines.push(`G1 X${i} Y0 E1`)
    expect(buildHologram(parseGcode(lines.join('\n')), 10).drawnMoves).toBe(10)
  })
})

describe('layerNow', () => {
  const starts = new Uint32Array([0, 10, 25])
  it('is the layer of the last done move, to the next layer', () => {
    expect(layerNow(starts, 40, 0)).toEqual({ from: 0, to: 0, layer: -1 })
    expect(layerNow(starts, 40, 12)).toEqual({ from: 10, to: 25, layer: 1 })
    expect(layerNow(starts, 40, 30)).toEqual({ from: 25, to: 40, layer: 2 })
  })
})

describe('dialPlace', () => {
  it('centres the dial under the part, just below the first layer', () => {
    const d = dialPlace({ min: [0, 0, 0.2], max: [30, 40, 10] }, 0.34)
    expect([d.x, d.y]).toEqual([15, 20])
    expect(d.z).toBeLessThan(0.2)
    // the ring (0.34 of the dial) is wider than the part's diagonal
    expect(d.size * 0.34).toBeGreaterThan(25)
  })
})
