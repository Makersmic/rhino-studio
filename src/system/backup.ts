/**
 * Settings / Host / Backups (Tool Manager 1.7): the words the Backups panel shows.
 * The Portal does the work (rhino/backup.py); this only decides what to say and
 * when a button is off. Kept here so the rules are tested (backup.test.ts).
 *
 * INV-B8: Studio never calls a GitHub copy done unless the last push really worked.
 */
import type { BackupArchive, BackupState, RestorePlan } from '@/portal/client'

/** "3 min ago", "2 days ago", "Oct 4" */
export function ago(t: number | null | undefined, now = Date.now() / 1000): string {
  if (!t) return 'never'
  const s = Math.max(0, now - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ago`
  if (s < 30 * 86400) return `${Math.round(s / 86400)} days ago`
  return new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function size(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** The details line under an archive's name: date · size · why it was made */
export function archiveLine(a: BackupArchive): string {
  const when = new Date(a.time * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const parts = [when, size(a.size)]
  if (a.reason) parts.push(a.reason.replace(/_/g, ' '))
  if (a.host) parts.push(a.host)
  if (!a.complete) parts.push('not readable')
  return parts.join(' · ')
}

/** The newest complete archive, or null */
export function lastGood(s: BackupState | null): BackupArchive | null {
  return s?.archives.find((a) => a.complete) ?? null
}

/** The headline: how old the last backup is. Older than 30 days reads as a warning. */
export function headline(s: BackupState | null, now = Date.now() / 1000): { text: string; tone: 'ok' | 'warn' } {
  const a = lastGood(s)
  if (!a) return { text: 'No backup on this Rhino yet', tone: 'warn' }
  const old = now - a.time > 30 * 86400
  return { text: `Last backup ${ago(a.time, now)}`, tone: old ? 'warn' : 'ok' }
}

/** klipper-backup's GitHub copy, said plainly (INV-B8). */
export function githubLine(s: BackupState | null, now?: number): { text: string; bad: boolean } {
  const g = s?.github
  if (!g) return { text: '', bad: false }
  if (g.running) return { text: 'GitHub copy: pushing now…', bad: false }
  switch (g.state) {
    case 'not_installed':
      return { text: 'GitHub copy: klipper-backup isn’t installed, so there’s no copy off this Rhino.', bad: true }
    case 'no_env':
      return { text: 'GitHub copy: klipper-backup is installed but not set up (no .env).', bad: true }
    case 'never':
      return { text: 'GitHub copy: not pushed from here yet.', bad: false }
    case 'ok':
      return { text: `GitHub copy: pushed ${ago(g.last?.time, now)}.`, bad: false }
    default:
      return { text: `GitHub copy: the last push failed ${ago(g.last?.time, now)}${g.last?.tail?.length ? ` (${g.last.tail[g.last.tail.length - 1]})` : ''}.`, bad: true }
  }
}

/** Why Back up now / Restore is off, or null. Moonraker refuses both during a job too. */
export function backupBlock(o: { online: boolean; jobState: string; portal: boolean }): string | null {
  if (!o.portal) return 'The Rhino Portal isn’t answering'
  if (!o.online) return 'Moonraker isn’t connected'
  if (o.jobState === 'printing' || o.jobState === 'paused') return 'Not during a job'
  return null
}

/** One line for each part of a restore plan, for the confirm step. */
export function planLines(p: RestorePlan): string[] {
  const out: string[] = []
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const ns = p.item === 'studio'
  if (p.replace.length) out.push(`${n(p.replace.length, ns ? 'setting goes' : 'file goes', ns ? 'settings go' : 'files go')} back to how the backup has it`)
  if (p.add.length) out.push(`${n(p.add.length, ns ? 'setting comes' : 'file comes', ns ? 'settings come' : 'files come')} back`)
  if (p.same.length) out.push(`${n(p.same.length, ns ? 'setting is' : 'file is', ns ? 'settings are' : 'files are')} already the same`)
  if (p.keep.length) out.push(`${n(p.keep.length, ns ? 'setting' : 'file', ns ? 'settings' : 'files')} made since ${p.keep.length === 1 ? 'stays' : 'stay'} as ${p.keep.length === 1 ? 'it is' : 'they are'}`)
  if (p.item === 'all') {
    if (p.history_jobs != null) out.push(`Moonraker's database comes back whole: job history (${p.history_jobs} jobs), Studio and Mainsail settings`)
    if (p.backup_version && p.installed_version && p.backup_version !== p.installed_version)
      out.push(`Made with Tool Manager ${p.backup_version}; ${p.installed_version} stays installed (its program files aren't touched)`)
  }
  if (!out.length) out.push('Nothing to change: this part of the backup matches what’s here')
  return out
}

/** A full restore stops before changing anything if the backup's board isn't connected here. */
export function serialProblem(p: RestorePlan | null): string | null {
  const m = p?.missing_serial ?? []
  if (!m.length) return null
  return `This backup's board isn't connected here (${m.map((x) => `[${x.section}] ${x.serial}`).join(', ')}), so a full restore won't run here. Restore items one by one instead.`
}
