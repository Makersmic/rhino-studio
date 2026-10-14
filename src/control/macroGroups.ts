/**
 * Macro buttons, split into two panels:
 *
 *   - Tool panel: macros for the mounted toolhead only. It changes when the
 *     tool changes, so it carries the tool's name and accent.
 *   - System Macros panel: macros that work whatever is mounted (backups,
 *     care, and the machine's own hardware such as lights or
 *     an exhaust fan). It never changes, so its buttons stay in one place.
 *
 * Not here on purpose:
 *   - Swap and Confirm tool live in the top bar, beside the mounted tool.
 *   - Pause, Resume and Cancel live with the running job in the status box.
 *
 * Only macros Klipper actually has are shown, so this works on older and
 * newer Rhino configs alike. Every button still goes through the same safety
 * check as the console.
 */

export interface MacroButton {
  name: string
  label: string
  /** Highlight: the thing you most likely need right now */
  suggested?: boolean
}

export interface MacroGroup {
  title: string
  buttons: MacroButton[]
  /** Small monospace buttons for the long tail of unsorted macros */
  dense?: boolean
  /** Can be folded away (the long "Other macros" list) */
  collapsible?: boolean
}

export interface MacroPanels {
  /** Buttons for the mounted tool, in the order you'd usually use them */
  tool: MacroButton[]
  /** More macros that belong to the mounted tool but are rarely clicked */
  toolMore: MacroButton[]
  /** System macros, the same whatever is mounted */
  shared: MacroGroup[]
}

const LABELS: Record<string, string> = {
  SET_Z_ZERO: 'Set Z zero',
  LIST_TOOLHEADS: 'List toolheads',
  CHECK_TOOLHEADS: 'Check toolheads',
  PREHEAT: 'Preheat',
  BED_COOLDOWN: 'Bed cooldown',
  NOZZLE_HEIGHT_CALIBRATE: 'Nozzle height',
  FILAMENT_CHANGE: 'Change filament',
  PURGE: 'Purge',
  CALCULATE_PA: 'Pressure advance',
  LASER_FOCUS_ALIGN: 'Focus and align',
  SET_WORK_ZERO: 'Set work zero',
  CALIBRATE_ESC: 'Calibrate ESC',
  BACKUP_CFG: 'Back up config',
  SHOW_BACKUP_LOCATION: 'Backup location',
  PM_STATUS: 'Maintenance status',
  LEDMAX: 'Lights full',
  LEDMIN: 'Lights low',
  LEDOFF: 'Lights off',
  LEDFLASH: 'Lights flash',
  SWITCH_T0: 'Path 1',
  SWITCH_T1: 'Path 2',
}

/** The main buttons for each kind of tool, in the order you'd use them. */
const BY_TYPE: Record<string, string[]> = {
  // The heated bed only serves printing, so its macros belong to print heads.
  DEPOSITION: ['PREHEAT', 'BED_COOLDOWN', 'NOZZLE_HEIGHT_CALIBRATE', 'FILAMENT_CHANGE', 'PURGE', 'CALCULATE_PA'],
  LASER: ['LASER_FOCUS_ALIGN', 'SET_Z_ZERO'],
  CNC: ['SET_Z_ZERO', 'SET_WORK_ZERO', 'CALIBRATE_ESC'],
  DRAG_KNIFE: ['SET_Z_ZERO'],
}

/**
 * Macros that belong to one kind of tool. They're left out while a different
 * tool is mounted (or none is confirmed): they'd be refused by the macro
 * anyway, and they crowd out what applies. They stay reachable from the
 * console, and the tool panel can show them on request.
 */
const OWNED_BY_TYPE: Record<string, string[]> = {
  DEPOSITION: [
    'PREHEAT', 'BED_COOLDOWN', 'NOZZLE_HEIGHT_CALIBRATE', 'FILAMENT_CHANGE', 'PURGE', 'CALCULATE_PA', 'PRIME_LINE',
    'LOAD_FILAMENT', 'UNLOAD_FILAMENT', 'SET_PAUSE_AT_LAYER', 'SET_PAUSE_NEXT_LAYER',
  ],
  LASER: ['ACTIVATE_LASER', 'DEACTIVATE_LASER', 'SET_LASER_POWER', 'LASER_FOCUS_ALIGN', 'LASERHOME', 'SET_Z_ZERO'],
  CNC: ['SET_WORK_ZERO', 'SPINDLE_ACTIVATE', 'SPINDLE_DEACTIVATE', 'CALIBRATE_ESC', 'G54', 'SET_Z_ZERO'],
  DRAG_KNIFE: ['SET_Z_ZERO'],
  POWERED: ['SET_TOOL_POWER'],
}

/** Macros for one named tool (SwitchFly's filament path servo). */
const OWNED_BY_NAME: Record<string, string[]> = {
  SwitchFly: ['SWITCH_T0', 'SWITCH_T1'],
}

/**
 * True when a macro belongs to other tools and not the mounted one. A macro
 * can belong to several kinds of tool (Set Z zero: laser, spindle, knife).
 */
