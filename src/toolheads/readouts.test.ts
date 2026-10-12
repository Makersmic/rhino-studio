import { describe, expect, it } from 'vitest'
import { readoutPlan, toolKind, type ReadoutInput } from './readouts'

const cold = { temp: 24, target: 0 }
const base: ReadoutInput = { kind: 'print', hotend: cold, bed: cold, bodyReading: true, has: { fan: true, laser: true, spindle: true, toolPower: true } }
const plan = (o: Partial<ReadoutInput>) => readoutPlan({ ...base, ...o })

describe('what each tool shows', () => {
  it('maps Klipper tool types, and unconfirmed means none', () => {
    expect(toolKind('DEPOSITION', true)).toBe('print')
    expect(toolKind('CNC', true)).toBe('cnc')
    expect(toolKind('DRAG_KNIFE', true)).toBe('knife')
    expect(toolKind('NEEDLE', true)).toBe('passive')
    expect(toolKind('LASER', false)).toBe('none')
  })

  it('print head: hotend, bed and part fan, machine position', () => {
    expect(plan({})).toEqual({ readouts: ['hotend', 'bed', 'fan'], position: 'machine' })
    expect(plan({ has: { ...base.has, fan: false } }).readouts).toEqual(['hotend', 'bed'])
  })

  it('laser: no bed, no hotend; its rail and power and body temperature', () => {
    expect(plan({ kind: 'laser' })).toEqual({ readouts: ['laser', 'body'], position: 'machine' })
  })

  it('spindle: spindle and body temperature, work position', () => {
    expect(plan({ kind: 'cnc' })).toEqual({ readouts: ['spindle', 'body'], position: 'work' })
    expect(plan({ kind: 'cnc', bodyReading: false }).readouts).toEqual(['spindle'])
  })

  it('knife: nothing extra unless its body thermistor reads', () => {
    expect(plan({ kind: 'knife', bodyReading: false })).toEqual({ readouts: [], position: 'work' })
  })

  it('brings the bed back when it is warm or heating under a non-print tool', () => {
    expect(plan({ kind: 'cnc', bed: { temp: 55, target: 0 } }).readouts).toContain('bed-warm')
    expect(plan({ kind: 'laser', bed: { temp: 24, target: 60 } }).readouts).toContain('bed-warm')
    expect(plan({ kind: 'laser', bed: { temp: 39, target: 0 } }).readouts).not.toContain('bed-warm')
  })

  it('flags the hotend heater switched on with a non-print tool, in place of body temperature', () => {
    expect(plan({ kind: 'laser', hotend: { temp: 30, target: 50 } }).readouts).toEqual(['laser', 'hotend-on'])
  })

  it('unknown tool: only heaters that are on or hot', () => {
    expect(plan({ kind: 'none' }).readouts).toEqual([])
    expect(plan({ kind: 'none', hotend: { temp: 120, target: 0 }, bed: { temp: 24, target: 60 } }).readouts).toEqual(['hotend-on', 'bed-warm'])
  })
})
