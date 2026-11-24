import { describe, expect, it } from 'vitest'
import { ago, headGroups, machineGroup } from './results'
import type { TunedState } from '@/portal/client'
import type { TuningState } from '@/tuning/tuning'

const t = { ok: true, rev: 1, updated: 0, runs: [], heads: { BlockOne: { rotation_distance: { value: 4.487, time: 100, old: null } } }, materials: { 'BlockOne|0.8|PLA': { pressure_advance: { value: 0.024, time: 200, old: null } } } } as unknown as TuningState
const u: TunedState = { ok: true, rev: 2, pid: { extruder: { kp: 31.2, ki: 2.4, kd: 101.5, at: 300 }, 'heater_generic chamber': { kp: 1, ki: 2, kd: 3, at: 301 } }, accelerometer: { serial: '/dev/serial/by-id/usb-Klipper_rp2040_X', cs_pin: 'adxl:gpio1', spi_bus: 'spi0a', axes_map: 'x,y,z', probe: { x: 1, y: 2, z: 3 } }, shaper: { BlockOne: { x: { type: 'mzv', freq: 47.8 }, y: { type: 'ei', freq: 40 }, max_accel: 4500, at: 400 } } }
describe('tuning results', () => {
  it('one group per head with its own and per-material values and the shaper', () => {
    const g = headGroups(t, u)
    expect(g.map((x) => x.title)).toEqual(['BlockOne'])
    expect(g[0]!.rows.map((r) => r.what)).toEqual(['Extruder rotation distance', 'Pressure advance (0.8 mm · PLA)', 'Input shaper'])
    expect(g[0]!.rows[0]!.value).toBe('4.487 mm')
    expect(g[0]!.rows[2]!.value).toBe('X MZV 47.8 Hz · Y EI 40 Hz · up to 4500 mm/s²')
    expect(g[0]!.rows[2]!.wizard).toBe('/wizards/shaping')
  })
  it('a shaper for a head with no other results still gets its group', () => {
    expect(headGroups(null, u).map((x) => x.title)).toEqual(['BlockOne'])
    expect(headGroups(null, null)).toEqual([])
  })
  it('the machine group: heaters and the accelerometer', () => {
    const m = machineGroup(u)
    expect(m.rows.map((r) => r.what)).toEqual(['Hotend PID', 'chamber PID', 'Accelerometer'])
    expect(m.rows[2]!.value).toBe('usb-Klipper_rp2040_X')
    expect(machineGroup(null).rows).toEqual([])
  })
  it('how long ago', () => {
    expect(ago(null)).toBe('')
    expect(ago(1000, 1100)).toBe('just now')
    expect(ago(0 + 1, 1 + 7200)).toBe('2 h ago')
    expect(ago(1, 1 + 86400 * 5)).toBe('5 days ago')
    expect(ago(1, 1 + 86400 * 90)).toBe('3 months ago')
  })
})
