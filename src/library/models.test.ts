import { describe, expect, it } from 'vitest'
import { addable, fromLibrary, arrange, deleteSentence, depthOf, isModelName, join, parentOf, planUpload, setupPaths, sizeText, skippedText, spaceText } from './models'
import type { LibraryEntry } from '@/portal/client'

const f = (name: string, size: number, modified: number): LibraryEntry => ({ name, dir: false, size, modified, kind: 'stl' })
const d = (name: string, items: number, modified: number): LibraryEntry => ({ name, dir: true, items, modified })

describe('models', () => {
  it('paths', () => {
    expect(join('', 'a.stl')).toBe('a.stl')
    expect(join('Box/v2', 'a.stl')).toBe('Box/v2/a.stl')
    expect(parentOf('Box/v2/a.stl')).toBe('Box/v2')
    expect(parentOf('a.stl')).toBe('')
    expect(depthOf('')).toBe(0)
    expect(depthOf('a/b')).toBe(2)
  })
  it('model names follow job setup', () => {
    for (const n of ['a.stl', 'A.STL', 'b.3mf', 'c.obj', 'd.svg', 'e.dxf']) expect(isModelName(n), n).toBe(true)
    for (const n of ['a.gcode', 'a', 'stl', 'a.step']) expect(isModelName(n), n).toBe(false)
  })
  it('arrange: folders first, then the order, search narrows', () => {
    const l = [f('b.stl', 10, 3), d('Zed', 2, 1), f('a10.stl', 30, 1), f('a9.stl', 20, 2), d('Alpha', 0, 5)]
    expect(arrange(l, 'name', false, '').map((e) => e.name)).toEqual(['Alpha', 'Zed', 'a9.stl', 'a10.stl', 'b.stl'])
    expect(arrange(l, 'name', true, '').map((e) => e.name)).toEqual(['Zed', 'Alpha', 'b.stl', 'a10.stl', 'a9.stl'])
    expect(arrange(l, 'size', true, '').filter((e) => !e.dir).map((e) => e.name)).toEqual(['a10.stl', 'a9.stl', 'b.stl'])
    expect(arrange(l, 'date', false, '').filter((e) => !e.dir).map((e) => e.name)).toEqual(['a10.stl', 'a9.stl', 'b.stl'])
    expect(arrange(l, 'name', false, ' A9 ').map((e) => e.name)).toEqual(['a9.stl'])
  })
  it('sizes', () => {
    expect(sizeText(500)).toBe('500 B')
    expect(sizeText(2048)).toBe('2 kB')
    expect(sizeText(5 * 1048576)).toBe('5.0 MB')
    expect(sizeText(3 * 1073741824)).toBe('3.0 GB')
  })
  it('planUpload keeps models, names the rest', () => {
    const p = planUpload([{ name: 'a.stl', size: 1 }, { name: 'a.gcode', size: 1 }, { name: '.x.stl', size: 1 }, { name: 'big.3mf', size: 999 }], 100)
    expect(p.keep).toEqual([0])
    expect(p.skipped.map((s) => s.name)).toEqual(['a.gcode', '.x.stl', 'big.3mf'])
    expect(skippedText(p.skipped)).toContain('a.gcode (not a model')
    expect(skippedText([])).toBeNull()
    expect(skippedText(Array.from({ length: 5 }, (_, i) => ({ name: `n${i}`, why: 'x' })))).toContain('and 2 more')
  })
  it('a selected folder is one assembly of its files, one level', () => {
    const sel = [f('a.stl', 1, 1), d('Bracket', 2, 1)]
    expect(setupPaths('Box', sel, { Bracket: ['p1.stl', 'p2.stl'] })).toEqual(['Box/a.stl', 'Box/Bracket/p1.stl', 'Box/Bracket/p2.stl'])
    expect(setupPaths('', [d('Empty', 0, 1)], {})).toEqual([])
  })
  it('delete says what goes and that there is no trash', () => {
    expect(deleteSentence(['a.stl'], { files: 1, folders: 0 })).toBe('Delete “a.stl”? That removes 1 file from the Rhino now. There is no trash to get them back from.')
    expect(deleteSentence(['x', 'y'], { files: 5, folders: 2 })).toContain('2 items')
    expect(deleteSentence(['x', 'y'], { files: 5, folders: 2 })).toContain('5 files and 2 folders')
  })
  it('space', () => {
    expect(spaceText({ files: 1, bytes: 2048, free: 10 * 1073741824, floor: 2 * 1073741824 })).toBe('1 model · 2 kB · room for 8.0 GB more')
    expect(spaceText({ files: 2, bytes: 0, free: 1, floor: 5 })).toContain('room for 0 B')
  })
  it('add to library: each original once, never a library file or a non-model', () => {
    const a = new File([new Uint8Array(1)], 'a.stl')
    const b = new File([new Uint8Array(1)], 'b.stl')
    const g = new File([new Uint8Array(1)], 'c.gcode')
    fromLibrary.add(b)
    const parts = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
    expect(addable(parts, { 1: a, 2: a, 3: b, 4: g })).toEqual([a])
    expect(addable([], {})).toEqual([])
  })
})
