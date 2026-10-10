import { describe, expect, it } from 'vitest'
import { deriveToolState, mergedToolMapping } from './toolState'

const base = {
  'gcode_macro VARIABLES': {
    tool_mapping: { '1': 'BlockOne', '2': 'SwitchFly', '3': 'LightSaber', '4': 'HotJoe', '5': 'DragKnife' },
    toolheads: { BlockOne: { type: 'DEPOSITION' }, LightSaber: { type: 'LASER' } },
  },
  'gcode_macro CUSTOM_TOOLS': { tool_mapping: { '6': 'HotWire' }, toolheads: { HotWire: { type: 'CNC' } } },
}
const ready = { online: true, klippyReady: true }

describe('deriveToolState', () => {
  it('is unknown while offline, even if old status is present', () => {
    const s = { ...base, 'gcode_macro SWAP_TOOL': { current_tool: 3, pending_tool: -1 } }
    expect(deriveToolState(s, { online: false, klippyReady: true })).toEqual({ kind: 'unknown', reason: 'offline' })
  })

  it('is unknown while Klipper is not ready', () => {
    const s = { ...base, 'gcode_macro SWAP_TOOL': { current_tool: 3, pending_tool: -1 } }
    expect(deriveToolState(s, { online: true, klippyReady: false }).kind).toBe('unknown')
  })

  it('is unknown when the config has no SWAP_TOOL macro', () => {
    expect(deriveToolState(base, ready)).toEqual({ kind: 'unknown', reason: 'no-swap-macro' })
  })

  it('reports the mounted tool with its Klipper type', () => {
    const s = { ...base, 'gcode_macro SWAP_TOOL': { current_tool: 3, pending_tool: -1 } }
    expect(deriveToolState(s, ready)).toEqual({ kind: 'mounted', slot: 3, name: 'LightSaber', type: 'LASER' })
  })

  it('finds user-added tools from CUSTOM_TOOLS', () => {
    const s = { ...base, 'gcode_macro SWAP_TOOL': { current_tool: 6, pending_tool: -1 } }
    expect(deriveToolState(s, ready)).toMatchObject({ kind: 'mounted', name: 'HotWire', type: 'CNC' })
  })

  it('does NOT treat a saved slot as mounted after a restart', () => {
    const s = { ...base, 'gcode_macro SWAP_TOOL': { current_tool: 0, pending_tool: -1 }, save_variables: { variables: { current_tool: 1 } } }
    expect(deriveToolState(s, ready)).toEqual({ kind: 'none-confirmed', lastSavedSlot: 1, lastSavedName: 'BlockOne' })
  })

  it('reports a swap in progress, not the old tool', () => {
    const s = { ...base, 'gcode_macro SWAP_TOOL': { current_tool: 1, pending_tool: 4 } }
    expect(deriveToolState(s, ready)).toMatchObject({ kind: 'swapping', fromSlot: 1, toSlot: 4, toName: 'HotJoe' })
  })

  it('flags a slot missing from tool_mapping', () => {
    const s = { ...base, 'gcode_macro SWAP_TOOL': { current_tool: 9, pending_tool: -1 } }
    expect(deriveToolState(s, ready)).toEqual({ kind: 'unmapped', slot: 9 })
  })

  it('works on configs without CUSTOM_TOOLS (Portal 1.3.4 and earlier)', () => {
    const { 'gcode_macro CUSTOM_TOOLS': _drop, ...old } = base
    const s = { ...old, 'gcode_macro SWAP_TOOL': { current_tool: 1, pending_tool: -1 } }
    expect(deriveToolState(s, ready)).toMatchObject({ kind: 'mounted', name: 'BlockOne' })
    expect(mergedToolMapping(s).size).toBe(5)
  })
})
