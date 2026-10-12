/**
 * Macro buttons, arranged by what you're doing. Only macros Klipper actually
 * has are shown, so this works on older and newer Rhino configs alike.
 * Every button still goes through the same safety check as the console.
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
}

const LABELS: Record<string, string> = {
  SWAP_TOOL: 'Swap toolhead',
  RESTORE_TOOL: 'Confirm mounted tool',
  SET_Z_ZERO: 'Set Z zero',
  LIST_TOOLHEADS: 'List toolheads',
  CHECK_TOOLHEADS: 'Check toolheads',
  PREHEAT: 'Preheat',
  NOZZLE_HEIGHT_CALIBRATE: 'Nozzle height',
  FILAMENT_CHANGE: 'Change filament',
  PURGE: 'Purge',
  CALCULATE_PA: 'Pressure advance',
  LASER_FOCUS_ALIGN: 'Focus and align',
  SET_WORK_ZERO: 'Set work zero',
  CALIBRATE_ESC: 'Calibrate ESC',
  BED_COOLDOWN: 'Bed cooldown',
  BACKUP_CFG: 'Back up config',
  PM_STATUS: 'Maintenance status',
  LEDMAX: 'Lights full',
  LEDMIN: 'Lights low',
  LEDOFF: 'Lights off',
}

const BY_TYPE: Record<string, string[]> = {
  DEPOSITION: ['PREHEAT', 'NOZZLE_HEIGHT_CALIBRATE', 'FILAMENT_CHANGE', 'PURGE', 'CALCULATE_PA'],
  LASER: ['LASER_FOCUS_ALIGN', 'SET_Z_ZERO'],
  CNC: ['SET_Z_ZERO', 'SET_WORK_ZERO', 'CALIBRATE_ESC'],
  DRAG_KNIFE: ['SET_Z_ZERO'],
}

/**
 * Macros that belong to one kind of tool. They're left out of the buttons
 * while a different tool is mounted (or none is confirmed): they'd be
 * refused by the macro anyway, and they crowd out what applies. They stay
 * reachable from the console, and the panel can show them on request.
 */
const OWNED_BY_TYPE: Record<string, string[]> = {
  DEPOSITION: ['PREHEAT', 'NOZZLE_HEIGHT_CALIBRATE', 'FILAMENT_CHANGE', 'PURGE', 'CALCULATE_PA', 'PRIME_LINE', 'LOAD_FILAMENT', 'UNLOAD_FILAMENT'],
  LASER: ['ACTIVATE_LASER', 'DEACTIVATE_LASER', 'SET_LASER_POWER', 'LASER_FOCUS_ALIGN', 'LASERHOME'],
  CNC: ['SET_WORK_ZERO', 'SPINDLE_ACTIVATE', 'SPINDLE_DEACTIVATE', 'CALIBRATE_ESC', 'G54'],
  POWERED: ['SET_TOOL_POWER'],
}
/** Macros for one named tool (SwitchFly's filament path servo). */
const OWNED_BY_NAME: Record<string, string[]> = {
  SwitchFly: ['SWITCH_T0', 'SWITCH_T1'],
}

/** True when a macro belongs to a tool other than the mounted one. */
export function forOtherTool(name: string, toolType: string | null, toolName: string | null): boolean {
  const n = name.toUpperCase()
  for (const [type, list] of Object.entries(OWNED_BY_TYPE)) if (list.includes(n) && type !== toolType) return true
  for (const [tool, list] of Object.entries(OWNED_BY_NAME)) if (list.includes(n) && tool !== toolName) return true
  return false
}

/** Run inside other macros or by Studio's own buttons; not offered as buttons. */
const HIDDEN = new Set([
  'G0', 'G1', 'G28', 'M0', 'M3', 'M4', 'M5', 'PAUSE', 'RESUME', 'CANCEL_PRINT', 'END_PRINT', 'START_JOB', 'START_SEQUENCE',
  'VARIABLES', 'CUSTOM_TOOLS', 'RHINO_POSITIONS', 'EMERGENCY_STOP', 'CONFIRM_TOOL_INSTALL', 'CONFIRM_TOOLHEAD',
  'LASER_JOB_SETUP', 'CNC_JOB_SETUP', 'DRAGKNIFE_JOB_SETUP', 'TOOL_JOB_SETUP',
])

const label = (n: string) => LABELS[n] ?? n.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

export function macroGroups(
  available: ReadonlySet<string>,
  opts: { toolType: string | null; toolName: string | null; needsRestore: boolean; showAll?: boolean },
): MacroGroup[] {
  const has = (n: string) => available.has(n) && (opts.showAll || !forOtherTool(n, opts.toolType, opts.toolName))
  const used = new Set<string>()
  const pick = (names: string[], suggested: string[] = []) =>
    names.filter((n) => has(n) && !used.has(n)).map((n) => (used.add(n), { name: n, label: label(n), suggested: suggested.includes(n) }))

  const groups: MacroGroup[] = []
  // RESTORE_TOOL is only offered when Klipper is waiting for it (after a restart)
  if (!opts.needsRestore) used.add('RESTORE_TOOL')
  const toolhead = pick(['RESTORE_TOOL', 'SWAP_TOOL', 'SET_Z_ZERO', 'LIST_TOOLHEADS', 'CHECK_TOOLHEADS'], ['RESTORE_TOOL'])
  // SET_Z_ZERO belongs with the tool when one is mounted that uses it
  if (opts.toolType && BY_TYPE[opts.toolType]?.includes('SET_Z_ZERO')) {
    const i = toolhead.findIndex((b) => b.name === 'SET_Z_ZERO')
    if (i >= 0) {
      toolhead.splice(i, 1)
      used.delete('SET_Z_ZERO')
    }
  }
  if (toolhead.length) groups.push({ title: 'Toolhead', buttons: toolhead })

  if (opts.toolType && opts.toolName) {
    const forTool = pick([...(BY_TYPE[opts.toolType] ?? []), ...(OWNED_BY_NAME[opts.toolName] ?? [])])
    if (forTool.length) groups.push({ title: `For ${opts.toolName}`, buttons: forTool })
  }

  const machine = pick(['BED_COOLDOWN', 'BACKUP_CFG', 'PM_STATUS', 'LEDMAX', 'LEDMIN', 'LEDOFF'])
  if (machine.length) groups.push({ title: 'Machine', buttons: machine })

  const rest = [...available].filter((n) => has(n) && !n.startsWith('_') && !HIDDEN.has(n) && !used.has(n) && !/^[GM]\d/.test(n)).sort()
  if (rest.length) groups.push({ title: 'Other macros', buttons: rest.map((n) => ({ name: n, label: n })) })
  return groups
}

/** How many macros are left out because they belong to another tool. */
export function hiddenForOtherTools(available: ReadonlySet<string>, toolType: string | null, toolName: string | null): number {
  return [...available].filter((n) => !n.startsWith('_') && !HIDDEN.has(n) && forOtherTool(n, toolType, toolName)).length
}
