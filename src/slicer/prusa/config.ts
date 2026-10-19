/**
 * PrusaSlicer settings for a Rhino job.
 *
 * The option list is PrusaSlicer's own (schema.json, generated from the release's
 * source by scripts/prusa/make_schema.py): every option on its Print, Filament and
 * Printer tabs, with its page, group, type, limits, choices, default and
 * Simple / Advanced / Expert level. Prepare shows all of them.
 *
 * What the Rhino owns, and why (LOCKS below), so a setting can't undo a safety rule:
 *   - Start, end, layer, tool-change and filament G-code are empty: the Rhino's
 *     START_JOB / END_PRINT lines are added by rhinoFile.ts, as with Kiri:Moto.
 *   - Temperatures come from the material table; START_JOB heats. First layer and
 *     later layers are the same, so the file never sets a heater.
 *   - Klipper flavour, relative E, no firmware retraction, no binary G-code, no
 *     thumbnails (the engine runs without a screen), no M73, machine limits for
 *     the time estimate only (Klipper's config owns the real limits).
 *   - Bed shape, height and nozzle come from Klipper and the material.
 *   - No post-processing scripts or G-code substitutions: those would run
 *     programs on the Rhino, or rewrite lines after Studio's checks.
 *   - One extruder: SwitchFly's two paths share one stepper (START_JOB EXTRUDER=).
 * Studio's file check (check.ts) still reads every line of the result.
 *
 * A job keeps only the options the user changed (job.prusa); everything else
 * comes from the Rhino's starting profile (RHINO_BASE) over PrusaSlicer's defaults.
 */
import type { MachineInfo, PrepareJob } from '../types'
import type { Material } from '../profiles'

export type OptionType =
  | 'float' | 'floats' | 'int' | 'ints' | 'bool' | 'bools' | 'string' | 'strings' | 'percent' | 'percents'
  | 'floatOrPercent' | 'floatsOrPercents' | 'enum' | 'enums' | 'point' | 'points' | 'point3'

export interface OptionDef {
  type: OptionType
  label?: string
  full_label?: string
  category?: string
  tooltip?: string
  sidetext?: string
  min?: number
  max?: number
  mode: 'simple' | 'advanced' | 'expert'
  enum?: { value: string; label: string }[]
  /** enum values are suggestions; anything typed is allowed */
  open?: boolean
  nullable?: boolean
  default?: string
}

export interface Schema {
  engine: string
  version: string
  source: string
  tabs: { id: 'print' | 'filament' | 'printer'; label: string; pages: { label: string; groups: { label: string; options: string[] }[] }[] }[]
  options: Record<string, OptionDef>
}

export type Mode = 'simple' | 'advanced' | 'expert'
export const MODE_RANK: Record<Mode, number> = { simple: 0, advanced: 1, expert: 2 }

let schemaP: Promise<Schema> | null = null
/** The option list, loaded the first time Prepare needs it (about 120 kB). */
export function loadSchema(): Promise<Schema> {
  schemaP ??= import('./schema.json').then((m) => m.default as unknown as Schema)
  return schemaP
}

// ---- what the Rhino sets -----------------------------------------------------

export interface RhinoCtx {
  job: PrepareJob
  material: Material | null
  machine: MachineInfo
  /** Klipper objects present: [exclude_object], [gcode_arcs] */
  hasExcludeObject: boolean
  hasArcs: boolean
}

export interface Lock {
  value: (c: RhinoCtx) => string
  reason: string
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)
const temp = (c: RhinoCtx, k: 'extruderTemp' | 'bedTemp') => String(Math.round(c.material?.[k] ?? 0))
const EMPTY = (reason: string): Lock => ({ value: () => '', reason })
const TEMP_REASON = 'From the material table: START_JOB heats, the file never sets a heater.'
const GCODE_REASON = 'The Rhino writes its own start and end lines (START_JOB, END_PRINT).'

