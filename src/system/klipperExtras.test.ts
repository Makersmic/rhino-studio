import { describe, expect, it } from 'vitest'
import { extrasSummary, type HostExtras } from './klipperExtras'

const two = (linked: boolean, found = true): HostExtras => ({
  klipper_dir: '/home/pi/klipper', found, all_linked: found && linked,
  extras: [
    { name: 'filament_angle_sensor', file: 'filament_angle_sensor.py', linked, in_the_way: false },
    { name: 'spindle_tachometer', file: 'spindle_tachometer.py', linked, in_the_way: false },
  ],
})

describe('Settings › Host › Klipper extras', () => {
  it('says all linked, how many are missing, where Klipper was looked for, or what is in the way', () => {
    expect(extrasSummary(two(true))).toEqual({ tone: 'ok', text: 'All 2 linked into Klipper' })
    expect(extrasSummary(two(false)).text).toMatch(/2 of 2 not linked/)
    expect(extrasSummary(two(false, false)).text).toMatch(/isn't at \/home\/pi\/klipper/)
    const x = two(false)
    x.extras[1]!.in_the_way = true
    expect(extrasSummary(x).text).toMatch(/spindle_tachometer.py: a file of someone else's/)
    expect(extrasSummary(null).tone).toBe('muted')
    expect(extrasSummary({ ...two(true), extras: [] }).text).toMatch(/ships no/)
  })
})
