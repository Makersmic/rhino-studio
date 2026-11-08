import { describe, expect, it } from 'vitest'
import { extrudeScript, extruderSettled, lastRun, materialKey, newRotationDistance, tunedFor, tuningStatus, type TuningState } from './tuning'
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