export const LOCKS: Record<string, Lock> = {
  // printer
  printer_technology: { value: () => 'FFF', reason: 'The Rhino prints with filament.' },
  gcode_flavor: { value: () => 'klipper', reason: 'The Rhino runs Klipper.' },
  bed_shape: { value: (c) => `0x0,${fmt(c.machine.workArea.x)}x0,${fmt(c.machine.workArea.x)}x${fmt(c.machine.workArea.y)},0x${fmt(c.machine.workArea.y)}`, reason: 'The work area Klipper allows (the X endstop sits at 550).' },
  max_print_height: { value: (c) => fmt(c.machine.travelMax[2]), reason: 'Klipper’s Z travel.' },
  z_offset: { value: () => '0', reason: 'Set on the machine with nozzle height calibration, not in the file.' },
  nozzle_diameter: { value: (c) => fmt(c.job.fdm.nozzle), reason: 'From the material you picked (its nozzle size).' },
  extruder_offset: { value: () => '0x0', reason: 'One nozzle.' },
  single_extruder_multi_material: { value: () => '0', reason: 'SwitchFly’s two paths share one stepper; START_JOB picks the path.' },
  use_relative_e_distances: { value: () => '1', reason: 'Rhino files use relative extrusion (M83).' },
  use_firmware_retraction: { value: () => '0', reason: 'The Rhino’s Klipper has no [firmware_retraction].' },
  use_volumetric_e: { value: () => '0', reason: 'Klipper expects millimetres of filament.' },
  binary_gcode: { value: () => '0', reason: 'Klipper reads plain G-code.' },
  thumbnails: EMPTY('The engine runs without a screen, so it can’t draw thumbnails.'),
  silent_mode: { value: () => '0', reason: 'A Prusa printer feature.' },
  remaining_times: { value: () => '0', reason: 'Studio shows time left from Klipper.' },
  machine_limits_usage: { value: () => 'time_estimate_only', reason: 'Klipper’s printer.cfg owns the real limits; these only shape the time estimate.' },
  start_gcode: EMPTY(GCODE_REASON),
  end_gcode: EMPTY(GCODE_REASON),
  before_layer_gcode: EMPTY(GCODE_REASON),
  layer_gcode: EMPTY(GCODE_REASON),
  toolchange_gcode: EMPTY(GCODE_REASON),
  between_objects_gcode: EMPTY(GCODE_REASON),
  color_change_gcode: EMPTY(GCODE_REASON),
  pause_print_gcode: EMPTY(GCODE_REASON),
  template_custom_gcode: EMPTY(GCODE_REASON),
  start_filament_gcode: EMPTY(GCODE_REASON),
  end_filament_gcode: EMPTY(GCODE_REASON),
  autoemit_temperature_commands: { value: () => '0', reason: TEMP_REASON },
  // print
  post_process: EMPTY('Would run programs on the Rhino after slicing.'),
  gcode_substitutions: EMPTY('Would rewrite lines after Studio checks the file.'),
  output_filename_format: { value: () => '{input_filename_base}.gcode', reason: 'Studio names the file.' },
  wipe_tower: { value: () => '0', reason: 'One extruder.' },
  complete_objects: { value: () => '0', reason: 'One part per job.' },
  ooze_prevention: { value: () => '0', reason: 'One extruder.' },
  // filament
  temperature: { value: (c) => temp(c, 'extruderTemp'), reason: TEMP_REASON },
  first_layer_temperature: { value: (c) => temp(c, 'extruderTemp'), reason: TEMP_REASON },
  bed_temperature: { value: (c) => temp(c, 'bedTemp'), reason: TEMP_REASON },
  first_layer_bed_temperature: { value: (c) => temp(c, 'bedTemp'), reason: TEMP_REASON },
  chamber_temperature: { value: () => '0', reason: 'The Rhino has no heated chamber.' },
  chamber_minimal_temperature: { value: () => '0', reason: 'The Rhino has no heated chamber.' },
  idle_temperature: { value: () => 'nil', reason: 'One extruder.' },
  filament_diameter: { value: () => '1.75', reason: 'Rhino print heads take 1.75 mm filament.' },
  filament_type: { value: (c) => materialType(c.job.material), reason: 'From the material you picked.' },
}

/** Choices the Rhino can't run, by option: value -> why. */
export function refused(key: string, c: RhinoCtx): Record<string, string> {
  if (key === 'gcode_label_objects' && !c.hasExcludeObject) return { firmware: 'Needs [exclude_object] in printer.cfg' }
  if (key === 'arc_fitting' && !c.hasArcs) return { emit_center: 'Needs [gcode_arcs] in printer.cfg' }
  return {}
}

