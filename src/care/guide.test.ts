import { describe, expect, it } from 'vitest'
import { GUIDES, checkGates, guideFor, logNote, stepsOf, waitAfter, type GateFacts } from './guide'

const ok: GateFacts = { klippyReady: true, jobActive: false, hotendTemp: 24, spindleOn: false, laserArmed: false, toolPowerActive: false, mountedType: 'DEPOSITION' }
const blocked = (g: ReturnType<typeof checkGates>) => g.filter((x) => !x.ok).map((x) => x.id)

describe('gates', () => {
  it('pass on a quiet machine', () => {
    expect(blocked(checkGates(['ready', 'noJob', 'hotendCold', 'spindleOff', 'laserOff', 'toolPowerOff', 'printHead'], ok))).toEqual([])
  })
  it('stop on each thing they exist to catch', () => {
    expect(blocked(checkGates(['noJob'], { ...ok, jobActive: true }))).toEqual(['noJob'])
    expect(blocked(checkGates(['hotendCold'], { ...ok, hotendTemp: 183 }))).toEqual(['hotendCold'])
    expect(blocked(checkGates(['spindleOff'], { ...ok, spindleOn: true }))).toEqual(['spindleOff'])
    expect(blocked(checkGates(['laserOff'], { ...ok, laserArmed: true }))).toEqual(['laserOff'])
    expect(blocked(checkGates(['toolPowerOff'], { ...ok, toolPowerActive: true }))).toEqual(['toolPowerOff'])
    expect(blocked(checkGates(['ready'], { ...ok, klippyReady: false }))).toEqual(['ready'])
    expect(blocked(checkGates(['printHead'], { ...ok, mountedType: 'LASER' }))).toEqual(['printHead'])
    expect(blocked(checkGates(['printHead'], { ...ok, mountedType: null }))).toEqual(['printHead'])
  })
  it('a machine without that output passes (null means none in this config)', () => {
    expect(blocked(checkGates(['spindleOff', 'laserOff', 'toolPowerOff', 'hotendCold'], { ...ok, spindleOn: null, laserArmed: null, toolPowerActive: null, hotendTemp: null }))).toEqual([])
  })
  it('say why in words', () => {
    expect(checkGates(['hotendCold'], { ...ok, hotendTemp: 183.4 })[0]!.why).toMatch(/183°/)
  })
})

describe('the guides', () => {
  it('cover the 17 guided checklists, once each', () => {
    const ids = GUIDES.map((g) => g.template).sort()
    expect(ids).toEqual(
      [
        'machine:dust', 'machine:frame', 'machine:wiring',
        'tool:blade', 'tool:cnc_chips', 'tool:collet', 'tool:extruder_gears', 'tool:hot_wire', 'tool:hotend_check', 'tool:knife_bearing',
        'tool:laser_fan', 'tool:laser_lens', 'tool:needle', 'tool:nozzle_clean', 'tool:passive', 'tool:powered', 'tool:tool_connector',
      ].sort(),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('spindle, laser and powered-tool tasks are gated on their own power being off', () => {
    expect(guideFor('tool:collet')!.gates).toContain('spindleOff')
    expect(guideFor('tool:cnc_chips')!.gates).toContain('spindleOff')
    expect(guideFor('tool:laser_lens')!.gates).toContain('laserOff')
    expect(guideFor('tool:hot_wire')!.gates).toContain('toolPowerOff')
    expect(guideFor('tool:powered')!.gates).toContain('toolPowerOff')
    expect(guideFor('tool:hotend_check')!.gates).toContain('hotendCold')
  })
  it('no job may run during any of them', () => {
    for (const g of GUIDES) expect(g.gates, g.template).toContain('noJob')
  })
  it('an unknown task has no guide of its own', () => {
    expect(guideFor('machine:nothing')).toBeNull()
    expect(guideFor(undefined)).toBeNull()
  })
})

describe('steps, waits and the log note', () => {
  it('uses the task’s own steps first, then the guide’s, then one line', () => {
    expect(stepsOf(['a', 'b'], guideFor('tool:laser_fan'))).toEqual(['a', 'b'])
    expect(stepsOf([], guideFor('tool:laser_fan'))).toHaveLength(2)
    expect(stepsOf(undefined, null)).toEqual(['Do the work, then log it'])
    expect(stepsOf(['  ', ''], null)).toEqual(['Do the work, then log it'])
  })
  it('the electronics bay waits two minutes after the unplug step', () => {
    const d = guideFor('machine:dust')
    expect(waitAfter(d, 0)).toEqual({ seconds: 120, label: 'Letting the power supply discharge' })
    expect(waitAfter(d, 1)).toBeNull()
    expect(waitAfter(null, 0)).toBeNull()
  })
  it('writes a log note', () => {
    expect(logNote(3, '')).toBe('Guided: all 3 steps ticked.')
    expect(logNote(1, ' Found a loose crimp. ')).toBe('Guided: all 1 step ticked. Found a loose crimp.')
  })
})
