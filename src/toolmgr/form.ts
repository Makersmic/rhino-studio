/**
 * The add-a-tool and edit-tool forms' rules, ported from the Rhino Portal's
 * own screens (Toolhead_Manager rhino/portal/static/portal.js, sections 4-5)
 * so Studio sends exactly the requests the Portal expects.
 *
 * The Portal is the judge: it checks every tool, control and macro against
 * the whole Klipper config (/api/tools/check, /api/preview/*). These local
 * checks only catch typos before a round trip.
 */
import type { ToolControl, ToolDetail, ToolKind, ToolMacro, ToolOptions, ToolType } from './types'

export const pct = (v: number | string | null | undefined) => (v === '' || v == null ? '' : Math.round(Number(v) * 1000) / 10)
export const frac = (v: number | string | null | undefined) => (v === '' || v == null ? '' : Math.round(Number(v) * 10) / 1000)

// ---------------------------------------------------------------- materials

/** Columns of the materials table per tool type: [field, label, shown as %]. */
export const MAT_COLS: Record<string, [string, string, boolean?][]> = {
  POWERED: [['power', 'Power %', true], ['feed_rate', 'Feed mm/min'], ['z_offset', 'Z offset mm']],
  PASSIVE: [['feed_rate', 'Feed mm/min'], ['z_offset', 'Z offset mm']],
  DEPOSITION: [['extruder_temp', 'Nozzle °C'], ['bed_temp', 'Bed °C'], ['z_offset', 'Z offset mm'], ['fan_speed', 'Fan %', true]],
}

export interface MatRow {
  name: string
  existing?: boolean
  [field: string]: string | number | boolean | undefined
}

export function rowsFromTool(t: ToolDetail): MatRow[] {
  const cols = MAT_COLS[t.type] ?? []
  return Object.entries(t.materials ?? {}).map(([name, m]) => {
    const r: MatRow = { name, existing: true }
    for (const [k, , isPct] of cols) r[k] = isPct ? pct(m[k] as number) : (m[k] ?? '')
    return r
  })
}

export function rowsToPayload(rows: MatRow[], type: ToolType): Record<string, string | number>[] {
  const cols = MAT_COLS[type] ?? []
  return rows
    .filter((r) => String(r.name ?? '').trim())
    .map((r) => {
      const o: Record<string, string | number> = { name: String(r.name).trim() }
      for (const [k, , isPct] of cols) {
        const v = r[k]
        if (v !== '' && v !== undefined) o[k] = isPct ? frac(v as number) : (v as number)
      }
      return o
    })
}

// ---------------------------------------------------------------- controls and macros

export const roleLabel = (r: string) => ({ switch: 'on/off', level: 'level', fan: 'fan', heater_fan: 'heater fan', servo: 'servo', input: 'input' })[r] ?? r

/** The macros a control makes for itself (mirrors the Portal's sections.control_macros). */
export function ctlMacroNames(controls: ToolControl[]): string[] {
  const out: string[] = []
  for (const c of controls ?? []) {
    if (!c.make_macros) continue
    const up = c.name.toUpperCase()
    if (c.role === 'switch') out.push(`${up}_ON`, `${up}_OFF`)
    if (c.role === 'level' || c.role === 'fan') out.push(`${up}_SET`, `${up}_OFF`)
    if (c.role === 'servo') out.push(`${up}_ANGLE`, `${up}_OFF`)
  }
  return out
}

export function describeControl(c: ToolControl, actions: [string, string][] = []): string {
  const bits = [roleLabel(c.role), c.pin + (c.invert ? ' (inverted)' : '')]
  if (c.role === 'input') bits.push(`on trigger: ${(actions.find(([k]) => k === c.on_press?.action)?.[1] ?? '-').toLowerCase()}`)
  if (c.safe_off) bits.push('off when made safe')
  if (c.make_macros) bits.push(`macros: ${ctlMacroNames([c]).join(', ')}`)
  return bits.join(' · ')
}

/** A control as the form edits it: percent and millisecond fields, direction and wiring spelled out. */
export interface ControlDraft extends ToolControl {
  original?: string
  dir: 'out' | 'in'
  max_pct: number | string
  min_ms: number | string
  max_ms: number | string
  wiring?: 'ground' | 'drive'
  swap?: boolean
}

