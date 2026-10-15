import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { MaintOverview, HistoryRecord, JobsWeek } from '@/maintenance/types'
import {
  fmtHours,
  fmtLength,
  hoursByTool,
  jobsByTool,
  jobsWeekly,
  meter,
  nextUp,
  niceMax,
  stats,
  taskStatus,
  tasksByAsset,
  toolGlance,
  toolNames,
  weekStarts,
  workWeekly,
} from './reports'
import { attentionOf } from '@/maintenance/summary'

const ov = JSON.parse(readFileSync(new URL('../../scripts/fixtures/maint-overview.json', import.meta.url), 'utf8')) as MaintOverview
const hist = JSON.parse(readFileSync(new URL('../../scripts/fixtures/maint-history.json', import.meta.url), 'utf8')).records as HistoryRecord[]
const BUILT_IN = ['BlockOne', 'SwitchFly', 'LightSaber', 'HotJoe', 'DragKnife']

const week = (start: number, completed: number, cancelled = 0, error = 0): JobsWeek => ({ start, completed, cancelled, error, hours: 0 })

describe('dashboard reports (same figures as the Portal Dashboard)', () => {
  it('stat tiles come from the machine meters and the task counts', () => {
    const s = stats(ov, [week(0, 8, 1, 1), week(1, 10)])
    expect(s.prodHours).toBe(meter(ov.meters.machine, 'prod_h'))
    expect(s.jobs).toBe(meter(ov.meters.machine, 'jobs'))
    expect(s.filament).toBe(meter(ov.meters.machine, 'filament_m'))
    expect(s.swaps).toBe(meter(ov.meters.machine, 'swaps'))
    expect(s.finishedShare).toBeCloseTo(18 / 20)
    expect([s.overdue, s.dueSoon, s.held]).toEqual([ov.counts.overdue, ov.counts.due_soon, ov.counts.held])
  })

  it('no data: zeros and no share, never NaN', () => {
    const s = stats(null, null)
    expect(s.prodHours).toBe(0)
    expect(s.finishedShare).toBeNull()
    expect(hoursByTool(null, ['BlockOne'])[0]!.total).toBe(0)
  })

  it('tools in slot order first, then anything else the Portal has records for', () => {
    const names = toolNames(ov, ['SwitchFly', 'BlockOne'])
    expect(names.slice(0, 2)).toEqual(['SwitchFly', 'BlockOne'])
    expect(names).toEqual(expect.arrayContaining(BUILT_IN))
  })

  it('hours by tool: producing never exceeds mounted, and the parts add up to the total', () => {
    for (const r of hoursByTool(ov, BUILT_IN)) {
      const [prod, idle] = r.parts
      expect(prod!.v).toBeLessThanOrEqual(r.total + 1e-9)
      expect(prod!.v + idle!.v).toBeCloseTo(r.total)
    }
  })

  it('jobs by tool: shares add up to about 100%', () => {
    const rows = jobsByTool(ov, BUILT_IN)
    const pct = rows.map((r) => Number(r.note!.split('·')[1]!.replace('%', '')))
    expect(pct.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(98)
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(BUILT_IN.reduce((a, n) => a + meter(ov.meters.tools[n], 'jobs'), 0))
  })

  it('task status: every active task counted once, worst state first', () => {
    const groups = taskStatus(ov)
    const active = ov.tasks.filter((t) => attentionOf(t) !== 'off').length
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(active)
    const order = ['overdue', 'held', 'due_soon', 'snoozed', 'ok']
    const idx = groups.map((g) => order.indexOf(g.key))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // a task on hold shows its own status name ("Waiting on parts"), not "held"
    const held = groups.find((g) => g.key === 'held')
    if (held) expect(held.label).not.toBe('held')
  })

  it('next up: due and held tasks before scheduled ones', () => {
    const list = nextUp(ov, 6)
    expect(list.length).toBeLessThanOrEqual(6)
    const firstOk = list.findIndex((t) => attentionOf(t) === 'ok')
    if (firstOk >= 0) expect(list.slice(firstOk).every((t) => attentionOf(t) === 'ok')).toBe(true)
  })

  it('tasks by asset: machine areas together, first; totals match', () => {
    const rows = tasksByAsset(ov)
    expect(rows[0]!.label).toBe('Machine')
    for (const r of rows) expect(r.parts.reduce((a, p) => a + p.v, 0)).toBe(r.total)
  })

  it('tool glance carries the care summary for each tool', () => {
    const g = toolGlance(ov, ['BlockOne'])[0]!
    expect(g.care.asset).toBe('tool:BlockOne')
    expect(g.jobs).toBe(meter(ov.meters.tools.BlockOne, 'jobs'))
  })

  it('weeks: 12 Monday starts, a week apart, when the Portal sends none', () => {
    const s = weekStarts(null, new Date(2026, 9, 15, 12).getTime())
    expect(s).toHaveLength(12)
    expect(new Date(s[11]! * 1000).getDay()).toBe(1)
    expect(s[11]! - s[10]!).toBe(7 * 86400)
  })

  it('jobs per week: finished solid, cancelled dots, failed hatched', () => {
    const c = jobsWeekly([week(0, 3, 2, 1)])[0]!
    expect(c.parts.map((p) => [p.name, p.v, p.fill])).toEqual([['Finished', 3, 'ink'], ['Cancelled', 2, 'dither'], ['Failed', 1, 'hatch']])
  })

  it('work per week counts done and skipped in the right week, and nothing older', () => {
    const starts = weekStarts(null)
    const recs: HistoryRecord[] = [
      { id: 'a', action: 'done', at: starts[0]! + 10 },
      { id: 'b', action: 'skipped', at: starts[11]! + 10 },
      { id: 'c', action: 'done', at: starts[0]! - 10 },
      { id: 'd', action: 'status', at: starts[5]! },
    ]
    const cols = workWeekly(recs, starts)
    expect(cols[0]!.parts[0]!.v).toBe(1)
    expect(cols[11]!.parts[1]!.v).toBe(1)
    expect(cols.reduce((a, c) => a + c.parts[0]!.v + c.parts[1]!.v, 0)).toBe(2)
    expect(workWeekly(hist, starts)).toHaveLength(12)
  })

  it('formats like the Portal', () => {
    expect(fmtHours(7.46)).toBe('7.5 h')
    expect(fmtHours(1156.4)).toBe('1,156 h')
    expect(fmtLength(6110)).toBe('6.11 km')
    expect(fmtLength(412.4)).toBe('412 m')
    expect([niceMax(0), niceMax(7), niceMax(12), niceMax(1231)]).toEqual([1, 10, 20, 2000])
  })
})
