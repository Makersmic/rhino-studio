import { describe, expect, it } from 'vitest'
import { chainRaise, stitchPrint } from './stitch'
import { checkFile } from '@/slicer/check'
import type { MachineInfo, PrepareJob } from '@/slicer/types'

const fix = ['G1 Z0.2000 F4800', 'G1 X100 Y100', 'G1 X110 Y100 E0.5']
const feat = ['G1 Z0.2000 F4800', 'G1 X150 Y150', 'G1 X160 Y150 E0.5']

describe('stitchPrint', () => {
  it('orders fixtures, the pause, the raise straight after it, then the features', () => {
    const r = stitchPrint({ fixtures: fix, features: feat, thickness: 3.1 })
    if ('error' in r) throw new Error(r.error)
    const L = r.lines
    const pause = L.indexOf('PAUSE')
    expect(L[pause + 1]).toBe('SET_GCODE_OFFSET Z_ADJUST=3.1 MOVE=0')
    expect(L.indexOf(fix[2]!)).toBeLessThan(pause)
    expect(L.indexOf(feat[2]!)).toBeGreaterThan(pause)
    expect(L.filter((l) => l.startsWith('SET_GCODE_OFFSET'))).toHaveLength(1)
  })
  it('refuses a missing or silly thickness', () => {
    for (const t of [null, 0, 0.1, 21, NaN]) expect('error' in stitchPrint({ fixtures: fix, features: feat, thickness: t })).toBe(true)
  })
  it('refuses empty bodies and bodies that carry the chain\'s own commands', () => {
    expect('error' in stitchPrint({ fixtures: [], features: feat, thickness: 3 })).toBe(true)
    expect('error' in stitchPrint({ fixtures: fix, features: [], thickness: 3 })).toBe(true)
    expect('error' in stitchPrint({ fixtures: [...fix, 'SET_GCODE_OFFSET Z=5'], features: feat, thickness: 3 })).toBe(true)
    expect('error' in stitchPrint({ fixtures: fix, features: [...feat, 'PAUSE'], thickness: 3 })).toBe(true)
    expect('error' in stitchPrint({ fixtures: fix, features: ['G28', ...feat], thickness: 3 })).toBe(true)
  })
})

describe('chainRaise: the file check\'s one exception', () => {
  it('accepts the exact line right after PAUSE, once', () => {
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=3.1 MOVE=0', 'PAUSE', 0)).toBe(3.1)
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=3.1 MOVE=0', 'PAUSE', 3.1)).toBeNull()
  })
  it('refuses it anywhere else, or in any other form', () => {
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=3.1 MOVE=0', 'G1', 0)).toBeNull()
    expect(chainRaise('SET_GCODE_OFFSET Z=3.1 MOVE=1', 'PAUSE', 0)).toBeNull()
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=3.1 MOVE=1', 'PAUSE', 0)).toBeNull()
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=3.1 X=5 MOVE=0', 'PAUSE', 0)).toBeNull()
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=-3 MOVE=0', 'PAUSE', 0)).toBeNull()
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=0.05 MOVE=0', 'PAUSE', 0)).toBeNull()
    expect(chainRaise('SET_GCODE_OFFSET Z_ADJUST=99 MOVE=0', 'PAUSE', 0)).toBeNull()
  })
})

describe('the file check with a chain file', () => {
  const machine = { travelMin: [0, 0, 0], travelMax: [550, 400, 300], workArea: { x: 550, y: 400 }, laserSMax: 1000, prime: null, keepOut: [] } as unknown as MachineInfo
  const job = { toolhead: 'BlockOne', process: 'fdm' } as unknown as PrepareJob
  const wrap = (mid: string[]) => ['; rhino_toolhead = BlockOne', 'START_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=210', 'G90', 'M83', ...mid, 'END_PRINT'].join('\n')
  const forbiddenOf = (text: string) => checkFile(text, job, null, machine).checks.filter((c) => c.level === 'error' && /offset|work zero/i.test(`${c.label} ${c.detail ?? ''}`))
  it('accepts the stitched file\'s one raise', () => {
    const r = stitchPrint({ fixtures: fix, features: feat, thickness: 3.1 })
    if ('error' in r) throw new Error(r.error)
    expect(forbiddenOf(wrap(r.lines))).toEqual([])
  })
  it('still refuses a raise that is not right after a pause', () => {
    expect(forbiddenOf(wrap([...fix, 'SET_GCODE_OFFSET Z_ADJUST=3.1 MOVE=0', ...feat])).length).toBeGreaterThan(0)
  })
  it('still refuses a second raise', () => {
    const r = stitchPrint({ fixtures: fix, features: feat, thickness: 3.1 })
    if ('error' in r) throw new Error(r.error)
    expect(forbiddenOf(wrap([...r.lines, 'PAUSE', 'SET_GCODE_OFFSET Z_ADJUST=3.1 MOVE=0'])).length).toBeGreaterThan(0)
  })
})
