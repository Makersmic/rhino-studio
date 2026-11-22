import { describe, expect, it } from 'vitest'
import { approve, check, commandOf, fanScript, fromPrompt, heaterScript, jogScript, safeFileParam } from './commands'
import { HEAT_LIMITS, resetHeatLimits, setHeatLimits } from './heatLimits'

const idle = { jobActive: false }

describe('check (console safety)', () => {
  it('reads commands the way Klipper does', () => {
    expect(commandOf('g1x10 y5')).toBe('G1')
    expect(commandOf('  set_pin PIN=x VALUE=1')).toBe('SET_PIN')
    expect(commandOf('G38.2 Z-5')).toBe('G38.2')
    // Klipper skips a leading line number (gcode.py: "Skip line number at start of command")
    expect(commandOf('N1 G28')).toBe('G28')
    expect(commandOf('n7 force_move STEPPER=stepper_z DISTANCE=50')).toBe('FORCE_MOVE')
  })

  it.each([
    ['N1 G28', 'motion'],
    ['N12 M3 S255', 'power'],
    ['n7 FORCE_MOVE STEPPER=stepper_z DISTANCE=50 VELOCITY=50', 'motion'],
    ['N3 SET_PIN PIN=SERVO_LASER VALUE=1', 'power'],
  ])('a line number hides nothing: %s (%s)', (line, risk) => {
    const c = check(line, idle)
    expect(c.lines[0]!.risk).toBe(risk)
    expect(c.needsConfirm).toBe(true)
    expect(c.script).toBe(line) // sent as typed; Klipper drops the number itself
  })

  it.each([
    ['SET_GCODE_VARIABLE MACRO="SWAP_TOOL" VARIABLE=current_tool VALUE=1', 'tool-state'],
    ['set_gcode_variable macro=swap_tool variable=current_tool value=1', 'tool-state'],
    ['SAVE_VARIABLE VARIABLE="current_tool" VALUE=1', 'tool-state'],
    ['SET_GCODE_OFFSET Z=0.1 MOVE="1"', 'motion'],
    ['SET_GCODE_OFFSET Z=0.1 MOVE=2', 'motion'],
  ])('quoted parameter values count, as Klipper reads them with shlex: %s', (line, risk) => {
    expect(check(line, idle).lines[0]!.risk).toBe(risk)
  })

  it('leaves SET_GCODE_OFFSET without a move, and other macro variables, alone', () => {
    expect(check('SET_GCODE_OFFSET Z=0.1 MOVE=0', idle).needsConfirm).toBe(false)
    expect(check('SET_GCODE_VARIABLE MACRO=RHINO_MESH VARIABLE=soak_min VALUE=5', idle).needsConfirm).toBe(false)
  })

  it.each([
    ['G28.1 Z', 'motion', 'G28'],
    ['G1.1 X10', 'motion', 'G1'],
    ['M104.1 S250', 'internal', 'M104'],
    ['M109.1 S250', 'internal', 'M109'],
  ])('the raw command behind a Rhino wrapper asks and says so: %s', (line, risk, base) => {
    const c = check(line, idle)
    expect(c.lines[0]!.risk).toBe(risk)
    expect(c.needsConfirm).toBe(true)
    expect(c.lines[0]!.reason).toContain(`${base} wrapper`)
  })

  it("keeps Klipper's own dotted G-codes as they are", () => {
    expect(check('G38.2 Z-5', idle).lines[0]!.reason).toBe('probes (moves the machine)')
  })

  it.each([
    ['G1 X10', 'motion'],
    ['G28', 'motion'],
    ['M84', 'motion'],
    ['SET_KINEMATIC_POSITION Z=0', 'motion'],
    ['SET_GCODE_OFFSET Z=0.1 MOVE=1', 'motion'],
    ['SWAP_TOOL TOOL=3', 'motion'],
    ['RESUME', 'motion'],
    ['M3 S500', 'power'],
    ['set_servo SERVO=SERVO_LASER WIDTH=0.002', 'power'],
    ['ACTIVATE_LASER', 'power'],
    ['SWITCH_T1', 'power'],
    ['SET_GCODE_VARIABLE MACRO=SWAP_TOOL VARIABLE=current_tool VALUE=3', 'tool-state'],
    ['SAVE_VARIABLE VARIABLE=current_tool VALUE=1', 'tool-state'],
    ['FIRMWARE_RESTART', 'restart'],
    ['SAVE_CONFIG', 'restart'],
    ['SDCARD_PRINT_FILE FILENAME=a.gcode', 'job'],
    ['_CNC_START', 'internal'],
  ])('%s needs confirmation (%s)', (line, risk) => {
    const c = check(line, idle)
    expect(c.lines[0]!.risk).toBe(risk)
    expect(c.needsConfirm).toBe(true)
  })

  it.each(['SWAP_TOOL', 'PREHEAT', 'M105', 'STATUS', 'M5', 'SET_FAN_SPEED FAN=x SPEED=0.5', 'M104 S0', 'LIST_TOOLHEADS', 'GET_POSITION'])(
    '%s runs without asking',
    (line) => {
      expect(check(line, idle).needsConfirm).toBe(false)
    },
  )

  it('bed mesh: making, loading and switching off ask; removing and saving profiles are not motion', () => {
    expect(check('RHINO_MESH_CALIBRATE PROFILE=bed-60 BED=60', idle).risk).toBe('motion')
    expect(check('BED_MESH_PROFILE LOAD=bed-60', idle).risk).toBe('motion')
    expect(check('BED_MESH_CLEAR', idle).risk).toBe('motion')
    expect(check('BED_MESH_PROFILE REMOVE=bed-60', idle).needsConfirm).toBe(false)
    expect(check('SAVE_CONFIG', idle).risk).toBe('restart')
  })

  it('never asks before a stop', () => {
    expect(check('M112', idle)).toMatchObject({ risk: 'stop', needsConfirm: false })
    expect(check('EMERGENCY_STOP', idle).needsConfirm).toBe(false)
  })

  it('treats heating as heat, not as harmless', () => {
    expect(check('M104 S210', idle).lines[0]).toMatchObject({ risk: 'heat', reason: 'heats to 210°' })
    expect(check('SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=65', idle).lines[0]!.risk).toBe('heat')
  })

  it('checks every line of a script and ignores comments', () => {
    const c = check('M117 hi ; note\n\n; G1 X1\nG1 X5', idle)
    expect(c.lines.map((l) => l.command)).toEqual(['M117', 'G1'])
    expect(c.needsConfirm).toBe(true)
  })

  it('says when a job is running', () => {
    expect(check('G1 Z5', { jobActive: true }).lines[0]!.reason).toMatch(/while a job is running/)
  })

  it('will not approve an unconfirmed risky script', () => {
    expect(() => approve(check('G28', idle), false)).toThrow(/confirmation/)
    expect(approve(check('G28', idle), true)).toBe('G28')
    expect(approve(check('M105', idle), false)).toBe('M105')
    expect(() => approve(check('  ', idle), true)).toThrow()
  })
})

