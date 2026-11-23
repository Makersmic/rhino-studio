/**
 * Settings › Health check: the Rhino's own health check (Tool Manager scripts/rhino_doctor.py, also menu option 7 on
 * the host) shown on a page. Plain logic only: grouping, the one-line verdict, the words for each level and a text
 * report. The Portal runs the check; this page never changes anything.
 */
export type HealthLevel = 'PASS' | 'WARN' | 'FAIL' | 'INFO'

export interface HealthItem {
  section: string
  level: HealthLevel
  what: string
  detail: string
}
export interface HealthResult {
  made: string
  counts: Record<HealthLevel, number>
  facts: Record<string, string | string[]>
  results: HealthItem[]
}
/** GET /api/health */
export interface HealthState {
  ok: boolean
  running: boolean
  at: number | null
  result: HealthResult | null
  error: string | null
}

/** What each level means, in the page's words (shape and word, never colour alone: only "Fix" is red). */
export const LEVEL_WORD: Record<HealthLevel, string> = { PASS: 'Good', WARN: 'Look', FAIL: 'Fix', INFO: 'Note' }
export const LEVEL_TONE: Record<HealthLevel, 'ok' | 'warn' | 'danger' | 'neutral'> = { PASS: 'ok', WARN: 'warn', FAIL: 'danger', INFO: 'neutral' }

/** Items in the order the check made them, one group per section. Items with no section go under "Other". */
export function groupBySection(items: HealthItem[]): { section: string; items: HealthItem[] }[] {
  const out: { section: string; items: HealthItem[] }[] = []
  for (const it of items) {
    const name = it.section || 'Other'
    let g = out.find((x) => x.section === name)
    if (!g) out.push((g = { section: name, items: [] }))
    g.items.push(it)
  }
  return out
}

/** The one line at the top. Anything to fix comes first; "Look" items don't stop the machine. */
export function verdict(counts: Record<HealthLevel, number> | undefined): { tone: 'ok' | 'warn' | 'danger'; text: string } | null {
  if (!counts) return null
  if (counts.FAIL) return { tone: 'danger', text: `${counts.FAIL} thing${counts.FAIL === 1 ? '' : 's'} to fix before you trust this machine` }
  if (counts.WARN) return { tone: 'warn', text: `Works, but ${counts.WARN} thing${counts.WARN === 1 ? ' is' : 's are'} worth a look` }
  return { tone: 'ok', text: 'Everything checked is in order' }
}

/** Items to show first: fixes, then looks, then notes, then what passed (kept in check order inside each). */
export function needsAttention(items: HealthItem[]): HealthItem[] {
  const rank: Record<HealthLevel, number> = { FAIL: 0, WARN: 1, INFO: 2, PASS: 3 }
  return items.filter((i) => i.level !== 'PASS').sort((a, b) => rank[a.level] - rank[b.level])
}

/** Plain text to paste into a message or a note. */
export function report(r: HealthResult, when: Date, version: string): string {
  const lines = [`Rhino health check, ${when.toLocaleString()} (Studio ${version})`, '']
  for (const g of groupBySection(r.results)) {
    lines.push(g.section)
    for (const i of g.items) lines.push(`  ${i.level.padEnd(4)} ${i.what}${i.detail ? ` - ${i.detail}` : ''}`)
    lines.push('')
  }
  lines.push(`Summary: ${r.counts.PASS} good, ${r.counts.WARN} to look at, ${r.counts.FAIL} to fix, ${r.counts.INFO} notes`)
  const facts = Object.entries(r.facts)
  if (facts.length) {
    lines.push('', 'Facts')
    for (const [k, v] of facts) lines.push(`  ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
  }
  return lines.join('\n')
}