/** Pages and groups that don't apply to a one-extruder Klipper machine (or are G-code the Rhino writes). */
const HIDDEN_PAGES = new Set(['Notes', 'Dependencies', 'Custom G-code', 'Multiple Extruders', 'Machine limits'])
const HIDDEN_GROUPS = new Set([
  'Wipe tower parameters', 'Toolchange parameters with single extruder MM printers', 'Toolchange parameters with multi extruder MM printers',
  'Flush parameters (experimental)', 'Position (for multi-extruder printers)', 'Retraction when tool is disabled (advanced settings for multi-extruder setups)',
  'Retraction when tool is disabled', 'Capabilities', 'Preview', 'Sequential printing limits',
])
export function shownPage(label: string): boolean {
  return !HIDDEN_PAGES.has(label)
}
export function shownGroup(label: string): boolean {
  return !HIDDEN_GROUPS.has(label)
}

/**
 * The Rhino's starting point over PrusaSlicer's defaults: Mike's OrcaSlicer
 * BlockOne / SwitchFly profiles (0.2 mm layers, 15 mm/s first layer, 60 mm/s,
 * 0.4 mm retract), so a first slice looks like the Orca ones.
 */
export function rhinoBase(c: RhinoCtx): Record<string, string> {
  const big = c.job.fdm.nozzle >= 0.6
  const fan = Math.round(Math.max(0, Math.min(1, c.material?.fan ?? c.job.fdm.fan)) * 100)
  return {
    layer_height: big ? '0.4' : '0.2',
    first_layer_height: big ? '0.4' : '0.2',
    perimeters: '3',
    top_solid_layers: '4',
    bottom_solid_layers: '3',
    fill_density: '15%',
    fill_pattern: 'grid',
    perimeter_speed: '60',
    external_perimeter_speed: '60',
    infill_speed: '60',
    solid_infill_speed: '60',
    top_solid_infill_speed: '40',
    first_layer_speed: '15',
    travel_speed: '150',
    retract_length: '0.4',
    retract_speed: '30',
    retract_lift: '0',
    max_fan_speed: String(fan),
    min_fan_speed: String(fan),
    bridge_fan_speed: '100',
    disable_fan_first_layers: '1',
    skirts: '1',
    skirt_distance: '3',
    brim_width: '0',
    min_layer_height: '0.04',
    max_layer_height: fmt(c.job.fdm.nozzle * 0.8),
    gcode_comments: '0',
    gcode_label_objects: c.hasExcludeObject ? 'firmware' : 'octoprint',
    filament_max_volumetric_speed: '12',
  }
}

/** PLA_0_4_T1 -> PLA, for filament_type (Prusa's list has the usual names). */
export function materialType(key: string): string {
  const m = /^(.+?)_\d+_\d+(?:_T\d)?$/.exec(key)
  return (m ? m[1]! : key).replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'PLA'
}

// ---- values ------------------------------------------------------------------

/** The value an option takes for this job, and where it comes from. */
export function valueOf(key: string, s: Schema, c: RhinoCtx): { value: string; from: 'rhino' | 'yours' | 'start' | 'prusa' } {
  const lock = LOCKS[key]
  if (lock) return { value: lock.value(c), from: 'rhino' }
  const mine = c.job.prusa?.[key]
  if (mine !== undefined) return { value: mine, from: 'yours' }
  const base = rhinoBase(c)[key]
  if (base !== undefined) return { value: base, from: 'start' }
  return { value: firstOf(s.options[key]?.default ?? '', s.options[key]?.type), from: 'prusa' }
}

/** Single-extruder: a vector option shows and saves its first value. */
export function firstOf(v: string, type: OptionType | undefined): string {
  if (!type || !type.endsWith('s') || type === 'strings') return type === 'strings' ? v.split(';')[0] ?? '' : v
  return v.split(',')[0] ?? ''
}

