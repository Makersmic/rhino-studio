/**
 * Control › Hardware: every piece of system hardware, with the control that suits it.
 *
 *   fan     slider + % field        SET_FAN_SPEED FAN=<n> SPEED=<0..1>
 *   level   slider + % field        SET_PIN PIN=<n> VALUE=<0..cap>     (an old "level" output is capped at max_power)
 *   switch  On / Off                SET_PIN PIN=<n> VALUE=0|1
 *   servo   slider + ° field        SET_SERVO SERVO=<n> ANGLE=<0..max>
 *   heater  °C field                SET_HEATER_TEMPERATURE HEATER=<n> TARGET=<0..max>
 *   light   slider + % field        SET_LED LED=<n> <channels>=<0..1>
 *   auto    read only               fans Klipper runs itself (driver, hotend, temperature fans)
 *   input   read only               interlocks, flame, pressure, buttons: their state
 *   temp    read only               temperature readouts
 *
 * Items come from the Portal: system hardware (GET /api/state pins.hardware, the six roles) and the
 * Add hardware wizard's devices (GET /api/hardware/devices). Live items (spindles, laser-style power, heaters)
 * sit behind the panel's padlock. The scripts here are the ONLY ones the Hardware panel may send without a
 * confirmation (isHardwareScript), and never to a tool output.
 */
import type { Status } from '@/moonraker/client'
import type { SystemHardware } from '@/toolmgr/types'

export type HwKind = 'fan' | 'level' | 'switch' | 'servo' | 'heater' | 'light' | 'auto' | 'input' | 'temp'

export interface HwItem {
  name: string
  kind: HwKind
  /** what Klipper calls the object: "fan_generic exhaust", "output_pin lamp" */
  object: string
  label: string
  purpose: string
  /** behind the padlock */
  live: boolean
  /** level: highest value (old "level" outputs); servo: highest angle; heater: highest °C */
  max: number
  /** light: which channels to set */
  channels?: string[]
  /** a tool-scoped device: only usable while one of these slots is mounted ([] = whole machine) */
  slots: number[]
  scopeText?: string
}

/** Tool outputs Studio never drives from this panel (they belong to the tools' own wizards). */
const TOOL_OUTPUTS = new Set(['laser_initialize', 'servo_laser', 'spindle_power', 'spindle_speed'])

export interface WizardDevice {
  name: string
  device: string
  label: string
  purpose?: string
  pins: Record<string, string>
  settings: Record<string, unknown>
  expose?: string[]
  live?: boolean
  scope?: string
  scope_values?: string[]
  scope_slots?: number[]
}

const pretty = (n: string) => {
  const h = n.replace(/_/g, ' ')
  return h.charAt(0).toUpperCase() + h.slice(1)
}

function fromRole(h: SystemHardware): HwItem | null {
  const base = { name: h.name, label: pretty(h.name), purpose: h.purpose ?? '', live: false, slots: [] as number[] }
  switch (h.role) {
    case 'fan': return { ...base, kind: 'fan', object: `fan_generic ${h.name}`, max: 1 }
    case 'level': return { ...base, kind: 'level', object: `output_pin ${h.name}`, max: h.max_power ?? 1 }
    case 'switch': return { ...base, kind: 'switch', object: `output_pin ${h.name}`, max: 1 }
    case 'servo': return { ...base, kind: 'servo', object: `servo ${h.name}`, max: h.max_angle ?? 180 }
    case 'heater_fan': return { ...base, kind: 'auto', object: `heater_fan ${h.name}`, max: 1 }
    case 'input': return { ...base, kind: 'input', object: `gcode_button ${h.name}`, max: 1 }
  }
  return null
}

function fromDevice(d: WizardDevice): HwItem | null {
  const s = d.settings ?? {}
  const scoped = d.scope && d.scope !== 'machine'
  const base = {
    name: d.name, label: pretty(d.name), purpose: d.purpose || d.label, live: !!d.live,
    slots: scoped ? (d.scope_slots ?? []) : [], scopeText: scoped ? `Only with ${(d.scope_values ?? []).join(', ')}` : undefined,
  }
  switch (d.device) {
    case 'fan': case 'exhaust': return { ...base, kind: 'fan', object: `fan_generic ${d.name}`, max: 1 }
    case 'coolant': case 'air_assist': case 'dust': case 'vacuum_table': case 'spindle_relay':
      return { ...base, kind: 'switch', object: `output_pin ${d.name}`, max: 1 }
    case 'spindle_pwm': case 'pwm_tool': return { ...base, kind: 'level', object: `pwm_tool ${d.name}`, max: 1 }
    case 'heater': return { ...base, kind: 'heater', object: `heater_generic ${d.name}`, max: Number(s.max_temp ?? 120) }
    case 'led': return { ...base, kind: 'light', object: `led ${d.name}`, max: 1, channels: ['red', 'green', 'blue', 'white'].filter((c) => d.pins[c]).map((c) => c.toUpperCase()) }
    case 'neopixel': return { ...base, kind: 'light', object: `neopixel ${d.name}`, max: 1, channels: String(s.color_order ?? '').includes('W') ? ['RED', 'GREEN', 'BLUE', 'WHITE'] : ['RED', 'GREEN', 'BLUE'] }
    case 'dotstar': return { ...base, kind: 'light', object: `dotstar ${d.name}`, max: 1, channels: ['RED', 'GREEN', 'BLUE'] }
    case 'controller_fan': return { ...base, kind: 'auto', object: `controller_fan ${d.name}`, max: 1 }
    case 'hotend_fan': return { ...base, kind: 'auto', object: `heater_fan ${d.name}`, max: 1 }
    case 'temperature_fan': return { ...base, kind: 'auto', object: `temperature_fan ${d.name}`, max: 1 }
    case 'interlock': case 'flame': case 'pressure': case 'vfd_fault': return { ...base, kind: 'input', object: `gcode_button ${d.name}`, max: 1 }
    case 'runout': return { ...base, kind: 'input', object: `filament_switch_sensor ${d.name}`, max: 1 }
    case 'jam': return { ...base, kind: 'input', object: `filament_motion_sensor ${d.name}`, max: 1 }
    case 'temp_sensor': return { ...base, kind: 'temp', object: `temperature_sensor ${d.name}`, max: 1 }
  }
  return null
}

