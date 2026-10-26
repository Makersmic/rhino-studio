/**
 * Add hardware wizard (Tool Manager 1.9 design: docs/hardware-coverage.md in Toolhead_Manager).
 * The pure part: the catalog's shapes, the five questions, a draft per device, per-step checks and the
 * body the Portal saves. The Portal checks everything again before writing; these checks only stop a
 * step that obviously isn't finished.
 */

export type PinKind = 'digital_in' | 'digital_out' | 'pwm_out' | 'adc' | 'spi_cs' | 'i2c' | 'data' | 'clock' | 'step' | 'dir' | 'enable' | 'tach'

export interface HwSetting {
  key: string
  kind: 'num' | 'choice' | 'bool'
  default: number | string | boolean
  min?: number
  max?: number
  options?: string[]
}

export interface HwDevice {
  id: string
  group: string
  label: string
  section: string
  pins: [string, PinKind, boolean][]
  role: string | null
  status: 'ready' | 'planned'
  writer?: 'wizard' | 'form'
  follows: string[]
  expose: string[]
  expose_allowed?: string[]
  settings?: HwSetting[]
  sensor: boolean
  purpose: string | null
  live: boolean
  hardware_only: boolean
  help: string
  /** a pin asked for only when a setting has one of these values, e.g. a fan's tach only on 3 and 4 wires */
  pin_when?: Record<string, Record<string, string[]>>
}

export interface SensorType {
  label: string
  pin_kind: PinKind | null
  recommended?: boolean
  note?: string
  warn?: string
  refuse_direct?: boolean
}

export interface HwCatalog {
  ok: boolean
  groups: { id: string; label: string; devices: HwDevice[] }[]
  pin_kinds: Record<string, { label: string; help: string }>
  sensor_types: Record<string, SensorType>
  scopes: Record<string, string>
  follows: Record<string, string>
  follows_built: string[]
  expose: Record<string, string>
  limits: { heater_max_temp: number; temp_fan_margin: number; run_on: number; controller_fan_idle: number }
}

export interface PinChoice {
  pin: string
  board: string
  header: string
  use: string
  mosfet: boolean
  adc: boolean | null
  five_v: 'yes' | 'no' | 'check'
  warnings: string[]
  needs_isolation?: boolean
}

export interface PinChoices {
  ok: boolean
  kind: PinKind
  pins: PinChoice[]
  hidden: number
  type_pin_on: string[]
}

export interface BoardPreset {
  id: string
  label: string
  mcu: string
  generic: boolean
  example: string
}

export interface BoardsState {
  ok: boolean
  presets: BoardPreset[]
  boards: { name: string; preset?: string; label?: string; link?: 'usb' | 'can'; added_here: boolean; where?: string }[]
  serial_ports: { path: string; used_by: string }[]
  max_boards: number
}

export interface DevicePreview {
  ok: boolean
  name: string
  text: string
  warnings: string[]
}

export type WizStep = 'What' | 'Wiring' | 'Tools' | 'Follows' | 'Shows' | 'Check'
export const WIZ_STEPS: WizStep[] = ['What', 'Wiring', 'Tools', 'Follows', 'Shows', 'Check']
export const STEP_LABEL: Record<WizStep, string> = {
  What: 'What is it',
  Wiring: 'Wiring',
  Tools: 'For which tools',
  Follows: 'Follows',
  Shows: 'Shows',
  Check: 'Check',
}
export const STEP_HELP: Record<WizStep, string> = {
  What: 'The kind of hardware and its name',
  Wiring: 'Pins, switch type, electrical details',
  Tools: 'Whole machine, a category or named tools',
  Follows: 'What turns it on and off',
  Shows: 'Control tab, Dashboard, macros',
  Check: 'Checked against your config',
}
/** The mascot pose beside each question (rhino-studio/src/assets/wizard/, from scripts/wizard_poses.py). */
export const STEP_POSE: Record<WizStep, string> = {
  What: 'what',
  Wiring: 'wiring',
  Tools: 'tools',
  Follows: 'follows',
  Shows: 'shows',
  Check: 'done',
}

/** Settings that describe the wiring; the rest describe behaviour and go under Follows. */
export const WIRING_KEYS = new Set([
  'wires', 'tach_ppr', 'signal_inverted',
  'thermistor', 'pullup_resistor', 'active_low', 'dir_active_low', 'enable_active_low', 'cycle_time', 'cycle',
  'chain_count', 'color_order', 'microsteps', 'rotation_distance', 'source', 'extruder',
])

