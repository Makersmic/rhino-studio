import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { assembleLaser, assign, hatch, holesFirst, laserLoops, loopRef, drawingBox, matchLoops, newOp, opsWarnings, toggleLoop, within, type Loop } from './laserOps'
import type { LaserOp, LaserSettings } from './types'

// Kiri:Moto's laser cut of a 60 x 40 mm outline with a round hole (r 8) and a square hole (15 x 16), as Studio wrote it
const CUT = readFileSync(new URL('./fixtures/kiri-laser-nested.gcode', import.meta.url), 'utf8').split('\n').filter(Boolean)
const L: LaserSettings = { power: 0.8, feed: 600, passes: 1, cutHeight: 0, kerf: 0, smooth: 0, outerOnly: false }
const loops = laserLoops(CUT)
const by = (w: number) => loops.findIndex((l) => Math.abs(l.box.x1 - l.box.x0 - w) < 1)
const [square, circle, outline] = [by(15), by(16), by(60)]
const op = (kind: LaserOp['kind'], picks: Loop[], over: Partial<LaserOp> = {}): LaserOp => ({ ...newOp(kind, L), ...over, loops: picks.map((l) => loopRef(l, drawingBox(loops))) })
const moves = (lines: string[]) => lines.filter((l) => /^G[01] /.test(l))

describe('laser loops from Kiri’s cut', () => {
  it('finds the three closed loops, holes before the outline', () => {
    expect(loops).toHaveLength(3)
    expect(loops.every((l) => l.closed)).toBe(true)
    expect([square, circle, outline].every((i) => i >= 0)).toBe(true)
    expect(outline).toBe(2)
    expect(within(loops[circle]!, loops[outline]!) && within(loops[square]!, loops[outline]!)).toBe(true)
    expect(within(loops[outline]!, loops[circle]!)).toBe(false)
    expect(holesFirst([outline, circle], loops)).toEqual([circle, outline])
  })
  it('matches a pick again after the part moves or the kerf changes', () => {
    const ref = loopRef(loops[circle]!, drawingBox(loops))
    const shift = (dx: number, grow: number) => loops.map((l) => ({ ...l, box: { x0: l.box.x0 + dx - grow, y0: l.box.y0 + dx - grow, x1: l.box.x1 + dx + grow, y1: l.box.y1 + dx + grow } }))
    expect(matchLoops([ref], shift(37, 0))).toEqual([circle])
    expect(matchLoops([ref], shift(-12, 0.1))).toEqual([circle])
    expect(matchLoops([{ ...ref, x: ref.x + 20 }], loops)).toEqual([-1])
  })
})

describe('engrave fill', () => {
  const sq = (x: number, y: number, s: number): Loop => ({ pts: [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]], closed: true, box: { x0: x, y0: y, x1: x + s, y1: y + s } })
  it('hatches inside, back and forth', () => {
    const h = hatch([sq(0, 0, 10)], 1, 0)
    expect(h).toHaveLength(10)
    expect(h.every(([a, b]) => Math.abs(Math.abs(b[0] - a[0]) - 10) < 1e-9)).toBe(true)
    expect(h[0]![0][0]).toBeLessThan(h[0]![1][0])
    expect(h[1]![0][0]).toBeGreaterThan(h[1]![1][0])
  })
  it('leaves a picked hole empty (even-odd), and turns with the angle', () => {
    const h = hatch([sq(0, 0, 10), sq(4, 4, 2)], 1, 0)
    expect(h.length).toBe(12) // rows 4.5 and 5.5 split in two
    expect(h.every(([a, b]) => !(Math.min(a[0], b[0]) < 5 && Math.max(a[0], b[0]) > 5 && a[1] > 4 && a[1] < 6))).toBe(true)
    const d = hatch([sq(0, 0, 10)], 1, 90)
    expect(d.every(([a, b]) => Math.abs(a[0] - b[0]) < 1e-9)).toBe(true)
  })
})

