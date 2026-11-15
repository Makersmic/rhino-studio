import { describe, expect, it } from 'vitest'
import { happening, worthShowing, type HappeningFacts } from './happening'

const idle: HappeningFacts = {
  hotend: { temp: 24, target: 0 },
  bed: { temp: 23, target: 0 },
  job: { state: 'standby', filename: null, progress: null },
  running: null,
}
const with_ = (p: Partial<HappeningFacts>): HappeningFacts => ({ ...idle, ...p })

describe('what is happening', () => {
  it('says nothing when the machine is idle and cold', () => {
    expect(happening(idle)).toBeNull()
  })
  it('says heating while a heater is on its way up', () => {
    const h = happening(with_({ hotend: { temp: 143.4, target: 210 } }))!
    expect(h.headline).toBe('Heating the hotend: 143° of 210°')
    expect(h.leaveNote).toBeNull()
  })
  it('says when it has arrived', () => {
    expect(happening(with_({ hotend: { temp: 209, target: 210 } }))!.headline).toBe('The hotend is at 210°')
  })
  it('lists the second heater under the first', () => {
    const h = happening(with_({ hotend: { temp: 100, target: 210 }, bed: { temp: 40, target: 60 } }))!
    expect(h.headline).toMatch(/hotend/)
    expect(h.lines).toEqual(['Heating the bed: 40° of 60°'])
  })
  it('warns about a hot nozzle that is switched off', () => {
    expect(happening(with_({ hotend: { temp: 183, target: 0 } }))!.headline).toBe('The hotend is off but still 183°: careful')
  })
  it('names the job and says that leaving the page is fine', () => {
    const h = happening(with_({ job: { state: 'printing', filename: 'tuning/squish-BlockOne-PLA_0_4.gcode', progress: 0.347 }, hotend: { temp: 210, target: 210 } }))!
    expect(h.headline).toBe('Running squish-BlockOne-PLA_0_4.gcode · 35 %')
    expect(h.leaveNote).toMatch(/leave this page/)
    expect(h.lines).toEqual(['The hotend is at 210°'])
  })
  it('a paused job says paused', () => {
    expect(happening(with_({ job: { state: 'paused', filename: 'a.gcode', progress: 0.5 } }))!.headline).toBe('Paused a.gcode · 50 %')
  })
  it('shows a command being sent when nothing else is going on', () => {
    expect(happening(with_({ running: 'Home all' }))!.headline).toBe('Sending: Home all')
  })
  it('keeps console lines that say something', () => {
    expect(worthShowing('ok')).toBe(false)
    expect(worthShowing('  ')).toBe(false)
    expect(worthShowing('// Heating hotend')).toBe(true)
  })
})
