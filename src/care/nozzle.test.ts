import { describe, expect, it } from 'vitest'
import { HEAT_CEILING } from '@/control/heatLimits'
import { checkGates, DOS, type GateFacts } from './guide'
import { findGuide } from './guides'
import { NOZZLES, nozzleSteps, SOAK_SECONDS, TEMPS } from './nozzle'

const f: GateFacts = { klippyReady: true, jobActive: false, hotendTemp: 24, hotendTarget: null, spindleOn: false, spindleThrottle: null, spindleRpm: null, laserArmed: false, toolPowerActive: false, mountedType: 'DEPOSITION', homedXyz: true, heatersOn: false, toolMismatch: false, levelOutcome: null, levelRange: null, levelTolerance: null, levelPasses: 0, levelError: null }
const gate = (o: Partial<GateFacts>) => checkGates(['hotendAtTarget'], { ...f, ...o })[0]!

describe('the at-target gate', () => {
  it('opens only once a target is set and the hotend is within 3 degrees of it', () => {
    expect(gate({ hotendTarget: 210, hotendTemp: 207 }).ok).toBe(true)
    expect(gate({ hotendTarget: 210, hotendTemp: 143 }).ok).toBe(false)
    expect(gate({ hotendTarget: 0, hotendTemp: 220 }).ok).toBe(false)
    expect(gate({ hotendTarget: null, hotendTemp: 220 }).ok).toBe(false)
  })
  it('says what it is waiting for', () => {
    expect(gate({ hotendTarget: 210, hotendTemp: 143.2 }).why).toBe('Heating: 143° of 210°. Wait for it.')
    expect(gate({ hotendTarget: 0 }).why).toMatch(/press the heat button/)
  })
})

describe('the steps', () => {
  const kinds = (a: Record<string, string>) => nozzleSteps(a, f).map((s) => (s.kind === 'do' ? `do:${s.do}` : s.kind))
  it('prep, pick the temperature, heat, swap, say which nozzle, heater off, Z offset', () => {
    expect(kinds({ temp: '210' })).toEqual(['tick', 'pick', 'do:heat', 'tick', 'pick', 'do:heatOff', 'tick'])
  })
  it('the heat step names the chosen temperature and waits for it', () => {
    const h = nozzleSteps({ temp: '235' }, f).find((s) => s.do === 'heat')!
    expect(h.text).toContain('235°')
    expect(h.need).toEqual(['hotendAtTarget'])
    expect(h.before).toEqual(['ready', 'noJob', 'printHead'])
  })
  it('the two-minute soak follows the heat step and nothing else', () => {
    const g = findGuide('tool:nozzle_replace')!
    const heatAt = nozzleSteps({ temp: '210' }, f).findIndex((s) => s.do === 'heat')
    expect(g.wait).toEqual({ afterStep: heatAt, seconds: SOAK_SECONDS, label: 'Letting the heater block soak' })
  })
  it('leaves heat on for no longer than the step needs: the heater-off step must be run and needs every heater off', () => {
    const off = nozzleSteps({ temp: '210' }, f).find((s) => s.do === 'heatOff')!
    expect(off.need).toEqual(['heatersOff'])
    expect(DOS.heatOff.heater).toBe(true)
    expect(DOS.heat.heater).toBe(true)
  })
  it('every offered temperature is within Studio’s heater ceiling', () => {
    for (const t of TEMPS) expect(Number(t.id)).toBeLessThanOrEqual(HEAT_CEILING.hotend)
    expect(TEMPS.map((t) => t.id)).toEqual(['210', '235', '250'])
  })
  it('is gated on a print head, as heating the hotend needs one', () => {
    expect(findGuide('tool:nozzle_replace')!.gates).toEqual(['ready', 'noJob', 'printHead'])
  })
})

describe('the log note', () => {
  it('says which nozzle and the temperature', () => {
    const n = findGuide('tool:nozzle_replace')!.note!({ temp: '210', nozzle: '0.6' }, ' Old one was worn. ', f)
    expect(n).toBe('Replaced the nozzle: fitted 0.6 mm, hot-tightened at 210°. Z offset redone. Old one was worn.')
  })
  it('copes with nothing picked', () => {
    expect(findGuide('tool:nozzle_replace')!.note!({}, '', f)).toBe('Replaced the nozzle: fitted a nozzle (size not recorded). Z offset redone.')
  })
  it('offers the usual sizes and an other', () => {
    expect(NOZZLES.map((n) => n.id)).toEqual(['0.25', '0.4', '0.6', '0.8', '1.0', 'other'])
  })
})
