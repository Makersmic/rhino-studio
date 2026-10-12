/**
 * Turns the Portal's maintenance overview into what Studio's screens show.
 * Pure functions, tested against a real overview from the Portal's own
 * year-of-use demo (scripts/fixtures/maint-overview.json).
 *
 * Rules match the Portal (service.py overview / due_items):
 * - A task needs attention when it is overdue or due soon and not snoozed.
 * - A task on hold (custom status like "Waiting on parts") is listed by its
 *   status's "list": 'due' keeps it in the due list, otherwise it's held.
 * - Nothing is ever blocked by maintenance. Studio informs; it doesn't refuse.
 */
import type { MaintOverview, MaintTask } from './types'

export type Attention = 'overdue' | 'due_soon' | 'held' | 'snoozed' | 'ok' | 'off'

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 }

export function attentionOf(t: MaintTask): Attention {
  const st = t.status
  if (!st || t.enabled === false || t.archived) return 'off'
  const hold = st.hold
  if (hold && hold.list !== 'due') return 'held'
  if (st.state === 'overdue' || st.state === 'due_soon') return st.snoozed ? 'snoozed' : (st.state as Attention)
  return 'ok'
}

/** Overdue first, then due soon; within each, higher priority, then further along. */
export function dueList(ov: MaintOverview | null): MaintTask[] {
  if (!ov) return []
  return ov.tasks
    .filter((t) => {
      const a = attentionOf(t)
      return a === 'overdue' || a === 'due_soon'
    })
    .sort(
      (a, b) =>
        (attentionOf(a) === 'overdue' ? 0 : 1) - (attentionOf(b) === 'overdue' ? 0 : 1) ||
        (PRIORITY_RANK[a.priority ?? 'normal'] ?? 2) - (PRIORITY_RANK[b.priority ?? 'normal'] ?? 2) ||
        (b.status?.fraction ?? 0) - (a.status?.fraction ?? 0),
    )
}

/** Scheduled tasks closest to coming due. */
export function upcomingList(ov: MaintOverview | null, limit = 8): MaintTask[] {
  if (!ov) return []
  return ov.tasks
    .filter((t) => attentionOf(t) === 'ok' && !t.status?.next?.event)
    .sort((a, b) => (b.status?.fraction ?? 0) - (a.status?.fraction ?? 0))
    .slice(0, limit)
}

export function heldList(ov: MaintOverview | null): MaintTask[] {
  return ov ? ov.tasks.filter((t) => attentionOf(t) === 'held' || attentionOf(t) === 'snoozed') : []
}

export interface AssetCare {
  asset: string
  label: string
  overdue: number
  dueSoon: number
  held: number
  total: number
  /** The most urgent task: due first, otherwise closest to due. */
  next: MaintTask | null
  /** 0..1, how far the most advanced task is through its interval. */
  worstFraction: number
  level: 'overdue' | 'due_soon' | 'ok' | 'none'
}

export function assetCare(ov: MaintOverview | null, asset: string, label = asset): AssetCare {
  const tasks = (ov?.tasks ?? []).filter((t) => t.asset === asset && attentionOf(t) !== 'off')
  const due = dueList(ov).filter((t) => t.asset === asset)
  const overdue = due.filter((t) => attentionOf(t) === 'overdue').length
  const dueSoon = due.length - overdue
  const held = tasks.filter((t) => attentionOf(t) === 'held').length
  const next = due[0] ?? upcomingList({ ...(ov as MaintOverview), tasks }, 1)[0] ?? null
  const worstFraction = Math.max(0, ...tasks.filter((t) => attentionOf(t) !== 'held').map((t) => t.status?.fraction ?? 0))
  return {
    asset,
    label: tasks[0]?.asset_label ?? label,
    overdue,
    dueSoon,
    held,
    total: tasks.length,
    next,
    worstFraction: Math.min(1, worstFraction),
    level: !tasks.length ? 'none' : overdue ? 'overdue' : dueSoon ? 'due_soon' : 'ok',
  }
}

export const toolAsset = (name: string) => `tool:${name}`

/** Machine areas (motion, frame, electronics...) in the Portal's order. */
export function machineAreas(ov: MaintOverview | null): AssetCare[] {
  if (!ov) return []
  return ov.areas.map((a) => assetCare(ov, `machine:${a.id}`, a.label)).filter((c) => c.total > 0)
}

/** "2 due soon", "1 overdue, 1 due soon", "Up to date". */
export function careText(c: Pick<AssetCare, 'overdue' | 'dueSoon' | 'total'>): string {
  if (!c.total) return 'No care tasks'
  const parts = [c.overdue && `${c.overdue} overdue`, c.dueSoon && `${c.dueSoon} due soon`].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Up to date'
}

/** Meter readings rounded for display: 1,148 h, 6,062 m, 492 jobs. */
export function fmtMeter(value: number, unit: string): string {
  const v = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${v.toLocaleString()}${unit ? ` ${unit}` : ''}`
}
