/**
 * viesturz/klipper-toolchanger: the toolchanger used by the Voron
 * StealthChanger and TapChanger and many new builds (GPL-3.0).
 *
 * Studio only reads its status over Moonraker and sends its own commands;
 * none of its code is used here. Fields, from its toolchanger.py / tool.py:
 *
 *   printer.toolchanger
 *     status          uninitialized | initializing | ready | changing | error
 *     tool            name of the selected tool object, e.g. "tool T0", or null
 *     tool_number     selected tool number, -1 = none
 *     detected_tool / detected_tool_number   what the tool sensors see (-1 = none)
 *     has_detection   true when the tools have presence sensors
 *     tool_numbers / tool_names              every tool, same order
 *   printer["tool <name>"]
 *     tool_number, extruder, fan, active, detect_state, gcode_x/y/z_offset
 *
 * Selecting: SELECT_TOOL T=<n> (also T0..Tn). Initialising: INITIALIZE_TOOLCHANGER.
 *
 * It models extruders, so it can't say a tool is a laser or a spindle. A tool
 * with an extruder is treated as a print head; anything else as unknown, until
 * Studio's own tool definitions say otherwise.
 */
import type { ToolState } from '@/moonraker/toolState'
import { toInt, type AdapterTool, type StatusMap, type ToolAdapter } from './types'

const TC = 'toolchanger'
const TC_FIELDS = ['status', 'tool', 'tool_number', 'detected_tool', 'detected_tool_number', 'has_detection', 'tool_numbers', 'tool_names']
const TOOL_FIELDS = ['tool_number', 'extruder', 'fan', 'active', 'detect_state']

/** "tool T0" -> "T0" */
const short = (objectName: string) => objectName.replace(/^tool\s+/, '')

function toolObjects(status: StatusMap): [string, Record<string, unknown>][] {
  return Object.entries(status).filter((e): e is [string, Record<string, unknown>] => e[0].startsWith('tool ') && !!e[1])
}

export function toolchangerTools(status: StatusMap | null): AdapterTool[] {
  if (!status) return []
  const out = new Map<number, AdapterTool>()
  // per-tool objects carry the extruder, which tells us it's a print head
  for (const [obj, t] of toolObjects(status)) {
    const n = toInt(t.tool_number)
    if (n == null || n < 0) continue
    out.set(n, { slot: n, name: short(obj), type: typeof t.extruder === 'string' && t.extruder ? 'DEPOSITION' : null })
  }
  // fall back to the toolchanger's own list
  const tc = status[TC]
  const nums = Array.isArray(tc?.tool_numbers) ? tc!.tool_numbers : []
  const names = Array.isArray(tc?.tool_names) ? tc!.tool_names : []
  nums.forEach((v: unknown, i: number) => {
    const n = toInt(v)
    if (n != null && n >= 0 && !out.has(n)) out.set(n, { slot: n, name: short(String(names[i] ?? `T${n}`)), type: null })
  })
  return [...out.values()].sort((a, b) => a.slot - b.slot)
}

export function toolchangerState(status: StatusMap | null, opts: { online: boolean; klippyReady: boolean }): ToolState {
  if (!opts.online || !status) return { kind: 'unknown', reason: 'offline' }
  if (!opts.klippyReady) return { kind: 'unknown', reason: 'klippy-not-ready' }
  const tc = status[TC]
  if (!tc) return { kind: 'unknown', reason: 'no-toolchanger' }

  const tools = toolchangerTools(status)
  const nameOf = (n: number | null) => (n == null || n < 0 ? null : tools.find((t) => t.slot === n)?.name ?? `T${n}`)
  const current = toInt(tc.tool_number) ?? -1
  const detected = toInt(tc.detected_tool_number)
  const hasDetection = tc.has_detection === true

  switch (tc.status) {
    case 'changing':
    case 'initializing':
      return { kind: 'swapping', fromSlot: current, toSlot: -1, toName: null }
    case 'error':
      return { kind: 'unknown', reason: 'toolchanger-error' }
    case 'uninitialized': {
      // A sensor may already see which tool is on; it still isn't confirmed
      const seen = hasDetection && detected != null && detected >= 0 ? detected : null
      return { kind: 'none-confirmed', lastSavedSlot: seen, lastSavedName: nameOf(seen) }
    }
    case 'ready':
      break
    default:
      return { kind: 'unknown', reason: 'toolchanger-error' }
  }

  // Ready. A tool sensor that disagrees with the selected tool is a stop condition.
  if (hasDetection && detected != null && detected !== current) {
    return { kind: 'mismatch', expectedSlot: current, expectedName: nameOf(current), detectedSlot: detected >= 0 ? detected : null, detectedName: nameOf(detected) }
  }
  if (current < 0) return { kind: 'none-confirmed', lastSavedSlot: null, lastSavedName: null, pick: true }
  const tool = tools.find((t) => t.slot === current)
  if (!tool) return { kind: 'unmapped', slot: current }
  return { kind: 'mounted', slot: current, name: tool.name, type: tool.type }
}

export const klipperToolchangerAdapter: ToolAdapter = {
  id: 'klipper-toolchanger',
  label: 'klipper-toolchanger',
  about: 'Reads printer.toolchanger and the [tool …] objects (StealthChanger, TapChanger and similar).',
  slotWord: 'Tool',
  detect: (objects) => objects.has(TC),
  watch(objects) {
    const w: Record<string, string[] | null> = {}
    for (const o of objects) {
      if (o === TC) w[o] = TC_FIELDS
      else if (o.startsWith('tool ')) w[o] = TOOL_FIELDS
    }
    return w
  },
  state: toolchangerState,
  tools: toolchangerTools,
  canSwap: (objects) => objects.has(TC),
  swapScript: (slot) => `SELECT_TOOL T=${slot}`,
  swapNote: (name) => `The toolchanger docks the tool it's holding and picks up ${name}. The head moves to the dock and back: keep hands clear.`,
  pickerScript: null,
  confirm: { script: 'INITIALIZE_TOOLCHANGER', label: 'Initialise the toolchanger', button: 'Initialise', requires: TC },
}
