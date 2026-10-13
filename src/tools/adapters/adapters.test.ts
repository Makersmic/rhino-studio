import { describe, expect, it } from 'vitest'
import { pickAdapter, watchedForAll } from './index'
import { klipperToolchangerAdapter as tc, toolchangerState, toolchangerTools } from './klipperToolchanger'
import { rhinoAdapter } from './rhino'

const ready = { online: true, klippyReady: true }
const tools = {
  'tool T0': { tool_number: 0, extruder: 'extruder', active: true },
  'tool T1': { tool_number: 1, extruder: 'extruder1', active: false },
  'tool Brush': { tool_number: 2, extruder: null, active: false },
}
const tcStatus = (fields: Record<string, unknown>) => ({
  toolchanger: { status: 'ready', tool: 'tool T0', tool_number: 0, has_detection: false, detected_tool_number: -1, tool_numbers: [0, 1, 2], tool_names: ['tool T0', 'tool T1', 'tool Brush'], ...fields },
  ...tools,
})

describe('picking the adapter', () => {
  it('finds the Rhino macros', () => {
    const p = pickAdapter(new Set(['webhooks', 'gcode_macro SWAP_TOOL']), 'auto')
    expect(p).toMatchObject({ detected: true, matched: true })
    expect(p.adapter.id).toBe('rhino')
  })
  it('finds klipper-toolchanger', () => {
    expect(pickAdapter(new Set(['toolchanger', 'tool T0']), 'auto').adapter.id).toBe('klipper-toolchanger')
  })
  it('falls back to Rhino, unmatched, when nothing is recognised (which keeps everything locked)', () => {
    const p = pickAdapter(new Set(['webhooks']), 'auto')
    expect(p).toMatchObject({ matched: false })
    expect(p.adapter.state({}, ready).kind).toBe('unknown')
  })
  it('lets a manual choice win, and says when it does not match the machine', () => {
    const p = pickAdapter(new Set(['gcode_macro SWAP_TOOL']), 'klipper-toolchanger')
    expect(p).toMatchObject({ detected: false, matched: false })
    expect(p.adapter.id).toBe('klipper-toolchanger')
  })
  it('watches only objects Klipper has, for every family', () => {
    const w = watchedForAll(['gcode_macro SWAP_TOOL', 'toolchanger', 'tool T0', 'extruder'])
    expect(Object.keys(w).sort()).toEqual(['gcode_macro SWAP_TOOL', 'tool T0', 'toolchanger'])
  })
})

describe('klipper-toolchanger', () => {
  it('reports the selected tool, treating tools with an extruder as print heads', () => {
    expect(toolchangerState(tcStatus({}), ready)).toEqual({ kind: 'mounted', slot: 0, name: 'T0', type: 'DEPOSITION' })
    expect(toolchangerTools(tcStatus({})).map((t) => [t.slot, t.name, t.type])).toEqual([[0, 'T0', 'DEPOSITION'], [1, 'T1', 'DEPOSITION'], [2, 'Brush', null]])
  })
  it('is not mounted while changing, initialising, in error or uninitialised', () => {
    expect(toolchangerState(tcStatus({ status: 'changing' }), ready).kind).toBe('swapping')
    expect(toolchangerState(tcStatus({ status: 'initializing' }), ready).kind).toBe('swapping')
    expect(toolchangerState(tcStatus({ status: 'error' }), ready)).toEqual({ kind: 'unknown', reason: 'toolchanger-error' })
    expect(toolchangerState(tcStatus({ status: 'uninitialized', tool_number: -1 }), ready).kind).toBe('none-confirmed')
    expect(toolchangerState(tcStatus({ status: 'something-new' }), ready).kind).toBe('unknown')
  })
  it('offers what the sensor sees, but does not trust it, before initialising', () => {
    const s = toolchangerState(tcStatus({ status: 'uninitialized', tool_number: -1, has_detection: true, detected_tool_number: 1 }), ready)
    expect(s).toEqual({ kind: 'none-confirmed', lastSavedSlot: 1, lastSavedName: 'T1' })
  })
  it('asks to pick a tool when ready with none held', () => {
    expect(toolchangerState(tcStatus({ tool: null, tool_number: -1 }), ready)).toMatchObject({ kind: 'none-confirmed', pick: true })
  })
  it('stops on a tool sensor that disagrees with the selected tool', () => {
    expect(toolchangerState(tcStatus({ has_detection: true, detected_tool_number: 1 }), ready)).toEqual({
      kind: 'mismatch', expectedSlot: 0, expectedName: 'T0', detectedSlot: 1, detectedName: 'T1',
    })
    expect(toolchangerState(tcStatus({ has_detection: true, detected_tool_number: -1 }), ready)).toMatchObject({ kind: 'mismatch', detectedSlot: null })
    // agreeing sensor: fine
    expect(toolchangerState(tcStatus({ has_detection: true, detected_tool_number: 0 }), ready).kind).toBe('mounted')
  })
  it('is unknown offline, before Klipper is ready, or without [toolchanger]', () => {
    expect(toolchangerState(tcStatus({}), { online: false, klippyReady: false }).kind).toBe('unknown')
    expect(toolchangerState(tcStatus({}), { online: true, klippyReady: false }).kind).toBe('unknown')
    expect(toolchangerState({}, ready)).toEqual({ kind: 'unknown', reason: 'no-toolchanger' })
  })
  it('swaps and initialises with its own commands', () => {
    expect(tc.swapScript(2)).toBe('SELECT_TOOL T=2')
    expect(tc.confirm?.script).toBe('INITIALIZE_TOOLCHANGER')
    expect(rhinoAdapter.swapScript(3)).toBe('SWAP_TOOL TOOL=3')
  })
})
