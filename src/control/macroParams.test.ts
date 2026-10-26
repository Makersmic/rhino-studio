import { describe, expect, it } from 'vitest'
import { checkParam, macroLine, macroParams } from './macroParams'

describe('macro parameters', () => {
  it("reads a generated SET macro's parameter, default and range", () => {
    const gcode = '{% set v = [[params.SPEED|default(1)|float, 0.0]|max, 1.0]|min %}\nSET_FAN_SPEED FAN=driver_fan SPEED={v}'
    expect(macroParams(gcode, 'System hardware: driver_fan speed SPEED=0..1')).toEqual([{ name: 'SPEED', default: '1', min: 0, max: 1 }])
  })

  it('finds every parameter once, in first-use order, including params["X"] and quoted defaults', () => {
    const g = "{% set t = params.TOOLHEAD|default('BlockOne') %}\n{% if params.TOOLHEAD %}{% endif %}\nM117 {params['MATERIAL']|default(\"PLA\")} {params.nozzle_size}"
    expect(macroParams(g)).toEqual([
      { name: 'TOOLHEAD', default: 'BlockOne' },
      { name: 'MATERIAL', default: 'PLA' },
      { name: 'NOZZLE_SIZE', default: '' },
    ])
  })

  it('a macro without parameters has none (it runs straight away)', () => {
    expect(macroParams('SET_PIN PIN=lamp VALUE=1')).toEqual([])
  })

  it('builds one safe line, leaving empty values to the macro default', () => {
    expect(macroLine('DRIVER_FAN_SET', { SPEED: '0.5' })).toEqual({ line: 'DRIVER_FAN_SET SPEED=0.5' })
    expect(macroLine('START_JOB', { TOOLHEAD: 'BlockOne', MATERIAL: '' })).toEqual({ line: 'START_JOB TOOLHEAD=BlockOne' })
    for (const bad of ['1 G28', '{1}', '1;G28', '"x"']) expect('error' in macroLine('X', { A: bad }), bad).toBe(true)
  })

  it('checks a ranged value', () => {
    const p = { name: 'SPEED', default: '1', min: 0, max: 1 }
    expect(checkParam(p, '0.4')).toBeNull()
    expect(checkParam(p, '1.5')).toBe('SPEED: 0 to 1')
    expect(checkParam(p, 'fast')).toBe('SPEED: a number')
  })
})
