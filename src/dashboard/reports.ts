/**
 * The Dashboard's reports: the same figures as the Rhino Portal's Dashboard
 * (Toolhead_Manager rhino/portal/static/dash.js), worked out from the same
 * three Portal reads: /api/maint (meters, tasks), /api/maint/history (work
 * log) and /api/dash/jobs (jobs per week from Moonraker's history).
 *
 * Pure functions, tested against the Portal's year-of-use demo data.
 *
 * Charts are drawn the e-paper way: series are told apart by fill (solid ink,
 * dense dots, dots, faint dots, hatching), never by colour, so they read in
 * day and night themes, in grey and on paper. Task states use the same rules
 * as the Care screen (attentionOf in maintenance/summary.ts).
 */
import { assetCare, attentionOf, toolAsset, type AssetCare, type Attention } from '@/maintenance/summary'
import type { HistoryRecord, JobsWeek, MaintOverview, MaintTask, MeterRow } from '@/maintenance/types'

export type Fill = 'ink' | 'dense' | 'dither' | 'faint' | 'hatch'

export interface Part {
  v: number
  name: string
  fill: Fill
}

export interface BarRow {
  label: string
  parts: Part[]
  total: number
  /** shown after the bar instead of the total, e.g. "54%" */
  note?: string
}

export interface Column {
  label: string
  /** the week's start, seconds */
  start: number
  parts: Part[]
}

const WEEK = 7 * 86400

// ---------------------------------------------------------------- helpers

