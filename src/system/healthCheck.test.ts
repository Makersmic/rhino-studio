import { describe, expect, it } from 'vitest'
import { groupBySection, needsAttention, report, verdict, type HealthItem, type HealthResult } from './healthCheck'

const item = (section: string, level: HealthItem['level'], what: string, detail = ''): HealthItem => ({ section, level, what, detail })
const items = [
  item('Host', 'PASS', 'Sleep is off'),
  item('Services', 'WARN', 'Portal service is old', 'install again'),
  item('Host', 'FAIL', 'Board not connected', 'ls /dev/serial/by-id/'),
  item('', 'INFO', 'A note'),
  item('Services', 'PASS', 'klipper is running'),
]

describe('health check page logic', () => {
  it('groups by section in the order the check made them', () => {
    const g = groupBySection(items)
    expect(g.map((x) => x.section)).toEqual(['Host', 'Services', 'Other'])
    expect(g[0]!.items.map((i) => i.what)).toEqual(['Sleep is off', 'Board not connected'])
  })
  it('puts what needs you first: fix, look, note; leaves out what passed', () => {
    expect(needsAttention(items).map((i) => i.level)).toEqual(['FAIL', 'WARN', 'INFO'])
  })
  it('says the worst thing first in one line', () => {
    expect(verdict({ PASS: 5, WARN: 2, FAIL: 1, INFO: 0 })).toEqual({ tone: 'danger', text: '1 thing to fix before you trust this machine' })
    expect(verdict({ PASS: 5, WARN: 2, FAIL: 0, INFO: 0 })).toEqual({ tone: 'warn', text: 'Works, but 2 things are worth a look' })
    expect(verdict({ PASS: 5, WARN: 1, FAIL: 0, INFO: 0 })!.text).toBe('Works, but 1 thing is worth a look')
    expect(verdict({ PASS: 5, WARN: 0, FAIL: 0, INFO: 3 })).toEqual({ tone: 'ok', text: 'Everything checked is in order' })
    expect(verdict(undefined)).toBeNull()
  })
  it('writes a plain text report with the details and facts', () => {
    const r: HealthResult = { made: 'x', counts: { PASS: 2, WARN: 1, FAIL: 1, INFO: 1 }, facts: { 'host name': 'rhino', boards: ['a', 'b'] }, results: items }
    const t = report(r, new Date(2026, 10, 23, 9, 0), '0.36.2')
    expect(t).toContain('Studio 0.36.2')
    expect(t).toContain('  FAIL Board not connected - ls /dev/serial/by-id/')
    expect(t).toContain('Summary: 2 good, 1 to look at, 1 to fix, 1 notes')
    expect(t).toContain('  boards: a, b')
  })
})