/** Everything the panel shows, controls first, in a stable order. */
export function hardwareItems(roles: SystemHardware[], devices: WizardDevice[]): HwItem[] {
  const out: HwItem[] = []
  for (const h of roles) {
    const i = fromRole(h)
    if (i && !TOOL_OUTPUTS.has(i.name.toLowerCase())) out.push(i)
  }
  for (const d of devices) {
    // a device shows when it's controllable and exposed to Control, or when it's something to watch
    const i = fromDevice(d)
    if (!i || TOOL_OUTPUTS.has(i.name.toLowerCase())) continue
    const readOnly = i.kind === 'auto' || i.kind === 'input' || i.kind === 'temp'
    if (readOnly || (d.expose ?? []).includes('control')) out.push(i)
  }
  const order: HwKind[] = ['fan', 'light', 'switch', 'level', 'servo', 'heater', 'auto', 'temp', 'input']
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name))
}

export const isControl = (i: HwItem) => i.kind !== 'auto' && i.kind !== 'input' && i.kind !== 'temp'

const num = (v: number) => String(Math.round(v * 10000) / 10000)

/** The one command for setting `item` to `value` (fraction 0..1 for fan/level/light, degrees for servo/heater, 0/1 for switch). */
export function hardwareScript(item: HwItem, value: number): { script: string } | { error: string } {
  if (!Number.isFinite(value)) return { error: 'not a number' }
  switch (item.kind) {
    case 'fan':
      if (value < 0 || value > 1) return { error: 'speed is 0 to 100 %' }
      return { script: `SET_FAN_SPEED FAN=${item.name} SPEED=${num(value)}` }
    case 'level':
      if (value < 0 || value > 1) return { error: 'level is 0 to 100 %' }
      return { script: `SET_PIN PIN=${item.name} VALUE=${num(value * item.max)}` }
    case 'switch':
      return { script: `SET_PIN PIN=${item.name} VALUE=${value > 0 ? 1 : 0}` }
    case 'servo':
      if (value < 0 || value > item.max) return { error: `angle is 0 to ${item.max}°` }
      return { script: `SET_SERVO SERVO=${item.name} ANGLE=${num(value)}` }
    case 'heater':
      if (value < 0 || value > item.max) return { error: `0 to ${item.max}°` }
      return { script: `SET_HEATER_TEMPERATURE HEATER=${item.name} TARGET=${Math.round(value)}` }
    case 'light': {
      if (value < 0 || value > 1) return { error: 'brightness is 0 to 100 %' }
      const ch = item.channels?.length ? item.channels : ['WHITE']
      return { script: `SET_LED LED=${item.name} ${ch.map((c) => `${c}=${num(value)}`).join(' ')}` }
    }
  }
  return { error: `${item.label} is read only` }
}

const FORMS: Record<string, RegExp> = {
  fan: /^SET_FAN_SPEED FAN=([a-z][a-z0-9_]*) SPEED=([\d.]+)$/,
  level: /^SET_PIN PIN=([a-z][a-z0-9_]*) VALUE=([\d.]+)$/,
  switch: /^SET_PIN PIN=([a-z][a-z0-9_]*) VALUE=([01])$/,
  servo: /^SET_SERVO SERVO=([a-z][a-z0-9_]*) ANGLE=([\d.]+)$/,
  heater: /^SET_HEATER_TEMPERATURE HEATER=([a-z][a-z0-9_]*) TARGET=(\d+)$/,
  light: /^SET_LED LED=([a-z][a-z0-9_]*)((?: (?:RED|GREEN|BLUE|WHITE)=[\d.]+)+)$/,
}