export function meter(rows: MeterRow[] | undefined, name: string): number {
  const v = rows?.find((r) => r.meter === name)?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function perDay(rows: MeterRow[] | undefined, name: string): number | null {
  const v = rows?.find((r) => r.meter === name)?.per_day
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/** 1,156 h · 7.5 h (one decimal under 10) */
export function fmtHours(v: number): string {
  return `${v < 10 ? (Math.round(v * 10) / 10).toLocaleString() : Math.round(v).toLocaleString()} h`
}

/** 6.11 km · 412 m */
export function fmtLength(m: number): string {
  return m >= 1000 ? `${(Math.round(m / 10) / 100).toLocaleString()} km` : `${Math.round(m).toLocaleString()} m`
}

export const fmtCount = (v: number) => Math.round(v).toLocaleString()

/** "Oct 6" */
export const weekLabel = (start: number) => new Date(start * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' })

/**
 * Toolheads in slot order: the ones Klipper knows first (already in slot
 * order), then any others the Portal has records for, so a tool that was
 * removed still shows its history.
 */
export function toolNames(ov: MaintOverview | null, known: string[]): string[] {
  const out = [...known]
  for (const t of ov?.tools ?? []) if (!out.includes(t.name)) out.push(t.name)
  for (const n of Object.keys(ov?.meters.tools ?? {})) if (!out.includes(n)) out.push(n)
  return out
}

// ---------------------------------------------------------------- stat tiles

export interface Stats {
  prodHours: number
  hoursPerDay: number | null
  jobs: number
  /** share of the last 12 weeks' jobs that finished, 0..1; null with no jobs */
  finishedShare: number | null
  filament: number
  swaps: number
  overdue: number
  dueSoon: number
  held: number
}

export function stats(ov: MaintOverview | null, weeks: JobsWeek[] | null): Stats {
  const m = ov?.meters.machine
  const n = (weeks ?? []).reduce((a, w) => ({ c: a.c + w.completed, all: a.all + w.completed + w.cancelled + w.error }), { c: 0, all: 0 })
  return {
    prodHours: meter(m, 'prod_h'),
    hoursPerDay: perDay(m, 'prod_h'),
    jobs: meter(m, 'jobs'),
    finishedShare: n.all ? n.c / n.all : null,
    filament: meter(m, 'filament_m'),
    swaps: meter(m, 'swaps'),
    overdue: ov?.counts.overdue ?? 0,
    dueSoon: ov?.counts.due_soon ?? 0,
    held: ov?.counts.held ?? 0,
  }
}

// ---------------------------------------------------------------- toolheads

/** Time each tool has been mounted, split into producing (solid) and not (dots). */
export function hoursByTool(ov: MaintOverview | null, names: string[]): BarRow[] {
  return names.map((name) => {
    const rows = ov?.meters.tools[name]
    const mounted = meter(rows, 'mounted_h')
    const prod = Math.min(mounted || Infinity, meter(rows, 'prod_h'))
    const p = Number.isFinite(prod) ? prod : 0
    return {
      label: name,
      parts: [
        { v: p, name: 'Producing', fill: 'ink' },
        { v: Math.max(0, mounted - p), name: 'Mounted, not producing', fill: 'dither' },
      ],
      total: Math.max(mounted, p),
    }
  })
}

/** Finished jobs per tool, with each tool's share. */
export function jobsByTool(ov: MaintOverview | null, names: string[]): BarRow[] {
  const counts = names.map((n) => meter(ov?.meters.tools[n], 'jobs'))
  const sum = counts.reduce((a, b) => a + b, 0)
  return names.map((label, i) => ({
    label,
    parts: [{ v: counts[i]!, name: 'Jobs', fill: 'ink' }],
    total: counts[i]!,
    note: `${fmtCount(counts[i]!)} · ${sum ? Math.round((counts[i]! / sum) * 100) : 0}%`,
  }))
}

export interface ToolGlance {
  name: string
  jobs: number
  prodHours: number
  mounts: number
  care: AssetCare
}

export function toolGlance(ov: MaintOverview | null, names: string[]): ToolGlance[] {
  return names.map((name) => {
    const rows = ov?.meters.tools[name]
    return { name, jobs: meter(rows, 'jobs'), prodHours: meter(rows, 'prod_h'), mounts: meter(rows, 'mounts'), care: assetCare(ov, toolAsset(name), name) }
  })
}

// ---------------------------------------------------------------- tasks

const STATE_ORDER: Attention[] = ['overdue', 'held', 'due_soon', 'snoozed', 'ok']
export const STATE_FILL: Record<string, Fill> = { overdue: 'ink', held: 'hatch', due_soon: 'dense', snoozed: 'faint', ok: 'dither' }

function stateLabel(ov: MaintOverview | null, a: Attention): string {
  const builtin: Record<string, string> = { overdue: 'Overdue', due_soon: 'Due soon', snoozed: 'Snoozed', ok: 'Scheduled', held: 'On hold' }
  const def = ov?.statuses?.find((s) => s.id === a)
  return def?.label ?? builtin[a] ?? a
}

const activeTasks = (ov: MaintOverview | null) => (ov?.tasks ?? []).filter((t) => attentionOf(t) !== 'off')

export interface StatusGroup {
  key: Attention
  label: string
  count: number
  fill: Fill
}

/** Active tasks by state, worst first; tasks on hold are grouped by their status ("Waiting on parts"). */
export function taskStatus(ov: MaintOverview | null): StatusGroup[] {
  const groups = new Map<string, StatusGroup>()
  for (const t of activeTasks(ov)) {
    const a = attentionOf(t)
    const id = a === 'held' ? `held:${t.status?.hold?.label ?? ''}` : a
    const label = a === 'held' ? (t.status?.hold?.label ?? stateLabel(ov, a)) : stateLabel(ov, a)
    const g = groups.get(id) ?? { key: a, label, count: 0, fill: STATE_FILL[a] ?? 'dither' }
    g.count++
    groups.set(id, g)
  }
  return [...groups.values()].sort((x, y) => STATE_ORDER.indexOf(x.key) - STATE_ORDER.indexOf(y.key))
}

/** The most urgent tasks: overdue, on hold, due soon, snoozed, then the furthest through their interval. */
export function nextUp(ov: MaintOverview | null, limit = 6): MaintTask[] {
  return activeTasks(ov)
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(attentionOf(a)) - STATE_ORDER.indexOf(attentionOf(b)) ||
        (b.status?.fraction ?? 0) - (a.status?.fraction ?? 0),
    )
    .slice(0, limit)
}

/** How many tasks the machine (all its areas together) and each tool or piece of hardware has, by state. */
export function tasksByAsset(ov: MaintOverview | null): BarRow[] {
  const tasks = activeTasks(ov)
  const key = (t: MaintTask) => (t.asset.startsWith('machine') ? 'machine' : t.asset)
  const assets = [...new Set(tasks.map(key))].sort((a, b) => (a === 'machine' ? -1 : b === 'machine' ? 1 : 0))
  return assets.map((asset) => {
    const list = tasks.filter((t) => key(t) === asset)
    const label = asset === 'machine' ? 'Machine' : asset.startsWith('tool:') ? asset.slice(5) : (list[0]?.asset_label ?? asset)
    const parts = STATE_ORDER.map((a) => ({ v: list.filter((t) => attentionOf(t) === a).length, name: stateLabel(ov, a), fill: STATE_FILL[a]! }))
    return { label, parts, total: list.length }
  })
}

// ---------------------------------------------------------------- weeks

/** The 12 Monday-based weeks the Portal reports on, oldest first. */
export function weekStarts(weeks: JobsWeek[] | null, now = Date.now()): number[] {
  if (weeks?.length) return weeks.map((w) => w.start)
  const d = new Date(now)
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime() / 1000
  return Array.from({ length: 12 }, (_, i) => monday - WEEK * (11 - i))
}

export function jobsWeekly(weeks: JobsWeek[]): Column[] {
  return weeks.map((w) => ({
    label: weekLabel(w.start),
    start: w.start,
    parts: [
      { v: w.completed, name: 'Finished', fill: 'ink' },
      { v: w.cancelled, name: 'Cancelled', fill: 'dither' },
      { v: w.error, name: 'Failed', fill: 'hatch' },
    ],
  }))
}

/** Maintenance logged per week from the work log: done (solid) and skipped (dots). */
export function workWeekly(records: HistoryRecord[], starts: number[]): Column[] {
  const cols = starts.map((start) => ({ start, done: 0, skipped: 0 }))
  for (const r of records) {
    if (!starts.length || r.at < starts[0]!) continue
    const c = cols[Math.min(cols.length - 1, Math.floor((r.at - starts[0]!) / WEEK))]!
    if (r.action === 'done') c.done++
    else if (r.action === 'skip' || r.action === 'skipped') c.skipped++
  }
  return cols.map((c) => ({
    label: weekLabel(c.start),
    start: c.start,
    parts: [
      { v: c.done, name: 'Done', fill: 'ink' },
      { v: c.skipped, name: 'Skipped', fill: 'dither' },
    ],
  }))
}

/** A round number at or above v, for chart axes (1, 2, 5 × 10ⁿ). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 5, 10].map((m) => m * p).find((x) => x >= v) ?? 10 * p
}
