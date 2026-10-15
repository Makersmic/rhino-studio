/**
 * The task editor's form, and the plain-words schedule it shows as you type.
 * Pure functions (tested in edit.test.ts). The Portal is still the judge of
 * what's valid: these only shape the form and the request, the way the
 * Portal's own editor does (Toolhead_Manager rhino/portal/static/maint.js,
 * sections 6 and 9).
 */
import type { CustomStatus, LibTask, MaintOverview, MaintTask, MeterRow, Rule, TaskDef } from './types'

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const isTool = (asset: string | undefined | null) => !!asset && asset.startsWith('tool:')
export const toolOf = (asset: string | undefined | null) => (isTool(asset) ? asset!.slice(5) : null)

// ---------------------------------------------------------------- what a task is for

export interface AssetChoice { value: string; label: string; group: string }

/** Every place a task can live, grouped. `withMachine` adds "Whole machine" (books and library tasks). */
export function assetChoices(ov: MaintOverview | null, withMachine = false): AssetChoice[] {
  if (!ov) return []
  return [
    ...(withMachine ? [{ value: 'machine', label: 'Whole machine (each task in its own area)', group: 'Machine' }] : []),
    ...ov.areas.map((a) => ({ value: `machine:${a.id}`, label: a.label, group: 'Machine' })),
    ...(ov.tools ?? []).map((t) => ({ value: `tool:${t.name}`, label: t.name, group: 'Toolheads' })),
    ...(ov.hardware ?? []).map((h) => ({ value: `hw:${h.name}`, label: h.label || h.name, group: 'System hardware' })),
  ]
}

/** [[group, choices]] in order, for <optgroup>s. */
export function grouped<T extends { group: string }>(items: T[]): [string, T[]][] {
  const out: [string, T[]][] = []
  for (const it of items) {
    const g = out.find(([k]) => k === it.group)
    if (g) g[1].push(it)
    else out.push([it.group, [it]])
  }
  return out
}

// ---------------------------------------------------------------- rules

export type RuleKind = 'time' | 'meter' | 'event' | 'date'
export const RULE_KINDS: [RuleKind, string][] = [
  ['time', 'Every so often'],
  ['meter', 'After so much use'],
  ['event', 'After each event'],
  ['date', 'Once, on a date'],
]
export const UNITS = ['days', 'weeks', 'months'] as const

/** A rule as the form edits it: events are their own kind here, meter rules with event: true in the Portal. */
export interface FormRule {
  kind: RuleKind
  every?: number | string
  unit?: 'days' | 'weeks' | 'months'
  lead?: number | string
  lead_unit?: 'days' | 'weeks' | 'months'
  meter?: string
  scope?: 'machine' | 'tool'
  on?: string
}

/** A sensible new rule. Library tasks start on the tool's own meters only for 'tool' scope choices. */
export function blankRule(kind: RuleKind, asset: string | null, template = false): FormRule {
  const tool = !template && isTool(asset)
  if (kind === 'time') return { kind, every: 3, unit: 'months', lead: 14, lead_unit: 'days' }
  if (kind === 'meter') return { kind, meter: tool ? 'active_h' : 'prod_h', scope: tool ? 'tool' : 'machine', every: 100, lead: 10 }
  if (kind === 'event') return { kind, meter: tool ? 'mounts' : 'swaps', scope: tool ? 'tool' : 'machine' }
  return { kind: 'date', on: today(), lead: 7 }
}

export const ruleToForm = (r: Rule): FormRule => (r.kind === 'meter' && r.event ? { kind: 'event', meter: r.meter, scope: r.scope } : ({ ...r } as FormRule))

export function formToRule(r: FormRule): Rule {
  if (r.kind === 'event') return { kind: 'meter', meter: r.meter!, scope: r.scope ?? 'machine', every: 1, event: true }
  if (r.kind === 'time') {
    const out: Rule = { kind: 'time', every: r.every ?? '', unit: r.unit ?? 'days' }
    if (r.lead !== undefined && r.lead !== '') Object.assign(out, { lead: r.lead, lead_unit: r.lead_unit ?? 'days' })
    return out
  }
  if (r.kind === 'meter') {
    const out: Rule = { kind: 'meter', meter: r.meter!, scope: r.scope ?? 'machine', every: r.every ?? '' }
    if (r.lead !== undefined && r.lead !== '') out.lead = r.lead
    return out
  }
  return { kind: 'date', on: r.on ?? '', lead: r.lead ?? 0 }
}

