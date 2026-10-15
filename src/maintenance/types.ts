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
}

export interface MeterRow {
  meter: string
  label: string
  unit: string
  help?: string
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
  meters: { machine: MeterRow[]; tools: Record<string, MeterRow[]>; tracking_since?: number | null }
  types?: Record<string, string>
  statuses?: MaintStatusDef[]
  tools?: { name: string; type: string; builtin: boolean }[]
  now: number
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
