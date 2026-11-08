import { describe, expect, it } from 'vitest'
import { check } from './commands'
import { buildMacro, macroProblem, starterMacros, stepProblem, stepSummary, type MacroDraft, type RunContext } from './userMacros'

const ctx = (o: Partial<RunContext> = {}): RunContext => ({
  jobActive: false,
  tool: 'BlockOne',
  toolConfirmed: true,
  printHead: true,
  homed: 'xyz',
  position: [100, 100, 10, 0],
  min: [0, 0, 0],
  max: [550, 375, 300],
  material: { hotend: 215, bed: 60, name: 'PLA' },
  macros: new Set(['CLEAN_NOZZLE', 'END_PRINT']),
  ...o,
})
const macro = (steps: MacroDraft['steps'], o: Partial<MacroDraft> = {}): MacroDraft => ({ name: 'Test', toolheads: [], notes: '', steps, ...o })
const lines = (r: ReturnType<typeof buildMacro>) => ('script' in r ? r.script.split('\n') : [r.error])

describe('buildMacro', () => {
  it('wraps the steps in a saved G-code state, so G90/G91 and the feed rate come back', () => {
    const r = lines(buildMacro(macro([{ kind: 'moveBy', dx: null, dy: null, dz: 5, speed: 10 }]), ctx()))
    expect(r[0]).toBe('SAVE_GCODE_STATE NAME=_rs_macro')
    expect(r.at(-1)).toBe('RESTORE_GCODE_STATE NAME=_rs_macro')
    expect(r).toContain('G91')
    expect(r).toContain('G1 Z5 F600')
  })

  it('writes each kind of step as the console would', () => {
    const r = lines(
      buildMacro(
        macro([
          { kind: 'home', axes: 'xy', onlyIfNeeded: false },
          { kind: 'moveTo', x: 275, y: 350, z: null, speed: 100 },
          { kind: 'temp', heater: 'hotend', target: 210, wait: true },
          { kind: 'temp', heater: 'bed', target: 60, wait: false },
          { kind: 'fan', percent: 50 },
          { kind: 'fan', percent: 0 },
          { kind: 'wait', seconds: 1.5 },
          { kind: 'macro', name: 'clean_nozzle' },
          { kind: 'message', text: 'Ready' },
          { kind: 'gcode', line: ' M117 hi ' },
        ]),
        ctx(),
      ),
    )
    expect(r.slice(1, -1)).toEqual(['G28 X Y', 'G90', 'G1 X275 Y350 F6000', 'M109 S210', 'M140 S60', 'M106 S128', 'M107', 'G4 P1500', 'CLEAN_NOZZLE', 'RESPOND MSG="Ready"', 'M117 hi'])
  })

  it('heats for the mounted material, bed first, and waits when asked', () => {
    expect(lines(buildMacro(macro([{ kind: 'heatMaterial', wait: true }]), ctx())).slice(1, -1)).toEqual(['M140 S60', 'M104 S215', 'M190 S60', 'M109 S215'])
    expect(lines(buildMacro(macro([{ kind: 'heatMaterial', wait: true }]), ctx({ material: null })))[0]).toMatch(/no material/)
  })

  it('skips "home only if needed" when those axes are homed, and homes when they aren’t', () => {
    const step = { kind: 'home' as const, axes: 'all' as const, onlyIfNeeded: true }
    expect(lines(buildMacro(macro([step]), ctx()))).not.toContain('G28')
    expect(lines(buildMacro(macro([step]), ctx({ homed: '' })))).toContain('G28')
  })

  it('refuses before sending anything', () => {
    const move = { kind: 'moveBy' as const, dx: 10, dy: null, dz: null, speed: 50 }
    expect(lines(buildMacro(macro([move]), ctx({ jobActive: true })))[0]).toMatch(/job is running/)
    expect(lines(buildMacro(macro([move]), ctx({ toolConfirmed: false })))[0]).toMatch(/Confirm the mounted toolhead/)
    expect(lines(buildMacro(macro([move], { toolheads: ['Laser'] }), ctx()))[0]).toMatch(/for Laser; BlockOne is mounted/)
    expect(lines(buildMacro(macro([move]), ctx({ homed: 'z' })))[0]).toMatch(/X isn't homed/)
    expect(lines(buildMacro(macro([{ kind: 'moveTo', x: 600, y: null, z: null, speed: 50 }]), ctx()))[0]).toMatch(/past its travel \(0 to 550 mm\)/)
    expect(lines(buildMacro(macro([{ kind: 'moveBy', dx: null, dy: null, dz: -20, speed: 5 }]), ctx()))[0]).toMatch(/Z -10 is past its travel/)
    expect(lines(buildMacro(macro([{ kind: 'temp', heater: 'hotend', target: 200, wait: false }]), ctx({ printHead: false })))[0]).toMatch(/confirmed print head/)
    expect(lines(buildMacro(macro([{ kind: 'macro', name: 'NOPE' }]), ctx()))[0]).toMatch(/no macro called NOPE/)
    expect(lines(buildMacro(macro([{ kind: 'gcode', line: 'M112' }]), ctx()))[0]).toMatch(/M112 can’t be run/)
  })

  it('lets a Home step earlier in the macro make a later move possible, and follows moves along', () => {
    const r = buildMacro(macro([{ kind: 'home', axes: 'all', onlyIfNeeded: false }, { kind: 'moveTo', x: 10, y: 10, z: 20, speed: 50 }, { kind: 'moveBy', dx: 600, dy: null, dz: null, speed: 50 }]), ctx({ homed: '' }))
    expect(lines(r)[0]).toMatch(/Step 3 \(Move by\): X 610 is past its travel/)
  })

  it('switches the hotend off without a print head (cooling down is always allowed)', () => {
    expect('script' in buildMacro(macro([{ kind: 'temp', heater: 'hotend', target: 0, wait: true }]), ctx({ printHead: false }))).toBe(true)
  })
})

describe('the console still decides what asks first', () => {
  const checked = (m: MacroDraft) => {
    const r = buildMacro(m, ctx())
    if (!('script' in r)) throw new Error(r.error)
    return check(r.script, { jobActive: false, macros: ctx().macros })
  }
  it('asks before a macro that moves, and lists the move', () => {
    const c = checked(macro([{ kind: 'moveBy', dx: null, dy: null, dz: 5, speed: 10 }]))
    expect(c.needsConfirm).toBe(true)
    expect(c.risk).toBe('motion')
    expect(c.blocked).toBeNull()
  })
  it('doesn’t ask before a heat-only macro, as the console doesn’t', () => {
    const c = checked(macro([{ kind: 'heatMaterial', wait: true }, { kind: 'fan', percent: 0 }, { kind: 'message', text: 'Hot' }]))
    expect(c.needsConfirm).toBe(false)
    expect(c.blocked).toBeNull()
  })
  it('classifies an advanced G-code line like the console', () => {
    expect(checked(macro([{ kind: 'gcode', line: 'G1 X5 F600' }])).needsConfirm).toBe(true)
  })
})

describe('step checks', () => {
  it('match the Portal’s rules', () => {
    expect(stepProblem({ kind: 'moveTo', x: null, y: null, z: null, speed: 50 })).toMatch(/at least one axis/)
    expect(stepProblem({ kind: 'temp', heater: 'bed', target: 140, wait: false })).toMatch(/0 to 130/)
    expect(stepProblem({ kind: 'macro', name: '_TOOL_SAFE_OFF' })).toMatch(/Pick one/)
    expect(stepProblem({ kind: 'macro', name: 'save_config' })).toMatch(/SAVE_CONFIG can’t/)
    expect(stepProblem({ kind: 'message', text: 'say "hi"' })).toMatch(/without quotes/)
    expect(stepProblem({ kind: 'gcode', line: 'FORCE_MOVE STEPPER=stepper_z' })).toMatch(/FORCE_MOVE/)
    expect(stepProblem({ kind: 'gcode', line: 'G28' })).toBeNull()
    expect(macroProblem(macro([]))).toMatch(/at least one step/)
  })
  it('summarise each step on one short line', () => {
    expect(stepSummary({ kind: 'moveBy', dx: null, dy: null, dz: 5, speed: 10 })).toBe('Z +5 mm at 10 mm/s')
    expect(stepSummary({ kind: 'temp', heater: 'bed', target: 0, wait: false })).toBe('Bed 0° (off)')
    expect(stepSummary({ kind: 'home', axes: 'all', onlyIfNeeded: true })).toBe('All axes, only if not homed')
  })
})

describe('starterMacros', () => {
  it('parks at the END_PRINT spot, heats for the material, cools down; all valid', () => {
    const s = starterMacros({ x: 275, y: 370 })
    expect(s.map((m) => m.name)).toEqual(['Park the head', 'Heat for the material', 'Cool down'])
    for (const m of s) expect(macroProblem(m)).toBeNull()
    expect(s[0]!.steps.at(-1)).toMatchObject({ kind: 'moveTo', x: 275, y: 370 })
    expect(starterMacros(null)[0]!.steps.some((x) => x.kind === 'moveTo')).toBe(false)
  })
})
