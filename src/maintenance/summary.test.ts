import { describe, expect, it } from 'vitest'
import overview from '../../scripts/fixtures/maint-overview.json'
import { assetCare, attentionOf, careText, dueList, machineAreas, upcomingList } from './summary'
import type { MaintOverview, MaintTask } from './types'

const ov = overview as unknown as MaintOverview

function withState(id: string, state: string, extra: Partial<MaintTask['status']> = {}): MaintOverview {
  return {
    ...ov,
    tasks: ov.tasks.map((t) => (t.id === id ? { ...t, status: { ...t.status!, state, ...extra } } : t)),
  }
}

describe('maintenance summary (real Portal data)', () => {
  it('finds the three due-soon tasks the Portal counts', () => {
    expect(ov.counts.due_soon).toBe(3)
    expect(dueList(ov)).toHaveLength(3)
  })

  it('puts overdue tasks first', () => {
    const lens = ov.tasks.find((t) => t.title.startsWith('Clean the laser lens'))!
    const list = dueList(withState(lens.id, 'overdue'))
    expect(list[0]!.id).toBe(lens.id)
  })

  it('keeps a task held for parts out of the due list', () => {
    const held = ov.tasks.find((t) => t.status?.hold)!
    expect(attentionOf(held)).toBe('held')
    expect(dueList(ov).some((t) => t.id === held.id)).toBe(false)
  })

  it('leaves snoozed tasks out of the due list', () => {
    const due = dueList(ov)[0]!
    expect(dueList(withState(due.id, due.status!.state, { snoozed: true })).some((t) => t.id === due.id)).toBe(false)
  })

  it('summarises a toolhead', () => {
    const knife = assetCare(ov, 'tool:DragKnife')
    expect(knife.dueSoon).toBe(1)
    expect(knife.level).toBe('due_soon')
    expect(knife.next?.title).toMatch(/blade/)
    expect(careText(knife)).toBe('1 due soon')
    const joe = assetCare(ov, 'tool:HotJoe')
    expect(joe.level).toBe('ok')
    expect(careText(joe)).toBe('Up to date')
  })

  it('reports a tool with no tasks as having none', () => {
    expect(assetCare(ov, 'tool:HotWire').level).toBe('none')
  })

  it('lists machine areas that have tasks', () => {
    const areas = machineAreas(ov)
    expect(areas.map((a) => a.label)).toContain('Motion X/Y')
    expect(areas.find((a) => a.label === 'Motion X/Y')!.level).toBe('due_soon')
  })

  it('never lists event tasks (after an E-stop) as upcoming', () => {
    expect(upcomingList(ov, 50).some((t) => t.status?.next?.event)).toBe(false)
  })
})