/** The meter rows a rule can count, for the task's asset. Library tasks offer "the tool's own" meters too. */
function meterRows(ov: MaintOverview | null, scope: 'machine' | 'tool', asset: string | null): MeterRow[] {
  if (!ov) return []
  if (scope === 'machine') return ov.meters.machine
  const t = toolOf(asset)
  return (t && ov.meters.tools[t]) || Object.values(ov.meters.tools)[0] || []
}

export interface MeterChoice { value: string; label: string; unit: string }

/** "scope.meter" choices for a usage rule (events = only meters that are events). */
export function meterChoices(ov: MaintOverview | null, asset: string | null, template: boolean, events: boolean): MeterChoice[] {
  const out: MeterChoice[] = []
  const add = (scope: 'machine' | 'tool', prefix: string) =>
    meterRows(ov, scope, asset).forEach((m) => {
      if (!events || m.event) out.push({ value: `${scope}.${m.meter}`, label: prefix + (events ? m.event! : m.label), unit: m.unit })
    })
  if (template || isTool(asset)) add('tool', template ? "The tool's own: " : 'This tool: ')
  add('machine', 'Machine: ')
  return out
}

export function meterOf(ov: MaintOverview | null, r: Pick<FormRule, 'scope' | 'meter'>, asset: string | null): MeterRow | null {
  return meterRows(ov, r.scope ?? 'machine', asset).find((m) => m.meter === r.meter) ?? null
}

/** When the asset changes, tool-meter rules that no longer fit become a fresh rule of the same kind. */
export function fitRules(rules: FormRule[], asset: string | null): FormRule[] {
  return rules.map((r) => ((r.kind === 'meter' || r.kind === 'event') && r.scope === 'tool' && !isTool(asset) ? blankRule(r.kind, asset) : r))
}

const plural = (n: number | string, unit: string) => `${n} ${Number(n) === 1 ? unit.replace(/s$/, '') : unit}`
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : iso
}

/**
 * One rule in plain words, worded like the Portal's own schedule text
 * (rhino/maint/schedule.py describe): "every 3 months", "every 200 production
 * hours", "every 1000 m of filament", "after each tool swap"; plus the early alarm.
 */
export function describeRule(ov: MaintOverview | null, r: FormRule, asset: string | null, template = false): string {
  const own = template && r.scope === 'tool' ? " (the tool's own)" : ''
  const hasLead = r.lead !== undefined && r.lead !== '' && Number(r.lead) > 0
  if (r.kind === 'time') {
    if (!r.every) return 'every …'
    const every = Number(r.every) === 1 ? `every ${(r.unit ?? 'days').replace(/s$/, '')}` : `every ${r.every} ${r.unit ?? 'days'}`
    return every + (hasLead ? `, early alarm ${plural(r.lead!, r.lead_unit ?? 'days')} before` : '')
  }
  const m = meterOf(ov, r, asset)
  if (r.kind === 'event') return m?.event ? m.event + own : 'after each …'
  if (r.kind === 'meter') {
    if (!r.every || !m) return 'every …'
    const noun = m.noun || m.label.toLowerCase()
    const amount = m.unit === 'm' ? `${r.every} m ${noun}` : `${r.every} ${noun}`
    const lead = hasLead ? `, early alarm ${r.lead}${m.unit ? ` ${m.unit}` : ''} before` : ''
    return `every ${amount}${own}${lead}`
  }
  if (!r.on) return 'once, on …'
  const lead = Number(r.lead) > 0 ? `, early alarm ${plural(r.lead!, 'days')} before` : ''
  return `once, on ${fmtDay(r.on)}${lead}`
}

