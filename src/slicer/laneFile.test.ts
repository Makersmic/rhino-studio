import { describe, expect, it } from 'vitest'
import { LANE_TEMPLATE, hasLaneChanges, laneBody } from './laneFile'

describe('laneBody', () => {
  const prusa = [';LAYER_CHANGE', ';RHINO_LANE 1', 'T1', 'M104 S230', 'G1 X1 Y1 E1', ';RHINO_LANE 0', 'T0', 'M104 S210 ; set temperature', 'G1 X2 Y2 E1', ';RHINO_LANE 1', 'T1', 'M109 S230', 'G1 X3 E1']
  it('turns PrusaSlicer’s markers into the change command and drops its bare tool commands and heat commands', () => {
    const r = laneBody(prusa)
    expect(r.lines).toEqual([';LAYER_CHANGE', 'SWITCH_LANE LANE=1', 'G1 X1 Y1 E1', 'SWITCH_LANE LANE=0', 'G1 X2 Y2 E1', 'SWITCH_LANE LANE=1', 'G1 X3 E1'])
    expect(r.start).toBe(1)
    expect(r.changes).toBe(2)
    expect(r.lanes).toEqual([0, 1])
  })
  it('takes Kiri’s own change command as it is', () => {
    const r = laneBody(['G1 X1', 'SWITCH_LANE LANE=1', 'G1 X2', 'SWITCH_LANE LANE=0', 'G1 X3'])
    expect(r.lines).toEqual(['G1 X1', 'SWITCH_LANE LANE=1', 'G1 X2', 'SWITCH_LANE LANE=0', 'G1 X3'])
    expect(r).toMatchObject({ start: null, changes: 2, lanes: [0, 1] })
  })
  it('leaves other lines, including ones that merely start with T or M10, alone', () => {
    const r = laneBody(['G1 X1', 'TIMED_THING', 'M1040', 'M106 S128', 'T', ';RHINO_LANE 0'])
    expect(r.lines).toEqual(['G1 X1', 'TIMED_THING', 'M1040', 'M106 S128', 'T', 'SWITCH_LANE LANE=0'])
  })
  it('says there is no lane when the file has no change', () => expect(laneBody(['G1 X1']).start).toBeNull())
})

describe('hasLaneChanges', () => {
  it('sees both slicers’ output and nothing else', () => {
    expect(hasLaneChanges('G1 X1\n;RHINO_LANE 1\nG1')).toBe(true)
    expect(hasLaneChanges('G1 X1\nSWITCH_LANE LANE=0\n')).toBe(true)
    expect(hasLaneChanges('G1 X1\n; SWITCH_LANE is not here\nM104 S0\n')).toBe(false)
    expect(hasLaneChanges('G1 X1\nSWITCH_T1 MATERIAL=PLA\n')).toBe(false)
  })
  it('uses the template the Portal accepts', () => expect(LANE_TEMPLATE).toBe(';RHINO_LANE {next_extruder}'))
})