/** True only for a script hardwareScript would make for one of `items`, in range. */
export function isHardwareScript(script: string, items: HwItem[]): boolean {
  const s = script.trim()
  if (s.includes('\n')) return false
  for (const item of items) {
    if (!isControl(item)) continue
    const m = FORMS[item.kind]!.exec(s)
    if (!m || m[1] !== item.name || TOOL_OUTPUTS.has(item.name.toLowerCase())) continue
    const v = item.kind === 'light' ? Math.max(...[...m[2]!.matchAll(/=([\d.]+)/g)].map((x) => Number(x[1]))) : Number(m[2])
    const top = item.kind === 'level' ? item.max : item.kind === 'servo' || item.kind === 'heater' ? item.max : 1
    if (Number.isFinite(v) && v >= 0 && v <= top + 1e-9) return true
  }
  return false
}

export interface HwState {
  /** fan / level / light: 0..1 of the item's range; switch: 0 or 1; servo/heater: target */
  value: number | null
  /** what to show: "60 %", "On", "Open", "48°" */
  text: string
  /** read-only items: something to look at (an open interlock, a stalled fan) */
  alert?: boolean
  rpm?: number | null
  temp?: number | null
}

const pct = (v: number) => `${Math.round(v * 100)} %`

/** The item's live state from Klipper's status (null value: Klipper doesn't report it). */
export function hardwareState(item: HwItem, status: Status): HwState {
  const o = (status[item.object] ?? null) as Record<string, unknown> | null
  const n = (k: string) => (o && typeof o[k] === 'number' ? (o[k] as number) : null)
  switch (item.kind) {
    case 'fan': case 'auto': {
      const v = n('speed')
      return { value: v, text: v == null ? '—' : v > 0 ? pct(v) : 'Off', rpm: n('rpm') }
    }
    case 'level': {
      const v = n('value')
      const f = v == null ? null : item.max > 0 ? v / item.max : 0
      return { value: f, text: f == null ? '—' : f > 0 ? pct(f) : 'Off' }
    }
    case 'switch': {
      const v = n('value')
      return { value: v, text: v == null ? '—' : v > 0 ? 'On' : 'Off' }
    }
    case 'servo':
      return { value: null, text: '' }
    case 'heater': {
      const t = n('temperature')
      const target = n('target')
      return { value: target, temp: t, text: t == null ? '—' : `${Math.round(t)}°` }
    }
    case 'temp': {
      const t = n('temperature')
      return { value: t, temp: t, text: t == null ? '—' : `${Math.round(t)}°` }
    }
    case 'light': {
      const cd = (o?.color_data as number[][] | undefined)?.[0]
      const v = cd ? Math.max(...cd) : null
      return { value: v, text: v == null ? '—' : v > 0 ? pct(v) : 'Off' }
    }
    case 'input': {
      if (item.object.startsWith('gcode_button')) {
        const st = o?.state as string | undefined
        if (!st) return { value: null, text: '—' }
        const triggered = st === 'PRESSED'
        const word = item.purpose.toLowerCase().includes('interlock') || /door|lid/i.test(item.name) ? (triggered ? 'Open' : 'Closed') : triggered ? 'Triggered' : 'OK'
        return { value: triggered ? 1 : 0, text: word, alert: triggered }
      }
      const enabled = o?.enabled as boolean | undefined
      const present = o?.filament_detected as boolean | undefined
      if (enabled === false) return { value: null, text: 'Off (no print head)' }
      return { value: present ? 1 : 0, text: present == null ? '—' : present ? 'Filament OK' : 'No filament', alert: present === false }
    }
  }
  return { value: null, text: '—' }
}

/** Klipper objects to subscribe to for this panel (only ones Klipper has are subscribed). */
export const HARDWARE_TYPES = ['output_pin', 'pwm_tool', 'heater_generic', 'gcode_button', 'led', 'neopixel', 'dotstar',
  'temperature_sensor', 'filament_switch_sensor', 'filament_motion_sensor'] as const
const FIELDS: Record<string, string[]> = {
  output_pin: ['value'], pwm_tool: ['value'], heater_generic: ['temperature', 'target', 'power'], gcode_button: ['state'],
  led: ['color_data'], neopixel: ['color_data'], dotstar: ['color_data'], temperature_sensor: ['temperature'],
  filament_switch_sensor: ['enabled', 'filament_detected'], filament_motion_sensor: ['enabled', 'filament_detected'],
}
export function hardwareWatch(objects: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const o of objects) {
    const t = o.split(' ')[0]!
    if (o.includes(' ') && FIELDS[t]) out[o] = FIELDS[t]!
  }
  return out
}

/** Can it be used now? null = yes, otherwise why not. */
export function hardwareBlock(item: HwItem, ctx: { ready: boolean; mountedSlot: number | null; unlocked: boolean }): string | null {
  if (!ctx.ready) return 'Klipper is not ready'
  if (item.slots.length && (ctx.mountedSlot == null || !item.slots.includes(ctx.mountedSlot))) return item.scopeText ?? 'Not for the mounted tool'
  if (item.live && !ctx.unlocked) return 'Unlock to use'
  return null
}
