import { describe, expect, it } from 'vitest'
import { checkGates, type GateFacts } from './guide'
import { findGuide } from './guides'
import { FLEX_SECONDS, umbilicalSteps } from './umbilical'

const f: GateFacts = { klippyReady: true, jobActive: false, hotendTemp: 24, hotendTarget: null, spindleOn: false, spindleThrottle: null, spindleRpm: null, laserArmed: false, toolPowerActive: false, mountedType: 'DEPOSITION', homedXyz: true, heatersOn: false, toolMismatch: false, levelOutcome: null, levelRange: null, levelTolerance: null, levelPasses: 0, levelError: null }

describe('the umbilical flex test', () => {
  it('looks, watches for a minute, then reports', () => {
    const s = umbilicalSteps({}, f)
    expect(s.map((x) => x.kind)).toEqual(['tick', 'watch', 'tick'])
    expect(s[1]).toMatchObject({ key: 'flexEvents', seconds: FLEX_SECONDS, need: ['hasTemp'] })
  })
  it('needs a thermistor reading to watch', () => {
    expect(checkGates(['hasTemp'], f)[0]!.ok).toBe(true)
    expect(checkGates(['hasTemp'], { ...f, hotendTemp: null })[0]!.ok).toBe(false)
  })
  it('reports what it saw, and says to find where when it saw something', () => {
    expect(umbilicalSteps({ flexEvents: '0' }, f)[2]!.text).toMatch(/No drop-outs/)
    expect(umbilicalSteps({ flexEvents: '3' }, f)[2]!.text).toMatch(/3 drop-outs.*find where/)
    expect(umbilicalSteps({ flexEvents: '1' }, f)[2]!.text).toMatch(/1 drop-out\./)
  })
  it('is read only: no command step', () => {
    expect(umbilicalSteps({}, f).every((x) => x.kind !== 'do')).toBe(true)
  })
  it('logs the count and where it was', () => {
    const g = findGuide('machine:umbilical')!
    expect(g.note!({ flexEvents: '2', flexDetail: '2 drop-outs (first at 14 s: no thermistor reading).' }, ' Near the strain relief. ', f)).toBe(
      'Umbilical inspected: connector halves and latch looked at; 2 drop-outs while flexing the cable for 60 s. 2 drop-outs (first at 14 s: no thermistor reading). Near the strain relief.',
    )
    expect(g.note!({ flexEvents: '0' }, '', f)).toContain('no drop-outs while flexing the cable for 60 s')
    expect(g.note!({}, '', f)).toContain('flex test not run')
  })
})