describe('prompt buttons', () => {
  it('sends the button command as is', () => {
    expect(fromPrompt('SWAP_TOOL TOOL=3')).toBe('SWAP_TOOL TOOL=3')
  })
  it('turns action:prompt_end into a RESPOND', () => {
    expect(fromPrompt('action:prompt_end')).toBe('RESPOND TYPE=command MSG="action:prompt_end"')
  })
  it('refuses multi-line commands', () => {
    expect(() => fromPrompt('G28\nG1 Z0')).toThrow()
  })
})

describe('jogScript', () => {
  const ctx = { position: [100, 100, 10], min: [0, 0, -2], max: [576, 406, 300], homed: 'xyz' }
  it('jogs relative and restores the G-code state', () => {
    expect(jogScript('X', 10, ctx)).toEqual({
      script: 'SAVE_GCODE_STATE NAME=_rs_jog\nG91\nG1 X10 F6000\nRESTORE_GCODE_STATE NAME=_rs_jog',
    })
  })
  it('refuses unhomed axes', () => {
    expect(jogScript('Z', 1, { ...ctx, homed: 'xy' })).toEqual({ error: 'Home Z first' })
  })
  it('refuses moves past the travel', () => {
    expect(jogScript('X', -101, ctx)).toHaveProperty('error')
    expect(jogScript('Y', 50, { ...ctx, position: [0, 400, 10] })).toHaveProperty('error')
    expect(jogScript('Z', -10, ctx)).toEqual({ script: expect.stringContaining('G1 Z-10 F600') })
    expect(jogScript('Z', -13, ctx)).toHaveProperty('error')
  })
  it('refuses when the position is unknown', () => {
    expect(jogScript('X', 1, { ...ctx, position: null })).toHaveProperty('error')
  })
})

describe('heaterScript and file names', () => {
  it('limits targets', () => {
    expect(heaterScript('extruder', 215)).toEqual({ script: 'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=215' })
    expect(heaterScript('heater_bed', 200)).toHaveProperty('error')
    expect(heaterScript('extruder', -1)).toHaveProperty('error')
  })
  it('only passes plain file names to wizards', () => {
    expect(safeFileParam('signs/oak_sign.gcode')).toBe(true)
    expect(safeFileParam('my sign.gcode')).toBe(false)
    expect(safeFileParam('../printer.cfg')).toBe(false)
  })
})

