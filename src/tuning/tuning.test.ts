import { describe, expect, it } from 'vitest'
import { emCubesBounds, emCubesFile, emRefine, emValues, emWider, extrudeScript, extruderSettled, lastRun, materialKey, newRotationDistance, nozzleKey, storeScript, storedVariable, unstoreScript, unstored, paPatternFile, paRefine, paValues, squishFile, squishFine, squishPatches, tuningStatus, zFineVariable, type TuningState } from './tuning'
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
    // Klipper's default max_extrude_only_distance (50) refuses only a longer move: two 50 mm moves
    expect(extrudeScript()).toBe('M83\nG1 E50 F60\nG1 E50 F60')
    expect(extrudeScript(150)).toBe('M83\nG1 E100 F60')
    expect(extrudeScript(30)).toBe('M83\nG1 E25 F60\nG1 E25 F60\nG1 E25 F60\nG1 E25 F60')
    expect(extrudeScript(40)).toBe('M83\nG1 E33.333 F60\nG1 E33.333 F60\nG1 E33.334 F60')
    expect(extrudeScript(NaN)).toBe('M83\nG1 E50 F60\nG1 E50 F60')
    expect(check(extrudeScript(), { jobActive: false }).needsConfirm).toBe(true)
  })
})

describe('what a job uses: stored on the Rhino (Tool Manager 1.9.17)', () => {
  it('names each value as the macros look it up: head, short material, nozzle as 0_4, no SwitchFly path', () => {
    expect(storedVariable('extruder_calibration', 'BlockOne')).toBe('rhino_rd_blockone')
    expect(storedVariable('pressure_advance', 'BlockOne', 0.4, 'PLA')).toBe('rhino_pa_blockone_pla_0_4')
    expect(storedVariable('extrusion_multiplier', 'SwitchFly', 0.8, 'PETG')).toBe('rhino_em_switchfly_petg_0_8')
    expect(storedVariable('first_layer', 'BlockOne', 0.4, 'PLA')).toBeNull()
    expect(storedVariable('pressure_advance', 'BlockOne')).toBeNull()
    expect([nozzleKey(0.4), nozzleKey(0.6), nozzleKey(1)]).toEqual(['0_4', '0_6', '1_0'])
  })
  it('stores with SAVE_VARIABLE and forgets with None, both plain console lines', () => {
    expect(storeScript('pressure_advance', 'BlockOne', 0.032, 0.4, 'PLA')).toBe('SAVE_VARIABLE VARIABLE=rhino_pa_blockone_pla_0_4 VALUE=0.032')
    expect(unstoreScript('extruder_calibration', 'BlockOne')).toBe('SAVE_VARIABLE VARIABLE=rhino_rd_blockone VALUE=None')
    expect(check(storeScript('extruder_calibration', 'BlockOne', 4.3)!, { jobActive: false }).needsConfirm).toBe(false)
  })
  it('lists what Studio has that the Rhino doesn’t apply yet', () => {
    expect(unstored(st, 'BlockOne', {}).map((u) => u.variable)).toEqual(['rhino_rd_blockone', 'rhino_pa_blockone_pla_0_4'])
    expect(unstored(st, 'BlockOne', { rhino_rd_blockone: 4.3, rhino_pa_blockone_pla_0_4: 0.032 })).toEqual([])
    expect(unstored(st, 'BlockOne', { rhino_rd_blockone: 4.4, rhino_pa_blockone_pla_0_4: 0.032 })[0]!.script).toBe('SAVE_VARIABLE VARIABLE=rhino_rd_blockone VALUE=4.3')
    expect(unstored(null, 'BlockOne', {})).toEqual([])
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
    const f = squishFile({ tool: 'BlockOne', material: 'PLA', nozzle: 0.4, path: 0, bed })
    const lines = f.trim().split('\n')
    expect(lines[0]).toBe('; rhino_toolhead = BlockOne')
    expect(lines).toContain('START_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=0')
    // START_JOB applies the stored rotation distance: the file carries none of its own
    expect(lines.some((l) => l.startsWith('SET_EXTRUDER_ROTATION_DISTANCE'))).toBe(false)
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

describe('pressure advance pattern', () => {
  const bed = { x: 550, y: 375, keepOut: [] }
  it('tests evenly spaced values, and refines round a pick', () => {
    expect(paValues(0, 0.005, 21).at(-1)).toBe(0.1)
    expect(paRefine(0.035)).toEqual({ start: 0.025, step: 0.002, count: 11 })
    expect(paValues(0.025, 0.002, 11).at(-1)).toBe(0.045)
    expect(paRefine(0.004).start).toBe(0)
  })
  it('sets each column’s value before it on every layer, stays on the bed and puts the usual value back', () => {
    const values = paValues(0, 0.005, 21)
    const f = paPatternFile({ tool: 'BlockOne', material: 'PLA', nozzle: 0.4, path: 0, bed, values, restore: 0.024 })
    const lines = f.trim().split('\n')
    expect(lines.filter((l) => l === 'SET_PRESSURE_ADVANCE ADVANCE=0.05')).toHaveLength(4)
    expect(lines.filter((l) => l.startsWith(';LAYER_CHANGE'))).toHaveLength(4)
    const xs = lines.flatMap((l) => (/ X(-?[\d.]+)/.exec(l) ? [Number(/ X(-?[\d.]+)/.exec(l)![1])] : []))
    expect(Math.min(...xs)).toBeGreaterThan(5)
    expect(Math.max(...xs)).toBeLessThan(545)
    expect(lines.at(-4)).toBe('SET_PRESSURE_ADVANCE ADVANCE=0.024 ; back to the usual')
    expect(lines.at(-1)).toBe('END_PRINT')
  })
})

describe('extrusion multiplier cubes', () => {
  const bed = { x: 550, y: 375 }
  it('tries the usual range, refines round a pick, and has a wider spread for when they all look alike', () => {
    expect(emValues(0.9, 0.02, 6)).toEqual([0.9, 0.92, 0.94, 0.96, 0.98, 1])
    expect(emRefine(0.96)).toEqual({ start: 0.95, step: 0.005, count: 5 })
    expect(emValues(emWider().start, emWider().step, emWider().count).at(-1)).toBe(1.06)
  })
  it('sets each cube’s multiplier before it on every layer, prints 3 mm of layers and puts 100 % back', () => {
    const f = emCubesFile({ tool: 'BlockOne', material: 'PLA', nozzle: 0.4, path: 0, bed, values: emValues(0.9, 0.02, 6) })
    const lines = f.trim().split('\n')
    expect(lines.filter((l) => l.startsWith(';LAYER_CHANGE'))).toHaveLength(15)
    expect(lines.filter((l) => l === 'M221 S96')).toHaveLength(15)
    expect(lines.some((l) => l.startsWith('SET_PRESSURE_ADVANCE'))).toBe(false)
    expect(lines.at(-4)).toBe('M221 S100 ; back to 100 %')
    const es = lines.flatMap((l) => (/^G1 X.* E(-?[\d.]+)/.exec(l) ? [Number(/ E(-?[\d.]+)/.exec(l)![1])] : []))
    expect(Math.min(...es)).toBeGreaterThanOrEqual(0)
    const b = emCubesBounds(bed, 6)
    const xs = lines.flatMap((l) => (/ X(-?[\d.]+)/.exec(l) ? [Number(/ X(-?[\d.]+)/.exec(l)![1])] : []))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(b.x0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(b.x1)
  })
})
