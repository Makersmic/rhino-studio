import { describe, expect, it } from 'vitest'
import { DOS, stepKey, type GateFacts } from './guide'
import { findGuide } from './guides'
import { BACKLASH, BELT_FINDINGS, zBeltSteps, zScrewSteps } from './zdrive'

const f: GateFacts = { klippyReady: true, jobActive: false, hotendTemp: 24, hotendTarget: null, spindleOn: false, spindleThrottle: null, spindleRpm: null, laserArmed: false, toolPowerActive: false, mountedType: 'DEPOSITION', homedXyz: true, heatersOn: false, toolMismatch: false, levelOutcome: null, levelRange: null, levelTolerance: null, levelPasses: 0, levelError: null }
const kinds = (s: ReturnType<typeof zScrewSteps>) => s.map((x) => (x.kind === 'do' ? `do:${x.do}` : x.kind))

describe('the leadscrew path', () => {
  it('has the library task’s order: reach, clean, grease, then home and exercise, then backlash', () => {
    expect(kinds(zScrewSteps({}, f))).toEqual(['tick', 'tick', 'tick', 'do:home', 'tick', 'pick', 'tick'])
  })
  it('homing is its own step and has to be run, never read as already homed', () => {
    const h = zScrewSteps({}, f).find((s) => s.do === 'home')!
    expect(h.id).toBe('rehome')
    expect(h.before).toEqual(['ready', 'noJob', 'heatersOff', 'toolAgrees'])
    expect(h.need).toEqual(['homed'])
  })
  it('never moves Z by itself: no Studio-built Z move and no height in the steps', () => {
    for (const s of zScrewSteps({}, f)) expect(s.do === undefined || s.do === 'home').toBe(true)
    expect(zScrewSteps({}, f).map((s) => s.text).join(' ')).not.toMatch(/G1|Z\d/)
  })
  it('offers a backlash answer', () => {
    const p = zScrewSteps({}, f).find((s) => s.kind === 'pick')!
    expect(p.key).toBe('backlash')
    expect(p.options!.map((o) => o.id)).toEqual(BACKLASH.map((b) => b.id))
  })
})

describe('the belt path', () => {
  it('looks, checks screws, turns by hand, records what it found, re-homes, then levels', () => {
    expect(kinds(zBeltSteps({}, f))).toEqual(['tick', 'tick', 'tick', 'pick', 'do:home', 'do:level'])
  })
  it('the hand-turn step points at Bed › Configuration, whose release and hold are padlocked', () => {
    const t = zBeltSteps({}, f)[2]!
    expect(t.links).toEqual([{ label: 'Open Bed › Configuration', to: '/bed/config' }])
    expect(t.text).toMatch(/Release to turn by hand/)
  })
  it('re-homes after the release, and the level needs a finished run', () => {
    const s = zBeltSteps({}, f)
    expect(s.find((x) => x.do === 'home')!.text).toMatch(/un-homes Z/)
    const lv = s.find((x) => x.do === 'level')!
    expect(lv.before).toContain('printHead')
    expect(lv.need).toEqual(['levelOk'])
    expect(lv.show).toBe('tilt')
  })
  it('offers the four findings', () => {
    expect(zBeltSteps({}, f).find((s) => s.kind === 'pick')!.options!.map((o) => o.id)).toEqual(BELT_FINDINGS.map((b) => b.id))
  })
})

describe('registering, gating and logging', () => {
  it('both Z tasks have a wizard', () => {
    expect(findGuide('machine:z_screws')!.build).toBeTypeOf('function')
    expect(findGuide('machine:z_belt')!.build).toBeTypeOf('function')
  })
  it('the belt path is gated on a print head (it ends by levelling), the screw path is not', () => {
    expect(findGuide('machine:z_belt')!.gates).toContain('printHead')
    expect(findGuide('machine:z_screws')!.gates).not.toContain('printHead')
    for (const t of ['machine:z_belt', 'machine:z_screws']) expect(findGuide(t)!.gates).toEqual(expect.arrayContaining(['ready', 'noJob']))
  })
  it('a step key is its own id, else its command', () => {
    expect(stepKey({ kind: 'do', do: 'home', text: '', id: 'rehome' })).toBe('rehome')
    expect(stepKey({ kind: 'do', do: 'level', text: '' })).toBe('level')
    expect(DOS.home.script).toBe('G28')
  })
  it('the Work log notes say what was found', () => {
    const s = findGuide('machine:z_screws')!.note!({ backlash: 'slight' }, ' Re-greased. ', f)
    expect(s).toBe('Z leadscrews cleaned and lubricated. Nut backlash: slight. Re-homed and ran Z through its travel. Re-greased.')
    const b = findGuide('machine:z_belt')!.note!({ belt: 'replaced' }, '', { ...f, levelPasses: 2, levelRange: 0.021 })
    expect(b).toBe('Z belt drive checked: replaced the belt. All three screws turned together by hand. Levelled: 2 passes, final range 0.021 mm.')
    expect(findGuide('machine:z_belt')!.note!({}, '', f)).toContain('finding not recorded')
  })
})
