import { describe, expect, it } from 'vitest'
import {
  CUT_LIMITS, CUT_WIZARDS, GRID, KERF, depthFile, focusFile, focusRampProblem, focusRampSafe, focusTicks, gridBounds,
  gridFile, kerfFile, kerfFrom, labelStrokes, lastCut, offsetFile, offsetSquarePath, passesFile, stepValues,
} from './cutTests'
import { checkFile } from '@/slicer/check'
import { DEFAULT_MACHINE } from '@/slicer/types'
import { newJob } from '@/slicer/profiles'

const base = { tool: 'LightSaber', material: 'PLYWOOD', x: 100, y: 100 }
const laserJob = () => newJob('LightSaber', 'laser', [])
const knifeJob = (depth: number) => { const j = newJob('DragKnife', 'dragknife', []); j.knife.depth = depth; return j }
const errors = (text: string, job: ReturnType<typeof newJob>) => checkFile(text, job, null, DEFAULT_MACHINE).checks.filter((c) => c.level === 'error').map((c) => c.id)

describe('cut tuning order', () => {
  it('has every saved value inside the Portal limits table', () => {
    for (const w of CUT_WIZARDS) for (const v of w.saves) expect(CUT_LIMITS[v]).toBeDefined()
  })
})

describe('labels', () => {
  it('draws 8 as seven strokes and 1 as two', () => {
    expect(labelStrokes('8', 0, 0, 3)).toHaveLength(7)
    expect(labelStrokes('1', 0, 0, 3)).toHaveLength(2)
    expect(labelStrokes('0.5', 0, 0, 3)).toHaveLength(6 + 1 + 5)
  })
})

