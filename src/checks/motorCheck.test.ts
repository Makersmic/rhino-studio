import { describe, expect, it } from 'vitest'
import { answered, buzzScript, driversFrom, findings, parseDump, parseEndstops, prepScript, validStepper, worst } from './motorCheck'

const OK = ['========== Queried registers ==========', 'GSTAT: 00000000', 'DRV_STATUS: 80150000 cs_actual=21(21) stst=1 stealth=1']
const HOT = ['GSTAT: 00000002 drv_err=1(Error)', 'DRV_STATUS: 80350000 otpw=1(Warning) cs_actual=21 s2ga=1']
describe('motor check', () => {
  it('reads end switches', () => {
    expect(parseEndstops(['x:open y:TRIGGERED z:open probe:open'])).toEqual([
      { name: 'x', triggered: false }, { name: 'y', triggered: true }, { name: 'z', triggered: false }, { name: 'probe', triggered: false },
    ])
    expect(parseEndstops(['nothing'])).toEqual([])
  })
  it('lists the drivers in axis order from the object list', () => {
    const d = driversFrom(['extruder', 'tmc2240 extruder', 'tmc2208 stepper_z1', 'tmc2240 stepper_y', 'tmc2240 stepper_x', 'heater_bed', 'tmc2208 stepper_z'])
    expect(d.map((x) => x.stepper)).toEqual(['stepper_x', 'stepper_y', 'stepper_z', 'stepper_z1', 'extruder'])
    expect(d[0]).toEqual({ object: 'tmc2240 stepper_x', kind: 'tmc2240', stepper: 'stepper_x' })
  })
  it('parses the register dump', () => {
    const r = parseDump(OK)
    expect(r.map((x) => x.reg)).toEqual(['GSTAT', 'DRV_STATUS'])
    expect(r[1]!.fields).toEqual({ cs_actual: 21, stst: 1, stealth: 1 })
  })
  it('a healthy driver has no findings; a hot, shorted one is explained worst first', () => {
    expect(findings(OK)).toEqual([])
    expect(worst(findings(OK))).toBe('ok')
    const f = findings(HOT)
    expect(f.map((x) => x.flag).sort()).toEqual(['drv_err', 'otpw', 's2ga'])
    expect(f[0]!.level).toBe('bad')
    expect(f[f.length - 1]!.level).toBe('warn')
    expect(worst(f)).toBe('bad')
  })
  it('a driver that doesn\'t answer is noticed', () => {
    expect(answered(OK)).toBe(true)
    expect(answered([])).toBe(false)
    expect(answered(['GSTAT: ffffffff', 'DRV_STATUS: ffffffff'])).toBe(false)
  })
  it('prep lowers the bed 10 mm (less near the end of travel) then centres the head', () => {
    const lim = { min: [0, 0, 0], max: [300, 200, 290] }
    expect(prepScript(lim, 20)).toBe('G91\nG1 Z10 F600\nG90\nG1 X150 Y100 F6000')
    expect(prepScript(lim, 285)).toBe('G91\nG1 Z5 F600\nG90\nG1 X150 Y100 F6000')
    expect(prepScript(lim, 290)).toBe('G90\nG1 X150 Y100 F6000')
    expect(prepScript(null, 1)).toBeNull()
  })
  it('only real stepper names are buzzed', () => {
    expect(buzzScript('stepper_x')).toBe('STEPPER_BUZZ STEPPER=stepper_x')
    for (const s of ['stepper_x', 'stepper_z2', 'extruder']) expect(validStepper(s)).toBe(true)
    for (const s of ['stepper_x; M112', 'heater_bed', '']) expect(validStepper(s)).toBe(false)
  })
})