describe('the file by operation', () => {
  it('without operations, the cut is unchanged and repeated per pass', () => {
    expect(assembleLaser(CUT, L, 1000)).toEqual(CUT)
    const two = assembleLaser(CUT, { ...L, passes: 2 }, 1000)
    expect(two.length).toBe(CUT.length * 2 + 2)
    expect(assembleLaser(CUT, { ...L, ops: [op('cut', [])] }, 1000)).toEqual(CUT)
  })
  it('runs each operation in order with its own power, speed and passes, then everything else', () => {
    const ops = [op('score', [loops[square]!], { power: 0.1, feed: 1500, name: 'Mark' }), op('cut', [loops[circle]!], { power: 0.9, feed: 300, passes: 2 })]
    const out = assembleLaser(CUT, { ...L, ops }, 1000)
    const heads = out.filter((l) => l.startsWith('; operation'))
    expect(heads).toEqual(['; operation: Mark (score, 10 %, 1500 mm/min)', '; operation: Cut 2 (cut, 90 %, 300 mm/min, 2 passes)', '; operation: Everything else (cut, 80 %, 600 mm/min)'])
    const s = out.filter((l) => l.startsWith('M3'))
    expect(s).toEqual(['M3 S100', 'M3 S900', 'M3 S900', 'M3 S800'])
    expect(out.filter((l) => l === 'M5').length).toBe(s.length)
    expect(moves(out).filter((l) => l.startsWith('G1')).length).toBe(moves(CUT).filter((l) => l.startsWith('G1')).length + (loops[circle]!.pts.length - 1))
  })
  it('engraves a fill, then cuts the same loop out when it’s picked for both', () => {
    const ops = [op('fill', [loops[square]!], { spacing: 1 }), op('cut', [loops[square]!])]
    const out = assembleLaser(CUT, { ...L, ops }, 1000)
    const at = (t: string) => out.findIndex((l) => l.startsWith(`; operation: ${t}`))
    expect(at('Engrave fill 1')).toBeLessThan(at('Cut 2'))
    expect(out.filter((l) => l.startsWith('M3')).length).toBe(16 + 1 + 2) // 16 lines across the 16 mm square, its cut, the other two loops
    expect(assign(ops, loops).rest.sort()).toEqual([circle, outline].sort())
  })
  it('cuts holes before the outline inside one operation, whatever order they were picked in', () => {
    const out = assembleLaser(CUT, { ...L, ops: [op('cut', [loops[outline]!, loops[circle]!])] }, 1000)
    const first = moves(out).find((l) => l.startsWith('G0'))!
    expect(first).toContain(`X${loops[circle]!.pts[0]![0]}`)
  })
})

describe('order and picking', () => {
  it('warns when a cut frees a part before work inside it', () => {
    const w = opsWarnings([op('cut', [loops[outline]!], { name: 'Outline' }), op('fill', [loops[circle]!], { name: 'Logo' })], loops)
    expect(w).toEqual(['Outline cuts around Logo, which runs after it: the part may drop or shift first. Move Outline down.'])
    expect(opsWarnings([op('fill', [loops[circle]!]), op('cut', [loops[square]!, loops[circle]!]), op('cut', [loops[outline]!])], loops)).toEqual([])
    expect(opsWarnings([op('cut', [loops[outline]!], { name: 'Outline' })], loops)[0]).toMatch(/Everything else/)
  })
  it('a loop is in one line operation and one fill at most', () => {
    const ops = [op('cut', []), op('score', []), op('fill', [])]
    toggleLoop(ops, 0, loops[circle]!, loops)
    toggleLoop(ops, 2, loops[circle]!, loops)
    toggleLoop(ops, 1, loops[circle]!, loops)
    expect(ops.map((o) => o.loops.length)).toEqual([0, 1, 1])
    toggleLoop(ops, 1, loops[circle]!, loops)
    expect(ops[1]!.loops).toEqual([])
  })
  it('says when picks no longer match the drawing', () => {
    const o = op('cut', [loops[circle]!])
    o.loops[0]!.x += 30
    expect(opsWarnings([o], loops)[0]).toMatch(/no longer in the drawing/)
  })
})

import { profileSettings } from './sliceProfiles'
import { newJob } from './profiles'
describe('profiles', () => {
  it('a profile never takes a drawing’s operations', () => {
    const j = newJob('LightSaber', 'laser', [])
    j.laser.ops = [newOp('cut', j.laser)]
    expect('ops' in profileSettings(j)).toBe(false)
    expect(j.laser.ops).toHaveLength(1)
  })
})
