import { describe, expect, it } from 'vitest'
import { checkStart } from './jobs'
import type { ToolState } from '@/moonraker/toolState'

const macros = new Set(['LASER_JOB_SETUP', 'CNC_JOB_SETUP', 'DRAGKNIFE_JOB_SETUP', 'TOOL_JOB_SETUP'])
const types = new Map([['BlockOne', 'DEPOSITION'], ['LightSaber', 'LASER'], ['DragKnife', 'DRAG_KNIFE'], ['HotWire', 'POWERED']])
const slots = new Map([['BlockOne', 1], ['LightSaber', 3], ['DragKnife', 5]])
const mounted = (name: string, slot: number): ToolState => ({ kind: 'mounted', name, slot, type: types.get(name) ?? null })

const base = { path: 'a.gcode', jobState: 'standby', klippyReady: true, toolTypes: types, toolSlots: slots, macros }

describe('checkStart', () => {
  it('starts a print file directly', () => {
    const r = checkStart({ ...base, fileTool: 'BlockOne', toolState: mounted('BlockOne', 1) })
    expect(r).toMatchObject({ ok: true, method: { kind: 'print' } })
  })

  it('starts laser files through LASER_JOB_SETUP', () => {
    const r = checkStart({ ...base, fileTool: 'LightSaber', toolState: mounted('LightSaber', 3) })
    expect(r.method).toEqual({ kind: 'wizard', macro: 'LASER_JOB_SETUP' })
  })

  it('uses TOOL_JOB_SETUP for added tools', () => {
    const r = checkStart({ ...base, fileTool: 'HotWire', toolState: { kind: 'mounted', name: 'HotWire', slot: 6, type: 'POWERED' } })
    expect(r.method).toEqual({ kind: 'wizard', macro: 'TOOL_JOB_SETUP' })
  })

  it('blocks a file for another tool and offers the swap', () => {
    const r = checkStart({ ...base, fileTool: 'DragKnife', toolState: mounted('BlockOne', 1) })
    expect(r).toMatchObject({ ok: false, swapTo: 5 })
    expect(r.block).toMatch(/Needs DragKnife/)
  })

  it('blocks when the mounted tool is not confirmed', () => {
    const r = checkStart({ ...base, fileTool: 'BlockOne', toolState: { kind: 'none-confirmed', lastSavedSlot: 1, lastSavedName: 'BlockOne' } })
    expect(r.ok).toBe(false)
    expect(checkStart({ ...base, fileTool: 'BlockOne', toolState: { kind: 'swapping', fromSlot: 1, toSlot: 3, toName: 'LightSaber' } }).ok).toBe(false)
  })

  it('blocks while a job runs or the file is still being read', () => {
    expect(checkStart({ ...base, jobState: 'paused', fileTool: 'BlockOne', toolState: mounted('BlockOne', 1) }).ok).toBe(false)
    expect(checkStart({ ...base, fileTool: undefined, toolState: mounted('BlockOne', 1) }).ok).toBe(false)
  })

  it('warns, but allows, files that declare no toolhead', () => {
    const r = checkStart({ ...base, fileTool: null, toolState: mounted('BlockOne', 1) })
    expect(r.ok).toBe(true)
    expect(r.warnings[0]).toMatch(/doesn't say which toolhead/)
  })

  it('refuses names the wizard cannot take', () => {
    const r = checkStart({ ...base, path: 'oak sign.gcode', fileTool: 'LightSaber', toolState: mounted('LightSaber', 3) })
    expect(r.ok).toBe(false)
  })

  it('refuses when the config has no wizard for the tool', () => {
    const r = checkStart({ ...base, macros: new Set(), fileTool: 'LightSaber', toolState: mounted('LightSaber', 3) })
    expect(r.block).toMatch(/no LASER_JOB_SETUP/)
  })
})

describe('checkStart on a machine that changes tools itself', () => {
  const auto = { ...base, autoTools: true, fileTool: null }
  it('starts with no tool on the head: the job picks one up', () => {
    const r = checkStart({ ...auto, toolState: { kind: 'none-confirmed', lastSavedSlot: null, lastSavedName: null, pick: true } })
    expect(r).toMatchObject({ ok: true, method: { kind: 'print' }, warnings: [] })
  })
  it('does not demand the file match the tool on the head (multi-tool files)', () => {
    const r = checkStart({ ...auto, fileTool: 'T1', toolState: { kind: 'mounted', name: 'T0', slot: 0, type: 'DEPOSITION' } })
    expect(r.ok).toBe(true)
  })
  it('warns, but allows, an uninitialised toolchanger', () => {
    const r = checkStart({ ...auto, toolState: { kind: 'none-confirmed', lastSavedSlot: 0, lastSavedName: 'T0' } })
    expect(r.ok).toBe(true)
    expect(r.warnings[0]).toMatch(/isn't initialised/)
  })
  it('still blocks on a sensor mismatch, a change in progress or an error', () => {
    expect(checkStart({ ...auto, toolState: { kind: 'mismatch', expectedSlot: 0, expectedName: 'T0', detectedSlot: null, detectedName: null } }).ok).toBe(false)
    expect(checkStart({ ...auto, toolState: { kind: 'swapping', fromSlot: 0, toSlot: -1, toName: null } }).ok).toBe(false)
    expect(checkStart({ ...auto, toolState: { kind: 'unknown', reason: 'toolchanger-error' } }).ok).toBe(false)
  })
  it('keeps the Rhino rule: no confirmed tool, no start', () => {
    const r = checkStart({ ...base, fileTool: null, toolState: { kind: 'none-confirmed', lastSavedSlot: null, lastSavedName: null, pick: true } })
    expect(r.ok).toBe(false)
  })
})
