import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { drawingBox, laserLoops } from '@/slicer/laserOps'
import type { LaserOp } from '@/slicer/types'
import { presetStages } from './chain'
import { SAFE_FEED, SAFE_POWER, laserChecks, materialChecks, placeLoops, starterOp } from './laser'

const CUT = readFileSync(new URL('../slicer/fixtures/kiri-laser-nested.gcode', import.meta.url), 'utf8').split('\n').filter(Boolean)
const loops = laserLoops(CUT)
const tools = { print: 'BlockOne', laser: 'LightSaber' }
const base = { stages: presetStages('sheet-print-laser', tools), sheet: { width: 100, depth: 80, x: 150, y: 150 } }
const op = (kind: LaserOp['kind'], n: number): LaserOp => ({ id: 'a', kind, name: '', power: 0.2, feed: 1000, passes: 1, spacing: 0.2, angle: 0, loops: Array.from({ length: n }, () => ({ x: 1, y: 1, w: 1, h: 1 })) })
const level = (c: ReturnType<typeof laserChecks>, id: string) => c.find((x) => x.id === id)?.level

describe('placing the loops', () => {
  it('centres the drawing on the given place, keeping its size', () => {
    const before = drawingBox(loops)
    const p = placeLoops(loops, { x: 150, y: 150 })
    const b = drawingBox(p)
    expect((b.x0 + b.x1) / 2).toBeCloseTo(150)
    expect((b.y0 + b.y1) / 2).toBeCloseTo(150)
    expect(b.x1 - b.x0).toBeCloseTo(before.x1 - before.x0)
    expect(p[0]!.box.x1 - p[0]!.box.x0).toBeCloseTo(loops[0]!.box.x1 - loops[0]!.box.x0)
  })
  it('nothing in, nothing out', () => expect(placeLoops([], { x: 1, y: 1 })).toEqual([]))
})

describe('laser checks', () => {
  const placed = placeLoops(loops, { x: 150, y: 150 })
  it('none for a chain without a laser stage', () => expect(laserChecks({ ...base, stages: presetStages('print-laser', tools).filter((s) => s.kind !== 'laser'), laser: null }, null, true)).toEqual([]))
  it('a laser stage needs a drawing', () => expect(level(laserChecks({ ...base, laser: null }, null, false), 'laser-file')).toBe('error'))
  it('a drawing that could not be read is an error once we have tried', () => {
    const lz = { file: 'Chains/a__b.svg', ops: [] }
    expect(laserChecks({ ...base, laser: lz }, null, false)).toEqual([])
    expect(level(laserChecks({ ...base, laser: lz }, null, true), 'laser-file')).toBe('error')
  })
  it('passes work on the sheet with an operation picked, and warns about a cut', () => {
    const c = laserChecks({ ...base, laser: { file: 'Chains/a__b.svg', ops: [op('score', 1)] } }, placed, true)
    expect(level(c, 'laser-sheet')).toBe('ok')
    expect(level(c, 'laser-ops')).toBe('ok')
    expect(level(c, 'laser-cut')).toBeUndefined()
    expect(level(laserChecks({ ...base, laser: { file: 'Chains/a__b.svg', ops: [op('cut', 1)] } }, placed, true), 'laser-cut')).toBe('warn')
  })
  it('refuses a drawing wider than the sheet, and warns when nothing is picked', () => {
    const small = { ...base, sheet: { width: 20, depth: 20, x: 150, y: 150 }, laser: { file: 'Chains/a__b.svg', ops: [op('score', 0)] } }
    const c = laserChecks(small, placed, true)
    expect(level(c, 'laser-sheet')).toBe('error')
    expect(level(c, 'laser-ops')).toBe('warn')
  })
})

describe('laser material', () => {
  const ply = { key: 'PLYWOOD', name: 'PLYWOOD', laserPower: 0.8, feed: 600 }
  const unknown = { key: 'MYSTERY', name: 'MYSTERY' }
  const op = (power: number): LaserOp => ({ id: 'a', kind: 'score', name: '', power, feed: 1500, passes: 1, spacing: 0.2, angle: 0, loops: [] })
  it('starts from the material, scores at low power, engraves capped', () => {
    expect(starterOp('cut', ply, null, null)).toMatchObject({ power: 0.8, feed: 600, passes: 1 })
    expect(starterOp('score', ply, null, null)).toMatchObject({ power: 0.15, feed: 1500 })
    expect(starterOp('fill', ply, null, null)).toMatchObject({ power: 0.3, feed: 600 })
  })
  it('tuned values come first: cut, and the tuned engrave values', () => {
    expect(starterOp('cut', ply, { power: 0.6, feed: 450, passes: 2 }, null)).toMatchObject({ power: 0.6, feed: 450, passes: 2 })
    expect(starterOp('fill', ply, null, { power: 0.25, feed: 2500 })).toMatchObject({ power: 0.25, feed: 2500 })
  })
  it('an unknown material starts at the safe power, never 80 %', () => {
    for (const k of ['cut', 'score', 'fill'] as const) expect(starterOp(k, unknown, null, null).power).toBeLessThanOrEqual(SAFE_POWER)
    expect(starterOp('cut', null, null, null)).toMatchObject({ power: SAFE_POWER, feed: SAFE_FEED })
  })
  it('checks: no material and a missing one are errors; unknown power warns; known passes', () => {
    expect(materialChecks(null, [ply])).toEqual([])
    expect(materialChecks({ ops: [] }, [ply])[0]).toMatchObject({ id: 'laser-material', level: 'error' })
    expect(materialChecks({ material: 'GONE', ops: [] }, [ply])[0]).toMatchObject({ level: 'error' })
    expect(materialChecks({ material: 'MYSTERY', ops: [] }, [unknown])[0]).toMatchObject({ level: 'warn' })
    expect(materialChecks({ material: 'PLYWOOD', ops: [op(0.1)] }, [ply]).map((c) => c.level)).toEqual(['ok'])
  })
  it('warns when an operation uses more than the cut power, and counts them', () => {
    const c = materialChecks({ material: 'PLYWOOD', ops: [op(0.9), op(1), op(0.2)] }, [ply])
    expect(c.find((x) => x.id === 'laser-power')).toMatchObject({ level: 'warn', label: expect.stringContaining('2 operations') })
  })
})
