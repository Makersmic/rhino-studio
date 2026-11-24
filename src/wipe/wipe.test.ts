import { describe, expect, it } from 'vitest'
import { attachPlan, defaults, problemOf, sentence, setupProblems, slowed, wipeLines, type Limits, type WipeSetup } from './wipe'

const LIM: Limits = { min: [0, 0, -10], max: [576, 406, 295] }
const base = (o: Partial<WipeSetup> = {}): WipeSetup => ({ ...defaults(), start: { x: 100, y: 390, z: 20 }, end: { x: 160, y: 390, z: 20 }, ...o })

describe('the lines', () => {
  it('zero the offsets, clear, wipe, clear, and put everything back', () => {
    expect(wipeLines(base())).toEqual([
      'SAVE_GCODE_STATE NAME=_rs_wipe',
      'SET_GCODE_OFFSET X=0 Y=0 Z=0',
      'G90',
      'G1 Z30 F600', // bed lowered 10 mm clear (bigger Z = bed lower)
      'G1 X100 Y390 F6000',
      'G1 Z20 F600',
      'G1 X160 Y390 Z20 F3600',
      'G1 X100 Y390 Z20 F3600',
      'G1 X160 Y390 Z20 F3600',
      'G1 Z30 F600',
      'RESTORE_GCODE_STATE NAME=_rs_wipe',
    ])
  })
  it('for a frame-mounted brush only lowers the bed clear: no contact height, no Z on the wipe', () => {
    const l = wipeLines(base({ mount: 'frame', clear: 15 }))
    expect(l).toContain('G1 Z15 F600')
    expect(l.some((x) => /^G1 X160 Y390 F3600$/.test(x))).toBe(true)
    expect(l.filter((x) => x.startsWith('G1 Z'))).toHaveLength(2)
  })
  it('alternate direction on every pass and stay inside 20 lines at the most passes', () => {
    const l = wipeLines(base({ passes: 8 }))
    expect(l.filter((x) => /Y390 Z20 F3600/.test(x)).map((x) => x.startsWith('G1 X160'))).toEqual([true, false, true, false, true, false, true, false])
    expect(l.length).toBeLessThanOrEqual(20)
  })
  it('are empty until both ends are measured', () => {
    expect(wipeLines(defaults())).toEqual([])
  })
})

describe('the numbers', () => {
  it('pass when sensible', () => {
    expect(setupProblems(base(), LIM)).toEqual([])
  })
  it('say what is wrong', () => {
    expect(setupProblems(defaults(), LIM)).toEqual(expect.arrayContaining(['The start of the bristles isn\'t set.', 'The end of the bristles isn\'t set.']))
    expect(setupProblems(base({ passes: 9 }), LIM).join(' ')).toMatch(/Passes must be from 1 to 8/)
    expect(setupProblems(base({ passes: 2.5 }), LIM).join(' ')).toMatch(/whole number/)
    expect(setupProblems(base({ wipeSpeed: 400 }), LIM).join(' ')).toMatch(/Wipe speed/)
    expect(setupProblems(base({ end: { x: 102, y: 390, z: 20 } }), LIM).join(' ')).toMatch(/less than 5 mm apart/)
    expect(setupProblems(base({ end: { x: 160, y: 390, z: 26 } }), LIM).join(' ')).toMatch(/more than 3 mm apart in height/)
    expect(setupProblems(base({ start: { x: 700, y: 390, z: 20 } }), LIM).join(' ')).toMatch(/outside the X\/Y travel limits/)
    expect(setupProblems(base({ start: { x: 100, y: 390, z: 290 }, end: { x: 160, y: 390, z: 290 } }), LIM).join(' ')).toMatch(/Z travel limits/)
  })
})

describe('edited text', () => {
  const ok = wipeLines(base()).join('\n')
  it('accepts the wizard\'s own lines', () => {
    expect(problemOf(ok, LIM)).toBeNull()
  })
  it('refuses what a hook can never hold', () => {
    expect(problemOf(ok + '\nM112', LIM)).toMatch(/M112|not allowed|can't/i)
    expect(problemOf(ok + '\nFIRMWARE_RESTART', LIM)).not.toBeNull()
    expect(problemOf('', LIM)).toMatch(/nothing to run/)
    expect(problemOf(Array.from({ length: 21 }, () => 'G4 P100').join('\n'), LIM)).toMatch(/holds 20/)
  })
  it('refuses a move outside the travel limits, and ignores relative moves it cannot check', () => {
    expect(problemOf('G90\nG1 X900 F600', LIM)).toMatch(/X 900 is outside 0 to 576/)
    expect(problemOf('G91\nG1 X900 F600', LIM)).toBeNull()
    expect(problemOf('G90\nG1 Z-50 F600', LIM)).toMatch(/Z -50 is outside/)
  })
})

describe('the slow cold test', () => {
  it('scales every feed rate to 20% and never below 5 mm/s', () => {
    expect(slowed('G1 X1 F6000\nG1 Z2 F600\nG1 X3 F3600')).toBe('G1 X1 F1200\nG1 Z2 F300\nG1 X3 F720')
  })
  it('leaves lines without a feed rate alone', () => {
    expect(slowed('G90\nSET_GCODE_OFFSET X=0 Y=0 Z=0')).toBe('G90\nSET_GCODE_OFFSET X=0 Y=0 Z=0')
  })
})

describe('sentences and attaching', () => {
  it('describes the wipe', () => {
    expect(sentence(base())).toBe('The bed lowers 10 mm, the head goes over the start of the bristles and the bed raises to touch them, wipes 60 mm along them 3 times at 60 mm/s, then the bed lowers clear again.')
    expect(sentence(defaults())).toBe('')
  })
  it('adds after what is there, or replaces it, and keeps to 20 lines', () => {
    const lines = wipeLines(base())
    expect(attachPlan(['M117 hi'], lines, 'add').next).toHaveLength(lines.length + 1)
    expect(attachPlan(['M117 hi'], lines, 'replace').next).toEqual(lines)
    expect(attachPlan(Array.from({ length: 12 }, () => 'G4 P1'), lines, 'add').problem).toMatch(/holds 20/)
    expect(attachPlan(Array.from({ length: 12 }, () => 'G4 P1'), lines, 'replace').problem).toBeNull()
  })
})
