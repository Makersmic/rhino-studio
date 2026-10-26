import { describe, expect, it } from 'vitest'
import { STALL_SECONDS, fanReadings, fanStalls, fanTitle, fanWatch } from './fans'

describe('fans with a speed signal', () => {
  it('watches every fan section Klipper has, and nothing else', () => {
    const w = fanWatch(['fan', 'fan_generic exhaust', 'heater_fan hotend_cool', 'controller_fan drivers', 'temperature_fan chamber', 'extruder', 'output_pin fan_light'])
    expect(Object.keys(w).sort()).toEqual(['controller_fan drivers', 'fan', 'fan_generic exhaust', 'heater_fan hotend_cool', 'temperature_fan chamber'])
    expect(w['fan']).toEqual(['speed', 'rpm'])
  })

  it('lists only fans that report rpm (a tach pin), with a plain label', () => {
    const r = fanReadings({
      'controller_fan drivers': { speed: 1, rpm: 4800 },
      'fan_generic exhaust': { speed: 0.5, rpm: null },
      fan: { speed: 0 },
      extruder: { temperature: 20 },
    } as never)
    expect(r).toEqual([{ id: 'controller_fan drivers', name: 'drivers', kind: 'controller_fan', label: 'Drivers fan', speed: 1, rpm: 4800 }])
  })

  it('names fans by their own name', () => {
    expect(fanTitle('drivers', 'controller_fan')).toBe('Drivers fan')
    expect(fanTitle('chamber_exhaust_fan', 'fan_generic')).toBe('Chamber exhaust fan')
    expect(fanTitle('fan', 'fan')).toBe('Part fan')
  })

  it('a driven fan reading nothing is a stall only after STALL_SECONDS', () => {
    const f = [{ id: 'controller_fan drivers', name: 'drivers', kind: 'controller_fan', label: 'Driver fan', speed: 1, rpm: 0 }]
    let s = fanStalls(f, {}, 1000)
    expect(s.stalled).toEqual([])
    s = fanStalls(f, s.since, 1000 + STALL_SECONDS * 1000 - 1)
    expect(s.stalled).toEqual([])
    s = fanStalls(f, s.since, 1000 + STALL_SECONDS * 1000)
    expect(s.stalled.map((x) => x.name)).toEqual(['drivers'])
  })

  it('a fan that is off, slow on purpose, or turning is never a stall, and recovering clears it', () => {
    const base = { id: 'fan_generic x', name: 'x', kind: 'fan_generic', label: 'Fan' }
    expect(fanStalls([{ ...base, speed: 0, rpm: 0 }], { 'fan_generic x': 0 }, 60_000).stalled).toEqual([])
    expect(fanStalls([{ ...base, speed: 0.2, rpm: 0 }], { 'fan_generic x': 0 }, 60_000).stalled).toEqual([])
    const ok = fanStalls([{ ...base, speed: 1, rpm: 3000 }], { 'fan_generic x': 0 }, 60_000)
    expect(ok.stalled).toEqual([])
    expect(ok.since).toEqual({})
  })
})
