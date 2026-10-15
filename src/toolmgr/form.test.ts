import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ToolDetail, ToolKind, ToolOptions } from './types'
import {
  applyKindPreset,
  checkStep,
  controlPins,
  controlToDraft,
  ctlMacroNames,
  draftToControl,
  editBody,
  editToKind,
  hardwarePins,
  kindToEdit,
  newHardware,
  newKind,
  editForm,
  frac,
  newControl,
  newDraft,
  outputChoices,
  pct,
  rowsFromTool,
  rowsToPayload,
  wizPayload,
  wizSteps,
} from './form'

// Captured from the Portal's demo (dev/demo_server.py) with FoamWire, PenPlotter and Needle added
const opt = JSON.parse(readFileSync(new URL('../../scripts/fixtures/portal-options.json', import.meta.url), 'utf8')) as ToolOptions
const foam = JSON.parse(readFileSync(new URL('../../scripts/fixtures/portal-tool-FoamWire.json', import.meta.url), 'utf8')).tool as ToolDetail

describe('tool forms (same requests as the Portal)', () => {
  it('percent and fraction round-trip without float noise', () => {
    expect(pct(0.4)).toBe(40)
    expect(frac(40)).toBe(0.4)
    expect(frac(pct(0.123))).toBe(0.123)
    expect([pct(''), frac('')]).toEqual(['', ''])
  })

  it('materials: power shown as %, sent as a fraction; blank names dropped', () => {
    const rows = rowsFromTool(foam)
    expect(rows.find((r) => r.name === 'FOAM_EPS')!.power).toBe(40)
    const out = rowsToPayload([...rows, { name: '  ' }], 'POWERED')
    expect(out).toHaveLength(2)
    expect(out.find((m) => m.name === 'FOAM_EPS')!.power).toBe(0.4)
  })

  it('control macros named as the Portal names them', () => {
    expect(ctlMacroNames([{ name: 'vac', role: 'switch', pin: 'PC1', make_macros: true }, { name: 'fan1', role: 'fan', pin: 'x', make_macros: true }, { name: 's', role: 'servo', pin: 'y', make_macros: false }]))
      .toEqual(['VAC_ON', 'VAC_OFF', 'FAN1_SET', 'FAN1_OFF'])
  })

  it('a control survives the form and back (input wiring included)', () => {
    const c = { name: 'lid', role: 'input', pin: 'PC1', pullup: true, invert: true, max_power: 1, min_pulse: 0.001, max_pulse: 0.002, on_press: { action: 'pause' } }
    const d = controlToDraft(c)
    expect([d.dir, d.wiring, d.swap]).toEqual(['in', 'ground', false])
    const back = draftToControl(d)
    expect([back.role, back.pullup, back.invert]).toEqual(['input', true, true])
    expect(back).not.toHaveProperty('dir')
    const n = draftToControl({ ...newControl(opt), name: 'vac', pin: 'PC1', max_pct: 50 })
    expect(n.max_power).toBe(0.5)
    expect(n.role).toBe('switch')
  })

  it("a servo or input can't use a power (MOSFET) pin", () => {
    const o = { ...opt, free_pins: ['PC1', 'PB1'], pin_info: { PB1: { type: 'mosfet' }, PC1: { type: 'logic' } } }
    const pins = controlPins(o, 'servo', [], [])
    expect(pins.find((p) => p.pin === 'PB1')!.bad).toBe(true)
    expect(pins.find((p) => p.pin === 'PC1')!.bad).toBe(false)
    expect(controlPins(o, 'switch', ['PC1'], []).map((p) => p.pin)).toEqual(['PB1'])
  })

  it('output choices: a power output is only offered PWM channels', () => {
    const power = outputChoices(opt, 'power').flatMap(([, items]) => items)
    const sw = outputChoices(opt, 'switch').flatMap(([, items]) => items)
    expect(power.some(([v]) => v === 'output:Spindle_power')).toBe(false) // on/off relay
    expect(sw.length).toBeGreaterThanOrEqual(power.length)
  })

  it('wizard steps per kind of tool', () => {
    const d = newDraft()
    d.kind = 'HOT_WIRE'
    expect(wizSteps(opt, d)).toEqual(['Tool', 'Outputs', 'Limits', 'Materials', 'Controls', 'Macros', 'Review'])
    d.kind = 'PRINT_HEAD'
    expect(wizSteps(opt, d)).toEqual(['Tool', 'Hardware', 'Controls', 'Macros', 'Review'])
    d.kind = ''
    expect(wizSteps(opt, d)).toEqual(['Tool', 'Review'])
  })

  it('presets give safe starting values; the payload matches the Portal', () => {
    const d = newDraft()
    Object.assign(d, { category: 'subtractive', kind: 'HOT_WIRE', name: 'Wire2' })
    applyKindPreset(opt, d)
    expect(Number(d.cap)).toBe(pct(opt.presets.HOT_WIRE!.cap!))
    expect(d.materials.length).toBeGreaterThan(0)
    d.outputs = [{ role: 'power', source: 'pin:PC1' }]
    const p = wizPayload(opt, d)
    expect(p).toMatchObject({ name: 'Wire2', kind: 'HOT_WIRE', outputs: [{ role: 'power', source: 'pin:PC1' }], cap: frac(d.cap) })
    expect((p.materials as { power: number }[])[0]!.power).toBeLessThanOrEqual(1)
  })

  it('step checks catch typos before the Portal', () => {
    const d = newDraft()
    expect(checkStep(opt, d, 'Tool', [])).toMatch(/Additive/)
    Object.assign(d, { category: 'subtractive', kind: 'HOT_WIRE', name: '9bad' })
    expect(checkStep(opt, d, 'Tool', [])).toMatch(/start with a letter/)
    d.name = 'foamwire'
    expect(checkStep(opt, d, 'Tool', ['FoamWire'])).toMatch(/already exists/)
    d.name = 'Wire2'
    expect(checkStep(opt, d, 'Tool', ['FoamWire'])).toBe('')
    d.outputs = [{ role: 'power', source: 'pin:PC1' }, { role: 'switch', source: 'pin:PC1' }]
    expect(checkStep(opt, d, 'Outputs', [])).toMatch(/twice/)
    Object.assign(d, { cap: 20, min: 30 })
    expect(checkStep(opt, d, 'Limits', [])).toMatch(/Minimum/)
  })

  it('edit body: limits as fractions, removed materials listed, no checklist for print heads', () => {
    const f = editForm(foam)
    expect(f.cap).toBe(50)
    const b = editBody(foam, { ...f, cap: 40 }, rowsFromTool(foam), ['OLD'], [], [])
    expect(b).toMatchObject({ cap: 0.4, delete_materials: ['OLD'], checklist: expect.any(String) })
    expect(editBody({ ...foam, type: 'DEPOSITION' }, f, [], [], [], [])).not.toHaveProperty('checklist')
  })
})

