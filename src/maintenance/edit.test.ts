import { describe, expect, it } from 'vitest'
import overview from '../../scripts/fixtures/maint-overview.json'
import {
  assetChoices, blankForm, blankRule, describeRule, describeSchedule, filterCounts, fitRules, formProblem, formToDef, grouped,
  meterChoices, ruleToForm, statusSummary, taskGroups, taskToForm, blankStatus,
} from './edit'
import type { MaintOverview, MaintTask } from './types'

const ov = overview as unknown as MaintOverview

describe('what a task is for', () => {
  it('lists areas, then toolheads, then system hardware, grouped', () => {
    const c = assetChoices({ ...ov, hardware: [{ name: 'enclosure_light', label: 'Enclosure light' }] })
    expect(c[0]).toEqual({ value: 'machine:motion_xy', label: 'Motion X/Y', group: 'Machine' })
    expect(c.find((x) => x.value === 'tool:BlockOne')?.group).toBe('Toolheads')
    expect(c.at(-1)).toEqual({ value: 'hw:enclosure_light', label: 'Enclosure light', group: 'System hardware' })
    expect(grouped(c).map(([g]) => g)).toEqual(['Machine', 'Toolheads', 'System hardware'])
  })
  it('books and library tasks can also go on the whole machine', () => {
    expect(assetChoices(ov, true)[0]!.value).toBe('machine')
  })
})

describe('rules', () => {
  it('starts tool tasks on the tool’s own meters, machine tasks on the machine’s', () => {
    expect(blankRule('meter', 'tool:BlockOne')).toMatchObject({ scope: 'tool', meter: 'active_h' })
    expect(blankRule('meter', 'machine:frame')).toMatchObject({ scope: 'machine', meter: 'prod_h' })
    expect(blankRule('event', 'tool:BlockOne')).toMatchObject({ scope: 'tool', meter: 'mounts' })
  })
  it('events are meter rules with event: true in the Portal, their own kind in the form', () => {
    const f = ruleToForm({ kind: 'meter', meter: 'swaps', scope: 'machine', every: 1, lead: 0, event: true })
    expect(f).toEqual({ kind: 'event', meter: 'swaps', scope: 'machine' })
    const form = { ...blankForm(ov, 'machine:frame'), title: 'X', rules: [f] }
    expect(formToDef(form, 'task', false).rules).toEqual([{ kind: 'meter', meter: 'swaps', scope: 'machine', every: 1, event: true }])
  })
  it('offers this tool’s meters only on a tool, and only event meters for events', () => {
    const onTool = meterChoices(ov, 'tool:BlockOne', false, false).map((m) => m.value)
    expect(onTool).toContain('tool.filament_m')
    expect(onTool).toContain('machine.prod_h')
    expect(meterChoices(ov, 'machine:frame', false, false).some((m) => m.value.startsWith('tool.'))).toBe(false)
    const ev = meterChoices(ov, 'tool:BlockOne', false, true)
    expect(ev.map((m) => m.label)).toContain('This tool: each time this tool is mounted')
    expect(ev.every((m) => !m.value.endsWith('prod_h'))).toBe(true)
  })
  it('a tool-meter rule becomes a machine rule when the task moves off a tool', () => {
    const r = fitRules([blankRule('meter', 'tool:BlockOne'), blankRule('time', null)], 'machine:frame')
    expect(r[0]).toMatchObject({ scope: 'machine', meter: 'prod_h' })
    expect(r[1]!.kind).toBe('time')
  })
  it('describes rules the way the Portal does', () => {
    expect(describeRule(ov, { kind: 'time', every: 3, unit: 'months', lead: 2, lead_unit: 'weeks' }, null)).toBe('every 3 months, early alarm 2 weeks before')
    expect(describeRule(ov, { kind: 'time', every: 1, unit: 'weeks' }, null)).toBe('every week')
    expect(describeRule(ov, { kind: 'meter', meter: 'prod_h', scope: 'machine', every: 200, lead: 20 }, 'machine:frame')).toBe('every 200 production hours, early alarm 20 h before')
    expect(describeRule(ov, { kind: 'meter', meter: 'filament_m', scope: 'tool', every: 1000 }, 'tool:BlockOne')).toBe('every 1000 m of filament')
    expect(describeRule(ov, { kind: 'event', meter: 'swaps', scope: 'machine' }, null)).toBe('after each tool swap')
    expect(describeRule(ov, { kind: 'event', meter: 'mounts', scope: 'tool' }, null, true)).toBe("each time this tool is mounted (the tool's own)")
  })
  it('describes the whole schedule, whichever comes first', () => {
    const s = describeSchedule(ov, { rules: [{ kind: 'time', every: 6, unit: 'months' }, { kind: 'meter', meter: 'prod_h', scope: 'machine', every: 500 }], anchor: 'completion', first_due: '' }, 'machine:frame')
    expect(s).toBe('Due every 6 months, or every 500 production hours, whichever comes first. Time rules count from when it was last done.')
  })
})

