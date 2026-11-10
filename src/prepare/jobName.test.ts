import { describe, expect, it } from 'vitest'
import { baseOf, extOf, outFileName } from './jobName'

describe('job file name', () => {
  it('starts from the prepared name without .gcode', () => {
    expect(baseOf('bracket_PLA.gcode')).toBe('bracket_PLA')
    expect(baseOf('old.GCO')).toBe('old')
    expect(extOf('cut.nc')).toBe('.nc')
  })
  it('uses the typed name, adding .gcode once', () => {
    expect(outFileName('shelf clip', 'bracket.gcode')).toBe('shelf_clip.gcode')
    expect(outFileName('shelf.gcode', 'bracket.gcode')).toBe('shelf.gcode')
    expect(outFileName('v1.2', 'bracket.gcode')).toBe('v1.2.gcode')
  })
  it('falls back to the prepared name when blank', () => {
    expect(outFileName(null, 'bracket.gcode')).toBe('bracket.gcode')
    expect(outFileName('   ', 'bracket.gcode')).toBe('bracket.gcode')
  })
  it("can't name another folder", () => {
    expect(outFileName('../../config/printer', 'a.gcode')).not.toContain('/')
    expect(outFileName('a/b', 'x.gcode')).toBe('a_b.gcode')
    expect(outFileName('..hidden', 'x.gcode')).toBe('hidden.gcode')
  })
  it("keeps a ready-made file's own extension", () => {
    expect(outFileName(null, 'cut.nc')).toBe('cut.nc')
    expect(outFileName('pocket', 'cut.nc')).toBe('pocket.nc')
    expect(outFileName('pocket.nc', 'cut.nc')).toBe('pocket.nc')
  })
})