export function newControl(opt: ToolOptions | null): ControlDraft {
  return {
    name: '', purpose: '', dir: 'out', role: 'switch', pin: '', invert: false, start_on: false, on_shutdown: 'off', safe_off: true,
    make_macros: true, mounted_only: true, cycle: 0.01, max_power: 1, kick_start: 0.1, heater: opt?.heaters?.[0] ?? '', heater_temp: 50,
    max_angle: 180, min_pulse: 0.001, max_pulse: 0.002, pullup: true, wiring: 'ground', swap: false,
    on_press: { action: 'message', message: '' }, on_release: { action: 'none' },
    max_pct: 100, min_ms: 1, max_ms: 2,
  }
}

export function controlToDraft(c: ToolControl): ControlDraft {
  const d = JSON.parse(JSON.stringify(c)) as ControlDraft
  d.original = c.name
  // on a pin label: edit it as the label, so it stays on the label (the Portal keeps the resolved pin too)
  if (c.pin_label) d.pin = c.pin_label
  delete (d as Partial<ToolControl>).pin_label
  d.dir = c.role === 'input' ? 'in' : 'out'
  d.max_pct = pct(c.max_power ?? 1)
  d.min_ms = (c.min_pulse ?? 0.001) * 1000
  d.max_ms = (c.max_pulse ?? 0.002) * 1000
  if (c.role === 'input') {
    d.wiring = c.pullup ? 'ground' : 'drive'
    d.swap = c.pullup ? !c.invert : !!c.invert
  }
  d.on_press ??= { action: 'message', message: '' }
  d.on_release ??= { action: 'none' }
  return d
}

/** The form's draft -> what the Portal stores (the Portal's itemPayload). */
export function draftToControl(d: ControlDraft): ToolControl {
  const it: Record<string, unknown> = { ...d }
  it.role = d.dir === 'in' ? 'input' : d.role
  if (it.role === 'input') {
    it.pullup = d.wiring === 'ground'
    it.invert = it.pullup ? !d.swap : !!d.swap
  }
  it.max_power = d.max_pct === '' ? '' : frac(d.max_pct)
  it.min_pulse = d.min_ms === '' ? '' : Number(d.min_ms) / 1000
  it.max_pulse = d.max_ms === '' ? '' : Number(d.max_ms) / 1000
  for (const k of ['dir', 'wiring', 'swap', 'max_pct', 'min_ms', 'max_ms', 'pin_typed']) delete it[k]
  return it as ToolControl
}

export const newMacro = (): ToolMacro & { original?: string } => ({ name: '', purpose: '', body: '', mounted_only: true })

/**
 * Pins a control may use on the tool connector: the free ones plus this
 * tool's own, minus the ones its outputs and its other controls already use.
 * Power outputs (MOSFETs) can't read an input or drive a servo.
 */
export function controlPins(opt: ToolOptions, role: string, taken: string[], mine: string[]) {
  const t = new Set(taken)
  const pool = [...new Set([...opt.free_pins, ...mine])].filter((p) => !t.has(p))
  return pool.map((p) => {
    const info = opt.pin_info[p] ?? {}
    const bad = info.type === 'mosfet' && (role === 'input' || role === 'servo')
    return { pin: p, bad, label: p + (info.label ? ` - ${info.label}` : '') + (info.type ? ` (${info.type === 'mosfet' ? 'power output' : 'logic'})` : '') }
  })
}

/** Board pins that drive power (MOSFET heater and fan outputs): no inputs or servos there. */
const POWER_PINS = new Set(['PA8', 'PE5', 'PD12', 'PD13', 'PD14', 'PD15', 'PA2', 'PA3', 'PB10', 'PB11', 'PA1'])

/**
 * Pins system hardware may use: the board headers that aren't on the
 * umbilical (options.board_pins), plus the one it already has. Mirrors the
 * Portal's own list (portal.js controlPins, hardware branch).
 */