const SETTING_LABEL: Record<string, string> = {
  wires: 'Wires on the fan',
  tach_ppr: 'Speed signal pulses per turn',
  signal_inverted: 'The speed input is inverted (a transistor in between)',
  heater: 'Heater it follows',
  heater_temp: 'Turns on above (°C)',
  off_below: 'Off below (0-1)',
  fan_speed: 'Fan speed (0-1)',
  idle_timeout: 'Keeps running after the motors stop (s)',
  kick_start: 'Kick-start time (s)',
  target_temp: 'Holds this temperature (°C)',
  min_speed: 'Lowest speed (0-1)',
  max_speed: 'Highest speed (0-1)',
  thermistor: 'Thermistor',
  pullup_resistor: 'Pull-up resistor (Ω)',
  max_temp: 'Highest temperature (°C)',
  max_power: 'Highest power (0-1)',
  pwm_cycle_time: 'PWM cycle time (s)',
  max_delta: 'Switches within (°C)',
  source: 'Reads from',
  must_close_laser: 'Must be closed to start the laser',
  must_close_spindle: 'Must be closed to start the spindle',
  required_for_laser: 'Laser jobs need it clear to start',
  must_be_ok: 'Must be OK to start any job',
  active_low: 'The relay turns on when the pin is LOW',
  cycle_time: 'PWM cycle time (s)',
  dir_active_low: 'Direction is active LOW',
  enable_active_low: 'Enable is active LOW',
  gcode: 'G-code that switches it',
  cycle: 'PWM cycle time (s)',
  chain_count: 'Number of LEDs',
  color_order: 'Colour order',
  event_delay: 'Ignore repeats for (s)',
  detection_length: 'Filament length before a jam (mm)',
  extruder: 'Extruder',
  microsteps: 'Microsteps',
  rotation_distance: 'Distance per turn (mm or °)',
  velocity: 'Speed (mm/s)',
  accel: 'Acceleration (mm/s², 0 = none)',
}
export const settingLabel = (key: string) => SETTING_LABEL[key] ?? key.replace(/_/g, ' ')

const PIN_LABEL: Record<string, string> = {
  pin: 'Pin',
  sensor: 'Temperature sensor',
  direction: 'Direction (optional)',
  enable: 'Enable',
  tach: 'Speed signal (optional)',
  power: 'Power',
  red: 'Red channel',
  green: 'Green channel',
  blue: 'Blue channel',
  white: 'White channel',
  data: 'Data',
  clock: 'Clock',
  step: 'Step',
  dir: 'Direction',
  endstop: 'Endstop (optional)',
  pins: 'Pin',
}
export const pinLabel = (name: string) => PIN_LABEL[name] ?? name

export interface Draft {
  device: string
  name: string
  purpose: string
  notes: string
  pins: Record<string, string>
  sensor_type: string
  isolated: boolean
  settings: Record<string, number | string | boolean>
  scope: 'machine' | 'category' | 'tools'
  scope_values: string[]
  follows: string
  expose: string[]
}

/** Devices whose digital input is a switch or sensor the user picks a type for (the Portal's rule). */
export function asksSensorType(dev: HwDevice): boolean {
  return dev.pins.some((p) => p[1] === 'digital_in') && (dev.sensor || dev.id === 'manual_stepper')
}

/** The pins this draft shows: for a temperature readout, the sensor pin only when it reads a thermistor. */
export function pinsShown(dev: HwDevice, d: Draft): [string, PinKind, boolean][] {
  if (dev.id === 'temp_sensor') return d.settings.source === 'thermistor' ? dev.pins.map((p) => [p[0], p[1], true]) : []
  return dev.pins.filter(([name]) => whenMet(dev.pin_when?.[name], d))
}

const whenMet = (when: Record<string, string[]> | undefined, d: Draft) => !when || Object.entries(when).every(([k, v]) => v.includes(String(d.settings[k])))

/** Settings that only mean something for some wiring: a 4-wire fan's inverted input, pulses per turn with a tach. */
export function settingShown(key: string, d: Draft): boolean {
  if (key === 'signal_inverted') return String(d.settings.wires) === '4'
  if (key === 'tach_ppr') return ['3', '4'].includes(String(d.settings.wires)) && !!d.pins.tach
  return true
}

/** Help under each fan pin, in place of the pin kind's general help. */
export function fanPinHelp(slot: string, wires: string): string | null {
  if (slot === 'pin') return wires === '4' ? 'The blue wire. 3.3 V logic drives it fine for most fans.' : "The fan's power: a fan or heater header switches it."
  if (slot === 'tach') return 'The yellow wire. The wizard adds the pull-up it needs.'
  if (slot === 'power') return "A fan header that switches the fan's power, so it stops at 0 %. Leave empty for an always-on port."
  return null
}

/** One line under the wire count: what each fan wiring means. */
export const WIRES_HELP: Record<string, string> = {
  '2': 'Power only. Its speed is set by switching the power on a fan header.',
  '3': 'Power plus a speed signal back (yellow). The reading is only right at full speed on a switched header.',
  '4': 'Power, a speed signal back, and a speed input (blue) on a logic pin. Power comes from an always-on port, or a fan header as its power pin.',
}

