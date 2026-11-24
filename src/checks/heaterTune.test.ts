import { describe, expect, it } from 'vitest'
import { compare, explain, heatersFrom, parsePid, sane, script, startProblem, targetProblem, textProblem, tunedLines } from './heaterTune'

const hs = heatersFrom(['extruder', 'heater_bed', 'heater_generic chamber', 'heater_generic dryer', 'temperature_sensor Chamber_Temp', 'tmc2240 extruder'])
describe('heater tune', () => {
  it('finds the hotend, bed and any generic heater', () => {
    expect(hs.map((h) => `${h.kind}:${h.name}`)).toEqual(['hotend:extruder', 'bed:heater_bed', 'chamber:chamber', 'chamber:dryer'])
    expect(hs[2]!.label).toBe('Chamber')
    expect(hs[3]!.label).toBe('Heater “dryer”')
    expect(heatersFrom(['extruder', 'temperature_sensor Chamber_Temp']).map((h) => h.kind)).toEqual(['hotend'])   // a sensor alone is no heater
  })
  it('reads the PID line', () => {
    expect(parsePid(['PID parameters: pid_Kp=28.729 pid_Ki=2.176 pid_Kd=94.807', 'The SAVE_CONFIG command will update'])).toEqual({ kp: 28.729, ki: 2.176, kd: 94.807 })
    expect(parsePid(['!! Heater extruder not heating at expected rate'])).toBeNull()
    expect(sane({ kp: 1, ki: 1, kd: 1 })).toBe(true)
    expect(sane({ kp: 0, ki: 1, kd: 1 })).toBe(false)
    expect(sane({ kp: 1, ki: NaN, kd: 1 })).toBe(false)
  })
  it('targets stay inside the limits', () => {
    const [hot, bed, ch] = hs as [typeof hs[0], typeof hs[0], typeof hs[0]]
    expect(targetProblem(hot, 210, 290)).toBeNull()
    expect(targetProblem(hot, 280, 290)).toMatch(/275 C or less/)
    expect(targetProblem(bed, 60, 130)).toBeNull()
    expect(targetProblem(bed, 130, 130)).toMatch(/125/)
    expect(targetProblem(ch, 45)).toBeNull()
    expect(targetProblem(ch, 200)).toMatch(/115 C or less/)     // a generic heater is capped at 120
    expect(targetProblem(ch, 20)).toMatch(/at least 40/)
    expect(targetProblem(ch, NaN)).toMatch(/number/)
  })
  it('a chamber tune starts cool', () => {
    expect(startProblem(hs[2]!, 24, 45)).toBeNull()
    expect(startProblem(hs[2]!, 40, 45)).toMatch(/cool to below 35/)
    expect(startProblem(hs[0]!, 207, 210)).toMatch(/already/)
    expect(startProblem(hs[0]!, null, 210)).toMatch(/isn't being read/)
  })
  it('the script: fan on for the hotend only', () => {
    expect(script(hs[0]!, 210)).toBe('M106 S255\nPID_CALIBRATE HEATER=extruder TARGET=210\nM107')
    expect(script(hs[1]!, 60)).toBe('PID_CALIBRATE HEATER=heater_bed TARGET=60')
    expect(script(hs[2]!, 45)).toBe('PID_CALIBRATE HEATER=chamber TARGET=45')
  })
  it('edited text is checked', () => {
    expect(textProblem('PID_CALIBRATE HEATER=chamber TARGET=45', hs[2]!)).toBeNull()
    expect(textProblem('PID_CALIBRATE HEATER=chamber TARGET=45\nSAVE_CONFIG', hs[2]!)).toMatch(/isn't allowed/)
    expect(textProblem('PID_CALIBRATE HEATER=extruder TARGET=45', hs[2]!)).toMatch(/for chamber/)
    expect(textProblem('PID_CALIBRATE HEATER=chamber', hs[2]!)).toMatch(/TARGET/)
    expect(textProblem('PID_CALIBRATE HEATER=chamber TARGET=500', hs[2]!)).toMatch(/or less/)
  })
  it('old and new side by side, in words', () => {
    expect(compare({ kp: 28.729, ki: 2.176, kd: 94.807 }, { kp: 31.6, ki: 2.4, kd: 100 })).toEqual(['Kp 28.729 → 31.600 (+10%)', 'Ki 2.176 → 2.400 (+10%)', 'Kd 94.807 → 100.000 (+5%)'])
    expect(compare(null, { kp: 1, ki: 2, kd: 3 })[0]).toBe('Kp 1.000')
    expect(explain({ kp: 10, ki: 1, kd: 10 }, { kp: 10.5, ki: 1, kd: 10 })).toMatch(/already well tuned/)
    expect(explain({ kp: 10, ki: 1, kd: 10 }, { kp: 30, ki: 1, kd: 10 })).toMatch(/differ a lot/)
    expect(explain(null, { kp: 1, ki: 1, kd: 1 })).toMatch(/first/)
  })
  it('what the Portal will keep', () => {
    expect(tunedLines(hs[2]!, { kp: 1.5, ki: 0.2, kd: 30 })).toEqual(['[heater_generic chamber]', 'control: pid', 'pid_Kp: 1.5', 'pid_Ki: 0.2', 'pid_Kd: 30'])
  })
})
