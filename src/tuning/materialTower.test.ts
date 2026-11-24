import { describe, expect, it } from 'vitest'
import { DEFAULTS, TOWER, bandAtHeight, footprint, retractValues, tempValues, towerFile, towerHeight, valuesProblem } from './materialTower'

const base = { tool: 'BlockOne', material: 'PLA', nozzle: 0.4, path: 0, bed: { x: 300, y: 200 } }
describe('material tower', () => {
  it('values: hot to cool, and short to long', () => {
    expect(tempValues(230, 5, 4)).toEqual([230, 225, 220, 215])
    expect(retractValues(0.4, 0.4, 4)).toEqual([0.4, 0.8, 1.2, 1.6])
    expect(DEFAULTS.temperature.count).toBe(7)
  })
  it('values are checked', () => {
    expect(valuesProblem('temperature', tempValues(230, 5, 7), 290)).toBeNull()
    expect(valuesProblem('temperature', tempValues(290, 5, 7), 290)).toMatch(/275 C or less/)
    expect(valuesProblem('temperature', [100, 200, 210])).toMatch(/160 to 290/)
    expect(valuesProblem('retraction', [0.4, 0.8])).toMatch(/3 to 10/)
    expect(valuesProblem('retraction', [0.4, 0.8, 12])).toMatch(/0 to 8/)
    expect(valuesProblem('retraction', retractValues(0.4, 0.4, 7))).toBeNull()
  })
  it('a measured height is a band', () => {
    expect(bandAtHeight(2, 7)).toBe(0)
    expect(bandAtHeight(5, 7)).toBe(1)
    expect(bandAtHeight(17, 7)).toBe(3)
    expect(bandAtHeight(99, 7)).toBe(6)
    expect(bandAtHeight(-3, 7)).toBe(0)
    expect(towerHeight(7)).toBe(35)
  })
  it('the temperature tower: one M109 per band, the right height, ends with END_PRINT', () => {
    const g = towerFile({ ...base, mode: 'temperature', values: tempValues(230, 5, 7) })
    expect(g.split('\n').filter((l) => /^M109 S/.test(l)).map((l) => l.split(' ')[1])).toEqual(['S230', 'S225', 'S220', 'S215', 'S210', 'S205', 'S200'])
    expect(g).toContain(';Z:35')
    expect(g).toContain('START_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=0')
    expect(g.trim().endsWith('END_PRINT')).toBe(true)
    expect(g).not.toMatch(/SAVE_CONFIG|M112|FIRMWARE_RESTART/)
  })
  it('stays on the bed', () => {
    for (const mode of ['temperature', 'retraction'] as const) {
      const g = towerFile({ ...base, mode, values: mode === 'temperature' ? tempValues(230, 5, 5) : retractValues(0.4, 0.4, 5) })
      for (const m of g.matchAll(/G[01] X([\d.]+) Y([\d.]+)/g)) {
        expect(+m[1]!).toBeGreaterThanOrEqual(0); expect(+m[1]!).toBeLessThanOrEqual(300)
        expect(+m[2]!).toBeGreaterThanOrEqual(0); expect(+m[2]!).toBeLessThanOrEqual(200)
      }
    }
    const r = footprint({ x: 300, y: 200 }, 'retraction')
    expect(r.x1 - r.x0).toBe(TOWER.gap + TOWER.pillar)
  })
  it('the retraction tower: the length changes every band and no M109 is sent', () => {
    const g = towerFile({ ...base, mode: 'retraction', values: retractValues(0.4, 0.4, 3) })
    expect(g).not.toMatch(/^M109/m)
    expect(g).toMatch(/G1 E-0\.4 F2100 ; retract 0\.4 mm/)
    expect(g).toMatch(/G1 E-1\.2 F2100 ; retract 1\.2 mm/)
    expect(g.match(/; band \d: retraction/g)).toHaveLength(3)
  })
})
