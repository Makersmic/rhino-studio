/**
 * Which toolhead is mounted: the one shape the whole app works from.
 *
 * How it's read depends on the machine; that lives in the tool-change
 * adapters (src/tools/adapters): the Rhino's own macros, klipper-toolchanger,
 * and more later. They all answer with a ToolState.
 *
 * Only 'mounted' counts as verified. Everything else keeps the app neutral
 * (hatched band, no tool colour) and keeps jogging, tool power and jobs locked.
 */

export type ToolState =
  | { kind: 'unknown'; reason: 'offline' | 'klippy-not-ready' | 'no-swap-macro' | 'no-toolchanger' | 'toolchanger-error' }
  /** pick: nothing is held, so the next step is choosing a tool (Swap) rather than confirming one */
  | { kind: 'none-confirmed'; lastSavedSlot: number | null; lastSavedName: string | null; pick?: boolean }
  /** toSlot -1: changing, target not reported */
  | { kind: 'swapping'; fromSlot: number; toSlot: number; toName: string | null }
  | { kind: 'unmapped'; slot: number }
  /** A tool sensor sees a different tool than the one selected: stop and check */
  | { kind: 'mismatch'; expectedSlot: number; expectedName: string | null; detectedSlot: number | null; detectedName: string | null }
  | { kind: 'mounted'; slot: number; name: string; type: string | null }

/** The Klipper status fields the Rhino adapter reads (kept for older callers and tests). */
export interface ToolStatusInput {
  'gcode_macro SWAP_TOOL'?: { current_tool?: unknown; pending_tool?: unknown }
  'gcode_macro VARIABLES'?: { tool_mapping?: unknown; toolheads?: unknown }
  'gcode_macro CUSTOM_TOOLS'?: { tool_mapping?: unknown; toolheads?: unknown }
  save_variables?: { variables?: Record<string, unknown> }
}

// The Rhino's rules, under their old names
export { rhinoState as deriveToolState, mergedToolMapping, mergedToolTypes } from '@/tools/adapters/rhino'

/** One short line for the UI. */
export function describeToolState(s: ToolState, slotWord = 'Slot'): string {
  const which = (slot: number, name: string | null) => name ?? `${slotWord.toLowerCase()} ${slot}`
  switch (s.kind) {
    case 'mounted': return `${slotWord} ${s.slot}, confirmed by Klipper`
    case 'swapping': return s.toSlot >= 0 ? `Swap in progress to ${which(s.toSlot, s.toName)}` : 'Tool change in progress'
    case 'none-confirmed':
      return s.lastSavedSlot != null
        ? `Not confirmed yet. Last known: ${which(s.lastSavedSlot, s.lastSavedName)}. Confirm it from the top bar.`
        : 'No toolhead confirmed. Use Swap in the top bar to fit one.'
    case 'unmapped': return `${slotWord} ${s.slot} isn't in Klipper's tool list`
    case 'mismatch':
      return `${s.expectedSlot >= 0 ? `${which(s.expectedSlot, s.expectedName)} is selected` : 'no tool is selected'}, but the sensor sees ${s.detectedSlot != null ? which(s.detectedSlot, s.detectedName) : 'no tool'}. Check the machine before anything moves.`
    case 'unknown':
      return {
        offline: 'Not connected to the machine',
        'klippy-not-ready': 'Klipper is not ready',
        'no-swap-macro': 'No tool changing found in this config (SWAP_TOOL macro or [toolchanger])',
        'no-toolchanger': '[toolchanger] not found in this config',
        'toolchanger-error': 'The toolchanger reports an error. Clear it on the machine first.',
      }[s.reason]
  }
}
