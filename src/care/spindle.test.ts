import { describe, expect, it } from 'vitest'
import { checkGates, type GateFacts } from './guide'
import { findGuide } from './guides'
import { RUNIN_SECONDS, RUNIN_STEPS, RUNOUT_ANGLES, runinSteps, runoutSteps, totalRunout } from './spindle'

const f: GateFacts = { klippyReady: true, jobActive: false, hotendTemp: 24, hotendTarget: null, spindleOn: false, spindleThrottle: null, spindleRpm: null, laserArmed: false, toolPowerActive: false, mountedType: 'CNC', homedXyz: true, heatersOn: false, toolMismatch: false, levelOutcome: null, levelRange: null, levelTolerance: null, levelPasses: 0, levelError: null }

describe('run-in: Studio never starts the spindle', () => {
  const steps = runinSteps({}, f)
  it('has no command step at all: every spindle command is for you to type', () => {
    expect(steps.some((s) => s.kind === 'do')).toBe(false)
  })
  it('shows the exact lines to type, in order', () => {
    const cmds = steps.filter((s) => s.command).map((s) => s.command)
    expect(cmds).toEqual([
      'Spindle_ACTIVATE',
      ...RUNIN_STEPS.map((v) => `SET_PIN PIN=SPINDLE_SPEED VALUE=${v} PWM_CYCLE_TIME=0.0025`),
      'Spindle_DEACTIVATE',
    ])
  })
  it('each speed waits one minute, shows the live spindle, and needs the relay on', () => {
    const speeds = steps.filter((s) => s.command?.startsWith('SET_PIN'))
    expect(speeds).toHaveLength(4)
    for (const s of speeds) {
      expect(s.wait!.seconds).toBe(RUNIN_SECONDS)
      expect(s.show).toBe('spindle')
      expect(s.need).toEqual(['spindleOn'])
      expect(s.capture!.from).toBe('rpm')
    }
  })
  it('ends only when the spindle reads off', () => {
    const last = steps[steps.length - 1]!
    expect(last.command).toBe('Spindle_DEACTIVATE')
    expect(last.need).toEqual(['spindleOff'])
  })
  it('starts only with the spindle off, and the gates read the relay', () => {
    const g = findGuide('tool:spindle_runin')!
    expect(g.startGates).toEqual(['spindleOff'])
    // and not all the way through, or arming the spindle would hold the guide forever
    expect(g.gates).toEqual(['ready', 'noJob'])
    expect(checkGates(['spindleOn'], { ...f, spindleOn: true })[0]!.ok).toBe(true)
    expect(checkGates(['spindleOn'], { ...f, spindleOn: false })[0]!.ok).toBe(false)
    expect(checkGates(['spindleOn'], { ...f, spindleOn: null })[0]!.ok).toBe(false)
  })
  it('tells you to stop on rough, rising or hot, and records the answers and RPM', () => {
    expect(steps.map((s) => s.text).join(' ')).toMatch(/rough or rising noise is a stop/)
    const n = findGuide('tool:spindle_runin')!.note!({ noise: 'smooth', heat: 'warm', rpm50: '11800', rpm100: '24100' }, '', f)
    expect(n).toBe('Spindle run-in: four one-minute steps at 0.5, 0.65, 0.8, 1 throttle. Noise: smooth. Body: warm. RPM: 0.5 throttle 11800, 1 throttle 24100.')
    expect(findGuide('tool:spindle_runin')!.note!({}, '', f)).toContain('Noise: not recorded. Body: not recorded.')
  })
})

describe('runout', () => {
  it('works out the spread of four readings', () => {
    expect(totalRunout({ r0: '0.000', r90: '0.012', r180: '0.030', r270: '0.018' })).toBeCloseTo(0.03, 6)
    expect(totalRunout({ r0: '-0.01', r90: '0.02', r180: '0', r270: '0.01' })).toBeCloseTo(0.03, 6)
  })
  it('is null until all four are in, and for anything that is not a number', () => {
    expect(totalRunout({})).toBeNull()
    expect(totalRunout({ r0: '0', r90: '0.01', r180: '', r270: '0.02' })).toBeNull()
    expect(totalRunout({ r0: '0', r90: 'abc', r180: '0', r270: '0' })).toBeNull()
  })
  it('asks for four readings at the four angles, with a range', () => {
    const steps = runoutSteps({}, f)
    const nums = steps.filter((s) => s.kind === 'number')
    expect(nums.map((s) => s.key)).toEqual(RUNOUT_ANGLES.map((d) => `r${d}`))
    for (const n of nums) expect([n.unit, n.min, n.max]).toEqual(['mm', -2, 2])
  })
  it('says the total, and compares it with a limit it does not invent', () => {
    const t = runoutSteps({ r0: '0', r90: '0.02', r180: '0.03', r270: '0.01' }, f).at(-1)!.text
    expect(t).toContain('0.030 mm')
    expect(t).toMatch(/limit you set/)
    expect(t).not.toMatch(/0\.0[0-9]+ mm limit/)
  })
  it('keeps the spindle off and writes the readings', () => {
    expect(findGuide('tool:runout')!.gates).toEqual(['noJob', 'spindleOff'])
    expect(runoutSteps({}, f).every((s) => s.kind !== 'do')).toBe(true)
    expect(findGuide('tool:runout')!.note!({ r0: '0', r90: '0.012', r180: '0.03', r270: '0.018' }, ' After the new collet. ', f)).toBe(
      'Spindle runout (dial indicator, mm) 0°: 0, 90°: 0.012, 180°: 0.03, 270°: 0.018. Total 0.030 mm. After the new collet.',
    )
  })
})
