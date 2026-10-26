import { describe, expect, it } from 'vitest'
import { WIZ_STEPS, STEP_POSE, asksSensorType, checkStep, newDraft, payload, pinText, pinsShown, settingShown, type HwDevice } from './wizard'

const BUILT = ['gcode', 'heater', 'manual', 'motors', 'temperature']
const dev = (over: Partial<HwDevice>): HwDevice => ({
  id: 'heater', group: 'heat', label: 'Chamber heater', section: 'heater_generic', role: null, status: 'ready', writer: 'wizard',
  pins: [['pin', 'pwm_out', true], ['sensor', 'adc', true]], follows: ['manual'], expose: ['control', 'dashboard'],
  expose_allowed: ['control', 'dashboard', 'macros'], sensor: false, purpose: null, live: true, hardware_only: true, help: '',
  settings: [{ key: 'max_temp', kind: 'num', default: 120, min: 30, max: 120 }, { key: 'thermistor', kind: 'choice', default: 'Generic 3950', options: ['Generic 3950'] }],
  ...over,
})

describe('Add hardware wizard', () => {
  it('five questions plus the check, each with its mascot pose', () => {
    expect(WIZ_STEPS).toEqual(['What', 'Wiring', 'Tools', 'Follows', 'Shows', 'Check'])
    expect(WIZ_STEPS.map((s) => STEP_POSE[s])).toEqual(['what', 'wiring', 'tools', 'follows', 'shows', 'done'])
  })

  it('a new draft takes the catalog defaults and the first follows rule that is built', () => {
    const d = newDraft(dev({ id: 'dust', follows: ['output', 'job', 'manual'] }), BUILT)
    expect(d.follows).toBe('manual')
    expect(newDraft(dev({}), BUILT).settings).toEqual({ max_temp: 120, thermistor: 'Generic 3950' })
  })

  it('checks each step before moving on', () => {
    const h = dev({})
    const d = newDraft(h, BUILT)
    expect(checkStep('What', h, d, [], BUILT)).toMatch(/Name/)
    d.name = 'chamber'
    expect(checkStep('What', h, d, ['chamber'], BUILT)).toMatch(/already used/)
    expect(checkStep('What', h, d, [], BUILT)).toBeNull()
    expect(checkStep('Wiring', h, d, [], BUILT)).toMatch(/pin/)
    d.pins = { pin: 'PB10', sensor: 'PB10' }
    expect(checkStep('Wiring', h, d, [], BUILT)).toMatch(/only be used once/)
    d.pins = { pin: 'PB10', sensor: 'PF5' }
    expect(checkStep('Wiring', h, d, [], BUILT)).toBeNull()
    d.settings.max_temp = 121
    expect(checkStep('Follows', h, d, [], BUILT)).toMatch(/30 to 120/)
    d.scope = 'category'
    expect(checkStep('Tools', h, d, [], BUILT)).toMatch(/category/)
    expect(checkStep('What', dev({ status: 'planned', writer: undefined }), d, [], BUILT)).toMatch(/isn't built/)
  })

  it('refuses a follows rule that waits for job hooks', () => {
    const x = dev({ id: 'dust', follows: ['output', 'manual'], settings: [] })
    const d = newDraft(x, BUILT)
    d.follows = 'output'
    expect(checkStep('Follows', x, d, [], BUILT)).toMatch(/job hooks/)
  })

  it('asks the switch type for sensors, and a thermistor readout only needs a pin when it reads one', () => {
    expect(asksSensorType(dev({ id: 'interlock', sensor: true, pins: [['pin', 'digital_in', true]] }))).toBe(true)
    expect(asksSensorType(dev({}))).toBe(false)
    const t = dev({ id: 'temp_sensor', pins: [['sensor', 'adc', false]], settings: [{ key: 'source', kind: 'choice', default: 'thermistor', options: ['thermistor', 'host'] }] })
    const d = newDraft(t, BUILT)
    expect(pinsShown(t, d)).toEqual([['sensor', 'adc', true]])
    d.settings.source = 'host'
    expect(pinsShown(t, d)).toEqual([])
  })

  it('builds the Portal body: numbers as numbers, choices as given, no empty pins', () => {
    const h = dev({ settings: [{ key: 'max_temp', kind: 'num', default: 120, min: 30, max: 120 }, { key: 'microsteps', kind: 'choice', default: '16', options: ['16'] }] })
    const d = newDraft(h, BUILT)
    Object.assign(d, { name: 'chamber', pins: { pin: 'PB10', sensor: '' } })
    d.settings.max_temp = '80' as unknown as number
    const b = payload(d, h)
    expect(b.max_temp).toBe(80)
    expect(b.microsteps).toBe('16')
    expect(b.pins).toEqual({ pin: 'PB10' })
    expect(b.scope_values).toEqual([])
    expect('sensor_type' in b).toBe(false)
  })

  it('describes a pin choice in one line', () => {
    expect(pinText({ pin: 'PD15', board: 'main', header: 'FAN5', use: 'fan', mosfet: true, adc: false, five_v: 'yes', warnings: [] })).toBe('PD15 · FAN5 (MOSFET)')
    expect(pinText({ pin: 'ebb:PA3', board: 'ebb', header: '', use: 'thermistor', mosfet: false, adc: true, five_v: 'yes', warnings: [] })).toBe('ebb:PA3 · thermistor (analog)')
  })

  it('fans: the tach and power pins follow the wire count, and a hidden pin is never sent', () => {
    const f = dev({
      id: 'controller_fan', live: false,
      pins: [['pin', 'pwm_out', true], ['tach', 'tach', false], ['power', 'digital_out', false]],
      pin_when: { tach: { wires: ['3', '4'] }, power: { wires: ['4'] } },
      settings: [{ key: 'wires', kind: 'choice', default: '2', options: ['2', '3', '4'] }, { key: 'tach_ppr', kind: 'num', default: 2, min: 1, max: 12 }],
    })
    const d = newDraft(f, BUILT)
    expect(pinsShown(f, d).map((p) => p[0])).toEqual(['pin'])
    d.settings.wires = '3'
    expect(pinsShown(f, d).map((p) => p[0])).toEqual(['pin', 'tach'])
    d.settings.wires = '4'
    expect(pinsShown(f, d).map((p) => p[0])).toEqual(['pin', 'tach', 'power'])
    Object.assign(d, { name: 'drivers', pins: { pin: 'PB1', tach: 'PG12', power: 'PD15' } })
    d.settings.wires = '2'
    expect(payload(d, f).pins).toEqual({ pin: 'PB1' })
    d.pins.tach = 'PB1'
    expect(checkStep('Wiring', f, d, [], BUILT)).toBeNull() // a hidden pin can't clash
    expect(settingShown('signal_inverted', d)).toBe(false)
    d.settings.wires = '4'
    expect(settingShown('signal_inverted', d)).toBe(true)
  })
})
