import { describe, expect, it } from 'vitest'
import { extrudeScript, extruderSettled, lastRun, materialKey, newRotationDistance, squishFile, squishFine, squishPatches, tunedFor, tuningStatus, zFineVariable, type TuningState } from './tuning'
import { check } from '@/control/commands'

const st: TuningState = {
  ok: true,
  rev: 3,
  updated: 0,
  heads: { BlockOne: { rotation_distance: { value: 4.3, time: 10, old: null } } },
  materials: { [materialKey('BlockOne', 0.4, 'PLA')]: { pressure_advance: { value: 0.032, time: 20, old: 0.04 } } },
  runs: [
    { tool: 'BlockOne', test: 'pressure_advance', value: 0.032, time: 20, nozzle: 0.4, material: 'PLA' },
    { tool: 'BlockOne', test: 'extruder_calibration', value: 4.3, time: 10 },
  ],
}

describe('extruder calibration', () => {
  it('scales the rotation distance by what actually went in', () => {
    // 21 mm left of a 120 mm mark: 99 mm went in (Ellis' example)
    expect(newRotationDistance(4.4, 21)).toEqual({ value: 4.356, actual: 99 })
    expect(newRotationDistance(4.4, 20)).toEqual({ value: 4.4, actual: 100 })
  })
  it('refuses readings that can’t be right', () => {
    expect(newRotationDistance(4.4, 130)).toMatchObject({ error: expect.stringMatching(/0 to 120/) })
    expect(newRotationDistance(4.4, 100)).toMatchObject({ error: expect.stringMatching(/too far from 100/) })
    expect(newRotationDistance(0, 20)).toMatchObject({ error: expect.stringMatching(/isn’t known/) })
  })
  it('is settled after two runs in a row within half a millimetre of 100', () => {
    expect(extruderSettled([97, 99.8])).toBe(false)
    expect(extruderSettled([97, 99.8, 100.3])).toBe(true)
  })
  it('extrudes 100 mm at 1 mm/s, and the console asks first', () => {
    expect(extrudeScript()).toBe('M83\nG1 E100 F60')
    expect(check(extrudeScript(), { jobActive: false }).needsConfirm).toBe(true)
  })
})

describe('what a job uses', () => {
  it('takes the head’s rotation distance and the material’s pressure advance', () => {
    expect(tunedFor(st, 'BlockOne', 0.4, 'PLA')).toEqual({ rotationDistance: 4.3, pressureAdvance: 0.032 })
    expect(tunedFor(st, 'BlockOne', 0.8, 'PLA')).toEqual({ rotationDistance: 4.3 })
    expect(tunedFor(null, 'BlockOne', 0.4, 'PLA')).toEqual({})
  })
  it('lists each wizard’s last run, per head or per material', () => {
    expect(lastRun(st, 'BlockOne', 'extruder_calibration')?.value).toBe(4.3)
    expect(lastRun(st, 'BlockOne', 'pressure_advance', 0.8, 'PLA')).toBeNull()
    expect(tuningStatus(st, 'BlockOne', 0.4, 'PLA').map((s) => !!s.run)).toEqual([true, false, true, false])
  })
})

describe('first-layer squish', () => {
  const bed = { x: 550, y: 375, keepOut: [{ x0: 490, y0: 300, x1: 550, y1: 375 }] }
  it('places five patches on the bed, clear of the areas to keep clear and of each other', () => {
    const p = squishPatches(bed)
    expect(p).toHaveLength(5)
    for (const r of p) {
      expect(r.x0).toBeGreaterThanOrEqual(5)
      expect(r.y1).toBeLessThanOrEqual(370)
      expect(r.x1 <= 490 || r.y1 <= 300).toBe(true)
    }
  })
  it('makes a job file: START_JOB for the head and material, one layer at 0.25 mm, END_PRINT, and the console’s file rules', () => {
    const f = squishFile({ tool: 'BlockOne', material: 'PLA', nozzle: 0.4, path: 0, rotationDistance: 4.42, bed })
    const lines = f.trim().split('\n')
    expect(lines[0]).toBe('; rhino_toolhead = BlockOne')
    expect(lines).toContain('START_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=0')
    expect(lines).toContain('SET_EXTRUDER_ROTATION_DISTANCE EXTRUDER=extruder DISTANCE=4.42 ; calibrated (Studio tuning)')
    expect(lines.at(-1)).toBe('END_PRINT')
    expect(lines.filter((l) => /^G1 Z/.test(l)).every((l) => /Z(0\.25|2\.25) /.test(l))).toBe(true)
    // 0.48 mm lines, 0.25 mm high: about 0.0499 mm of filament per mm
    expect(f).toMatch(/G1 X\d+ Y\d+ E1\.4\d+ F1200/)
  })
  it('keeps the fine-tune: the offset that looked right, less the paper test', () => {
    expect(zFineVariable('BlockOne', 'PLA_0_4')).toBe('rhino_zfine_blockone_pla_0_4')
    expect(squishFine(-0.06, -0.02)).toBe(-0.04)
    expect(squishFine(3, 0)).toBeNull()
  })
})
