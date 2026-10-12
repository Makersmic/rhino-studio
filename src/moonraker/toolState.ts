/**
 * Works out which toolhead is mounted, from Klipper's own status.
 *
 * This is a pure function (status in, answer out) so it can be tested without
 * a machine. It mirrors how the Rhino macros themselves decide:
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
 * Only the 'mounted' result counts as verified. Everything else keeps the
 * app neutral (hatched band, no tool colour).
 */

export type ToolState =
  | { kind: 'unknown'; reason: 'offline' | 'klippy-not-ready' | 'no-swap-macro' }
  | { kind: 'none-confirmed'; lastSavedSlot: number | null; lastSavedName: string | null }
  | { kind: 'swapping'; fromSlot: number; toSlot: number; toName: string | null }
  | { kind: 'unmapped'; slot: number }
  | { kind: 'mounted'; slot: number; name: string; type: string | null }

/** The parts of Klipper's status this needs. Everything is optional: objects may be missing. */
export interface ToolStatusInput {
  'gcode_macro SWAP_TOOL'?: { current_tool?: unknown; pending_tool?: unknown }
  'gcode_macro VARIABLES'?: { tool_mapping?: unknown; toolheads?: unknown }
  'gcode_macro CUSTOM_TOOLS'?: { tool_mapping?: unknown; toolheads?: unknown }
  save_variables?: { variables?: Record<string, unknown> }
}

function toInt(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null
}

/**
 * Klipper sends dicts with integer keys as JSON, so {1: 'BlockOne'} arrives as
 * {"1": "BlockOne"}. Merge the built-in and custom tables, custom last
 * (same order the macros use).
 */
export function mergedToolMapping(status: ToolStatusInput): Map<number, string> {
  const out = new Map<number, string>()
  for (const src of [status['gcode_macro VARIABLES']?.tool_mapping, status['gcode_macro CUSTOM_TOOLS']?.tool_mapping]) {
    if (!src || typeof src !== 'object') continue
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const slot = toInt(k)
      if (slot != null && typeof v === 'string') out.set(slot, v)
    }
  }
  return out
}

export function mergedToolTypes(status: ToolStatusInput): Map<string, string> {
  const out = new Map<string, string>()
  for (const src of [status['gcode_macro VARIABLES']?.toolheads, status['gcode_macro CUSTOM_TOOLS']?.toolheads]) {
    if (!src || typeof src !== 'object') continue
    for (const [name, def] of Object.entries(src as Record<string, unknown>)) {
      const t = def && typeof def === 'object' ? (def as { type?: unknown }).type : undefined
      if (typeof t === 'string') out.set(name, t)
    }
  }
  return out
}

export function deriveToolState(
  status: ToolStatusInput | null,
  opts: { online: boolean; klippyReady: boolean },
): ToolState {
  if (!opts.online || !status) return { kind: 'unknown', reason: 'offline' }
  if (!opts.klippyReady) return { kind: 'unknown', reason: 'klippy-not-ready' }

  const swap = status['gcode_macro SWAP_TOOL']
  const current = toInt(swap?.current_tool)
  if (!swap || current == null) return { kind: 'unknown', reason: 'no-swap-macro' }

  const mapping = mergedToolMapping(status)
  const pending = toInt(swap.pending_tool)

  if (pending != null && pending >= 0) {
    return { kind: 'swapping', fromSlot: current, toSlot: pending, toName: mapping.get(pending) ?? null }
  }

  if (current <= 0) {
    const saved = toInt(status.save_variables?.variables?.current_tool)
    const lastSavedSlot = saved != null && saved > 0 ? saved : null
    return { kind: 'none-confirmed', lastSavedSlot, lastSavedName: lastSavedSlot ? mapping.get(lastSavedSlot) ?? null : null }
  }

  const name = mapping.get(current)
  if (!name) return { kind: 'unmapped', slot: current }
  return { kind: 'mounted', slot: current, name, type: mergedToolTypes(status).get(name) ?? null }
}

/** One short line for the UI. */
export function describeToolState(s: ToolState): string {
  switch (s.kind) {
    case 'mounted': return `Slot ${s.slot}, confirmed by Klipper`
    case 'swapping': return `Swap in progress to ${s.toName ?? `slot ${s.toSlot}`}`
    case 'none-confirmed':
      return s.lastSavedSlot
        ? `Not confirmed since restart. Last saved: ${s.lastSavedName ?? `slot ${s.lastSavedSlot}`}. Confirm it with RESTORE_TOOL (Confirm mounted tool on Control).`
        : 'No toolhead confirmed. Use SWAP_TOOL to fit one.'
    case 'unmapped': return `Slot ${s.slot} isn't in Klipper's tool_mapping`
    case 'unknown':
      return {
        offline: 'Not connected to the machine',
        'klippy-not-ready': 'Klipper is not ready',
        'no-swap-macro': 'SWAP_TOOL macro not found in this config',
      }[s.reason]
  }
}
