import { describe, expect, it } from 'vitest'
import { PromptTracker } from './prompts'

// Lines as SWAP_TOOL prints them (toolchanger.cfg)
const SWAP = [
  '// action:prompt_begin Swap toolhead',
  '// action:prompt_text Installed now: slot 1 (BlockOne)',
  '// action:prompt_button Slot 3: LightSaber (LASER)|SWAP_TOOL TOOL=3|info',
  '// action:prompt_button Slot 4: HotJoe (CNC)|SWAP_TOOL TOOL=4|info',
  '// action:prompt_footer_button Cancel|action:prompt_end|error',
  '// action:prompt_show',
]

describe('PromptTracker', () => {
  it('builds the question Mainsail would show', () => {
    const t = new PromptTracker()
    SWAP.forEach((l) => t.feed(l))
    const p = t.current()!
    expect(p.title).toBe('Swap toolhead')
    expect(p.items[0]).toEqual({ text: 'Installed now: slot 1 (BlockOne)' })
    expect(p.items[1]).toEqual({ group: [{ label: 'Slot 3: LightSaber (LASER)', command: 'SWAP_TOOL TOOL=3', color: 'info' }] })
    expect(p.footer[0]).toEqual({ label: 'Cancel', command: 'action:prompt_end', color: 'error' })
  })

  it('shows nothing until prompt_show', () => {
    const t = new PromptTracker()
    SWAP.slice(0, -1).forEach((l) => t.feed(l))
    expect(t.current()).toBeNull()
  })

  it('closes on prompt_end and on a new prompt_begin', () => {
    const t = new PromptTracker()
    SWAP.forEach((l) => t.feed(l))
    t.feed('// action:prompt_end')
    expect(t.current()).toBeNull()
    SWAP.forEach((l) => t.feed(l))
    t.feed('// action:prompt_begin Next question')
    expect(t.current()).toBeNull()
  })

  it('keeps button groups together and ignores other output', () => {
    const t = new PromptTracker()
    ;[
      '// action:prompt_begin Passes',
      'echo: something else',
      '// action:prompt_button_group_start',
      '// action:prompt_button 1|_LASER_SET_PASSES N=1',
      '// action:prompt_button 2|_LASER_SET_PASSES N=2|primary',
      '// action:prompt_button_group_end',
      '// action:prompt_button Start',
      '// action:prompt_show',
    ].forEach((l) => t.feed(l))
    const p = t.current()!
    expect(p.items).toHaveLength(2)
    expect((p.items[0] as { group: unknown[] }).group).toHaveLength(2)
    expect(p.items[1]).toEqual({ group: [{ label: 'Start', command: 'Start', color: 'secondary' }] })
  })
})
