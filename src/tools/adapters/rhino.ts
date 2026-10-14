/**
 * The Rhino's own tool macros (Rhino toolhead manager).
 *
 *   printer["gcode_macro SWAP_TOOL"].current_tool  - the slot every safety gate
 *       reads (START_JOB, SWAP_TOOL). 0 = nothing confirmed.
 *   printer["gcode_macro SWAP_TOOL"].pending_tool  - -1 unless a swap is under way.
 *   printer.save_variables.variables.current_tool  - the slot saved at the last
 *       swap. After a Klipper restart current_tool is 0 until RESTORE_TOOL is
 *       answered, so a saved slot alone is NOT treated as mounted.
 *   VARIABLES.tool_mapping + CUSTOM_TOOLS.tool_mapping - slot -> name.
 *   VARIABLES.toolheads + CUSTOM_TOOLS.toolheads      - name -> { type, ... }.
 *
 * This is the logic Studio has always used, moved here unchanged.
 */
import type { ToolState } from '@/moonraker/toolState'
import { toInt, type StatusMap, type ToolAdapter } from './types'

const SWAP = 'gcode_macro SWAP_TOOL'
const VARS = 'gcode_macro VARIABLES'
const CUSTOM = 'gcode_macro CUSTOM_TOOLS'

const WATCH: Record<string, string[]> = {
  [SWAP]: ['current_tool', 'pending_tool'],
  [VARS]: ['tool_mapping', 'toolheads', 'laser_s_max'], // laser_s_max: Prepare scales laser power to it
  [CUSTOM]: ['tool_mapping', 'toolheads'],
  save_variables: ['variables'],
}

/**
 * Klipper sends dicts with integer keys as JSON, so {1: 'BlockOne'} arrives as
 * {"1": "BlockOne"}. Merge the built-in and custom tables, custom last
 * (same order the macros use).
 */
export function mergedToolMapping(status: StatusMap): Map<number, string> {
  const out = new Map<number, string>()
  for (const src of [status[VARS]?.tool_mapping, status[CUSTOM]?.tool_mapping]) {
    if (!src || typeof src !== 'object') continue
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const slot = toInt(k)
      if (slot != null && typeof v === 'string') out.set(slot, v)
    }
  }
  return out
}

export function mergedToolTypes(status: StatusMap): Map<string, string> {
  const out = new Map<string, string>()
  for (const src of [status[VARS]?.toolheads, status[CUSTOM]?.toolheads]) {
    if (!src || typeof src !== 'object') continue
    for (const [name, def] of Object.entries(src as Record<string, unknown>)) {
      const t = def && typeof def === 'object' ? (def as { type?: unknown }).type : undefined
      if (typeof t === 'string') out.set(name, t)
    }
  }
  return out
}

export function rhinoState(status: StatusMap | null, opts: { online: boolean; klippyReady: boolean }): ToolState {
  if (!opts.online || !status) return { kind: 'unknown', reason: 'offline' }
  if (!opts.klippyReady) return { kind: 'unknown', reason: 'klippy-not-ready' }

  const swap = status[SWAP]
  const current = toInt(swap?.current_tool)
  if (!swap || current == null) return { kind: 'unknown', reason: 'no-swap-macro' }

  const mapping = mergedToolMapping(status)
  const pending = toInt(swap.pending_tool)

  if (pending != null && pending >= 0) {
    return { kind: 'swapping', fromSlot: current, toSlot: pending, toName: mapping.get(pending) ?? null }
  }

  if (current <= 0) {
    const saved = toInt((status.save_variables?.variables as Record<string, unknown> | undefined)?.current_tool)
    const lastSavedSlot = saved != null && saved > 0 ? saved : null
    return { kind: 'none-confirmed', lastSavedSlot, lastSavedName: lastSavedSlot ? mapping.get(lastSavedSlot) ?? null : null }
  }

  const name = mapping.get(current)
  if (!name) return { kind: 'unmapped', slot: current }
  return { kind: 'mounted', slot: current, name, type: mergedToolTypes(status).get(name) ?? null }
}

export const rhinoAdapter: ToolAdapter = {
  id: 'rhino',
  label: 'Rhino tool macros',
  about: 'Reads SWAP_TOOL.current_tool and the tool tables in VARIABLES / CUSTOM_TOOLS.',
  style: 'manual',
  slotWord: 'Slot',
  detect: (objects) => objects.has(SWAP),
  watch: (objects) => Object.fromEntries(Object.entries(WATCH).filter(([o]) => objects.includes(o))),
  state: rhinoState,
  tools(status) {
    if (!status) return []
    const types = mergedToolTypes(status)
    return [...mergedToolMapping(status).entries()]
      .sort(([a], [b]) => a - b)
      .map(([slot, name]) => ({ slot, name, type: types.get(name) ?? null }))
  },
  canSwap: (objects) => objects.has(SWAP),
  swapScript: (slot) => `SWAP_TOOL TOOL=${slot}`,
  swapNote: (name) => `The machine cools down and lowers the bed, then asks you to fit ${name}. Follow its questions here or in Mainsail.`,
  pickerScript: 'SWAP_TOOL',
  confirm: { script: 'RESTORE_TOOL', label: 'Confirm mounted tool', button: 'Confirm tool', requires: 'gcode_macro RESTORE_TOOL' },
}