/** The whole schedule: "Due every 3 months, or every 100 h of production hours, whichever comes first." */
export function describeSchedule(ov: MaintOverview | null, f: Pick<TaskForm, 'rules' | 'anchor' | 'first_due'>, asset: string | null, template = false): string {
  const parts = f.rules.map((r) => describeRule(ov, r, asset, template))
  if (!parts.length) return 'No schedule yet: add a rule.'
  let s = `Due ${parts.join(', or ')}${parts.length > 1 ? ', whichever comes first' : ''}.`
  if (f.rules.some((r) => r.kind === 'time'))
    s += f.anchor === 'calendar' ? ` Time rules keep a fixed calendar${f.first_due ? `, first due ${fmtDay(f.first_due)}` : ''}.` : ' Time rules count from when it was last done.'
  return s
}

// ---------------------------------------------------------------- the form

export interface TaskForm {
  title: string
  asset: string
  area: string
  type: string
  priority: string
  rules: FormRule[]
  anchor: 'completion' | 'calendar'
  first_due: string
  steps: string
  parts: string
  tools_needed: string
  minutes: number | string
  safety: string
  notes: string
  links: string
  remind_boot: boolean
  enabled: boolean
  last_done: { when: 'now' | 'date'; date: string; readings: Record<string, number | string> }
}

const firstType = (types: Record<string, string> | undefined) => (types && 'inspect' in types ? 'inspect' : Object.keys(types ?? {})[0] ?? 'inspect')

export function blankForm(ov: MaintOverview | null, asset: string, template = false): TaskForm {
  return {
    title: '', asset, area: '', type: firstType(ov?.types), priority: 'normal', rules: [blankRule('time', asset, template)],
    anchor: 'completion', first_due: today(), steps: '', parts: '', tools_needed: '', minutes: '', safety: '', notes: '', links: '',
    remind_boot: true, enabled: true, last_done: { when: 'now', date: today(), readings: {} },
  }
}

