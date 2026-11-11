import { describe, expect, it } from 'vitest'
import { check } from './commands'
import { START_TOOLS, checklist, focusSteps, frameProblem, frameScript, startScript, startToolFor, testQuestion, testScript, zeroScript } from './startWizard'

const travel = { minX: 0, minY: 0, maxX: 576, maxY: 406 }
const ctx = { jobActive: false }

describe('start wizard', () => {
  it('is used only for the built-in laser and knife, on a config with the zero flag', () => {
    expect(startToolFor('LightSaber', 'LASER_JOB_SETUP', '')).toEqual(START_TOOLS.LightSaber)
    expect(startToolFor('DragKnife', 'DRAGKNIFE_JOB_SETUP', 'DragKnife')).toEqual(START_TOOLS.DragKnife)
    expect(startToolFor('LightSaber', 'LASER_JOB_SETUP', undefined)).toBeNull() // older config: the prompt chain
    expect(startToolFor('HotJoe', 'CNC_JOB_SETUP', '')).toBeNull()
    expect(startToolFor('MyLaser', 'TOOL_JOB_SETUP', '')).toBeNull()
    expect(startToolFor('LightSaber', 'TOOL_JOB_SETUP', '')).toBeNull()
    expect(startToolFor(null, 'LASER_JOB_SETUP', '')).toBeNull()
  })

  it('shows the prompts’ checklist word for word', () => {
    expect(checklist('laser', null)).toContain('Laser glasses on, rated for 450 nm')
    expect(checklist('laser', null)).toHaveLength(5)
    expect(checklist('knife', 200)).toContain('Blade is extended and the pressure dial is set to 200 g')
    expect(checklist('knife', null)[2]).toContain('150 g')
  })

  it('every script asks first through the console check', () => {
    for (const kind of ['laser', 'knife'] as const) {
      const z = check(zeroScript(kind), ctx)
      expect(z.needsConfirm).toBe(true)
      expect(z.lines[0]!.line).toContain('VARIABLE=zeroed')
      expect(check(testScript(kind), ctx).needsConfirm).toBe(true)
      const fr = check(frameScript(kind, { minX: 10, minY: 10, maxX: 60, maxY: 40 }), ctx)
      expect(fr.needsConfirm).toBe(true)
      expect(fr.risk).toBe('motion')
    }
    const s = check(startScript(START_TOOLS.LightSaber!, 'cut.gcode')!, ctx)
    expect(s.needsConfirm).toBe(true)
    expect(s.risk).toBe('job')
  })

  it('zeroes fresh, and the knife gets its X/Y zero before the test cut', () => {
    expect(zeroScript('knife').split('\n')).toEqual(["SET_GCODE_VARIABLE MACRO=SET_Z_ZERO VARIABLE=zeroed VALUE=\"''\"", 'SET_Z_ZERO NEXT=_DK_XY_ZERO'])
    expect(zeroScript('laser').endsWith('\nSET_Z_ZERO')).toBe(true)
    expect(testScript('laser')).toBe('_LASER_TEST_FIRE QUIET=1')
    expect(testScript('knife')).toBe('_DK_TEST_CUT QUIET=1')
  })

  it('starts with FROM=STUDIO, and refuses a file name the macro can’t take', () => {
    expect(startScript(START_TOOLS.DragKnife!, 'sign.gcode')).toBe('DRAGKNIFE_JOB_SETUP FILE=sign.gcode FROM=STUDIO')
    expect(startScript(START_TOOLS.LightSaber!, 'my file.gcode')).toBeNull()
  })

  it('frames the outline above the zero with the tool off, in machine X/Y', () => {
    const s = frameScript('laser', { minX: 10, minY: 20, maxX: 110, maxY: 70 }).split('\n')
    expect(s[0]).toBe('M5')
    expect(s).toContain('SET_GCODE_OFFSET X=0 Y=0')
    expect(s.indexOf('G0 Z5 F600')).toBeLessThan(s.indexOf('G0 X10.00 Y20.00 F3000'))
    expect(s.filter((l) => l.startsWith('G0 X'))).toHaveLength(5)
    expect(s.at(-1)).toBe('G0 X10.00 Y20.00 F3000')
    expect(s.some((l) => /^(M3|M4|SET_LASER_POWER|ACTIVATE_LASER)/.test(l))).toBe(false)
    expect(frameScript('knife', { minX: 0, minY: 0, maxX: 5, maxY: 5 }).startsWith('SET_GCODE_OFFSET')).toBe(true)
  })

  it('refuses a frame outside the travel or without cutting moves', () => {
    expect(frameProblem(null, travel)).toMatch(/no cutting moves/)
    expect(frameProblem({ minX: -1, minY: 0, maxX: 10, maxY: 10 }, travel)).toMatch(/outside/)
    expect(frameProblem({ minX: 0, minY: 0, maxX: 600, maxY: 10 }, travel)).toMatch(/outside/)
    expect(frameProblem({ minX: NaN, minY: 0, maxX: 10, maxY: 10 }, travel)).toBeTruthy()
    expect(frameProblem({ minX: 0, minY: 0, maxX: 576, maxY: 406 }, travel)).toBeNull()
  })

  it('asks the prompts’ test question, with the knife’s adjust help', () => {
    expect(testQuestion('laser').yes).toBe('Yes - continue')
    expect(testQuestion('knife').adjust[0]).toMatch(/pressure dial/)
  })

  it('turns a tuned focus height into button presses', () => {
    expect(focusSteps(null)).toBeNull()
    expect(focusSteps(0)).toBeNull()
    expect(focusSteps(6.3)![1]).toBe('Your tuned focus height is 6.3 mm: press Bed down 1 mm 6 times, then Bed down 0.1 mm 3 times.')
    expect(focusSteps(1)![1]).toBe('Your tuned focus height is 1 mm: press Bed down 1 mm 1 time.')
    expect(focusSteps(0.4)![1]).toBe('Your tuned focus height is 0.4 mm: press Bed down 0.1 mm 4 times.')
  })
})