export function forOtherTool(name: string, toolType: string | null, toolName: string | null): boolean {
  const n = name.toUpperCase()
  const owners = [
    ...Object.entries(OWNED_BY_TYPE).filter(([, list]) => list.includes(n)).map(([type]) => `type:${type}`),
    ...Object.entries(OWNED_BY_NAME).filter(([, list]) => list.includes(n)).map(([tool]) => `name:${tool}`),
  ]
  return owners.length > 0 && !owners.includes(`type:${toolType}`) && !owners.includes(`name:${toolName}`)
}

/** True when a macro belongs to the mounted tool. */
function ownedByMounted(name: string, toolType: string | null, toolName: string | null): boolean {
  const n = name.toUpperCase()
  return (!!toolType && !!OWNED_BY_TYPE[toolType]?.includes(n)) || (!!toolName && !!OWNED_BY_NAME[toolName]?.includes(n))
}

/** Shared panel, in this order. */
const SHARED_KNOWN: { title: string; names: string[] }[] = [
  { title: 'Machine', names: ['BACKUP_CFG', 'SHOW_BACKUP_LOCATION', 'PM_STATUS'] },
]

/**
 * The machine's own hardware (lights, chamber, exhaust, filters), recognised
 * by name so a new light or exhaust-fan macro lands here without code
 * changes. It is never tool power: air assist and coolant belong to tools.
 */
const SYSTEM_HARDWARE = /^(LED|LIGHT|LIGHTS|CASE_?LIGHT|CHAMBER|ENCLOSURE|EXHAUST|NEVERMORE|FILTER|VENT)/

/** Run inside other macros or by Studio's own controls elsewhere; never offered as buttons. */
const HIDDEN = new Set([
  'G0', 'G1', 'G28', 'M0', 'M3', 'M4', 'M5', 'PAUSE', 'RESUME', 'CANCEL_PRINT', 'END_PRINT', 'START_JOB', 'START_SEQUENCE',
  'VARIABLES', 'CUSTOM_TOOLS', 'RHINO_POSITIONS', 'EMERGENCY_STOP', 'CONFIRM_TOOL_INSTALL', 'CONFIRM_TOOLHEAD',
  'LASER_JOB_SETUP', 'CNC_JOB_SETUP', 'DRAGKNIFE_JOB_SETUP', 'TOOL_JOB_SETUP',
  // lines that live in job files (Rhino 1.4.2): never a button
  'CNC_BIT_CHANGE', 'REQUIRE_TOOLHEAD',
  // in the top bar, beside the mounted tool (Swap lists the toolheads itself)
  'SWAP_TOOL', 'RESTORE_TOOL', 'LIST_TOOLHEADS', 'CHECK_TOOLHEADS',
])

const label = (n: string) => LABELS[n] ?? n.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
const visible = (n: string) => !n.startsWith('_') && !HIDDEN.has(n.toUpperCase()) && !/^[GM]\d/.test(n)

export function macroPanels(
  available: ReadonlySet<string>,
  opts: { toolType: string | null; toolName: string | null; showAll?: boolean },
): MacroPanels {
  const { toolType, toolName } = opts
  const has = (n: string) => available.has(n) && visible(n)
  const used = new Set<string>()
  const take = (n: string): MacroButton => (used.add(n), { name: n, label: label(n) })

  // ---- tool panel ----
  const main = toolType ? [...(BY_TYPE[toolType] ?? []), ...(toolName ? OWNED_BY_NAME[toolName] ?? [] : [])] : []
  const tool = main.filter((n) => has(n) && !used.has(n)).map(take)
  const toolMore = [...available]
    .filter((n) => has(n) && !used.has(n) && ownedByMounted(n, toolType, toolName))
    .sort()
    .map(take)
  // asked for: other tools' macros too, clearly after the mounted tool's
  if (opts.showAll) {
    for (const n of [...available].filter((n) => has(n) && !used.has(n) && forOtherTool(n, toolType, toolName)).sort()) {
      toolMore.push(take(n))
    }
  }

  // ---- shared panel ----
  const shared: MacroGroup[] = []
  for (const g of SHARED_KNOWN) {
    const buttons = g.names.filter((n) => has(n) && !used.has(n)).map(take)
    if (buttons.length) shared.push({ title: g.title, buttons })
  }
  const hardware = [...available]
    .filter((n) => has(n) && !used.has(n) && SYSTEM_HARDWARE.test(n.toUpperCase()) && !forOtherTool(n, toolType, toolName))
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map(take)
  if (hardware.length) shared.push({ title: 'Lights and air', buttons: hardware })
  const rest = [...available].filter((n) => has(n) && !used.has(n) && !forOtherTool(n, toolType, toolName)).sort()
  if (rest.length) shared.push({ title: 'Other macros', buttons: rest.map((n) => ({ name: n, label: n })), dense: true, collapsible: true })

  return { tool, toolMore, shared }
}

/** Lights in a sensible order (full, low, off, flash), then everything else. */
function order(n: string): number {
  const i = ['LEDMAX', 'LEDMIN', 'LEDOFF', 'LEDFLASH'].indexOf(n.toUpperCase())
  return i < 0 ? 99 : i
}

/** How many macros are left out because they belong to another tool. */
export function hiddenForOtherTools(available: ReadonlySet<string>, toolType: string | null, toolName: string | null): number {
  return [...available].filter((n) => visible(n) && forOtherTool(n, toolType, toolName)).length
}
