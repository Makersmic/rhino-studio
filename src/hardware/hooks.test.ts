import { describe, expect, it } from 'vitest'
import { MAX_LINES, SLOT_HELP, SLOT_LABEL, lineCount, linesOf, sameHooks, scopeList, setSlot, type Hooks } from './hooks'

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