export function newDraft(dev: HwDevice, followsBuilt: string[]): Draft {
  const settings: Draft['settings'] = {}
  for (const s of dev.settings ?? []) settings[s.key] = s.default
  return {
    device: dev.id,
    name: '',
    purpose: '',
    notes: '',
    pins: {},
    sensor_type: asksSensorType(dev) ? 'mech_nc' : '',
    isolated: false,
    settings,
    scope: 'machine',
    scope_values: [],
    follows: dev.follows.find((f) => followsBuilt.includes(f)) ?? dev.follows[0] ?? 'manual',
    expose: [...dev.expose],
  }
}

export const NAME_RE = /^[a-z][a-z0-9_]{1,31}$/

/** Why this step isn't finished, or null. `taken`: names already used (devices, hardware, boards). */
export function checkStep(step: WizStep, dev: HwDevice | null, d: Draft | null, taken: string[], followsBuilt: string[]): string | null {
  if (!dev || !d) return 'Choose what it is.'
  if (step === 'What') {
    if (dev.status !== 'ready' || dev.writer !== 'wizard') return `${dev.label} isn't built into the wizard yet.`
    if (!NAME_RE.test(d.name)) return 'Name: lower-case letters, digits and _, 2 to 32 characters, starting with a letter.'
    if (taken.includes(d.name)) return `${d.name} is already used.`
  }
  if (step === 'Wiring') {
    for (const [name, , required] of pinsShown(dev, d)) if (required && !d.pins[name]) return `Choose a pin for ${pinLabel(name).toLowerCase()}.`
    if (dev.id === 'led' && !['red', 'green', 'blue', 'white'].some((c) => d.pins[c])) return 'Choose at least one colour pin.'
    const shownPins = new Set(pinsShown(dev, d).map((p) => p[0]))
    const used = Object.entries(d.pins).filter(([k, v]) => v && shownPins.has(k)).map(([, v]) => v)
    if (new Set(used).size !== used.length) return 'Each pin can only be used once.'
    for (const s of dev.settings ?? []) {
      if (!WIRING_KEYS.has(s.key)) continue
      const err = checkSetting(s, d.settings[s.key])
      if (err) return err
    }
  }
  if (step === 'Tools' && d.scope !== 'machine' && !d.scope_values.length) return d.scope === 'category' ? 'Choose a category.' : 'Choose at least one tool.'
  if (step === 'Follows') {
    if (!followsBuilt.includes(d.follows)) return 'That rule comes with job hooks, which aren\'t built yet. Choose another.'
    for (const s of dev.settings ?? []) {
      if (WIRING_KEYS.has(s.key)) continue
      const err = checkSetting(s, d.settings[s.key])
      if (err) return err
    }
  }
  return null
}

export function checkSetting(s: HwSetting, v: unknown): string | null {
  if (s.kind !== 'num') return null
  const n = Number(v)
  if (v === '' || !Number.isFinite(n)) return `${settingLabel(s.key)}: a number.`
  if ((s.min != null && n < s.min) || (s.max != null && n > s.max)) return `${settingLabel(s.key)}: ${s.min} to ${s.max}.`
  return null
}

/** The body for POST /api/hardware/devices (and its preview). */
export function payload(d: Draft, dev: HwDevice): Record<string, unknown> {
  const kinds = Object.fromEntries((dev.settings ?? []).map((s) => [s.key, s.kind]))
  const shown = new Set(pinsShown(dev, d).map((p) => p[0]))
  const pins = Object.fromEntries(Object.entries(d.pins).filter(([k, v]) => v && shown.has(k)))
  const body: Record<string, unknown> = {
    device: d.device,
    name: d.name,
    purpose: d.purpose,
    notes: d.notes,
    pins,
    scope: d.scope,
    scope_values: d.scope === 'machine' ? [] : d.scope_values,
    follows: d.follows,
    expose: d.expose,
    ...Object.fromEntries(Object.entries(d.settings).map(([k, v]) => [k, kinds[k] === 'num' ? Number(v) : v])),
  }
  if (d.sensor_type) {
    body.sensor_type = d.sensor_type
    body.isolated = d.isolated
  }
  return body
}

/** One line for a pin choice: "PD15 · FAN5 (MOSFET)", "ebb:PA3 · thermistor". */
export function pinText(p: PinChoice): string {
  const where = p.header || (p.use !== 'gpio' ? p.use : '')
  const tags = [p.mosfet ? 'MOSFET' : '', p.adc ? 'analog' : ''].filter(Boolean)
  return `${p.pin}${where ? ` · ${where}` : ''}${tags.length ? ` (${tags.join(', ')})` : ''}`
}