export function hardwarePins(opt: ToolOptions, role: string, mine: string[]) {
  const board = opt.board_pins ?? []
  const pool = [...mine.filter((p) => p && !board.some((x) => x.pin === p)).map((pin) => ({ pin, header: '' })), ...board]
  return pool.map((x) => {
    const heat = POWER_PINS.has(x.pin)
    return { pin: x.pin, bad: heat && (role === 'input' || role === 'servo'), label: x.pin + (x.header ? ` - ${x.header}` : '') + (heat ? ' (power output)' : '') }
  })
}

/** A new piece of system hardware: like a control, but not switched off with the tool, and with a category. */
export function newHardware(opt: ToolOptions | null): ControlDraft {
  return { ...newControl(opt), safe_off: false, mounted_only: false, category: opt?.hw_categories?.[0]?.id ?? '', notes: '' }
}

// ---------------------------------------------------------------- outputs (powered tools)

export interface OutputRow {
  role: 'power' | 'switch' | string
  source: string // contact:<n> | pin:<PIN> | output:<name>
}

/** Where an output can come from, grouped as the Portal groups them. */
export function outputChoices(o: ToolOptions, role: string): [string, [string, string][]][] {
  const groups: [string, [string, string][]][] = []
  const chans = [...o.pwm_channels, ...o.switch_channels]
  const share = o.contacts
    .filter((c) => c.output && (role === 'switch' || c.pwm))
    .map((c): [string, string] => {
      const ch = chans.find((x) => x.name === c.output)
      return [`contact:${c.contact}`, `Contact ${c.contact} · ${c.pin} · ${c.output} (${c.pwm ? 'PWM' : 'on/off'})${ch?.shared_with ? ` - shared: ${ch.shared_with}` : ''}`]
    })
  if (share.length) groups.push(['Share an output already on the umbilical', share])
  const fresh = o.free_pins.map((p): [string, string] => [`pin:${p}`, `New output on ${p}${o.free_pin_contacts[p] ? ` (contact ${o.free_pin_contacts[p]})` : ' (spare pin)'}`])
  if (fresh.length) groups.push(['Make a new output on a spare pin', fresh])
  const onContact = new Set(o.contacts.map((c) => c.output).filter(Boolean))
  const pool = role === 'power' ? o.pwm_channels : [...o.switch_channels, ...o.pwm_channels]
  const hw = pool.filter((c) => c.hardware && !onContact.has(c.name)).map((c): [string, string] => [`output:${c.name}`, `${c.name} (system hardware, ${c.pwm ? 'PWM' : 'on/off'})`])
  if (hw.length) groups.push(['System hardware (switches on with the tool)', hw])
  const other = pool
    .filter((c) => !c.hardware && !onContact.has(c.name))
    .map((c): [string, string] => [`output:${c.name}`, `${c.name} (${c.pwm ? 'PWM' : 'on/off'}, contact unknown)${c.shared_with ? ` - shared: ${c.shared_with}` : ''}`])
  if (other.length) groups.push(['Other outputs in the config', other])
  return groups
}

export function outputContact(o: ToolOptions, src: string): number | null {
  const [k, ref] = (src || '').split(':')
  if (k === 'contact') return Number(ref)
  if (k === 'pin') return o.free_pin_contacts[ref!] ?? null
  return null
}

export function describeOutput(o: ToolOptions, src: string): string {
  const [k, ref] = (src || '').split(':')
  const c = k === 'contact' ? o.contacts.find((x) => x.contact === Number(ref)) : null
  if (c) return `contact ${c.contact} (${c.pin}, ${c.output})`
  if (k === 'pin') return `new output on ${ref}${o.free_pin_contacts[ref!] ? `, contact ${o.free_pin_contacts[ref!]}` : ''}`
  return ref ?? ''
}

// ---------------------------------------------------------------- the add wizard

export interface Draft {
  category: string
  kind: string
  name: string
  notes: string
  outputs: OutputRow[]
  contacts: number[]
  cycle: string | number
  base: string
  nozzles: string[]
  nozzles_other: string
  cap: number | string
  min: number | string
  idle: number | string
  max_on_s: number | string
  s_max: number | string
  materials: MatRow[]
  checklist: string
  controls: ToolControl[]
  macros: ToolMacro[]
}

export function newDraft(): Draft {
  return {
    category: '', kind: '', name: '', notes: '', outputs: [{ role: 'power', source: '' }], contacts: [], cycle: '0.01',
    base: '', nozzles: ['0.4'], nozzles_other: '', cap: 50, min: 0, idle: 0, max_on_s: 600, s_max: 1000, materials: [], checklist: '',
    controls: [], macros: [],
  }
}

