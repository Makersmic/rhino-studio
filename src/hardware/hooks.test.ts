import { describe, expect, it } from 'vitest'
import { MAX_LINES, copyMacroTo, SLOT_HELP, SLOT_LABEL, lineCount, linesOf, sameHooks, scopeList, setSlot, type Hooks } from './hooks'

describe('job hooks editor', () => {
  it('names and explains all seven moments', () => {
    const slots = ['before_start', 'after_start', 'before_end', 'after_end', 'on_cancel', 'on_pause', 'on_resume'] as const
    for (const s of slots) expect(SLOT_LABEL[s] && SLOT_HELP[s]).toBeTruthy()
    expect(SLOT_HELP.before_start).toMatch(/Nothing may move/)
    expect(MAX_LINES).toBe(20)
  })

  it('a textarea becomes trimmed lines with no blanks', () => {
    expect(linesOf('  DUST_ON \n\n M117 Cutting  \n')).toEqual(['DUST_ON', 'M117 Cutting'])
    expect(linesOf('\n \n')).toEqual([])
  })

  it('setting a slot drops empty slots and scopes, and never changes the original', () => {
    const h: Hooks = { 'category:subtractive': { after_start: ['DUST_ON'], before_end: ['DUST_OFF'] } }
    const a = setSlot(h, 'category:subtractive', 'after_start', [])
    expect(a).toEqual({ 'category:subtractive': { before_end: ['DUST_OFF'] } })
    expect(setSlot(a, 'category:subtractive', 'before_end', [])).toEqual({})
    expect(h['category:subtractive']!.after_start).toEqual(['DUST_ON'])
    expect(setSlot({}, 'machine', 'on_pause', ['M118 Paused'])).toEqual({ machine: { on_pause: ['M118 Paused'] } })
  })

  it('counts lines and compares regardless of order', () => {
    const h: Hooks = { machine: { before_start: ['M117 a', 'M117 b'], on_pause: ['M118 p'] } }
    expect(lineCount(h, 'machine')).toBe(3)
    expect(lineCount(h, 'tool:HotJoe')).toBe(0)
    expect(sameHooks(h, { machine: { on_pause: ['M118 p'], before_start: ['M117 a', 'M117 b'] } })).toBe(true)
    expect(sameHooks(h, { machine: { on_pause: ['M118 p'], before_start: ['M117 b', 'M117 a'] } })).toBe(false)
  })

  it('lists the Portal\'s scopes with counts, and keeps one saved for a tool that is gone', () => {
    const list = scopeList({ scopes: [{ id: 'machine', label: 'Whole machine' }, { id: 'tool:HotJoe', label: 'HotJoe' }] },
      { 'tool:HotJoe': { after_start: ['M8'] }, 'tool:OldCutter': { after_end: ['M9'] } })
    expect(list.map((s) => [s.id, s.count, s.gone])).toEqual([['machine', 0, false], ['tool:HotJoe', 1, false], ['tool:OldCutter', 1, true]])
    expect(list[2]!.label).toMatch(/no longer a tool/)
  })
})

describe('copyMacroTo (a macro as a toolhead’s start or end G-code)', () => {
  const park = { id: 'm_abc123', rev: 2, name: 'Park the head', toolheads: [], notes: '', steps: [{ kind: 'moveBy' as const, dx: null, dy: null, dz: 10, speed: 10 }] }
  it('copies the lines into the tool’s slot with where they came from, leaving other hooks alone', () => {
    const r = copyMacroTo({ machine: { after_start: ['M117 hi'] } }, {}, 'BlockOne', 'after_start', park)
    if ('error' in r) throw new Error(r.error)
    expect(r.hooks['tool:BlockOne']!.after_start).toEqual(['SAVE_GCODE_STATE NAME=_rs_hook', 'G91', 'G1 Z10 F600', 'G90', 'RESTORE_GCODE_STATE NAME=_rs_hook'])
    expect(r.hooks.machine).toEqual({ after_start: ['M117 hi'] })
    expect(r.sources).toEqual({ 'tool:BlockOne': { after_start: { macro: 'm_abc123', rev: 2, name: 'Park the head' } } })
  })
  it('clears the slot and its source', () => {
    const r = copyMacroTo({ 'tool:BlockOne': { after_start: ['M107'], before_end: ['M107'] } }, { 'tool:BlockOne': { after_start: { macro: 'm_abc123', rev: 1, name: 'x' } } }, 'BlockOne', 'after_start', null)
    expect(r).toEqual({ hooks: { 'tool:BlockOne': { before_end: ['M107'] } }, sources: {} })
  })
  it('refuses a macro for another toolhead, or one that can’t run in a job', () => {
    expect(copyMacroTo({}, {}, 'BlockOne', 'before_end', { ...park, toolheads: ['LightSaber'] })).toEqual({ error: 'Park the head is for LightSaber only' })
    expect(copyMacroTo({}, {}, 'BlockOne', 'after_start', { ...park, steps: [{ kind: 'heatMaterial', material: 'PLA', wait: true }] })).toMatchObject({ error: expect.stringMatching(/START_JOB already heats/) })
  })
})
