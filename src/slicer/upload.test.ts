import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { durationOf, readJobFile, withToolhead } from './gcodeFile'
import { blocking, checkFile } from './check'
import { materialsFor, newJob } from './profiles'
import { DEFAULT_MACHINE } from './types'
import { safeName } from '@/stores/prepare'

const orca = readFileSync(new URL('./fixtures/orca-switchfly.gcode', import.meta.url), 'utf8')
const M = DEFAULT_MACHINE
const job = (tool: string, p: 'fdm' | 'laser' | 'cnc' | 'dragknife') => newJob(tool, p, materialsFor(tool, null).list)

describe('reading a ready-made file', () => {
  it('Orca: toolhead from START_JOB, program, time, filament, toolpath', () => {
    const i = readJobFile(orca)
    expect(i.toolhead).toBe('SwitchFly')
    expect(i.madeBy).toBe('OrcaSlicer 2.4.2')
    expect(i.seconds).toBe(192)
    expect(i.filamentMm).toBeCloseTo(254.32)
    expect(i.paths.length).toBeGreaterThan(0)
    expect(i.bounds!.min[0]).toBeGreaterThan(270)
    expect(i.bounds!.max[0]).toBeLessThanOrEqual(300)
  })
  it('durations', () => {
    expect(durationOf('1h 2m 3s')).toBe(3723)
    expect(durationOf('38m 6s')).toBe(2286)
    expect(durationOf('soon')).toBeNull()
  })
  it('safe file names', () => {
    expect(safeName('My Part (v2).GCODE')).toBe('My_Part_v2.gcode')
    expect(safeName('cut.nc')).toBe('cut.nc')
  })
})

describe('checking a ready-made file', () => {
  it("Orca SwitchFly file passes; Orca's layer-2 bed temperature is a note", () => {
    const r = checkFile(orca, job('SwitchFly', 'fdm'), null, M, { upload: true })
    expect(blocking(r.checks)).toEqual([])
    expect(r.checks.find((c) => c.id === 'heat')?.level).toBe('warn')
    expect(r.checks.find((c) => c.id === 'header')?.level).toBe('ok')
  })
  it('the same file for the wrong tool is blocked', () => {
    const r = checkFile(orca, job('BlockOne', 'fdm'), null, M, { upload: true })
    expect(blocking(r.checks).map((c) => c.id)).toEqual(expect.arrayContaining(['header', 'start']))
  })
  it('a temperature above the limits is blocked', () => {
    const r = checkFile(orca.replace('M140 S65', 'M140 S150'), job('SwitchFly', 'fdm'), null, M, { upload: true })
    expect(blocking(r.checks).map((c) => c.id)).toContain('heatmax')
  })
  it('a print file without START_JOB is blocked', () => {
    const t = ['G90', 'M83', 'G1 Z0.2', 'G1 X100 Y100', 'G1 X110 Y100 E1', 'END_PRINT'].join('\n')
    expect(blocking(checkFile(t, job('BlockOne', 'fdm'), null, M, { upload: true }).checks).map((c) => c.id)).toContain('start')
  })
  it('LightBurn-style laser file: no header or END_PRINT are notes; power and off-at-end still checked', () => {
    const lb = ['; LightBurn 1.7', 'G90', 'G21', 'G0 X100 Y100', 'M4 S600', 'G1 X150 Y100 F900', 'G1 X150 Y150', 'M5'].join('\n')
    const r = checkFile(lb, job('LightSaber', 'laser'), null, M, { upload: true })
    expect(blocking(r.checks)).toEqual([])
    expect(r.checks.filter((c) => c.level === 'warn').map((c) => c.id)).toEqual(expect.arrayContaining(['header', 'end']))
    expect(readJobFile(lb).madeBy).toBe('LightBurn')
    const hot = checkFile(lb.replace('M4 S600', 'M4 S1500'), job('LightSaber', 'laser'), null, M, { upload: true })
    expect(blocking(hot.checks).map((c) => c.id)).toContain('laserpower')
    const on = checkFile(lb.replace(/\nM5$/, ''), job('LightSaber', 'laser'), null, M, { upload: true })
    expect(blocking(on.checks).map((c) => c.id)).toContain('laseroff')
  })
  it('CNC file from elsewhere: G54 and M3 are fine (notes); G28 and tool changes are blocked', () => {
    const f = ['; rhino_toolhead = HotJoe', 'G90', 'G54', 'M3 S12000', 'G0 Z5', 'G0 X0 Y0', 'G1 Z-3 F200', 'G1 X40 F800', 'G0 Z5', 'M5', 'END_PRINT'].join('\n')
    const r = checkFile(f, job('HotJoe', 'cnc'), null, M, { upload: true })
    expect(blocking(r.checks)).toEqual([])
    expect(r.checks.find((c) => c.id === 'spindle')?.level).toBe('warn')
    expect(r.checks.find((c) => c.id === 'depth')?.label).toContain('-3')
    const fusion = f.replace('M5', 'T2 M6\nG28 G91 Z0')
    expect(blocking(checkFile(fusion, job('HotJoe', 'cnc'), null, M, { upload: true }).checks).map((c) => c.id)).toContain('commands')
  })
  it('the sent copy gets a toolhead line only when it has none', () => {
    const lb = ['; LightBurn 1.7', 'G90', 'M5'].join('\n')
    const sent = withToolhead(lb, 'LightSaber')
    expect(sent.split('\n')[0]).toBe('; rhino_toolhead = LightSaber')
    expect(sent.endsWith(lb)).toBe(true)
    expect(withToolhead(orca, 'BlockOne')).toBe(orca)
    expect(checkFile(sent, job('LightSaber', 'laser'), null, M, { upload: true }).checks.find((c) => c.id === 'header')?.level).toBe('ok')
  })
})
