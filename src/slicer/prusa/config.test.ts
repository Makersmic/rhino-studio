import { describe, expect, it } from 'vitest'
import schemaJson from './schema.json'
import { LOCKS, buildIni, invalid, prusaStats, refused, rhinoBase, staleChanges, toStl, valueOf, type RhinoCtx, type Schema } from './config'
import { newJob, normalizeJob } from '../profiles'
import { DEFAULT_MACHINE } from '../types'

const schema = schemaJson as unknown as Schema
const mat = { key: 'PETG_0_4', name: 'PETG', nozzle: 0.4, extruderTemp: 245, bedTemp: 90, fan: 0.4 }
function ctx(prusa: Record<string, string> = {}, o: Partial<RhinoCtx> = {}): RhinoCtx {
  const job = newJob('BlockOne', 'fdm', [mat])
  job.prusa = prusa
  return { job, material: mat, machine: DEFAULT_MACHINE, hasExcludeObject: false, hasArcs: false, ...o }
}
const ini = (c: RhinoCtx, known?: Set<string>) => Object.fromEntries(buildIni(schema, c, known).split('\n').filter((l) => l.includes(' = ')).map((l) => l.split(' = ') as [string, string]))

describe('the PrusaSlicer option list (2.9.6)', () => {
  it('has Prusa’s three tabs and every option they show', () => {
    expect(schema.version).toBe('2.9.6')
    expect(schema.tabs.map((t) => t.id)).toEqual(['print', 'filament', 'printer'])
    const keys = schema.tabs.flatMap((t) => t.pages.flatMap((p) => p.groups.flatMap((g) => g.options)))
    expect(keys.length).toBeGreaterThan(300)
    for (const k of ['layer_height', 'perimeters', 'fill_density', 'fill_pattern', 'support_material', 'support_material_style', 'ironing', 'fuzzy_skin', 'scarf_seam_placement', 'brim_type', 'retract_length', 'max_fan_speed'])
      expect(schema.options[k], k).toBeDefined()
    expect(Object.values(schema.options).every((o) => o.default !== undefined && (o.label || o.full_label))).toBe(true)
  })
})

describe('what the Rhino owns', () => {
  it('locks G-code, temperatures, flavour, bed and scripts whatever the user saved', () => {
    const c = ctx({ start_gcode: 'G28', post_process: '/bin/sh evil', temperature: '300', gcode_flavor: 'marlin', layer_height: '0.28' })
    const v = ini(c)
    expect(v.start_gcode).toBe('')
    expect(v.post_process).toBe('')
    expect(v.gcode_substitutions).toBe('')
    expect(v.temperature).toBe('245')
    expect(v.first_layer_temperature).toBe('245')
    expect(v.bed_temperature).toBe('90')
    expect(v.gcode_flavor).toBe('klipper')
    expect(v.use_relative_e_distances).toBe('1')
    expect(v.bed_shape).toBe('0x0,550x0,550x375,0x375')
    expect(v.nozzle_diameter).toBe('0.4')
    expect(v.layer_height).toBe('0.28') // a user's own choice goes through
  })
  it('never writes a multi-line value', () => {
    const c = ctx({ notes: 'a\nG28' })
    expect(buildIni(schema, c)).not.toMatch(/G28/)
  })
  it('only writes keys the installed engine knows', () => {
    const v = ini(ctx(), new Set(['layer_height', 'perimeters']))
    expect(Object.keys(v).sort()).toEqual(['layer_height', 'perimeters'])
  })
  it('refuses choices Klipper can’t run without the right section', () => {
    expect(refused('gcode_label_objects', ctx())).toHaveProperty('firmware')
    expect(refused('gcode_label_objects', ctx({}, { hasExcludeObject: true }))).toEqual({})
    expect(invalid('arc_fitting', 'emit_center', schema, ctx())).toMatch(/gcode_arcs/)
  })
})

describe('values', () => {
  it('come from yours, then the Rhino profile, then PrusaSlicer', () => {
    const c = ctx({ perimeters: '5' })
    expect(valueOf('perimeters', schema, c)).toEqual({ value: '5', from: 'yours' })
    expect(valueOf('first_layer_speed', schema, c)).toEqual({ value: '15', from: 'start' })
    expect(valueOf('ironing', schema, c)).toEqual({ value: '0', from: 'prusa' })
    expect(valueOf('temperature', schema, c).from).toBe('rhino')
    expect(rhinoBase(c).max_fan_speed).toBe('40')
  })
  it('checks what is typed against Prusa’s limits and types', () => {
    const c = ctx()
    expect(invalid('perimeters', '3', schema, c)).toBeNull()
    expect(invalid('perimeters', '-1', schema, c)).toMatch(/At least/)
    expect(invalid('perimeters', '2.5', schema, c)).toMatch(/whole/)
    expect(invalid('fill_density', '35%', schema, c)).toBeNull()
    expect(invalid('first_layer_height', '50%', schema, c)).toBeNull()
    expect(invalid('fill_pattern', 'gyroid', schema, c)).toBeNull()
    expect(invalid('fill_pattern', 'banana', schema, c)).toMatch(/choices/)
    expect(invalid('temperature', '220', schema, c)).toMatch(/Rhino/)
  })
  it('flags saved changes that no longer apply', () => {
    expect(staleChanges(schema, ctx({ not_an_option: '1', temperature: '200', perimeters: '4' }).job)).toEqual(['not_an_option', 'temperature'])
  })
  it('keeps old jobs on Kiri and cleans saved overrides', () => {
    const j = normalizeJob({ ...newJob('BlockOne', 'fdm', [mat]), engine: undefined, prusa: { ok_key: '1', 'bad key': '2', multi: 'a\nb' } as Record<string, string> })
    expect(j.engine).toBe('kiri')
    expect(j.prusa).toEqual({ ok_key: '1' })
  })
})

describe('files', () => {
  it('writes a binary STL', async () => {
    const v = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 0, 0, 10, 0, 0, 0, 10])
    const b = toStl(v)
    expect(b.size).toBe(84 + 2 * 50)
    const dv = new DataView(await b.arrayBuffer())
    expect(dv.getUint32(80, true)).toBe(2)
    expect(dv.getFloat32(84 + 8, true)).toBeCloseTo(1) // first normal +Z
  })
  it('reads PrusaSlicer’s time and filament', () => {
    expect(prusaStats('; filament used [mm] = 1234.56\n; estimated printing time (normal mode) = 1h 2m 3s\n')).toEqual({ seconds: 3723, filamentMm: 1234.56 })
    expect(prusaStats('; estimated printing time (normal mode) = 1d 0h 0m 5s\n').seconds).toBe(86405)
  })
  it('every lock has a reason', () => {
    expect(Object.values(LOCKS).every((l) => l.reason.length > 5)).toBe(true)
  })
})
