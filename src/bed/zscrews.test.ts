import { describe, expect, it } from 'vitest'
import { bedLayout, isScrewScript, lastTiltRun, pairs, screwEnableScript, screwMoveScript, zSteppers } from './zscrews'

// The Rhino's printer.cfg (Nov 2026): three Z motors, two at the front, one at the rear
const RHINO = {
  stepper_z: {},
  stepper_z1: {},
  stepper_z2: {},
  z_tilt: {
    z_positions: [[-17.454, -100.383], [357.4595, 515.09], [722.454, -100.383]],
    points: [[30, 30], [247.5, 350], [450, 30]],
  },
}
const BED = { w: 576, h: 406 }
const Z = ['stepper_z', 'stepper_z1', 'stepper_z2']
const homed = { homed: 'xyz', zSafe: 1 }
const unhomed = { homed: 'xy', zSafe: 0 }

describe('bed layout', () => {
  it('places each Z motor from [z_tilt], in Klipper’s stepper order', () => {
    const b = bedLayout(RHINO, BED)
    expect(b.error).toBeUndefined()
    expect(b.screws.map((s) => [s.stepper, s.label])).toEqual([
      ['stepper_z', 'Front left'],
      ['stepper_z1', 'Rear centre'],
      ['stepper_z2', 'Front right'],
    ])
    expect(b.points).toHaveLength(3)
  })
  it('reads z_positions written as text too, comments and all', () => {
    expect(pairs('-17.4,-100.3  #front left\n357,515 #rear\n')).toEqual([{ x: -17.4, y: -100.3 }, { x: 357, y: 515 }])
  })
  it('draws a four-corner bed without being told', () => {
    const s = { stepper_z: {}, stepper_z1: {}, stepper_z2: {}, stepper_z3: {}, z_tilt: { z_positions: [[-20, -20], [-20, 420], [600, 420], [600, -20]] } }
    expect(bedLayout(s, BED).screws.map((x) => x.label)).toEqual(['Front left', 'Rear left', 'Rear right', 'Front right'])
  })
  it('says so when it can’t place the screws', () => {
    expect(bedLayout({ stepper_z: {} }, BED).error).toMatch(/no \[z_tilt\]/)
    expect(bedLayout({ ...RHINO, stepper_z3: {} }, BED).error).toMatch(/3 screw positions for 4 Z motors/)
  })
  it('lists Z motors in order and stops at a gap', () => {
    expect(zSteppers({ stepper_z: {}, stepper_z1: {}, stepper_z3: {} })).toEqual(['stepper_z', 'stepper_z1'])
  })
})

describe('moving a screw', () => {
  it('marks Z unhomed and the park height stale first, then moves each ticked motor; up is a negative distance', () => {
    const b = screwMoveScript(['stepper_z', 'stepper_z2'], Z, true, 0.5, homed)
    expect(b).toEqual({
      script: [
        'SET_KINEMATIC_POSITION SET_HOMED=none CLEAR_HOMED=Z',
        'SAVE_VARIABLE VARIABLE=rhino_z_safe VALUE=0',
        'FORCE_MOVE STEPPER=stepper_z DISTANCE=-0.5 VELOCITY=3 ACCEL=20',
        'FORCE_MOVE STEPPER=stepper_z2 DISTANCE=-0.5 VELOCITY=3 ACCEL=20',
      ].join('\n'),
    })
  })
  it('only moves once Z is already unhomed', () => {
    expect(screwMoveScript(['stepper_z1'], Z, false, 1, unhomed)).toEqual({ script: 'FORCE_MOVE STEPPER=stepper_z1 DISTANCE=1 VELOCITY=3 ACCEL=20' })
  })
  it('refuses no tick, an unknown motor and a big step', () => {
    expect(screwMoveScript([], Z, true, 1, homed)).toEqual({ error: 'Tick at least one motor' })
    expect(screwMoveScript(['stepper_x'], Z, true, 1, homed)).toHaveProperty('error')
    expect(screwMoveScript(['stepper_z'], Z, true, 6, homed)).toHaveProperty('error')
    expect(screwMoveScript(['stepper_z'], Z, true, 0, homed)).toHaveProperty('error')
  })
  it('releases for turning by hand (Z untrusted first), and holds again', () => {
    expect(screwEnableScript(['stepper_z1'], Z, false, homed)).toEqual({
      script: 'SET_KINEMATIC_POSITION SET_HOMED=none CLEAR_HOMED=Z\nSAVE_VARIABLE VARIABLE=rhino_z_safe VALUE=0\nSET_STEPPER_ENABLE STEPPER=stepper_z1 ENABLE=0',
    })
    expect(screwEnableScript(['stepper_z1'], Z, true, homed)).toEqual({ script: 'SET_STEPPER_ENABLE STEPPER=stepper_z1 ENABLE=1' })
  })
})