export const kindOf = (o: ToolOptions, d: Pick<Draft, 'kind'>) => o.kinds.find((k) => k.value === d.kind)
export const typeOf = (o: ToolOptions, d: Pick<Draft, 'kind'>) => kindOf(o, d)?.type ?? ''

/** Safe starting values for the chosen kind (the Portal's presets). */
export function applyKindPreset(o: ToolOptions, d: Draft) {
  const p = o.presets[d.kind] ?? {}
  if (d.kind === 'PRINT_HEAD' || typeOf(o, d) === 'DEPOSITION') {
    d.base = d.base || o.print_bases[0] || ''
    return
  }
  d.materials = Object.entries(p.materials ?? {}).map(([name, m]) => ({ name, power: m.power !== undefined ? pct(m.power) : '', feed_rate: m.feed_rate ?? '', z_offset: 0 }))
  d.checklist = (p.checklist ?? []).join('\n')
  if (p.cap !== undefined) {
    d.cap = pct(p.cap)
    d.max_on_s = p.max_on_s ?? d.max_on_s
  }
}

export type Step = 'Tool' | 'Outputs' | 'Connector' | 'Hardware' | 'Limits' | 'Materials' | 'Controls' | 'Macros' | 'Review'

export function wizSteps(o: ToolOptions | null, d: Draft): Step[] {
  const t = o ? typeOf(o, d) : ''
  if (t === 'POWERED') return ['Tool', 'Outputs', 'Limits', 'Materials', 'Controls', 'Macros', 'Review']
  if (t === 'PASSIVE') return ['Tool', 'Connector', 'Materials', 'Controls', 'Macros', 'Review']
  if (t === 'DEPOSITION') return ['Tool', 'Hardware', 'Controls', 'Macros', 'Review']
  return ['Tool', 'Review']
}

export const wizNozzles = (d: Draft) => [...d.nozzles, ...String(d.nozzles_other || '').split(',').map((x) => x.trim()).filter(Boolean)].join(', ')

export function wizPayload(o: ToolOptions, d: Draft): Record<string, unknown> {
  const t = typeOf(o, d)
  const p: Record<string, unknown> = { name: d.name.trim(), kind: d.kind, notes: d.notes, contacts: d.contacts }
  if (t === 'POWERED') {
    p.outputs = d.outputs.filter((r) => r.source).map((r) => ({ role: r.role, source: r.source }))
    p.cycle = d.cycle
    Object.assign(p, { cap: frac(d.cap), min: frac(d.min), idle: frac(d.idle), max_on_s: d.max_on_s, s_max: d.s_max })
  }
  if (t === 'POWERED' || t === 'PASSIVE') {
    p.materials = rowsToPayload(d.materials, t)
    p.checklist = d.checklist
  }
  if (t === 'DEPOSITION') {
    p.base = d.base
    p.nozzles = wizNozzles(d)
  }
  if (t) {
    p.controls = d.controls
    p.macros = d.macros
  }
  return p
}

export const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{1,23}$/

/** Quick checks before Next, so typos don't need a round trip. '' = fine. */
export function checkStep(_o: ToolOptions, d: Draft, step: Step, existing: string[]): string {
  if (step === 'Tool') {
    if (!d.category) return 'Choose Additive, Subtractive or Passive.'
    if (!d.kind) return 'Choose which kind of tool it is.'
    if (!NAME_RE.test(d.name.trim())) return 'The name must start with a letter, use only letters, digits and _, and be 2-24 characters.'
    if (existing.some((x) => x.toLowerCase() === d.name.trim().toLowerCase())) return 'A tool with that name already exists.'
  }
  if (step === 'Outputs') {
    if (d.outputs.filter((r) => r.role === 'power').length !== 1) return 'Give the tool exactly one main power output (the PWM level M3 S sets).'
    if (d.outputs.some((r) => !r.source)) return 'Choose the contact or pin for every output, or remove the empty row.'
    const s = d.outputs.map((r) => r.source)
    if (new Set(s).size !== s.length) return 'The same contact is chosen twice.'
  }
  if (step === 'Hardware' && !d.base) return 'Choose a tool to copy settings from.'
  if (step === 'Hardware' && !wizNozzles(d)) return 'Choose at least one nozzle size.'
  if (step === 'Limits' && Number(d.min) > Number(d.cap)) return 'Minimum power cannot be above the power cap.'
  return ''
}

