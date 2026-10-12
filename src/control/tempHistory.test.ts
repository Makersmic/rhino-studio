import { describe, expect, it } from 'vitest'
import { KEEP, SPAN_SMALL, graphPaths, plausible, push, seedFromStore, yRange, type Sample } from './tempHistory'

const now = 1_000_000_000

describe('temperature history', () => {
  it('seeds from Moonraker: oldest first, one per second ending now', () => {
    const s = seedFromStore({ extruder: { temperatures: [20, 21, 22], targets: [0, 200, 200] }, heater_bed: { temperatures: [30] } }, now)
    expect(s.extruder).toEqual([
      { t: now - 2000, temp: 20, target: 0 },
      { t: now - 1000, temp: 21, target: 200 },
      { t: now, temp: 22, target: 200 },
    ])
    expect(s.heater_bed).toEqual([{ t: now, temp: 30, target: 0 }])
    expect(seedFromStore(null, now)).toEqual({ extruder: [], heater_bed: [] })
  })

  it('keeps 20 minutes', () => {
    let list: Sample[] = []
    for (let i = 0; i < KEEP + 50; i++) list = push(list, { t: i, temp: i, target: 0 })
    expect(list).toHaveLength(KEEP)
    expect(list.at(-1)!.temp).toBe(KEEP + 49)
  })

  it('scales to readings and target, never flatter than 10°', () => {
    const [lo, hi] = yRange([{ t: 0, temp: 24, target: 0 }, { t: 1, temp: 24.5, target: 0 }])
    expect(hi - lo).toBeGreaterThanOrEqual(10)
    const [lo2, hi2] = yRange([{ t: 0, temp: 25, target: 210 }])
    expect(lo2).toBeLessThan(25)
    expect(hi2).toBeGreaterThan(210)
  })

  it('draws the window only, with the target as a broken step line', () => {
    const samples: Sample[] = [
      { t: now - SPAN_SMALL - 5000, temp: 10, target: 0 }, // too old
      { t: now - 3000, temp: 20, target: 0 },
      { t: now - 2000, temp: 30, target: 200 },
      { t: now - 1000, temp: 40, target: 200 },
      { t: now, temp: 50, target: 0 },
    ]
    const p = graphPaths(samples, now, SPAN_SMALL, 100, 50)
    expect(p.temp.match(/[ML]/g)).toHaveLength(4)
    expect(p.target.match(/M/g)).toHaveLength(1)
    expect(p.target.match(/L/g)).toHaveLength(1)
    expect(graphPaths(samples.slice(0, 2), now, SPAN_SMALL, 100, 50)).toEqual({ temp: '', target: '' })
  })

  it('treats impossible readings as no sensor', () => {
    expect(plausible(24)).toBe(true)
    expect(plausible(-273)).toBe(false)
    expect(plausible(null)).toBe(false)
  })
})