describe('the screw path’s validator', () => {
  it('accepts what the builders make', () => {
    for (const b of [screwMoveScript(Z, Z, true, 5, homed), screwMoveScript(['stepper_z'], Z, false, 0.1, unhomed), screwEnableScript(Z, Z, false, homed), screwEnableScript(Z, Z, true, homed)])
      expect(isScrewScript((b as { script: string }).script, Z)).toBe(true)
  })
  it('refuses anything else', () => {
    for (const s of [
      'FORCE_MOVE STEPPER=stepper_x DISTANCE=1 VELOCITY=3 ACCEL=20',
      'FORCE_MOVE STEPPER=stepper_z DISTANCE=10 VELOCITY=3 ACCEL=20',
      'FORCE_MOVE STEPPER=stepper_z DISTANCE=1 VELOCITY=50 ACCEL=20',
      'FORCE_MOVE STEPPER=stepper_z3 DISTANCE=1 VELOCITY=3 ACCEL=20',
      'SET_KINEMATIC_POSITION Z=0',
      'SET_KINEMATIC_POSITION CLEAR_HOMED=Z',
      'SAVE_VARIABLE VARIABLE=current_tool VALUE=0',
      'SET_STEPPER_ENABLE STEPPER=extruder ENABLE=0',
      'G1 Z5',
      'FORCE_MOVE STEPPER=stepper_z DISTANCE=1 VELOCITY=3 ACCEL=20\nG28',
      '',
    ])
      expect(isScrewScript(s, Z), s).toBe(false)
  })
})

describe('the last Z-tilt run', () => {
  const pass = (n: number, range: string, adj: [string, string][]) => [
    { kind: 'response', text: 'Making the following Z adjustments:\n' + adj.map(([s, v]) => `// ${s} = ${v}`).join('\n') },
    { kind: 'response', text: `Retries: ${n}/5 Probed points range: ${range} tolerance: 0.050000` },
  ]
  it('reads each pass and the finish', () => {
    const r = lastTiltRun([
      { kind: 'sent', text: 'Z_TILT_ADJUST' },
      ...pass(0, '0.412000', [['stepper_z', '0.120000'], ['stepper_z1', '-0.300000'], ['stepper_z2', '0.010000']]),
      ...pass(1, '0.021000', [['stepper_z', '0.004000'], ['stepper_z1', '-0.010000'], ['stepper_z2', '0.001000']]),
    ])
    expect(r?.outcome).toBe('done')
    expect(r?.passes).toHaveLength(2)
    expect(r?.passes[0]).toEqual({ adjust: { stepper_z: 0.12, stepper_z1: -0.3, stepper_z2: 0.01 }, retry: 0, retries: 5, range: 0.412, tolerance: 0.05 })
  })
  it('catches the fault that sends you here', () => {
    const r = lastTiltRun([
      { kind: 'sent', text: 'Level the gantry (Z_TILT_ADJUST)' },
      { kind: 'error', text: '!! Move out of range: 247.500 350.000 -10.500 [0.000]' },
    ])
    expect(r).toEqual({ passes: [], outcome: 'failed', error: 'Move out of range: 247.500 350.000 -10.500 [0.000]' })
  })
  it('keeps the newest run, including one a print started', () => {
    const r = lastTiltRun([
      { kind: 'sent', text: 'Z_TILT_ADJUST' },
      { kind: 'error', text: '!! Too many retries' },
      ...pass(0, '0.030000', [['stepper_z', '0.002000']]),
    ])
    expect(r?.outcome).toBe('done')
    expect(r?.passes).toHaveLength(1)
  })
  it('is null when nothing has run', () => {
    expect(lastTiltRun([{ kind: 'response', text: 'ok' }])).toBeNull()
  })
})
