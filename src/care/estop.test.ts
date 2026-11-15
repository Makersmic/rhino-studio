import { describe, expect, it } from 'vitest'
import { CAUSES, estopNote, estopSteps, suggestCause } from './estop'
import { DOS, type GateFacts } from './guide'
import { findGuide } from './guides'

const f: GateFacts = { klippyReady: true, jobActive: false, hotendTemp: 24, spindleOn: false, laserArmed: false, toolPowerActive: false, mountedType: 'DEPOSITION', homedXyz: false, heatersOn: false, toolMismatch: false, levelOutcome: null, levelRange: null, levelTolerance: null, levelPasses: 0, levelError: null }

describe('what Klipper said', () => {
  it('reads the usual messages', () => {
    expect(suggestCause('Shutdown due to M112 command')).toBe('estop')
    expect(suggestCause('Heater extruder not heating at expected rate\nThermal runaway')).toBe('heater')
    expect(suggestCause('ADC out of range')).toBe('heater')
    expect(suggestCause("Lost communication with MCU 'mcu'")).toBe('power')
    expect(suggestCause('Unable to connect')).toBe('power')
    expect(suggestCause('Move out of range: 10.0 -4.0 0.0')).toBe('error')
  })
  it('says nothing for an empty message, so the person picks', () => {
    expect(suggestCause('')).toBeNull()
    expect(suggestCause(null)).toBeNull()
    expect(suggestCause('   ')).toBeNull()
  })
})

describe('the steps', () => {
  const kinds = (a: Record<string, string>) => estopSteps(a, f).map((s) => (s.kind === 'do' ? `do:${s.do}` : s.kind))
  it('start with what happened, then a look, before anything moves', () => {
    const s = estopSteps({}, f)
    expect(s[0]).toMatchObject({ kind: 'pick', key: 'cause', show: 'klippy' })
    expect(s[0]!.options).toHaveLength(CAUSES.length)
    expect(s[1]!.text).toMatch(/Look before anything moves/)
  })
  it('restarts only when Klipper was down when the guide began', () => {
    expect(kinds({ cause: 'estop', wasDown: '1' })).toEqual(['pick', 'tick', 'tick', 'do:restart', 'do:home', 'tick'])
    expect(kinds({ cause: 'estop', wasDown: '0' })).toEqual(['pick', 'tick', 'tick', 'do:home', 'tick'])
  })
  it('the list does not change when Klipper comes back (wasDown is fixed at the start)', () => {
    const down = estopSteps({ cause: 'error', wasDown: '1' }, { ...f, klippyReady: false })
    const up = estopSteps({ cause: 'error', wasDown: '1' }, f)
    expect(down.map((s) => s.text)).toEqual(up.map((s) => s.text))
  })
  it('a heater fault adds the wiring look; each cause has its own line', () => {
    expect(estopSteps({ cause: 'heater', wasDown: '0' }, f).map((s) => s.text).join(' ')).toMatch(/thermistor wiring/)
    expect(estopSteps({ cause: 'power', wasDown: '0' }, f).map((s) => s.text).join(' ')).toMatch(/USB and CAN/)
    expect(estopSteps({ cause: 'unsure', wasDown: '0' }, f)).toHaveLength(4)
  })
  it('homing is offered only with Klipper ready, no job, no heater, and the tool sensor agreeing', () => {
    const home = estopSteps({ cause: 'estop', wasDown: '0' }, f).find((s) => s.do === 'home')!
    expect(home.before).toEqual(['ready', 'noJob', 'heatersOff', 'toolAgrees'])
    expect(home.need).toEqual(['homed'])
  })
  it('the restart step waits for Klipper to say Ready', () => {
    expect(estopSteps({ cause: 'estop', wasDown: '1' }, f).find((s) => s.do === 'restart')!.need).toEqual(['ready'])
  })
  it('the guide starts by remembering Klipper’s state and message', () => {
    const g = findGuide('machine:estop')!
    expect(g.start!({ klippyReady: false, message: 'Shutdown due to M112 command', homed: false })).toEqual({ wasDown: '1', said: 'Shutdown due to M112 command', cause: 'estop' })
    expect(g.start!({ klippyReady: true, message: null, homed: true })).toEqual({ wasDown: '0', said: '', cause: '' })
  })
  it('the commands are Studio’s own and fixed', () => {
    expect(DOS.restart.script).toBe('FIRMWARE_RESTART')
    expect(DOS.home.script).toBe('G28')
    expect(Object.keys(DOS).sort()).toEqual(['home', 'level', 'restart'])
  })
})

describe('registering and logging', () => {
  it('Studio finds the wizard for the library task', () => {
    expect(findGuide('machine:estop')).not.toBeNull()
    expect(findGuide('machine:estop')!.build).toBeTypeOf('function')
    expect(findGuide('tool:collet')!.build).toBeUndefined()
  })
  it('writes what happened into the Work log note', () => {
    const n = estopNote({ cause: 'heater', wasDown: '1', said: 'Heater extruder not heating at expected rate' }, ' Replaced the cartridge. ')
    expect(n).toContain('A heater or thermistor fault')
    expect(n).toContain('Klipper said: “Heater extruder not heating at expected rate”')
    expect(n).toContain('Restarted Klipper, homed all axes')
    expect(n).toContain('Replaced the cartridge.')
    expect(estopNote({}, '')).toContain('cause not picked')
  })
})
