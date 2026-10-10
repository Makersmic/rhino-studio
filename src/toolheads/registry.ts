/**
 * Toolhead display metadata: name, accent colour, icon, one-line purpose.
 *
 * This is NOT the source of truth for which tools exist or which one is
 * mounted. Klipper owns that:
 *   - tool list: [gcode_macro VARIABLES].tool_mapping + [gcode_macro CUSTOM_TOOLS].tool_mapping
 *   - mounted tool: printer["gcode_macro SWAP_TOOL"].current_tool (slot number, 0 = none)
 *
 * The app reads those from Moonraker (Phase 2) and only uses this file to
 * decide how a tool looks. Names match Klipper's exactly so a lookup by the
 * name Klipper reports always works; any name not listed here (a user-added
 * tool in slot 6+) falls back to the generic "custom" look.
 */

/** Tool types as written in variables.cfg / custom_tools.json. */
export type ToolType = 'DEPOSITION' | 'LASER' | 'CNC' | 'DRAG_KNIFE' | string

import type { ToolIconId } from '@/icons/toolheads'
export type IconId = ToolIconId

export interface ToolheadLook {
  /** Exact Klipper name, e.g. "BlockOne". */
  name: string
  type: ToolType
  /** Slot it ships in. Display only; Klipper's tool_mapping wins. */
  defaultSlot?: number
  /** CSS variable holding the accent colour. */
  accentVar: string
  icon: IconId
  /** Plain-language purpose, shown under the name. */
  summary: string
  /** Process family, used later to pick the Kiri:Moto mode. */
  process: 'fdm' | 'laser' | 'cnc' | 'dragknife' | 'other'
}

export const BUILT_IN_TOOLHEADS: readonly ToolheadLook[] = [
  {
    name: 'BlockOne',
    type: 'DEPOSITION',
    defaultSlot: 1,
    accentVar: '--th-blockone',
    icon: 'blockone',
    summary: 'FDM print head, swappable nozzles',
    process: 'fdm',
  },
  {
    name: 'SwitchFly',
    type: 'DEPOSITION',
    defaultSlot: 2,
    accentVar: '--th-switchfly',
    icon: 'switchfly',
    summary: 'Two filament paths into one nozzle',
    process: 'fdm',
  },
  {
    name: 'LightSaber',
    type: 'LASER',
    defaultSlot: 3,
    accentVar: '--th-lightsaber',
    icon: 'lightsaber',
    summary: 'Diode laser for engraving and cutting',
    process: 'laser',
  },
  {
    name: 'HotJoe',
    type: 'CNC',
    defaultSlot: 4,
    accentVar: '--th-hotjoe',
    icon: 'hotjoe',
    summary: 'CNC spindle for milling and routing',
    process: 'cnc',
  },
  {
    name: 'DragKnife',
    type: 'DRAG_KNIFE',
    defaultSlot: 5,
    accentVar: '--th-dragknife',
    icon: 'dragknife',
    summary: 'Swivel blade for vinyl, paper and card',
    process: 'dragknife',
  },
] as const

/** Look used when Klipper hasn't told us which tool is mounted. */
export const UNKNOWN_LOOK: ToolheadLook = {
  name: 'Unknown',
  type: 'UNKNOWN',
  accentVar: '--th-unknown',
  icon: 'unknown',
  summary: 'Mounted toolhead not verified with Klipper',
  process: 'other',
}

const PROCESS_BY_TYPE: Record<string, ToolheadLook['process']> = {
  DEPOSITION: 'fdm',
  LASER: 'laser',
  CNC: 'cnc',
  DRAG_KNIFE: 'dragknife',
}

/**
 * How should a tool with this Klipper name look?
 * Unknown names get the generic custom look, keeping the type Klipper reports.
 */
export function lookFor(name: string | null | undefined, type?: ToolType): ToolheadLook {
  if (!name) return UNKNOWN_LOOK
  const builtIn = BUILT_IN_TOOLHEADS.find((t) => t.name === name)
  if (builtIn) return builtIn
  const t = type ?? 'CUSTOM'
  return {
    name,
    type: t,
    accentVar: '--th-custom',
    icon: 'custom',
    summary: 'User-added toolhead',
    process: PROCESS_BY_TYPE[t] ?? 'other',
  }
}