// ---------------------------------------------------------------- the editor

export interface EditForm {
  new_name: string
  notes: string
  checklist: string
  cap: number | string
  min: number | string
  idle: number | string
  max_on_s: number | string
  s_max: number | string
  contacts: number[]
}

export function editForm(t: ToolDetail): EditForm {
  return {
    new_name: t.name, notes: t.notes ?? '', checklist: (t.checklist ?? []).join('\n'),
    cap: pct(t.power_cap ?? 0), min: pct(t.power_min ?? 0), idle: pct(t.power_idle ?? 0),
    max_on_s: t.max_on_s ?? '', s_max: t.s_max ?? '', contacts: [...(t.contacts ?? [])],
  }
}

/** POST /api/tools/<name>/edit body (the Portal's saveEditor). */
export function editBody(t: ToolDetail, f: EditForm, rows: MatRow[], removed: string[], controls: ToolControl[], macros: ToolMacro[]) {
  const body: Record<string, unknown> = { notes: f.notes, materials: rowsToPayload(rows, t.type), delete_materials: removed, controls, macros, contacts: f.contacts }
  if (t.type !== 'DEPOSITION') body.checklist = f.checklist
  if (t.type === 'POWERED') Object.assign(body, { cap: frac(f.cap), min: frac(f.min), idle: frac(f.idle), max_on_s: f.max_on_s, s_max: f.s_max })
  return body
}

// ---------------------------------------------------------------- toolhead setup: kinds of tool

/** What a kind of tool needs, in words. */
export const BEHAVIOUR_TEXT: Record<string, string> = { PRINT_HEAD: 'A print head (copies an extruder)', POWERED: 'A power output', PASSIVE: 'Nothing (unpowered)' }

export interface KindMat { name: string; power: number | string; feed: number | string }
export interface KindEdit {
  id: string
  category: string
  behaviour: string
  label: string
  help: string
  isNew: boolean
  cap: number | string
  max_on_s: number | string
  mats: KindMat[]
  checklist: string
}

/** A kind as the setup screen edits it: power and cap in %, materials as rows, checklist as lines. */
export function kindToEdit(k: ToolKind): KindEdit {
  return {
    id: k.id, category: k.category, behaviour: k.behaviour, label: k.label, help: k.help ?? '', isNew: false,
    cap: pct(k.cap ?? 1), max_on_s: k.max_on_s ?? 300,
    mats: Object.entries(k.materials ?? {}).map(([name, m]) => ({ name, power: m.power === undefined ? '' : pct(m.power), feed: m.feed_rate ?? '' })),
    checklist: (k.checklist ?? []).join('\n'),
  }
}

export const newKind = (category: string, behaviour: string): KindEdit => ({
  id: '', category, behaviour, label: '', help: '', isNew: true, cap: 100, max_on_s: 300, mats: [], checklist: '',
})

/** Back to what POST /api/lists { kinds } takes (the Portal's admin.js kindPayload). */
export function editToKind(e: KindEdit): ToolKind {
  const out: ToolKind = { id: e.id, category: e.category, behaviour: e.behaviour, label: e.label.trim(), help: e.help.trim() }
  if (e.behaviour === 'PRINT_HEAD') return out
  out.checklist = e.checklist.split('\n').map((x) => x.trim()).filter(Boolean)
  out.materials = {}
  for (const m of e.mats) {
    const name = m.name.trim().toUpperCase().replace(/\s+/g, '_')
    if (!name) continue
    out.materials[name] = e.behaviour === 'POWERED' ? { power: Number(frac(m.power === '' ? 50 : m.power)), feed_rate: Number(m.feed || 600) } : { feed_rate: Number(m.feed || 800) }
  }
  if (e.behaviour === 'POWERED') {
    out.cap = Number(frac(e.cap === '' ? 100 : e.cap))
    out.max_on_s = Number(e.max_on_s || 300)
  }
  return out
}

