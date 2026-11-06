import { describe, expect, it } from 'vitest'
import { kindOf, planDrop, skippedMessage } from './dropPlan'

describe('kindOf', () => {
  it('sorts files by what they are', () => {
    expect(kindOf('a.STL')).toBe('model')
    expect(kindOf('a.3mf')).toBe('model')
    expect(kindOf('a.svg')).toBe('flat')
    expect(kindOf('a.dxf')).toBe('flat')
    expect(kindOf('a.gcode')).toBe('gcode')
    expect(kindOf('a.pdf')).toBe('other')
  })
})

describe('planDrop', () => {
  it('loads every model', () => {
    expect(planDrop(['a.stl', 'b.obj', 'c.3mf'])).toEqual({ load: [0, 1, 2], kind: 'model', skipped: [] })
  })
  it('the first model or drawing sets the kind; the rest are skipped with a reason', () => {
    const p = planDrop(['a.stl', 'b.svg', 'c.stl'])
    expect(p.load).toEqual([0, 2])
    expect(p.kind).toBe('model')
    expect(p.skipped).toEqual([{ name: 'b.svg', why: 'a flat drawing, and this job holds 3D models' }])
  })
  it('a drawing first makes a drawing job', () => {
    const p = planDrop(['x.gcode', 'b.svg', 'a.stl'])
    expect(p.kind).toBe('flat')
    expect(p.load).toEqual([1])
    expect(p.skipped.map((s) => s.name)).toEqual(['x.gcode', 'a.stl'])
  })
  it('G-code alone: only the first', () => {
    const p = planDrop(['a.gcode', 'b.gcode'])
    expect(p).toEqual({ load: [0], kind: 'gcode', skipped: [{ name: 'b.gcode', why: 'one ready-made G-code file at a time' }] })
  })
  it('skips files it can’t read', () => {
    const p = planDrop(['notes.pdf'])
    expect(p.load).toEqual([])
    expect(p.kind).toBeNull()
  })
  it('adding to a job keeps its kind and never takes G-code', () => {
    const p = planDrop(['a.svg', 'b.stl', 'c.gcode'], 'model')
    expect(p.load).toEqual([1])
    expect(p.skipped.map((s) => s.name)).toEqual(['a.svg', 'c.gcode'])
  })
})

describe('skippedMessage', () => {
  it('is null with nothing skipped', () => expect(skippedMessage([])).toBeNull())
  it('names one file', () => expect(skippedMessage([{ name: 'b.svg', why: 'x' }])).toBe('Skipped b.svg: x.'))
  it('lists several', () => expect(skippedMessage([{ name: 'a', why: 'x' }, { name: 'b', why: 'y' }])).toBe('Skipped 2 files: a (x), b (y).'))
})
