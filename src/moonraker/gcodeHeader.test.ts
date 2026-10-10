import { describe, expect, it } from 'vitest'
import { toolheadFromGcode } from './gcodeHeader'

describe('toolheadFromGcode', () => {
  it('reads the OrcaSlicer START_JOB line', () => {
    expect(toolheadFromGcode('; thumbnail\nSTART_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4\n')).toBe('BlockOne')
  })
  it('accepts a quoted name and extra parameters first', () => {
    expect(toolheadFromGcode('START_JOB MATERIAL=PLA TOOLHEAD="SwitchFly"\n')).toBe('SwitchFly')
  })
  it('prefers the Rhino Studio header comment', () => {
    expect(toolheadFromGcode('; rhino_toolhead = LightSaber\nSTART_JOB TOOLHEAD=BlockOne\n')).toBe('LightSaber')
  })
  it('ignores a commented-out START_JOB', () => {
    expect(toolheadFromGcode('; START_JOB TOOLHEAD=BlockOne\nG28\n')).toBeNull()
  })
  it('returns null when nothing is declared', () => {
    expect(toolheadFromGcode('G21\nG90\nG0 Z5\n')).toBeNull()
  })
})
