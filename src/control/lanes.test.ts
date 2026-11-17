import { describe, expect, it } from 'vitest'
import { ANGLE, angleFromDuty, isLanesScript, laneScript, lanesBlock, lanesState, needsLock, powerScript, testScript } from './lanes'
import { approve, check } from './commands'
import type { Status } from '@/moonraker/client'

const st = (o: Record<string, unknown>) => o as unknown as Status

describe('lanes builders', () => {
  it('power', () => {
    expect(powerScript(true)).toEqual({ script: 'SWITCHFLY_SERVO_POWER ON=1' })
    expect(powerScript(false)).toEqual({ script: 'SWITCHFLY_SERVO_POWER ON=0' })
  })
  it('test: one angle, 0 to 180, one decimal', () => {
    expect(testScript(90)).toEqual({ script: 'SWITCHFLY_SERVO_TEST ANGLE=90' })
    expect(testScript(12.34)).toEqual({ script: 'SWITCHFLY_SERVO_TEST ANGLE=12.3' })
    for (const bad of [-1, 181, NaN, Infinity]) expect(testScript(bad)).toHaveProperty('error')
    expect(testScript(ANGLE.min)).toHaveProperty('script')
    expect(testScript(ANGLE.max)).toHaveProperty('script')
  })
  it('save: angle and/or retract for lane 0 or 1', () => {
    expect(laneScript(0, { angle: 20 })).toEqual({ script: 'SWITCHFLY_SET_LANE PATH=0 ANGLE=20' })
    expect(laneScript(1, { angle: 151.26, retract: 22 })).toEqual({ script: 'SWITCHFLY_SET_LANE PATH=1 ANGLE=151.3 RETRACT=22' })
    expect(laneScript(1, { retract: 0 })).toEqual({ script: 'SWITCHFLY_SET_LANE PATH=1 RETRACT=0' })
    expect(laneScript(0, {})).toHaveProperty('error')
    expect(laneScript(0, { angle: 200 })).toHaveProperty('error')
    expect(laneScript(0, { retract: 101 })).toHaveProperty('error')
    expect(laneScript(0, { retract: -1 })).toHaveProperty('error')
  })
})

describe('isLanesScript: the only commands the lanes path sends', () => {
  it('accepts what the builders make', () => {
    for (const s of ['SWITCHFLY_SERVO_POWER ON=1', 'SWITCHFLY_SERVO_POWER ON=0', 'SWITCHFLY_SERVO_TEST ANGLE=90', 'SWITCHFLY_SERVO_TEST ANGLE=12.5',
      'SWITCHFLY_SET_LANE PATH=0 ANGLE=20', 'SWITCHFLY_SET_LANE PATH=1 RETRACT=22', 'SWITCHFLY_SET_LANE PATH=1 ANGLE=151.3 RETRACT=22']) expect(isLanesScript(s), s).toBe(true)
  })
  it('refuses everything else', () => {
    for (const s of ['SWITCHFLY_SERVO_POWER ON=2', 'SWITCHFLY_SERVO_POWER', 'SWITCHFLY_SERVO_TEST ANGLE=', 'SWITCHFLY_SERVO_TEST ANGLE=-5', 'SWITCHFLY_SERVO_TEST ANGLE=90\nG28',
      'SWITCHFLY_SERVO_TEST ANGLE=90 ; G28', 'SWITCHFLY_SET_LANE PATH=2 ANGLE=5', 'SWITCHFLY_SET_LANE PATH=0', 'SWITCHFLY_SET_LANE PATH=0 ANGLE=5 EXTRA=1',
      'SET_PIN PIN=Spindle_power VALUE=1', 'SET_SERVO_ANGLE ANGLE=90', 'SWITCH_T1', 'M3', 'FIRMWARE_RESTART', '']) expect(isLanesScript(s), s).toBe(false)
  })
  it('only power off goes without the padlock', () => {
    expect(needsLock('SWITCHFLY_SERVO_POWER ON=0')).toBe(false)
    for (const s of ['SWITCHFLY_SERVO_POWER ON=1', 'SWITCHFLY_SERVO_TEST ANGLE=90', 'SWITCHFLY_SET_LANE PATH=0 ANGLE=5']) expect(needsLock(s)).toBe(true)
  })
  it('passes the command check without a confirmation, whether or not Klipper lists the macro', () => {
    const s = 'SWITCHFLY_SERVO_TEST ANGLE=90'
    for (const ctx of [{ jobActive: false }, { jobActive: false, macros: new Set(['SWITCHFLY_SERVO_TEST']), macroText: new Map([['SWITCHFLY_SERVO_TEST', 'SET_SERVO_ANGLE ANGLE={angle}']]) }]) {
      expect(() => approve(check(s, ctx), true)).not.toThrow()
    }
  })
})

describe('lanesBlock', () => {
  const ok = { ready: true, toolName: 'SwitchFly', jobActive: false }
  it('is free only with Klipper ready, SwitchFly mounted and no job', () => {
    expect(lanesBlock(ok)).toBeNull()
    expect(lanesBlock({ ...ok, ready: false })).toMatch(/not ready/)
    expect(lanesBlock({ ...ok, toolName: 'BlockOne' })).toMatch(/SwitchFly/)
    expect(lanesBlock({ ...ok, toolName: null })).toMatch(/SwitchFly/)
    expect(lanesBlock({ ...ok, jobActive: true })).toMatch(/job/)
  })
})

describe('lanesState', () => {
  it('uses the old fixed angles until something is saved', () => {
    const s = lanesState(st({ save_variables: { variables: {} }, 'output_pin Spindle_power': { value: 0 } }))
    expect(s.angle).toEqual([0, 180])
    expect(s.retract).toEqual([0, 0])
    expect(s.powered).toBe(false)
    expect(s.sent).toBeNull()
    expect(s.recorded).toBeNull()
  })
  it('reads saved values, the rail and the recorded lane from Klipper', () => {
    const s = lanesState(st({
      save_variables: { variables: { switchfly_angle_t0: 12, switchfly_angle_t1: 151.5, switchfly_retract_t1: 22, set_material_extruder_index: 1 } },
      'output_pin Spindle_power': { value: 1 },
      'output_pin SERVO_LASER': { value: (0.0005 + (0.002 * 90) / 180) / 0.02 },
    }))
    expect(s.angle).toEqual([12, 151.5])
    expect(s.retract).toEqual([0, 22])
    expect(s.powered).toBe(true)
    expect(s.sent).toBe(90)
    expect(s.recorded).toBe(1)
  })
  it('says nothing about power when Klipper has no such pin', () => {
    expect(lanesState(st({})).powered).toBeNull()
  })
  it('angleFromDuty undoes SET_SERVO_ANGLE', () => {
    for (const a of [0, 45, 90, 135, 180]) expect(angleFromDuty((0.0005 + (0.002 * a) / 180) / 0.02)).toBe(a)
    expect(angleFromDuty(0.075)).toBe(90) // the e-stop's centre value
    expect(angleFromDuty(0.5)).toBeNull() // not a servo signal (a laser's power)
  })
})