describe('the form', () => {
  const task = ov.tasks.find((t) => t.rules?.length && t.steps?.length) as MaintTask
  it('round-trips a real task', () => {
    const f = taskToForm(task)
    expect(f.steps.split('\n')).toEqual(task.steps)
    const def = formToDef(f, 'task', false)
    expect(def.asset).toBe(task.asset)
    expect(def.steps).toEqual(task.steps)
    expect(def.rules).toEqual(task.rules!.map((r) => (r.kind === 'meter' && r.event ? { kind: 'meter', meter: r.meter, scope: r.scope, every: 1, event: true } : r)))
    expect(def.last_done).toBeUndefined()
  })
  it('new tasks say where counting starts; library tasks carry an area, not an asset', () => {
    const f = { ...blankForm(ov, 'machine:frame'), title: 'Belts', area: 'frame' }
    expect(formToDef(f, 'task', true).last_done).toEqual({ when: 'now' })
    f.last_done = { when: 'date', date: '2026-01-02', readings: { 'machine.prod_h': 900 } }
    expect(formToDef(f, 'task', true).last_done).toEqual({ when: 'date', date: '2026-01-02', readings: { 'machine.prod_h': 900 } })
    const t = formToDef(f, 'template', true)
    expect(t.asset).toBeUndefined()
    expect(t.area).toBe('frame')
    expect(t.last_done).toBeUndefined()
  })
  it('catches the obvious before the Portal does', () => {
    const f = blankForm(ov, 'machine:frame')
    expect(formProblem(f, 'task')).toMatch(/title/)
    f.title = 'Belts'
    expect(formProblem(f, 'task')).toBe('')
    f.rules = [{ kind: 'meter', meter: 'prod_h', scope: 'machine', every: '' }]
    expect(formProblem(f, 'task')).toMatch(/interval/)
    f.rules = [blankRule('time', null)]
    f.links = 'ftp://x'
    expect(formProblem(f, 'task')).toMatch(/http/)
  })
})

describe('the tasks list', () => {
  it('groups by what the task is for, in the Portal’s order, most urgent first', () => {
    const g = taskGroups(ov, 'all', '')
    expect(g.length).toBeGreaterThan(3)
    expect(g[0]!.group).toBe('Machine')
    expect(g.reduce((n, x) => n + x.tasks.length, 0)).toBe(ov.tasks.filter((t) => !t.archived).length)
    for (const x of g) {
      const ranks = x.tasks.map((t) => ({ overdue: 0, due_soon: 1, ok: 2, done: 3 })[t.status?.state as 'ok'] ?? 9)
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }
  })
  it('filters', () => {
    const c = filterCounts(ov)
    expect(taskGroups(ov, 'due', '').flatMap((x) => x.tasks)).toHaveLength(c.due)
    expect(taskGroups(ov, 'held', '').flatMap((x) => x.tasks)).toHaveLength(c.held)
    expect(taskGroups(ov, 'all', 'tool:BlockOne').every((x) => x.asset === 'tool:BlockOne')).toBe(true)
    expect(taskGroups(ov, 'all', '', 'belt').flatMap((x) => x.tasks).every((t) => /belt/i.test(t.title + t.asset_label))).toBe(true)
  })
})

it('sums up a status code in a line', () => {
  expect(statusSummary({ ...blankStatus(), note_required: true })).toBe('Its own group · keeps ageing · until changed · note required · in Log work')
  expect(statusSummary({ ...blankStatus(), list: 'due', expiry: 'days', expiry_days: 3, log_option: false })).toBe('Listed with due tasks · keeps ageing · ends after 3 days')
})
