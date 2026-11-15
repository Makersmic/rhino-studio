import { describe, expect, it } from 'vitest'
import { lastTiltRun } from '@/bed/zscrews'
import { checkGates, DOS, type GateFacts } from './guide'
import { findGuide } from './guides'
import { levelFacts, levelSteps, passLines } from './level'

const base: GateFacts = { klippyReady: true, jobActive: false, hotendTemp: 24, spindleOn: false, laserArmed: false, toolPowerActive: false, mountedType: 'DEPOSITION', homedXyz: true, heatersOn: false, toolMismatch: false, levelOutcome: null, levelRange: null, levelTolerance: null, levelPasses: 0, levelError: null }
const sent = { kind: 'sent', text: 'Z_TILT_ADJUST (level the gantry)' }
const resp = (text: string) => ({ kind: 'response', text })
const err = (text: string) => ({ kind: 'error', text })
const run = (...l: { kind: string; text: string }[]) => lastTiltRun([sent, ...l])
const pass = (i: number, range: number) => [
  resp('// Making the following Z adjustments:\n// stepper_z = 0.120000\n// stepper_z1 = -0.300000'),
  resp(`// Retries: ${i}/5 Probed points range: ${range.toFixed(6)} tolerance: 0.050000`),
]

describe('reading the level run', () => {
  it('two passes that end within tolerance are done', () => {
    const f = levelFacts(run(...pass(0, 0.412), ...pass(1, 0.021)))
    expect(f).toMatchObject({ levelOutcome: 'done', levelRange: 0.021, levelTolerance: 0.05, levelPasses: 2, levelError: null })
  })
  it('a pass still out of tolerance is running, not done', () => {
    expect(levelFacts(run(...pass(0, 0.412))).levelOutcome).toBe('running')
  })
  it('a failure says why', () => {
    const f = levelFacts(run(...pass(0, 0.412), err('!! Too many retries')))
    expect(f.levelOutcome).toBe('failed')
    expect(f.levelError).toBe('Too many retries')
  })
  it('no run at all is null', () => {
    expect(levelFacts(null)).toMatchObject({ levelOutcome: null, levelRange: null, levelPasses: 0 })
  })
  it('a new run replaces an old good one', () => {
    const old = [sent, ...pass(0, 0.01)]
    const lines = [...old, sent]
    expect(levelFacts(lastTiltRun(lines)).levelOutcome).toBe('running')
  })
})

describe('the level gate', () => {
  it('opens only when Klipper finished within tolerance', () => {
    const open = (o: GateFacts['levelOutcome']) => checkGates(['levelOk'], { ...base, levelOutcome: o })[0]!.ok
    expect(open('done')).toBe(true)
    expect(open('running')).toBe(false)
    expect(open('failed')).toBe(false)
    expect(open(null)).toBe(false)
  })
  it('says what to do after a failure', () => {
    const why = checkGates(['levelOk'], { ...base, levelOutcome: 'failed', levelError: 'Too many retries' })[0]!.why
    expect(why).toMatch(/Too many retries/)
    expect(why).toMatch(/Bed › Configuration/)
  })
})

describe('the steps', () => {
  it('homes first only when the axes were not homed at the start', () => {
    const kinds = (w: string) => levelSteps({ wasHomed: w }, base).map((s) => (s.kind === 'do' ? `do:${s.do}` : s.kind))
    expect(kinds('0')).toEqual(['do:home', 'do:level', 'tick'])
    expect(kinds('1')).toEqual(['do:level', 'tick'])
  })
  it('levelling needs a print head, Klipper ready, no job and homed axes, and a finished run to go on', () => {
    const lv = levelSteps({ wasHomed: '1' }, base).find((s) => s.do === 'level')!
    expect(lv.before).toEqual(['ready', 'noJob', 'printHead', 'homed'])
    expect(lv.need).toEqual(['levelOk'])
    expect(lv.show).toBe('tilt')
    expect(DOS.level.script).toBe('Z_TILT_ADJUST')
  })
  it('the console label carries the command name, so the parser sees a run even when it fails before any pass', () => {
    expect(DOS.level.logLabel).toMatch(/\bZ_TILT_ADJUST\b/)
    const lines = [{ kind: 'sent', text: DOS.level.logLabel! }, { kind: 'error', text: 'Move out of range: 1 2 3' }]
    expect(levelFacts(lastTiltRun(lines))).toMatchObject({ levelOutcome: 'failed', levelError: 'Move out of range: 1 2 3', levelPasses: 0 })
  })
  it('is gated at the start on a print head', () => {
    expect(findGuide('machine:z_tilt')!.gates).toEqual(['ready', 'noJob', 'printHead'])
  })
  it('remembers whether the axes were homed when it began', () => {
    const g = findGuide('machine:z_tilt')!
    expect(g.start!({ klippyReady: true, message: null, homed: true })).toEqual({ wasHomed: '1' })
    expect(g.start!({ klippyReady: true, message: null, homed: false })).toEqual({ wasHomed: '0' })
  })
})

describe('what is shown and logged', () => {
  it('lists each pass', () => {
    expect(passLines(run(...pass(0, 0.412), ...pass(1, 0.021)))).toEqual(['Pass 1: range 0.412 mm', 'Pass 2: range 0.021 mm (within tolerance)'])
    expect(passLines(run(...pass(0, 0.4), err('!! Move out of range')))).toEqual(['Pass 1: range 0.400 mm', 'Stopped: Move out of range'])
    expect(passLines(null)).toEqual([])
  })
  it('writes the Work log note', () => {
    const g = findGuide('machine:z_tilt')!
    const f = { ...base, ...levelFacts(run(...pass(0, 0.412), ...pass(1, 0.021))) }
    expect(g.note!({}, ' First layer looked good. ', f)).toBe('Levelled the gantry: 2 passes, final range 0.021 mm, tolerance 0.050 mm. First layer looked good.')
    expect(g.note!({}, '', { ...base, levelPasses: 1, levelRange: 0.03 })).toBe('Levelled the gantry: 1 pass, final range 0.030 mm.')
  })
})
