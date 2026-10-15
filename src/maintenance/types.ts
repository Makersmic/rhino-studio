/**
 * Shapes returned by the Portal's maintenance API (Toolhead_Manager
 * rhino/maint/service.py overview(), 1.3.5 to 1.4.1). Fields Studio doesn't
 * use are left out; everything is treated as possibly missing.
 */

export type MaintState = 'overdue' | 'due_soon' | 'ok' | 'done' | string

export interface RuleStatus {
  summary?: string
  text?: string
  state?: MaintState
  fraction?: number
  due_ts?: number | null
  due_value?: number | null
  eta_ts?: number | null
  event?: boolean
}

export interface TaskStatus {
  state: MaintState
  fraction: number
  snoozed: boolean
  next: RuleStatus | null
  /** every rule, in the task's order */
  rules?: RuleStatus[]
  eta_ts?: number | null
  hold?: { id: string; label: string; hex?: string; list?: 'own' | 'due' | 'upcoming' | string; since: number; note?: string }
}

export interface MaintTask {
  id: string
  title: string
  asset: string // "machine:<area id>" | "tool:<name>" | "hw:<name>"
  asset_label: string
  type?: string
  priority?: 'low' | 'normal' | 'high' | 'critical' | string
  minutes?: number
  steps?: string[]
  parts?: string[]
  tools_needed?: string
  safety?: string
  notes?: string
  enabled?: boolean
  archived?: boolean
  snooze_until?: number
  last?: { at: number; action: string } | null
  status: TaskStatus | null
  rules?: Rule[]
  anchor?: 'completion' | 'calendar'
  first_due?: string
  links?: string[]
  remind_boot?: boolean
  /** set when the task comes from the Task Library (its definition is the library task's) */
  link?: { template: string; book?: string } | null
  link_info?: { template?: string; template_title?: string; book?: string; book_name?: string; uses?: number }
}

/** One schedule rule as the Portal stores it. Events are meter rules with event: true. */
export type Rule =
  | { kind: 'time'; every: number | string; unit: 'days' | 'weeks' | 'months'; lead?: number | string; lead_unit?: 'days' | 'weeks' | 'months' }
  | { kind: 'meter'; meter: string; scope: 'machine' | 'tool'; every: number | string; lead?: number | string; event?: boolean }
  | { kind: 'date'; on: string; lead?: number | string }

export interface MeterRow {
  meter: string
  label: string
  unit: string
  help?: string
  /** "after each job" when the meter can be used as an event, else "" */
  event?: string
  noun?: string
  value: number
  per_day: number | null
}

export interface MaintStatusDef {
  id: string
  label: string
  hex?: string
  builtin: boolean
  log_option?: boolean
}

export interface MaintOverview {
  ok: boolean
  areas: { id: string; label: string }[]
  tasks: MaintTask[]
  counts: { overdue: number; due_soon: number; snoozed: number; held: number }
  meters: { machine: MeterRow[]; tools: Record<string, MeterRow[]>; tracking_since?: number | null; imported_jobs?: number }
  types?: Record<string, string>
  priorities?: Record<string, string>
  statuses?: MaintStatusDef[]
  tools?: { name: string; type: string; builtin: boolean }[]
  hardware?: { name: string; label: string }[]
  settings?: { boot_reminder?: boolean }
  now: number
}

/** What the task editor sends (POST /api/maint/tasks, /tasks/<id>, /templates[/<id>]). */
export interface TaskDef {
  title: string
  asset?: string
  area?: string
  type: string
  priority: string
  rules: Rule[]
  anchor: 'completion' | 'calendar'
  first_due?: string
  steps: string[]
  parts: string[]
  tools_needed: string
  minutes: number | string
  safety: string
  notes: string
  links: string[]
  remind_boot: boolean
  enabled?: boolean
  /** new tasks only: where counting starts */
  last_done?: { when: 'now' | 'date'; date?: string; readings?: Record<string, number | string> }
}

/** A Task Library task (GET /api/maint/tasklib templates). */
export interface LibTask extends Omit<TaskDef, 'asset' | 'enabled' | 'last_done'> {
  id: string
  /** 'tool' when a rule counts the tool's own use: it can only go on a toolhead */
  applies: 'any' | 'tool'
  uses: string[]
  schedule: string
  books: string[]
  area_label?: string
  origin?: 'starter' | 'user' | string
}

export interface TaskBook {
  id: string
  name: string
  description?: string
  origin?: 'starter' | 'user' | string
  templates: string[]
  assigned: string[]
  assigned_labels: string[]
  needs_tool: boolean
}

export interface BookDef {
  name: string
  description: string
  templates: string[]
}

export interface TaskLibrary {
  ok: boolean
  templates: LibTask[]
  books: TaskBook[]
  areas: { id: string; label: string }[]
  types: Record<string, string>
  priorities: Record<string, string>
  /** the book that fits each tool: { BlockOne: "b_printhead" } */
  suggested: Record<string, string>
}

export interface CustomStatus {
  id: string
  label: string
  color: string
  help: string
  list: 'due' | 'upcoming' | 'own'
  clock: 'none' | 'pause' | 'done'
  expiry: 'never' | 'days' | 'meter'
  expiry_days: number | string
  boot_prompt: boolean
  note_required: boolean
  log_option: boolean
}

/** GET /api/maint/lists: the Care setup lists. */
export interface MaintLists {
  ok: boolean
  types: Record<string, string>
  type_use: Record<string, number>
  priorities: Record<string, string>
  areas: { id: string; label: string }[]
  statuses: { builtin: Record<string, { label: string; color: string }>; custom: CustomStatus[] }
  builtin_status_help: Record<string, string>
  status_use: Record<string, number>
  colors: Record<string, string>
  status_lists: Record<string, string>
  status_clock: Record<string, string>
  status_expiry: Record<string, string>
}

export interface StatusEdit {
  builtin: Record<string, { label: string; color: string }>
  custom: CustomStatus[]
}

export interface HistoryRecord {
  id: string
  task?: string
  title?: string
  asset?: string
  asset_label?: string
  action: string // done | skipped | status | status_cleared | meter ...
  at: number
  notes?: string
  was?: string
  status?: string
  /** meter readings: from -> to */
  from?: number | null
  to?: number | null
}

export interface MaintHistory {
  ok: boolean
  records: HistoryRecord[]
}

/** GET /api/dash/jobs: finished, cancelled and failed jobs per week, last 12 weeks (Monday-based). */
export interface JobsWeek {
  start: number
  completed: number
  cancelled: number
  error: number
  hours: number
}

export interface JobsWeeks {
  ok: boolean
  weeks: JobsWeek[]
  /** false when Moonraker's job history couldn't be read */
  available: boolean
}
