import { describe, expect, it } from 'vitest'
import { isTuningScript, limitsScript, speedScript, zResetScript, zStepScript } from './tuning'

const ok = (b: { script: string } | { error: string }) => ('script' in b ? b.script : `ERR ${b.error}`)

describe('tuning builders', () => {
  it('speed', () => {
    expect(ok(speedScript(120))).toBe('M220 S120')
    expect(ok(speedScript(5))).toMatch(/^ERR/)
    expect(ok(speedScript(NaN))).toMatch(/^ERR/)
  })
  it('Z steps: small, homed, within ±2 mm', () => {
    expect(ok(zStepScript(-0.01, 0, 'xyz'))).toBe('SET_GCODE_OFFSET Z_ADJUST=-0.01 MOVE=1')
    expect(ok(zStepScript(0.01, 0, 'xy'))).toBe('ERR Home Z first')
    expect(ok(zStepScript(0.1, 0, 'xyz'))).toMatch(/out of range/)
    expect(ok(zStepScript(0.05, 1.98, 'xyz'))).toMatch(/±2 mm/)
  })
  it('Z reset', () => {
    expect(ok(zResetScript(0.12, 'xyz'))).toBe('SET_GCODE_OFFSET Z=0 MOVE=1')
    expect(ok(zResetScript(0, 'xyz'))).toMatch(/already 0/)
    expect(ok(zResetScript(4.5, 'xyz'))).toMatch(/console/)
  })
  it('limits', () => {
    expect(ok(limitsScript(300, 5000))).toBe('SET_VELOCITY_LIMIT VELOCITY=300 ACCEL=5000')
    expect(ok(limitsScript(null, 5000))).toBe('SET_VELOCITY_LIMIT ACCEL=5000')
    expect(ok(limitsScript(5, null))).toMatch(/^ERR/)
    expect(ok(limitsScript(null, null))).toMatch(/Nothing/)
  })
  it('only builder output passes the unlocked path', () => {
    for (const s of ['M220 S100', 'SET_GCODE_OFFSET Z_ADJUST=-0.025 MOVE=1', 'SET_GCODE_OFFSET Z=0 MOVE=1', 'SET_VELOCITY_LIMIT VELOCITY=200']) expect(isTuningScript(s)).toBe(true)
    for (const s of ['G1 Z-5', 'SET_GCODE_OFFSET Z=-3 MOVE=1', 'M220 S100\nG28', 'SET_VELOCITY_LIMIT VELOCITY=200 SQUARE_CORNER_VELOCITY=99', 'FIRMWARE_RESTART']) expect(isTuningScript(s)).toBe(false)
  })
})