describe('L1 focus ramp', () => {
  const o = { ...base, zFrom: 2, zTo: 10, sMax: 1000 }
  it('refuses a ramp that could touch the stock or is unreadable', () => {
    expect(focusRampProblem(0.5, 8)).toMatch(/1 mm/)
    expect(focusRampProblem(4, 4)).toMatch(/climb/)
    expect(focusRampProblem(2, 31)).toMatch(/30/)
    expect(focusRampProblem(2, 20)).toMatch(/16/)
    expect(focusRampProblem(2, 10)).toBeNull()
  })
  it('lifts before any X/Y move and ticks every whole mm', () => {
    const t = focusFile(o)
    const moves = t.split('\n').filter((l) => /^G[01]/.test(l))
    expect(moves[0]).toMatch(/^G0 Z10\b/)
    expect(focusTicks(o).map((k) => k.z)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(focusRampSafe(t, 1000)).toBeNull()
  })
  it('passes the file check except for its own Z moves', () => {
    expect(errors(focusFile(o), laserJob())).toEqual(['laserz'])
  })
  it('its own check refuses Z below 1 mm and high power', () => {
    expect(focusRampSafe('G0 Z0.5', 1000)).toMatch(/outside/)
    expect(focusRampSafe('G0 Z2\nM3 S400', 1000)).toMatch(/30 %/)
  })
})

describe('L2 grid', () => {
  const o = { ...base, kind: 'cut' as const, powers: stepValues(0.4, 1, 5), feeds: stepValues(200, 1000, 5), sMax: 1000 }
  it('steps the values', () => {
    expect(o.powers).toEqual([0.4, 0.55, 0.7, 0.85, 1])
  })
  it('cuts 25 squares and passes the file check', () => {
    const t = gridFile(o)
    expect(t).toContain('; rhino_tuning = laser_cut')
    expect(t.split('\n').filter((l) => l === 'M3 S1000').length).toBe(5)
    expect(errors(t, laserJob())).toEqual([])
  })
  it('engraves filled squares and passes the file check', () => {
    const t = gridFile({ ...o, kind: 'engrave' })
    expect(t).toContain('; rhino_tuning = laser_engrave')
    expect(errors(t, laserJob())).toEqual([])
  })
  it('keeps every move inside its bounds', () => {
    const b = gridBounds({ x: 100, y: 100, rows: 5, cols: 5 })
    for (const l of gridFile(o).split('\n')) {
      const x = /X(-?[\d.]+)/.exec(l); const y = /Y(-?[\d.]+)/.exec(l)
      if (x) expect(+x[1]!).toBeGreaterThanOrEqual(b.x0 - 1e-6), expect(+x[1]!).toBeLessThanOrEqual(b.x1 + 1e-6)
      if (y) expect(+y[1]!).toBeGreaterThanOrEqual(b.y0 - 1e-6), expect(+y[1]!).toBeLessThanOrEqual(b.y1 + 1e-6)
    }
    expect(b.x1 - b.x0).toBe(GRID.margin + 5 * GRID.pitch)
  })
})

describe('L3 passes, L4 kerf', () => {
  it('cuts 1 to 5 passes', () => {
    const t = passesFile({ ...base, power: 0.9, feed: 300, sMax: 1000 })
    expect(t.split('\n').filter((l) => l.startsWith('M3')).length).toBe(15)
    expect(errors(t, laserJob())).toEqual([])
  })
  it('cuts the kerf square and works the kerf out', () => {
    expect(errors(kerfFile({ ...base, power: 0.9, feed: 300, passes: 2, sMax: 1000 }), laserJob())).toEqual([])
    expect(kerfFrom(19.8)).toEqual({ value: 0.1 })
    expect(kerfFrom(20.2)).toHaveProperty('error')
    expect(kerfFrom(17)).toHaveProperty('error')
    expect(kerfFrom(KERF.size)).toEqual({ value: 0 })
  })
})

describe('K1 depth, K2 blade offset', () => {
  it('steps the depth and passes the file check', () => {
    const d = stepValues(0.1, 0.35, 6)
    const t = depthFile({ ...base, tool: 'DragKnife', depths: d })
    expect(t.split('\n').filter((l) => /^G1 Z-/.test(l))).toHaveLength(6)
    expect(errors(t, knifeJob(0.35))).toEqual([])
  })
  it('swings round each corner on the offset radius', () => {
    const p = offsetSquarePath(0, 0, 15, 0.5)
    // every arc point is 0.5 mm from its corner
    const corners = [[15, 0], [15, 15], [0, 15], [0, 0]]
    for (const c of corners) expect(p.some((q) => Math.abs(Math.hypot(q[0] - c[0]!, q[1] - c[1]!) - 0.5) < 1e-9)).toBe(true)
    expect(offsetSquarePath(0, 0, 15, 0).length).toBe(6)
  })
  it('cuts five squares and passes the file check', () => {
    const t = offsetFile({ ...base, tool: 'DragKnife', offsets: stepValues(0.1, 0.5, 5), depth: 0.3 })
    expect(t).toContain('; rhino_tuning = knife_offset')
    expect(errors(t, knifeJob(0.3))).toEqual([])
  })
})

describe('results', () => {
  const runs = [
    { tool: 'LightSaber', test: 'laser_cut_power', value: 0.8, time: 2, material: 'PLYWOOD' },
    { tool: 'LightSaber', test: 'laser_focus_height', value: 6, time: 1 },
  ]
  it('finds the last run per material, or per tool for a head value', () => {
    expect(lastCut(runs, 'LightSaber', 'laser_cut_power', 'PLYWOOD')?.value).toBe(0.8)
    expect(lastCut(runs, 'LightSaber', 'laser_cut_power', 'MDF')).toBeNull()
    expect(lastCut(runs, 'LightSaber', 'laser_focus_height', 'MDF')?.value).toBe(6)
  })
})

import { centred, cutChoices, cutDefaults, cutFile, cutFileName, cutProblem, type CutTest } from './cutTests'

describe('a wizard run with the defaults', () => {
  const m = DEFAULT_MACHINE
  const all: CutTest[] = ['laser_focus', 'laser_cut', 'laser_engrave', 'laser_passes', 'laser_kerf', 'knife_depth', 'knife_offset']
  for (const t of all) {
    it(`${t}: fits the bed, clear of the leadscrew, and its file passes the check`, () => {
      const d = cutDefaults(t, {})
      const i = { ...d, ...centred(t, d, m.workArea) }
      expect(cutProblem(t, i, m)).toBeNull()
      const knife = t.startsWith('knife')
      const text = cutFile(t, { tool: knife ? 'DragKnife' : 'LightSaber', material: 'PLYWOOD' }, i, 1000)
      expect(errors(text, knife ? knifeJob(0.35) : laserJob())).toEqual(t === 'laser_focus' ? ['laserz'] : [])
      if (t !== 'laser_kerf') expect(cutChoices(t, i).length).toBeGreaterThan(0)
    })
  }
  it('refuses a pattern off the bed or over the leadscrew', () => {
    const d = cutDefaults('laser_cut', {})
    expect(cutProblem('laser_cut', { ...d, x: 500, y: 10 }, m)).toMatch(/inside the bed/)
    expect(cutProblem('laser_kerf', { ...d, x: 460, y: 305 }, m)).toMatch(/keep-out/)
  })
  it('gives each grid square its power and speed', () => {
    const d = cutDefaults('laser_cut', {})
    const c = cutChoices('laser_cut', { ...d, x: 0, y: 0 })
    expect(c).toHaveLength(25)
    expect(c[0]).toMatchObject({ row: 0, col: 0, values: { laser_cut_power: 0.4, laser_cut_speed: 200 } })
  })
  it('names the file safely', () => {
    expect(cutFileName('laser_cut', 'LightSaber', 'MDF 3mm')).toBe('tune-laser_cut-LightSaber-MDF_3mm.gcode')
  })
})

import { applyTuned, tunedDiff, tunedFor, tunedText } from './cutTests'

describe('Job setup from tuned values', () => {
  const st = {
    ok: true,
    heads: { DragKnife: { knife_blade_offset: { value: 0.3, time: 5 } } },
    materials: {
      'LightSaber|PLYWOOD': { laser_cut_power: { value: 0.85, time: 3 }, laser_cut_speed: { value: 600, time: 3 }, laser_kerf: { value: 0.1, time: 4 }, laser_engrave_power: { value: 0.2, time: 9 } },
      'DragKnife|VINYL': { knife_depth: { value: 0.25, time: 6 } },
      'BlockOne|0.4|PLA': { pressure_advance: { value: 0.03, time: 1 } },
    },
  }
  it('reads the cut values per material, the blade offset per knife', () => {
    const l = tunedFor(st, 'LightSaber', 'PLYWOOD')!
    expect(l.laser).toEqual({ power: 0.85, feed: 600, kerf: 0.1 })
    expect(l.time).toBe(4) // the engrave save doesn't count: Job setup doesn't use it
    expect(tunedFor(st, 'DragKnife', 'VINYL')!.knife).toEqual({ depth: 0.25, tip: 0.3 })
    expect(tunedFor(st, 'DragKnife', 'PAPER')!.knife).toEqual({ tip: 0.3 })
    expect(tunedFor(st, 'LightSaber', 'MDF')).toBeNull()
    expect(tunedFor({ ...st, ok: false }, 'LightSaber', 'PLYWOOD')).toBeNull()
  })
  it('applies to its own process only, and lists what differs', () => {
    const j = laserJob()
    const t = tunedFor(st, 'LightSaber', 'PLYWOOD')!
    expect(tunedDiff(j, t).sort()).toEqual(['feed', 'kerf', 'power'].filter((k) => (j.laser as never)[k] !== (t.laser as never)[k]).sort())
    applyTuned(j, t)
    expect(j.laser).toMatchObject({ power: 0.85, feed: 600, kerf: 0.1, passes: 1 })
    expect(tunedDiff(j, t)).toEqual([])
    const k = knifeJob(0.3)
    applyTuned(k, t)
    expect(k.laser.power).toBe(newJob('DragKnife', 'dragknife', []).laser.power)
  })
  it('says what was tuned', () => {
    expect(tunedText('laser', tunedFor(st, 'LightSaber', 'PLYWOOD')!)).toBe('power 85 %, speed 600 mm/min, kerf 0.1 mm')
    expect(tunedText('dragknife', tunedFor(st, 'DragKnife', 'VINYL')!)).toBe('depth 0.25 mm, blade offset 0.3 mm')
  })
})