describe('system hardware pins', () => {
  const o = { ...opt, board_pins: [{ pin: 'PD15', header: 'FAN5' }, { pin: 'PG11', header: 'DIAG3' }] }
  it('offers the board headers off the umbilical, plus the pin it already has', () => {
    const p = hardwarePins(o, 'switch', ['PE11'])
    expect(p.map((x) => x.pin)).toEqual(['PE11', 'PD15', 'PG11'])
    expect(p[1]!.label).toBe('PD15 - FAN5 (power output)')
  })
  it('a power output can switch, not read an input or drive a servo', () => {
    expect(hardwarePins(o, 'switch', []).find((x) => x.pin === 'PD15')!.bad).toBe(false)
    expect(hardwarePins(o, 'input', []).find((x) => x.pin === 'PD15')!.bad).toBe(true)
    expect(hardwarePins(o, 'servo', []).find((x) => x.pin === 'PG11')!.bad).toBe(false)
  })
  it('new hardware is not switched off with the tool and starts in the first category', () => {
    const h = newHardware({ ...o, hw_categories: [{ id: 'cooling', label: 'Fans' }] })
    expect(h).toMatchObject({ safe_off: false, mounted_only: false, category: 'cooling', notes: '' })
  })
})

describe('kinds of tool', () => {
  const powered: ToolKind = { id: 'DISPENSER', category: 'additive', behaviour: 'POWERED', label: 'Dispenser', help: 'A pump', cap: 0.8, max_on_s: 120, materials: { PASTE: { power: 0.5, feed_rate: 400 } }, checklist: ['Cartridge in'] }
  it('round-trips a powered kind through the % form', () => {
    const e = kindToEdit(powered)
    expect(e).toMatchObject({ cap: 80, max_on_s: 120, mats: [{ name: 'PASTE', power: 50, feed: 400 }], checklist: 'Cartridge in' })
    expect(editToKind(e)).toEqual(powered)
  })
  it('a print head kind sends no starting values; a passive one no power', () => {
    expect(editToKind(kindToEdit({ id: 'PRINT_HEAD', category: 'additive', behaviour: 'PRINT_HEAD', label: 'Head', help: '' }))).toEqual({ id: 'PRINT_HEAD', category: 'additive', behaviour: 'PRINT_HEAD', label: 'Head', help: '' })
    const p = { ...newKind('passive', 'PASSIVE'), label: 'Pen ', mats: [{ name: 'card stock', power: '', feed: 900 }] }
    expect(editToKind(p)).toEqual({ id: '', category: 'passive', behaviour: 'PASSIVE', label: 'Pen', help: '', checklist: [], materials: { CARD_STOCK: { feed_rate: 900 } } })
  })
})
