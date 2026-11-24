/**
 * Wizards > Tuning results: everything the wizards found, in one list per print head, with when and a way to run it again.
 * Plain logic: it turns the Portal's two stores (tuning.json: rotation distance, pressure advance, flow, first layer, ...;
 * tuned.cfg: heater PID, input shaper) into rows. No Vue, no network.
 */
import type { TunedState } from '@/portal/client'
import type { TuningState } from '@/tuning/tuning'

export interface Row {
  what: string
  value: string
  at: number | null
  /** where to run it again */
  wizard: string | null
}
export interface Group {
  title: string
  rows: Row[]
}

const NAMES: Record<string, { what: string; wizard: string | null; unit?: string }> = {
  rotation_distance: { what: 'Extruder rotation distance', wizard: '/assets', unit: 'mm' },
  pressure_advance: { what: 'Pressure advance', wizard: '/assets' },
  extrusion_multiplier: { what: 'Flow (extrusion multiplier)', wizard: '/assets' },
  first_layer_fine: { what: 'First-layer fine-tune', wizard: '/assets', unit: 'mm' },
  laser_focus_height: { what: 'Laser focus height', wizard: '/assets', unit: 'mm' },
  knife_blade_offset: { what: 'Knife blade offset', wizard: '/assets', unit: 'mm' },
}
const label = (k: string) => NAMES[k]?.what ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** Per print head or tool: its own values, then the per-material ones. */
export function headGroups(t: TuningState | null, tuned: TunedState | null): Group[] {
  const groups = new Map<string, Row[]>()
  const add = (head: string, row: Row) => groups.set(head, [...(groups.get(head) ?? []), row])
  for (const [head, vals] of Object.entries(t?.heads ?? {})) {
    for (const [k, v] of Object.entries(vals)) if (v) add(head, { what: label(k), value: `${v.value}${NAMES[k]?.unit ? ' ' + NAMES[k]!.unit : ''}`, at: v.time ?? null, wizard: NAMES[k]?.wizard ?? null })
  }
  for (const [key, vals] of Object.entries(t?.materials ?? {})) {
    const [head, ...rest] = key.split('|')
    const where = rest.join(' · ').replace(/^(\d+(\.\d+)?)(?= |$)/, '$1 mm')
    for (const [k, v] of Object.entries(vals)) if (v) add(head!, { what: `${label(k)} (${where})`, value: String(v.value), at: v.time ?? null, wizard: NAMES[k]?.wizard ?? null })
  }
  for (const [head, s] of Object.entries(tuned?.shaper ?? {})) {
    add(head, { what: 'Input shaper', value: `X ${s.x.type.toUpperCase()} ${s.x.freq} Hz · Y ${s.y.type.toUpperCase()} ${s.y.freq} Hz${s.max_accel ? ` · up to ${s.max_accel} mm/s²` : ''}`, at: s.at, wizard: '/wizards/shaping' })
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([title, rows]) => ({ title, rows }))
}

/** The machine's own: heater PID and the accelerometer. */
export function machineGroup(tuned: TunedState | null): Group {
  const rows: Row[] = []
  for (const [obj, p] of Object.entries(tuned?.pid ?? {})) {
    const name = obj === 'extruder' ? 'Hotend' : obj === 'heater_bed' ? 'Bed' : obj.replace(/^heater_generic /, '')
    rows.push({ what: `${name} PID`, value: `Kp ${p.kp} · Ki ${p.ki} · Kd ${p.kd}`, at: p.at, wizard: '/wizards/tune-heater' })
  }
  if (tuned?.accelerometer) rows.push({ what: 'Accelerometer', value: tuned.accelerometer.serial.replace('/dev/serial/by-id/', ''), at: null, wizard: '/wizards/shaping' })
  return { title: 'The machine', rows }
}

export function ago(at: number | null, now = Date.now() / 1000): string {
  if (!at) return ''
  const d = Math.max(0, now - at)
  if (d < 3600) return 'just now'
  if (d < 86400) return `${Math.round(d / 3600)} h ago`
  if (d < 86400 * 60) return `${Math.round(d / 86400)} days ago`
  return `${Math.round(d / (86400 * 30))} months ago`
}
