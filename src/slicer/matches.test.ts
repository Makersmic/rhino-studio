/**
 * "The file is the part on screen": a printed file reaches the part's top and covers its footprint. A slice of another
 * (or an older) model fails this, as a note. Also the CRC Studio sends the Portal, which must equal Python's zlib.crc32.
 */
import { describe, expect, it } from 'vitest'
import { newJob, materialsFor } from './profiles'
import { rhinoFile } from './rhinoFile'
import { checkFile } from './check'
import { crc32Hex } from './prusa/config'
import { DEFAULT_MACHINE, type PartInfo } from './types'

const part = (z: number): PartInfo => ({ name: 'a.stl', size: { x: 20, y: 20, z }, triangles: 12, footprint: [], flat: false })
const gcode = (top: number, half = 10) =>
  ['G1 E-0.4 F1800', ';LAYER_CHANGE', `G1 Z0.2 F4800`, `G1 X${300 - half} Y${200 - half}`, `G1 X${300 + half} Y${200 - half} E0.5 F1800`, `G1 X${300 + half} Y${200 + half} E0.5`, `G1 Z${top}`, `G1 X${300 - half} Y${200 + half} E0.5`, ''].join('\n')
const matches = (top: number, z: number, half = 10) => {
  const j = newJob('BlockOne', 'fdm', materialsFor('BlockOne', null).list)
  j.placement = { x: 300, y: 200, rotate: 0, scale: 1 }
  const p = part(z)
  const f = rhinoFile(gcode(top, half), j, p, DEFAULT_MACHINE, '0.5.0')
  return checkFile(f.text, j, p, DEFAULT_MACHINE).checks.find((c) => c.id === 'matches')
}

describe('the file is the part on screen', () => {
  it('passes when the print reaches the part’s top and covers it', () => {
    expect(matches(10, 10)?.level).toBe('ok')
    expect(matches(10, 9.4)?.level).toBe('ok')
  })
  it('notes a file much shorter or taller than the part', () => {
    expect(matches(10, 25)?.level).toBe('warn')
    expect(matches(30, 10)?.level).toBe('warn')
  })
  it('notes a file that doesn’t cover the part’s footprint, and never blocks', () => {
    const c = matches(10, 10, 4)
    expect(c?.level).toBe('warn')
    expect(c?.detail).toMatch(/different model/)
  })
})

describe('the sum sent to the Portal', () => {
  it('is CRC-32, as Python’s zlib.crc32 makes it', () => {
    expect(crc32Hex(new TextEncoder().encode('123456789'))).toBe('cbf43926')
    expect(crc32Hex(new Uint8Array(0))).toBe('00000000')
  })
})
