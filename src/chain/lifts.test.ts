import { describe, expect, it } from 'vitest'
import { checkFile } from '@/slicer/check'
import { DEFAULT_MACHINE } from '@/slicer/types'
import { newJob } from '@/slicer/profiles'
import { chainLifts, liftTravels } from './stitch'

const job = () => newJob('LightSaber', 'laser', [])
const errs = (text: string) => checkFile(text, job(), null, DEFAULT_MACHINE).checks.filter((c) => c.level === 'error').map((c) => c.id)
const TOOL = '; rhino_toolhead = LightSaber'
const HEAD = ['; rhino_chain_features = 3', '; rhino_chain_lift = 5']
const UP = 'G1 Z5 F600 ;RHINO_CHAIN lift'
const DOWN = 'G1 Z0 F600 ;RHINO_CHAIN drop'
/** a chain laser file: header, one cut, a lifted travel, a second cut */
const file = (over: { head?: string[]; mid?: string[] } = {}) =>
  [
    TOOL,
    ...(over.head ?? HEAD),
    'G21', 'G90', 'M5',
    'G0 X100 Y100', 'M3 S100', 'G1 X110 Y100 F600', 'M5',
    ...(over.mid ?? [UP, 'G0 X150 Y100', DOWN]),
    'M3 S100', 'G1 X160 Y100 F600', 'M5', 'DEACTIVATE_LASER', 'END_PRINT',
  ].join('\n') + '\n'

describe('a chain laser file may lift for travel, with exactly two Z lines', () => {
  it('passes with lifts and drops', () => {
    expect(errs(file())).toEqual([])
    expect(chainLifts(file().split('\n'))).toEqual({ problem: null, moves: 2 })
  })
  it('a laser file without the header keeps the no-Z-moves rule (Job setup and every other file)', () => {
    expect(errs(file({ head: [] }))).toContain('laserz')
    expect(chainLifts(file({ head: [] }).split('\n'))).toBeNull()
  })
  const bad: Array<[string, string[], string[]?]> = [
    ['a lift with no drop', [UP, 'G0 X150 Y100']],
    ['two lifts in a row', [UP, UP, 'G0 X150 Y100', DOWN]],
    ['a drop with no lift', ['G0 X150 Y100', DOWN]],
    ['a lift above the limit', ['G1 Z6 F600 ;RHINO_CHAIN lift', 'G0 X150 Y100', DOWN]],
    ['a downward Z', [UP, 'G0 X150 Y100', 'G1 Z-1 F600 ;RHINO_CHAIN drop']],
    ['a drop to a height that is not the focus', [UP, 'G0 X150 Y100', 'G1 Z1 F600 ;RHINO_CHAIN drop']],
    ['a lift at the wrong feed', ['G1 Z5 F3000 ;RHINO_CHAIN lift', 'G0 X150 Y100', DOWN]],
    ['a Z move with no marker', ['G1 Z5 F600', 'G0 X150 Y100', DOWN]],
    ['G0 with Z', ['G0 Z5', 'G0 X150 Y100', DOWN]],
    ['a Z move on the same line as X/Y', ['G1 X120 Z5 F600 ;RHINO_CHAIN lift', 'G0 X150 Y100', DOWN]],
    ['relative moves', ['G91', UP, 'G0 X5', DOWN]],
    ['the laser on at a lift', ['M3 S100', UP, 'G0 X150 Y100', DOWN]],
    ['a cut while lifted', [UP, 'M3 S100', 'G1 X160 Y100 F600', 'M5', DOWN]],
  ]
  for (const [name, mid] of bad)
    it(`fails: ${name}`, () => {
      expect(errs(file({ mid }))).toContain('laserz')
      expect(chainLifts(file({ mid }).split('\n'))!.problem).not.toBeNull()
    })
  it('fails: a file that ends lifted', () => {
    const text = [TOOL, ...HEAD, 'G21', 'G90', 'M5', UP, 'G0 X150 Y100', 'DEACTIVATE_LASER', 'END_PRINT'].join('\n') + '\n'
    expect(errs(text)).toContain('laserz')
  })
  const headers: Array<[string, string[]]> = [
    ['a lift in a file with no features (H = 0)', ['; rhino_chain_features = 0', '; rhino_chain_lift = 2']],
    ['L not equal to H + 2', ['; rhino_chain_features = 3', '; rhino_chain_lift = 9']],
    ['only one header line', ['; rhino_chain_lift = 5']],
    ['H above 20 mm', ['; rhino_chain_features = 21', '; rhino_chain_lift = 23']],
    ['a header that is not a number', ['; rhino_chain_features = tall', '; rhino_chain_lift = 5']],
  ]
  for (const [name, head] of headers)
    it(`fails: ${name}`, () => {
      expect(errs(file({ head }))).toContain('laserz')
    })
  it('only a laser job may use it: a print file with the header still may not move Z that way', () => {
    const pj = newJob('BlockOne', 'fdm', [])
    expect(checkFile(file(), pj, null, DEFAULT_MACHINE).checks.some((c) => c.id === 'laserz')).toBe(false)
  })
  it('adds the lift to the file Z range', () => {
    const r = checkFile(file(), job(), null, DEFAULT_MACHINE).stats
    expect(r).toBeDefined()
  })
})

describe('liftTravels writes the lifts', () => {
  const box = { x0: 120, y0: 90, x1: 140, y1: 110 }
  const cut = ['G21', 'G90', 'M5', 'G0 X100 Y100', 'M3 S100', 'G1 X110 Y100 F600', 'M5', 'G0 X150 Y100', 'M3 S100', 'G1 X160 Y100 F600', 'M5', 'G0 X150 Y50', 'M3 S100', 'G1 X160 Y50 F600', 'M5', 'END_PRINT']
  it('lifts the first move (the start position is unknown) and a travel that crosses a feature, not one that clears it', () => {
    const out = liftTravels(cut, [box], 5)
    expect(out.filter((l) => l === UP)).toHaveLength(2)
    expect(out.filter((l) => l === DOWN)).toHaveLength(2)
    const i = out.indexOf('G0 X150 Y100')
    expect(out[i - 1]).toBe(UP)
    expect(out[i + 1]).toBe(DOWN)
    expect(out.indexOf('G0 X150 Y50') ).toBeGreaterThan(-1)
    expect(out[out.indexOf('G0 X150 Y50') - 1]).toBe('M5')
  })
  it('lifts a travel that passes within 2 mm of a feature', () => {
    const out = liftTravels(['M5', 'G0 X10 Y10', 'M3 S1', 'G1 X20 Y10', 'M5', 'G0 X118.5 Y10', 'END_PRINT'], [{ x0: 120, y0: 0, x1: 130, y1: 20 }], 5)
    expect(out.filter((l) => l === UP).length).toBeGreaterThan(0)
  })
  it('refuses a travel while the laser is on', () => {
    expect(() => liftTravels(['M3 S100', 'G0 X150 Y100'], [box], 5)).toThrow(/laser is on/)
  })
  it('the lifted result passes the check', () => {
    const text = [TOOL, ...HEAD, ...liftTravels(cut, [box], 5)].join('\n') + '\n'
    expect(errs(text)).toEqual([])
  })
})
