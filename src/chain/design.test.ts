import { describe, expect, it } from 'vitest'
import { PRESETS, presetStages, type Chain } from './chain'
import { bodiesFrom, designChecks, guessRole, place, rolesAvailable, setRole, sheetFrom, type Body } from './design'

/** a box as 12 triangles: x0..x1, y0..y1, z0..z1 */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Float32Array {
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
  const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 5, 1], [0, 4, 5], [1, 6, 2], [1, 5, 6], [2, 7, 3], [2, 6, 7], [3, 4, 0], [3, 7, 4]]
  return new Float32Array(f.flatMap((t) => t.flatMap((i) => p[i]!)))
}
const tools = { print: 'BlockOne', laser: 'LightSaber' }
const full = (): Pick<Chain, 'stages' | 'sheet'> => ({ stages: presetStages('sheet-print-laser', tools), sheet: { width: 100, depth: 60, x: 150, y: 150 } })
const area = { x: 300, y: 300 }

describe('roles', () => {
  it('guesses from the name', () => {
    expect(guessRole('Corner jig')).toBe('fixture')
    expect(guessRole('Acrylic sheet')).toBe('sheet')
    expect(guessRole('Logo')).toBe('feature')
  })
  it('offers sheet and fixture only when the chain has those stages', () => {
    expect(rolesAvailable(full())).toEqual(['sheet', 'fixture', 'feature', 'skip'])
    expect(rolesAvailable({ stages: presetStages('print-laser', tools) })).toEqual(['feature', 'skip'])
  })
  it('turns a guessed sheet or fixture into a feature when the chain has no such stage, and keeps one sheet', () => {
    const parts = [{ name: 'sheet', vertices: box(0, 0, 0, 1, 1, 1) }, { name: 'jig', vertices: box(0, 0, 0, 1, 1, 1) }, { name: 'plate', vertices: box(0, 0, 0, 1, 1, 1) }]
    expect(bodiesFrom(parts, { stages: presetStages('print-laser', tools) }).map((b) => b.role)).toEqual(['feature', 'feature', 'feature'])
    expect(bodiesFrom(parts, full()).map((b) => b.role)).toEqual(['sheet', 'fixture', 'feature'])
  })
  it('setRole keeps one sheet and drops bodies with no triangles', () => {
    const bs = bodiesFrom([{ name: 'a', vertices: box(0, 0, 0, 1, 1, 1) }, { name: 'b', vertices: box(0, 0, 0, 1, 1, 1) }, { name: 'empty', vertices: new Float32Array(0) }], full())
    expect(bs).toHaveLength(2)
    const one = setRole(setRole(bs, 1, 'sheet'), 2, 'sheet')
    expect(one.map((b) => b.role)).toEqual(['feature', 'sheet'])
  })
})

describe('place', () => {
  const bodies: Body[] = [
    { id: 1, name: 'sheet', role: 'sheet', vertices: box(0, 0, 0, 100, 60, 3) },
    { id: 2, name: 'logo', role: 'feature', vertices: box(20, 10, 0, 40, 30, 2) },
    { id: 3, name: 'skipped', role: 'skip', vertices: box(0, 0, 0, 5, 5, 5) },
  ]
  it('anchors on the sheet body and keeps the relative places; leaves out skipped bodies', () => {
    const p = place(bodies, { x: 150, y: 150 })
    expect(p.map((x) => x.name)).toEqual(['sheet', 'logo'])
    expect(p[0]!.box).toEqual([100, 120, 200, 180])
    expect(p[1]!.box).toEqual([120, 130, 140, 150])
    expect(p[1]!.height).toBe(2)
  })
  it('anchors on the whole design without a sheet body', () => {
    const p = place([{ id: 1, name: 'a', role: 'feature', vertices: box(0, 0, 0, 10, 10, 1) }, { id: 2, name: 'b', role: 'feature', vertices: box(30, 0, 0, 40, 10, 1) }], { x: 100, y: 100 })
    expect(p[0]!.box[0]).toBe(80)
    expect(p[1]!.box[2]).toBe(120)
  })
  it('sheetFrom reads size, centre and thickness', () => {
    const s = sheetFrom(place(bodies, { x: 150, y: 150 })[0]!)
    expect(s).toEqual({ sheet: { width: 100, depth: 60, x: 150, y: 150 }, thickness: 3 })
  })
  it('nothing kept gives nothing', () => expect(place([], { x: 0, y: 0 })).toEqual([]))
})

describe('designChecks', () => {
  const mk = (role: Body['role'], x0: number, y0: number, x1: number, y1: number, id = 1): Body => ({ id, name: `${role}${id}`, role, vertices: box(x0, y0, 0, x1, y1, 2) })
  const run = (bodies: Body[], chain = full(), at = { x: 150, y: 150 }, keep: Array<{ x0: number; y0: number; x1: number; y1: number; label: string }> = []) =>
    designChecks(place(bodies, at), chain, area, keep)
  const level = (c: ReturnType<typeof run>, id: string) => c.find((x) => x.id === id)?.level

  it('passes a design with fixtures around the sheet and features on it', () => {
    const c = run([mk('fixture', 0, 0, 10, 60, 1), mk('feature', 20, 10, 40, 30, 2)])
    // anchored on the whole design here (no sheet body): fixtures are 0..10, features 20..40 → centre 20 → shifted to 150
    expect(level(c, 'design-fixtures')).toBeUndefined()
    expect(level(c, 'design-bed')).toBe('ok')
  })
  it('refuses fixtures stage with no fixture body, and features with none', () => {
    const c = run([mk('skip', 0, 0, 5, 5)])
    expect(level(c, 'design-fixtures')).toBe('error')
    expect(level(c, 'design-features')).toBe('error')
  })
  it('refuses features that reach past the sheet', () => {
    const c = run([mk('fixture', 0, 0, 5, 5, 1), mk('feature', 0, 0, 200, 20, 2)])
    expect(level(c, 'design-sheet')).toBe('error')
  })
  it('refuses a body off the bed and one over a keep-out area', () => {
    expect(level(run([mk('fixture', 0, 0, 5, 5, 1), mk('feature', 0, 0, 10, 10, 2)], full(), { x: 2, y: 2 }), 'design-bed')).toBe('error')
    expect(level(run([mk('fixture', 0, 0, 5, 5, 1), mk('feature', 0, 0, 10, 10, 2)], full(), { x: 150, y: 150 }, [{ x0: 100, y0: 100, x1: 200, y1: 200, label: 'Clamp' }]), 'design-keepout')).toBe('error')
  })
  it('only notes a fixture whose box overlaps the sheet', () => {
    const c = run([mk('sheet', 0, 0, 100, 60, 1), mk('fixture', 0, 0, 100, 5, 2), mk('feature', 10, 10, 20, 20, 3)])
    expect(level(c, 'design-clash')).toBe('warn')
    expect(level(c, 'design-sheet')).toBe('ok')
  })
  it('needs no fixtures or sheet checks for print + laser', () => {
    const chain = { stages: presetStages('print-laser', tools), sheet: null }
    const c = designChecks(place([mk('feature', 0, 0, 10, 10)], { x: 100, y: 100 }), chain, area, [])
    expect(c.some((x) => x.level === 'error')).toBe(false)
  })
  it('PRESETS still lists both', () => expect(PRESETS).toHaveLength(2))
})