export function taskToForm(t: MaintTask | LibTask): TaskForm {
  const x = t as Partial<MaintTask & LibTask>
  return {
    title: t.title, asset: x.asset ?? '', area: x.area ?? '', type: x.type ?? 'inspect', priority: x.priority ?? 'normal',
    rules: (x.rules ?? []).map(ruleToForm), anchor: x.anchor === 'calendar' ? 'calendar' : 'completion', first_due: x.first_due || today(),
    steps: (x.steps ?? []).join('\n'), parts: (x.parts ?? []).join('\n'), tools_needed: x.tools_needed ?? '', minutes: x.minutes || '',
    safety: x.safety ?? '', notes: x.notes ?? '', links: (x.links ?? []).join('\n'), remind_boot: x.remind_boot !== false,
    enabled: x.enabled !== false, last_done: { when: 'now', date: today(), readings: {} },
  }
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

/** The form -> what the Portal takes. `isNew` adds where counting starts; templates carry an area, tasks an asset. */
export function formToDef(f: TaskForm, mode: 'task' | 'template', isNew: boolean): TaskDef {
  const def: TaskDef = {
    title: f.title.trim(), type: f.type, priority: f.priority, rules: f.rules.map(formToRule), anchor: f.anchor,
    steps: lines(f.steps), parts: lines(f.parts), tools_needed: f.tools_needed.trim(), minutes: f.minutes === '' ? 0 : f.minutes,
    safety: f.safety.trim(), notes: f.notes.trim(), links: lines(f.links), remind_boot: f.remind_boot,
  }
  if (f.anchor === 'calendar') def.first_due = f.first_due
  if (mode === 'template') def.area = f.area
  else {
    def.asset = f.asset
    def.enabled = f.enabled
    if (isNew) def.last_done = f.last_done.when === 'date' ? { when: 'date', date: f.last_done.date, readings: { ...f.last_done.readings } } : { when: 'now' }
  }
  return def
}

/** Things the form can say before the Portal does (the Portal still checks everything). */
export function formProblem(f: TaskForm, mode: 'task' | 'template'): string {
  if (!f.title.trim()) return 'Give the task a title.'
  if (mode === 'task' && !f.asset) return 'Choose what the task is for.'
  if (!f.rules.length) return 'Add at least one schedule rule.'
  for (const r of f.rules) {
    if ((r.kind === 'time' || r.kind === 'meter') && !(Number(r.every) > 0)) return 'Each rule needs an interval above 0.'
    if (r.kind === 'date' && !r.on) return 'Choose the date for a one-off rule.'
  }
  if (f.anchor === 'calendar' && f.rules.some((r) => r.kind === 'time') && !f.first_due) return 'Choose the first due date.'
  for (const u of lines(f.links)) if (!/^https?:\/\//i.test(u)) return 'Links must start with http:// or https://.'
  return ''
}

// ---------------------------------------------------------------- status codes

/** One status code's four answers in a line, for a folded card. */
export function statusSummary(s: Pick<CustomStatus, 'list' | 'clock' | 'expiry' | 'expiry_days' | 'note_required' | 'log_option' | 'boot_prompt'>): string {
  const where = { due: 'Listed with due tasks', upcoming: 'Listed with upcoming tasks', own: 'Its own group' }[s.list] ?? s.list
  const clock = { none: 'keeps ageing', pause: 'clock paused', done: 'counts as done' }[s.clock] ?? s.clock
  const ends = s.expiry === 'days' ? `ends after ${plural(s.expiry_days || 0, 'days')}` : s.expiry === 'meter' ? 'ends when the machine runs again' : 'until changed'
  return [where, clock, ends, s.note_required && 'note required', s.log_option && 'in Log work', s.boot_prompt && 'in the Mainsail reminder'].filter(Boolean).join(' · ')
}

export const blankStatus = (): CustomStatus => ({
  id: '', label: '', color: 'purple', help: '', list: 'own', clock: 'none', expiry: 'never', expiry_days: 7,
  boot_prompt: false, note_required: false, log_option: true,
})

// ---------------------------------------------------------------- tasks list

export type TaskFilter = 'all' | 'due' | 'held' | 'paused' | 'archived'

const RANK: Record<string, number> = { overdue: 0, due_soon: 1, ok: 2, done: 3 }

/** Tasks for the Tasks list: filtered, then grouped by what they're for, most urgent first. */
export function taskGroups(ov: MaintOverview | null, filter: TaskFilter, asset: string, q = ''): { asset: string; label: string; group: string; tasks: MaintTask[] }[] {
  if (!ov) return []
  const needle = q.trim().toLowerCase()
  const keep = (t: MaintTask) => {
    if (filter === 'archived' ? !t.archived : t.archived) return false
    if (asset && t.asset !== asset) return false
    if (needle && !`${t.title} ${t.asset_label}`.toLowerCase().includes(needle)) return false
    if (filter === 'due') return !!t.status && (t.status.state === 'overdue' || t.status.state === 'due_soon')
    if (filter === 'held') return !!t.status?.hold
    if (filter === 'paused') return t.enabled === false
    return true
  }
  const order = assetChoices(ov)
  const groups = new Map<string, MaintTask[]>()
  for (const t of ov.tasks.filter(keep)) groups.set(t.asset, [...(groups.get(t.asset) ?? []), t])
  const at = (a: string) => {
    const i = order.findIndex((c) => c.value === a)
    return i < 0 ? 999 : i
  }
  return [...groups.entries()]
    .sort(([a], [b]) => at(a) - at(b))
    .map(([a, tasks]) => ({
      asset: a,
      label: tasks[0]!.asset_label,
      group: order.find((c) => c.value === a)?.group ?? 'Other',
      tasks: tasks.sort((x, y) => (x.status ? (RANK[x.status.state] ?? 4) : 9) - (y.status ? (RANK[y.status.state] ?? 4) : 9) || x.title.localeCompare(y.title)),
    }))
}

/** Counts for the filter chips. */
export function filterCounts(ov: MaintOverview | null): Record<TaskFilter, number> {
  const t = ov?.tasks ?? []
  const live = t.filter((x) => !x.archived)
  return {
    all: live.length,
    due: live.filter((x) => x.status && (x.status.state === 'overdue' || x.status.state === 'due_soon')).length,
    held: live.filter((x) => x.status?.hold).length,
    paused: live.filter((x) => x.enabled === false).length,
    archived: t.filter((x) => x.archived).length,
  }
}