describe('tool changes on other kinds of machine', () => {
  const ctx = { jobActive: false }
  it('asks before any tool selection, whichever adapter is active', () => {
    for (const s of ['T1', 'SELECT_TOOL T=2', 'UNSELECT_TOOL', 'INITIALIZE_TOOLCHANGER', 'TEST_TOOL_DOCKING', 'SET_DUAL_CARRIAGE CARRIAGE=1']) {
      const c = check(s, ctx)
      expect(c.needsConfirm, s).toBe(true)
      expect(c.risk, s).toBe('motion')
    }
  })
  it('treats renumbering or re-pointing a tool as a tool-state change', () => {
    for (const s of ['ASSIGN_TOOL TOOL=T1 N=3', 'ACTIVATE_EXTRUDER EXTRUDER=extruder1', 'SET_TOOL_PARAMETER TOOL=T0 PARAMETER=params_park_x VALUE=10']) {
      expect(check(s, ctx).risk, s).toBe('tool-state')
    }
  })
  it('leaves harmless tool-parameter edits alone', () => {
    expect(check('SET_TOOL_PARAMETER TOOL=T0 PARAMETER=params_fan_speed VALUE=1', ctx).needsConfirm).toBe(false)
    expect(check('SET_TOOL_PARAMETER TOOL=T0 PARAMETER=gcode_z_offset VALUE=-0.4', ctx)).toMatchObject({ risk: 'tool-state', needsConfirm: true })
  })

  it('confirms the Rhino job-file lines when typed by hand', () => {
    expect(check('CNC_BIT_CHANGE BIT=2', ctx)).toMatchObject({ risk: 'motion', needsConfirm: true })
    expect(check('REQUIRE_TOOLHEAD TOOLHEAD=LightSaber', ctx).needsConfirm).toBe(true)
  })
})

describe("a user's own macro is classified by what it runs (audit S1)", () => {
  const macroText = new Map([
    ['MY_PARK', 'G28\nG1 Z200 F600'],
    ['WARM', 'M104 S240\nM140 S60'],
    ['MAYBE', '{% if printer.toolhead.homed_axes != "xyz" %}\n  G28 ; only when needed\n{% endif %}\nM117 ok'],
    ['REFLASH', 'SAVE_CONFIG'],
  ])
  const macros = new Set(macroText.keys())
  it('a macro that homes asks like G28 does, and says why', () => {
    const c = check('MY_PARK', { jobActive: false, macros, macroText })
    expect(c.risk).toBe('motion')
    expect(c.needsConfirm).toBe(true)
    expect(c.lines[0]!.reason).toMatch(/its gcode runs G28: homes/)
  })
  it('a macro that only heats stays a plain button; one with a restart asks', () => {
    expect(check('WARM', { jobActive: false, macros, macroText }).needsConfirm).toBe(false)
    expect(check('REFLASH', { jobActive: false, macros, macroText }).risk).toBe('restart')
  })
  it('a command inside Jinja counts (a false positive only adds a dialog)', () => {
    expect(check('MAYBE', { jobActive: false, macros, macroText }).risk).toBe('motion')
  })
  it('without the texts, the lists alone decide, as before', () => {
    expect(check('MY_PARK', { jobActive: false, macros }).risk).toBe('none')
  })
})

describe('prompt buttons never run the never-list (audit S2)', () => {
  it('refuses FORCE_MOVE, M112 and a restart, and says which', () => {
    expect(() => fromPrompt('FORCE_MOVE STEPPER=stepper_z DISTANCE=50 VELOCITY=5')).toThrow(/would run FORCE_MOVE/)
    expect(() => fromPrompt('M112')).toThrow(/M112/)
    expect(() => fromPrompt('firmware_restart')).toThrow(/FIRMWARE_RESTART/)
  })
  it("the Rhino's own buttons still work: a macro whose name contains the word is not the word", () => {
    expect(fromPrompt('RESTART_FOR_TOOLS')).toBe('RESTART_FOR_TOOLS')
    expect(fromPrompt('_ESC_HIGH_THROTTLE')).toBe('_ESC_HIGH_THROTTLE')
  })
})

describe("heater fields follow Klipper's max_temp, under Studio's ceiling (audit S4)", () => {
  it('290 from the config refuses 295; a silly 350 is clamped to 300; reset puts the ceiling back', () => {
    setHeatLimits({ hotend: 290, bed: 110 })
    expect(heaterScript('extruder', 295)).toEqual({ error: 'Enter 0 to 290°' })
    expect(heaterScript('extruder', 290)).toEqual({ script: 'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=290' })
    expect(heaterScript('heater_bed', 111)).toEqual({ error: 'Enter 0 to 110°' })
    setHeatLimits({ hotend: 350, bed: null })
    expect(HEAT_LIMITS).toEqual({ hotend: 300, bed: 130 })
    resetHeatLimits()
    expect(heaterScript('extruder', 300)).toHaveProperty('script')
  })
})

describe('fanScript', () => {
  it('turns a percentage into M106 (0 to 255) or M107, and refuses anything else', () => {
    expect(fanScript(0)).toEqual({ script: 'M107' })
    expect(fanScript(50)).toEqual({ script: 'M106 S128' })
    expect(fanScript(100)).toEqual({ script: 'M106 S255' })
    expect(fanScript(0.4)).toEqual({ script: 'M107' })
    for (const bad of [-1, 101, NaN, Infinity]) expect(fanScript(bad)).toHaveProperty('error')
  })
  it('needs no confirmation, like the heat commands', () => {
    for (const p of [0, 40, 100]) {
      const r = fanScript(p)
      expect(check((r as { script: string }).script, { jobActive: false, macroText: new Map() } as never).needsConfirm).toBe(false)
    }
  })
})
