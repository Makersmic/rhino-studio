import { describe, expect, it } from 'vitest'
import { hardwareBlock, hardwareItems, hardwareScript, hardwareState, hardwareWatch, isHardwareScript } from './hardware'
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
})

