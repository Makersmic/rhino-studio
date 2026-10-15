/**
 * Shapes returned by the Rhino Portal's tool API (Toolhead_Manager
 * rhino/portal/routes.py and rhino/service.py, 1.4.x). Only what Studio
 * uses is typed; everything is treated as possibly missing.
 */

export type ToolType = 'DEPOSITION' | 'POWERED' | 'PASSIVE' | 'LASER' | 'CNC' | 'DRAG_KNIFE' | string

/** One tool in GET /api/state's list (built-in and added). */
export interface PortalTool {
  name: string
  slot: number
  builtin: boolean
  type: ToolType
  kind: string
  kind_code?: string
  category?: string
  category_label?: string
  contacts: number[]
  capabilities?: string[]
  materials: string[]
  notes?: string
  images?: string[]
  image?: string
  image_dark?: string
  function?: string
  macros?: { name: string }[]
}

export interface PendingInfo {
  changes?: string[]
  auto_restart?: boolean
  restart_at?: number | null
  note?: string
}

export interface PortalPrinter {
  online: boolean
  klippy?: string
  print_state?: string
  mounted_slot?: number | null
  restart_blocked?: boolean
  job?: { filename?: string; progress?: number; timing?: { elapsed?: number; remaining?: number | null; method?: string } } | null
}

export interface PortalState {
  ok: boolean
  tools: PortalTool[]
  pins?: PinsReport
  printer: PortalPrinter
  restart_pending: boolean
  pending: PendingInfo | null
  server_time?: number
}

export interface SheetContact {
  contact: number
  pin: string
  label: string
  kind?: string
  use: string
  used: boolean
}

/** GET /api/tools/<name>/sheet: a tool's own page. */
export interface ToolSheet extends PortalTool {
  about?: string
  setup?: string
  outputs_text?: string
  contacts: never
  photos: string[]
  image_notes: string[]
  other_pins?: { pin: string; use: string }[]
  material_columns: { field: string; label: string; unit?: string }[]
  material_rows: { key: string; label: string; values: string[] }[]
  macro_list: { name: string; description?: string }[]
}
export type ToolSheetData = Omit<ToolSheet, 'contacts'> & { contacts: SheetContact[] }

/** A control (extra output or input) on an added tool, as the Portal stores it. */
export interface ToolControl {
  name: string
  purpose?: string
  role: 'switch' | 'level' | 'fan' | 'heater_fan' | 'servo' | 'input' | string
  pin: string
  invert?: boolean
  start_on?: boolean
  on_shutdown?: 'off' | 'on'
  safe_off?: boolean
  make_macros?: boolean
  mounted_only?: boolean
  cycle?: number
  max_power?: number
  kick_start?: number
  heater?: string
  heater_temp?: number
  max_angle?: number
  min_pulse?: number
  max_pulse?: number
  pullup?: boolean
  on_press?: { action: string; message?: string; command?: string }
  on_release?: { action: string; message?: string; command?: string }
  [k: string]: unknown
}

export interface ToolMacro {
  name: string
  purpose?: string
  body: string
  mounted_only?: boolean
  [k: string]: unknown
}

/** GET /api/tools/<name>: an added tool's full record, for the editor. */
export interface ToolDetail {
  name: string
  slot: number
  type: ToolType
  kind: string
  category?: string
  notes?: string
  checklist?: string[]
  contacts?: number[]
  controls?: ToolControl[]
  macros?: ToolMacro[]
  images?: string[]
  materials: Record<string, Record<string, number | string>>
  outputs?: { contact: number | null; new?: boolean; output: string; pin: string; role: string }[]
  power_pin?: string
  power_cap?: number
  power_min?: number
  power_idle?: number
  max_on_s?: number
  s_max?: number
  new_pin?: string
  new_enable_pin?: string
  limits?: Record<string, [number, number]>
}

export interface OptionContact {
  contact: number
  pin: string
  label: string
  kind?: string
  output?: string
  pwm?: boolean
  used_by?: string
  tools?: string[]
}

export interface OptionChannel {
  name: string
  pwm: boolean
  value?: number
  shared_with?: string
  pin?: string
  contact?: number | null
  hardware?: boolean
}

/** GET /api/options: everything the add and edit forms choose from. */
export interface ToolOptions {
  kinds: { value: string; label: string; type: ToolType; category: string; behaviour?: string; help?: string }[]
  categories: { value: string; label: string; help?: string }[]
  free_pins: string[]
  free_pin_contacts: Record<string, number | null>
  contacts: OptionContact[]
  output_roles: [string, string][]
  pwm_channels: OptionChannel[]
  switch_channels: OptionChannel[]
  print_bases: string[]
  pin_info: Record<string, { type?: string; label?: string; type_label?: string }>
  heaters: string[]
  control_roles: { value: string; label: string; help?: string }[]
  input_actions: [string, string][]
  next_slot: number
  presets: Record<string, { cap?: number; max_on_s?: number; checklist?: string[]; materials?: Record<string, { power?: number; feed_rate?: number }> }>
  material_names: Record<string, string[]>
  nozzles: number[]
  limits: Record<string, [number, number]>
  hw_categories?: { id: string; label: string }[]
  /** board headers off the umbilical, for system hardware */
  board_pins?: { pin: string; header: string }[]
}

export interface PreviewResult {
  ok: boolean
  text: string
  warnings: string[]
  item: ToolControl | ToolMacro
}

export interface WriteResult {
  ok: boolean
  name?: string
  slot?: number
  restart_needed?: boolean
  restart_pending?: boolean
  warnings?: string[]
  images?: string[]
  [k: string]: unknown
}

/** A kind of tool, as the add-a-tool lists keep it (GET /api/lists). */
export interface ToolKind {
  id: string
  category: string
  behaviour: 'PRINT_HEAD' | 'POWERED' | 'PASSIVE' | string
  label: string
  help?: string
  cap?: number
  max_on_s?: number
  materials?: Record<string, { power?: number; feed_rate?: number }>
  checklist?: string[]
}

/** GET /api/lists: what Add a toolhead offers. */
export interface ToolLists {
  ok: boolean
  kinds: ToolKind[]
  materials: Record<string, string[]>
  nozzles: number[]
  hw_categories: { id: string; label: string }[]
  in_use: { kinds: Record<string, string[]>; hw_categories: Record<string, string[]> }
  builtin_kinds: string[]
  categories: { value: string; label: string; help?: string }[]
  behaviours: { value: string; label: string }[]
  category_behaviours: Record<string, string[]>
  limits: Record<string, [number, number]>
}

/** GET /api/state pins: the tool connector, the board's pins and outputs, system hardware. */
export interface PinsReport {
  pins: { pin: string; state: 'free' | 'claimed' | 'tool' | string; owner?: string }[]
  channels: { name: string; pwm: boolean; value?: number | null; shared_with?: string; pin?: string; contact?: number | null; hardware?: boolean }[]
  contacts: (OptionContact & { owner?: string; warning?: string })[]
  hardware: SystemHardware[]
  missing_includes: string[]
}

/** One piece of system hardware: a control wired to the board, not the tool connector. */
export interface SystemHardware extends ToolControl {
  category?: string
  category_label?: string
  header?: string
  notes?: string
  macros: string[]
}
