import { describe, expect, it } from 'vitest'
import { check } from './commands'
import {
  clampStep,
  feedBlock,
  feedScript,
  flowScript,
  pathBlock,
  pressureAdvanceScript,
  readExtruder,
  volumetric,
  ADVANCE,
  SMOOTH,
  type ExtruderStatus,
  type FeedContext,
} from './extruder'

const ex = (o: Partial<ExtruderStatus> = {}): ExtruderStatus => ({
  factor: 1, advance: 0.024, smooth: 0.04, canExtrude: true, temp: 215,
  path: null, pathMaterial: [null, null], recordHead: 'BlockOne', ...o,
})
const ctx = (o: Partial<FeedContext> = {}): FeedContext => ({
  klippyReady: true, printHead: true, mountedName: 'BlockOne', jobActive: false, swapping: false, ex: ex(), ...o,
})

describe('extruder scripts', () => {
  it('feed moves E only, relative, and puts the G-code state back', () => {
    const r = feedScript('extrude', 25, 5)
    expect(r).toEqual({ script: 'SAVE_GCODE_STATE NAME=_rs_feed\nM83\nG1 E25 F300\nRESTORE_GCODE_STATE NAME=_rs_feed' })
    const back = feedScript('retract', 10, 2)
    expect('script' in back && back.script).toContain('G1 E-10 F120')
    for (const s of [r, back]) expect('script' in s && /\b[XYZ]-?\d/.test(s.script)).toBe(false)
  })

  it('uses G1, not G1.1, so the Rhino override can reverse SwitchFly path 1', () => {
    const r = feedScript('extrude', 5, 5)
    expect('script' in r && r.script).toMatch(/^G1 E/m)
    expect('script' in r && r.script).not.toContain('G1.1')
  })

  it('refuses silly lengths and speeds', () => {
    expect(feedScript('extrude', 0, 5)).toHaveProperty('error')
    expect(feedScript('extrude', 101, 5)).toHaveProperty('error')
    expect(feedScript('extrude', 10, 0)).toHaveProperty('error')
    expect(feedScript('extrude', 10, 25)).toHaveProperty('error')
    expect(feedScript('extrude', NaN, 5)).toHaveProperty('error')
  })

  it('flow and pressure advance stay in range and need no confirmation', () => {
    expect(flowScript(100)).toEqual({ script: 'M221 S100' })
    expect(flowScript(49)).toHaveProperty('error')
    expect(flowScript(151)).toHaveProperty('error')
    const pa = pressureAdvanceScript(0.024, 0.04)
    expect(pa).toEqual({ script: 'SET_PRESSURE_ADVANCE ADVANCE=0.024 SMOOTH_TIME=0.04' })
    expect(pressureAdvanceScript(-0.1, 0.04)).toHaveProperty('error')
    expect(pressureAdvanceScript(0.02, 0.5)).toHaveProperty('error')
    for (const s of ['M221 S95', 'SET_PRESSURE_ADVANCE ADVANCE=0.03 SMOOTH_TIME=0.04'])
      expect(check(s, { jobActive: true }).needsConfirm).toBe(false)
  })

  it('a path switch still asks (it lifts Z, retracts, heats and purges)', () => {
    expect(check('SWITCH_T1', { jobActive: false }).needsConfirm).toBe(true)
  })

  it('steppers keep to their step and range', () => {
    expect(clampStep(0.0244, ADVANCE)).toBe(0.024)
    expect(clampStep(5, ADVANCE)).toBe(1)
    expect(clampStep(0.001, SMOOTH)).toBe(0.005)
    expect(clampStep(0.043, SMOOTH)).toBe(0.045)
  })

  it('volumetric rate for 1.75 mm filament', () => {
    expect(volumetric(5)).toBeCloseTo(12.03, 1)
  })
})

describe('reading Klipper', () => {
  it('reads flow, PA and the SwitchFly path from the record', () => {
    const e = readExtruder({
      gcode_move: { extrude_factor: 0.95 },
      extruder: { pressure_advance: 0.03, smooth_time: 0.04, can_extrude: false, temperature: 30 },
      save_variables: { variables: { set_material_toolhead: 'SwitchFly', set_material_extruder_index: 1, switchfly_material_t0: 'pla', switchfly_material_t1: "'PETG'" } },
    })
    expect(e).toMatchObject({ factor: 0.95, advance: 0.03, canExtrude: false, path: 1, pathMaterial: ['PLA', 'PETG'], recordHead: 'SwitchFly' })
  })

  it('has no path when the record is for another head', () => {
    const e = readExtruder({ save_variables: { variables: { set_material_toolhead: 'BlockOne', set_material_extruder_index: 1 } } })
    expect(e.path).toBeNull()
  })
})

describe('when Extrude / Retract work', () => {
  it('with a confirmed print head, hot, no job', () => {
    expect(feedBlock(ctx())).toBeNull()
  })
  it('not cold, not during a job or swap, not without a print head', () => {
    expect(feedBlock(ctx({ ex: ex({ canExtrude: false, temp: 25 }) }))).toBe('Hotend cold')
    expect(feedBlock(ctx({ ex: ex({ canExtrude: null, temp: 120 }) }))).toBe('Hotend cold')
    expect(feedBlock(ctx({ jobActive: true }))).toMatch(/job/)
    expect(feedBlock(ctx({ swapping: true }))).toMatch(/swap/)
    expect(feedBlock(ctx({ printHead: false, mountedName: 'LightSaber' }))).toMatch(/print head/)
    expect(feedBlock(ctx({ klippyReady: false }))).toMatch(/Klipper/)
  })
  it('SwitchFly needs its path known (the E direction depends on it)', () => {
    const sf = { mountedName: 'SwitchFly' }
    expect(feedBlock(ctx({ ...sf, ex: ex({ recordHead: 'BlockOne' }) }))).toBe('Pick a path first')
    expect(feedBlock(ctx({ ...sf, ex: ex({ recordHead: 'SwitchFly', path: 0 }) }))).toBeNull()
    expect(feedBlock(ctx({ ...sf, ex: ex({ recordHead: 'SwitchFly', path: 1 }) }))).toBeNull()
  })
  it('BlockOne is refused while the record would reverse or drop E', () => {
    expect(feedBlock(ctx({ ex: ex({ recordHead: 'SwitchFly', path: 1 }) }))).toMatch(/SwitchFly recorded/)
    expect(feedBlock(ctx({ ex: ex({ recordHead: 'HotJoe' }) }))).toMatch(/HotJoe recorded/)
    // SwitchFly path 0 doesn't reverse anything: fine
    expect(feedBlock(ctx({ ex: ex({ recordHead: 'SwitchFly', path: 0 }) }))).toBeNull()
  })
})

describe('when the path can change', () => {
  const base = { klippyReady: true, printHead: true, jobActive: false, swapping: false }
  it('SwitchFly only, never during a job', () => {
    expect(pathBlock({ ...base, mountedName: 'BlockOne' })).toBe('SwitchFly only')
    expect(pathBlock({ ...base, mountedName: 'SwitchFly' })).toBeNull()
    expect(pathBlock({ ...base, mountedName: 'SwitchFly', jobActive: true })).toMatch(/job/)
  })
})
