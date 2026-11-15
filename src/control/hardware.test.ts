import { describe, expect, it } from 'vitest'
import { hardwareBlock, hardwareItems, hardwareScript, hardwareState, hardwareWatch, isControl, isHardwareScript } from './hardware'
import type { SystemHardware } from '@/toolmgr/types'

const role = (over: Partial<SystemHardware>): SystemHardware => ({ name: 'x', role: 'switch', pin: 'PB1', macros: [], ...over }) as SystemHardware

describe('Control › Hardware', () => {
  const items = hardwareItems(
    [role({ name: 'driver_fan', role: 'fan' }), role({ name: 'lamp', role: 'switch' }), role({ name: 'dimmer', role: 'level', max_power: 0.5 }),
     role({ name: 'gate', role: 'servo', max_angle: 90 }), role({ name: 'spindle_speed', role: 'level' })],
    [
      { name: 'chamber', device: 'heater', label: 'Chamber heater', pins: { pin: 'PA2' }, settings: { max_temp: 80 }, expose: ['control'], live: true },
      { name: 'dust', device: 'dust', label: 'Dust', pins: { pin: 'PB2' }, settings: {}, expose: ['dashboard'] },
      { name: 'router', device: 'spindle_pwm', label: 'Spindle', pins: { pin: 'PB3' }, settings: {}, expose: ['control'], live: true, scope: 'tools', scope_values: ['HotJoe'], scope_slots: [4] },
      { name: 'lid', device: 'interlock', label: 'Lid', purpose: 'Door or lid interlock', pins: { pin: 'PG12' }, settings: {}, expose: ['dashboard'] },
      { name: 'strip', device: 'neopixel', label: 'Strip', pins: { pin: 'PB0' }, settings: { color_order: 'GRBW' }, expose: ['control'] },
    ],
  )
  const by = (n: string) => items.find((i) => i.name === n)!

  it('picks the right control for each item, and never a tool output', () => {
    expect(items.map((i) => `${i.name}:${i.kind}`)).toEqual(['driver_fan:fan', 'strip:light', 'lamp:switch', 'dimmer:level', 'router:level', 'gate:servo', 'chamber:heater', 'lid:input'])
    expect(items.some((i) => i.name === 'spindle_speed')).toBe(false)
    expect(items.some((i) => i.name === 'dust')).toBe(false) // not exposed to Control
  })

  it('builds the exact command, scaled to the item', () => {
    expect(hardwareScript(by('driver_fan'), 0.5)).toEqual({ script: 'SET_FAN_SPEED FAN=driver_fan SPEED=0.5' })
    expect(hardwareScript(by('dimmer'), 1)).toEqual({ script: 'SET_PIN PIN=dimmer VALUE=0.5' }) // capped at max_power
    expect(hardwareScript(by('lamp'), 1)).toEqual({ script: 'SET_PIN PIN=lamp VALUE=1' })
    expect(hardwareScript(by('gate'), 45)).toEqual({ script: 'SET_SERVO SERVO=gate ANGLE=45' })
    expect(hardwareScript(by('chamber'), 60)).toEqual({ script: 'SET_HEATER_TEMPERATURE HEATER=chamber TARGET=60' })
    expect(hardwareScript(by('strip'), 0.25)).toEqual({ script: 'SET_LED LED=strip RED=0.25 GREEN=0.25 BLUE=0.25 WHITE=0.25' })
    expect('error' in hardwareScript(by('chamber'), 81)).toBe(true)
    expect('error' in hardwareScript(by('gate'), 91)).toBe(true)
    expect('error' in hardwareScript(by('lid'), 1)).toBe(true)
  })

  it('only its own commands pass the no-confirm check', () => {
    expect(isHardwareScript('SET_FAN_SPEED FAN=driver_fan SPEED=0.5', items)).toBe(true)
    expect(isHardwareScript('SET_PIN PIN=dimmer VALUE=0.5', items)).toBe(true)
    expect(isHardwareScript('SET_PIN PIN=dimmer VALUE=0.6', items)).toBe(false) // above its cap
    expect(isHardwareScript('SET_PIN PIN=SPINDLE_SPEED VALUE=1', items)).toBe(false)
    expect(isHardwareScript('SET_SERVO SERVO=SERVO_LASER ANGLE=10', items)).toBe(false)
    expect(isHardwareScript('SET_FAN_SPEED FAN=nope SPEED=1', items)).toBe(false)
    expect(isHardwareScript('SET_FAN_SPEED FAN=driver_fan SPEED=1\nG28', items)).toBe(false)
    expect(isHardwareScript('SET_HEATER_TEMPERATURE HEATER=chamber TARGET=200', items)).toBe(false)
  })

  it('reads live state, and an open interlock is an alert', () => {
    const st = {
      'fan_generic driver_fan': { speed: 0.6, rpm: null },
      'output_pin dimmer': { value: 0.25 },
      'output_pin lamp': { value: 1 },
      'heater_generic chamber': { temperature: 41.6, target: 60 },
      'gcode_button lid': { state: 'PRESSED' },
    } as never
    expect(hardwareState(by('driver_fan'), st).text).toBe('60 %')
    expect(hardwareState(by('dimmer'), st)).toMatchObject({ value: 0.5, text: '50 %' })
    expect(hardwareState(by('lamp'), st).text).toBe('On')
    expect(hardwareState(by('chamber'), st)).toMatchObject({ value: 60, text: '42°' })
    expect(hardwareState(by('lid'), st)).toMatchObject({ text: 'Open', alert: true })
  })

  it('live items need the padlock, scoped items the right tool', () => {
    const ctx = { ready: true, mountedSlot: 1, unlocked: false }
    expect(hardwareBlock(by('driver_fan'), ctx)).toBeNull()
    expect(hardwareBlock(by('chamber'), ctx)).toBe('Unlock to use')
    expect(hardwareBlock(by('chamber'), { ...ctx, unlocked: true })).toBeNull()
    expect(hardwareBlock(by('router'), { ...ctx, unlocked: true })).toBe('Only with HotJoe')
    expect(hardwareBlock(by('router'), { ...ctx, unlocked: true, mountedSlot: 4 })).toBeNull()
    expect(hardwareBlock(by('driver_fan'), { ...ctx, ready: false })).toBe('Klipper is not ready')
  })

  it('subscribes to the hardware objects Klipper has', () => {
    const w = hardwareWatch(['output_pin lamp', 'gcode_button lid', 'heater_generic chamber', 'extruder', 'webhooks'])
    expect(Object.keys(w).sort()).toEqual(['gcode_button lid', 'heater_generic chamber', 'output_pin lamp'])
    expect(w['heater_generic chamber']).toEqual(['temperature', 'target', 'power'])
  })

  it("the Rhino's Klipper extras: the encoder is a sensor with travel, the tachometer a reading, neither a control", () => {
    const items = hardwareItems([], [
      { name: 'filament_enc', device: 'encoder', label: 'Filament encoder', pins: { pin: 'PB1' }, settings: { wheel_circumference: 31.4 }, expose: ['dashboard'] },
      { name: 'spindle_rpm', device: 'tachometer', label: 'Spindle tachometer', pins: { pin: 'PC5' }, settings: { pulses_per_rev: 7 }, expose: ['control'] },
    ])
    expect(items.map((i) => [i.name, i.kind, i.object, isControl(i)])).toEqual([
      ['spindle_rpm', 'rpm', 'spindle_tachometer spindle_rpm', false],
      ['filament_enc', 'input', 'filament_angle_sensor filament_enc', false],
    ])
    const enc = items[1]!
    const tach = items[0]!
    expect(hardwareState(enc, { 'filament_angle_sensor filament_enc': { enabled: true, filament_detected: true, angle: 212.4, measured_mm: 0, commanded_mm: 0, slip_pct: 0, printing: false } }).text).toBe('Filament OK · 212°')
    expect(hardwareState(enc, { 'filament_angle_sensor filament_enc': { enabled: true, filament_detected: true, angle: 1, measured_mm: 12.3, commanded_mm: 12.6, slip_pct: 2.4, printing: true } }).text).toBe('Moving · 12.3 / 12.6 mm · 2 % slip')
    const jam = hardwareState(enc, { 'filament_angle_sensor filament_enc': { enabled: true, filament_detected: false, angle: 1, measured_mm: 12.3, commanded_mm: 20, slip_pct: 38, printing: true } })
    expect(jam.alert).toBe(true)
    expect(jam.text).toMatch(/^Not moving/)
    expect(hardwareState(enc, { 'filament_angle_sensor filament_enc': { enabled: false } }).text).toBe('Off (no print head)')
    expect(hardwareState(tach, { 'spindle_tachometer spindle_rpm': { rpm: 14980 } })).toEqual({ value: 14980, text: '14980 rpm' })
    expect(hardwareWatch(['spindle_tachometer spindle_rpm', 'filament_angle_sensor filament_enc'])).toEqual({
      'spindle_tachometer spindle_rpm': ['rpm'],
      'filament_angle_sensor filament_enc': ['enabled', 'filament_detected', 'angle', 'measured_mm', 'commanded_mm', 'slip_pct', 'printing'],
    })
  })
})

