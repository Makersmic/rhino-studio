import { describe, expect, it } from 'vitest'
import { approve, check, commandOf, fromPrompt, heaterScript, jogScript, safeFileParam } from './commands'

const idle = { jobActive: false }

describe('check (console safety)', () => {
  it('reads commands the way Klipper does', () => {
    expect(commandOf('g1x10 y5')).toBe('G1')
    expect(commandOf('  set_pin PIN=x VALUE=1')).toBe('SET_PIN')
    expect(commandOf('G38.2 Z-5')).toBe('G38.2')
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