/** Why a typed value can't be used, or null. */
export function invalid(key: string, value: string, s: Schema, c: RhinoCtx): string | null {
  const d = s.options[key]
  if (!d) return 'Unknown option'
  if (LOCKS[key]) return 'Set by the Rhino'
  const v = value.trim()
  if (d.nullable && v === 'nil') return null
  const range = (n: number) =>
    d.min !== undefined && n < d.min ? `At least ${d.min}` : d.max !== undefined && n > d.max ? `At most ${d.max}` : null
  switch (d.type) {
    case 'int':
    case 'ints':
      return /^-?\d+$/.test(v) ? range(+v) : 'A whole number'
    case 'float':
    case 'floats':
      return /^-?\d*\.?\d+$/.test(v) ? range(+v) : 'A number'
    case 'percent':
    case 'percents': {
      const n = v.replace(/%$/, '')
      return /^-?\d*\.?\d+$/.test(n) ? range(+n) : 'A percentage'
    }
    case 'floatOrPercent':
    case 'floatsOrPercents': {
      const n = v.replace(/%$/, '')
      return /^-?\d*\.?\d+$/.test(n) ? (v.endsWith('%') ? null : range(+n)) : 'A number, or a percentage like 50%'
    }
    case 'bool':
    case 'bools':
      return v === '0' || v === '1' ? null : 'On or off'
    case 'enum':
    case 'enums': {
      const why = refused(key, c)[v]
      if (why) return why
      return d.open || d.enum?.some((e) => e.value === v) ? null : 'Not one of the choices'
    }
    case 'string':
    case 'strings':
      return /[\r\n]/.test(v) ? 'One line' : v.length > 500 ? 'Too long' : null
    default:
      return null
  }
}

/** Every option the engine gets, as PrusaSlicer INI text. `known` = keys the installed engine accepts. */
export function buildIni(s: Schema, c: RhinoCtx, known?: ReadonlySet<string>): string {
  const keys = new Set<string>([...Object.keys(s.options), ...Object.keys(LOCKS)])
  const lines = [`# Rhino Studio for ${c.job.toolhead} / ${c.job.material}, PrusaSlicer ${s.version} option list`]
  for (const k of [...keys].sort()) {
    if (known && !known.has(k)) continue
    if (!s.options[k] && !LOCKS[k]) continue
    const { value } = valueOf(k, s, c)
    if (/[\r\n]/.test(value)) continue // never multi-line: nothing can sneak G-code in
    lines.push(`${k} = ${value}`)
  }
  return lines.join('\n') + '\n'
}

/** Options the user changed that no longer apply (unknown to the engine, or locked now). */
export function staleChanges(s: Schema, job: PrepareJob): string[] {
  return Object.keys(job.prusa ?? {}).filter((k) => !s.options[k] || LOCKS[k])
}

/** Binary STL of the (already turned, scaled and centred) part. */
export function toStl(vertices: Float32Array): Blob {
  const tris = Math.floor(vertices.length / 9)
  const buf = new ArrayBuffer(84 + tris * 50)
  const dv = new DataView(buf)
  const name = 'Rhino Studio'
  for (let i = 0; i < name.length; i++) dv.setUint8(i, name.charCodeAt(i))
  dv.setUint32(80, tris, true)
  let o = 84
  for (let t = 0; t < tris; t++) {
    const b = t * 9
    const ax = vertices[b + 3]! - vertices[b]!, ay = vertices[b + 4]! - vertices[b + 1]!, az = vertices[b + 5]! - vertices[b + 2]!
    const bx = vertices[b + 6]! - vertices[b]!, by = vertices[b + 7]! - vertices[b + 1]!, bz = vertices[b + 8]! - vertices[b + 2]!
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true)
    for (let i = 0; i < 9; i++) dv.setFloat32(o + 12 + i * 4, vertices[b + i]!, true)
    dv.setUint16(o + 48, 0, true)
    o += 50
  }
  return new Blob([buf], { type: 'model/stl' })
}

/** Time and filament from PrusaSlicer's comments, before rhinoFile.ts strips them. */
export function prusaStats(g: string): { seconds: number | null; filamentMm: number | null } {
  const t = /^; estimated printing time \(normal mode\) = (.+)$/m.exec(g)?.[1]
  let seconds: number | null = null
  if (t) {
    seconds = 0
    for (const [, n, u] of t.matchAll(/(\d+)([dhms])/g)) seconds += +n! * ({ d: 86400, h: 3600, m: 60, s: 1 } as Record<string, number>)[u!]!
  }
  const f = /^; filament used \[mm\] = ([\d.]+)/m.exec(g)?.[1]
  return { seconds, filamentMm: f ? +f : null }
}
