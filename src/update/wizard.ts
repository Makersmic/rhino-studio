/**
 * The updating-safely wizard's plain logic (docs/proposal-update-wizard.md): the Before checklist, what to carry over a
 * reload (the install restarts the Portal and Studio reloads itself), and the before/after comparison. No Vue, no network.
 */
import { cmpVersion } from '@/system/zipUpdate'
import type { HealthItem, HealthLevel } from '@/system/healthCheck'

export interface BeforeInput {
  online: boolean
  installed: string | null
  latest: { version?: string; notes_url?: string; error?: string } | null
  helper: boolean
  busy: boolean
  jobState: string | null
  /** free space on the system disk, bytes, or null if unknown */
  freeBytes: number | null
  /** when the newest backup finished (seconds since 1970), or null */
  lastBackup: number | null
  now: number
}

const GB = 1024 ** 3
const bytesWord = (n: number) => (n >= GB ? `${(n / GB).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`)

/** "3 hours ago", "2 days ago". */
export function ago(thenSec: number, nowSec: number): string {
  const s = Math.max(0, nowSec - thenSec)
  if (s < 90) return 'just now'
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`
  if (s < 36 * 3600) return `${Math.round(s / 3600)} hours ago`
  return `${Math.round(s / 86400)} days ago`
}

/** The Before step: what is true now, and whether an update can start. `ready` is false when anything says Fix. */
export function beforeChecks(i: BeforeInput): { items: HealthItem[]; ready: boolean; newer: boolean } {
  const items: HealthItem[] = []
  const add = (level: HealthLevel, what: string, detail = '') => items.push({ section: 'Before', level, what, detail })
  let newer = false
  if (!i.online) add('FAIL', 'Studio can\'t reach the Rhino Portal', 'The update runs through the Portal. Run the Health check, or check the connection first.')
  if (i.installed && i.latest?.version) {
    newer = cmpVersion(i.latest.version, i.installed) > 0
    if (newer) add('PASS', `Version ${i.latest.version} is available (you have ${i.installed})`)
    else add('PASS', `You have ${i.installed}, the newest release`, 'Nothing to install. You can still check or repair from Settings > Software.')
  } else if (i.latest?.error) add('WARN', 'GitHub can\'t be asked right now', i.latest.error)
  else if (i.online) add('WARN', 'The newest release isn\'t known yet', 'Open Settings > Software and check for updates first.')
  if (i.online && !i.helper) add('FAIL', 'The updater isn\'t installed on this Rhino', 'Install a release zip once by hand (rhino.sh option 3). After that Studio installs the next ones.')
  if (i.busy) add('FAIL', 'An install is already running', 'Wait for it to finish.')
  if (i.jobState === 'printing' || i.jobState === 'paused') add('FAIL', 'A job is running', 'The update restarts the Portal and Klipper. Finish or cancel the job first.')
  else if (i.jobState) add('PASS', 'No job is running')
  if (i.freeBytes != null) {
    if (i.freeBytes < 1 * GB) add('FAIL', `Only ${bytesWord(i.freeBytes)} free on the system disk`, 'Free some space first: the install keeps a backup of the config and the old release.')
    else if (i.freeBytes < 3 * GB) add('WARN', `${bytesWord(i.freeBytes)} free on the system disk`, 'Enough, but not much.')
    else add('PASS', `${bytesWord(i.freeBytes)} free on the system disk`)
  }
  if (i.lastBackup == null) add('INFO', 'No backup has been made yet', 'The next step makes one.')
  else add('INFO', `The last backup was ${ago(i.lastBackup, i.now)}`, 'The next step makes a fresh one.')
  return { items, ready: !items.some((x) => x.level === 'FAIL') && newer, newer }
}

/** What survives the reload after an install (kept in the browser's session storage; the wizard works without it). */
export interface Resume {
  from: string
  to: string
  backup: string | null
  before: { fix: number; look: number } | null
  at: number
}
export const RESUME_KEY = 'rhino.updateWizard'
export function saveResume(store: Pick<Storage, 'setItem'> | undefined, r: Resume) {
  try {
    store?.setItem(RESUME_KEY, JSON.stringify(r))
  } catch {
    /* private window: the wizard still works, it just won't reopen at the check by itself */
  }
}
export function loadResume(store: Pick<Storage, 'getItem'> | undefined, installed: string | null, now: number): Resume | null {
  try {
    const raw = store?.getItem(RESUME_KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as Resume
    if (!r || typeof r.to !== 'string' || typeof r.at !== 'number' || now - r.at > 3 * 3600) return null
    return installed === r.to ? r : null
  } catch {
    return null
  }
}
export function clearResume(store: Pick<Storage, 'removeItem'> | undefined) {
  try {
    store?.removeItem(RESUME_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** The Check step: version before and after, and the health counts either side. */
export function compare(r: Resume | null, installed: string | null, counts: { FAIL: number; WARN: number } | null): { text: string; tone: 'ok' | 'warn' | 'danger' } {
  if (!r) return { text: 'Run the check to see how the Rhino looks now.', tone: 'ok' }
  const gone = installed !== r.to
  if (gone) return { text: `The Rhino reports ${installed ?? 'no version'}, not ${r.to}. The install may not have finished: look at Settings > Software, and see "If something is wrong".`, tone: 'danger' }
  if (!counts) return { text: `Updated from ${r.from} to ${r.to}. Run the check below.`, tone: 'ok' }
  const b = r.before
  const worse = b ? counts.FAIL > b.fix || (counts.FAIL === b.fix && counts.WARN > b.look) : counts.FAIL > 0
  const same = b ? `Before: ${b.fix} to fix, ${b.look} to look at. Now: ${counts.FAIL} to fix, ${counts.WARN} to look at.` : `Now: ${counts.FAIL} to fix, ${counts.WARN} to look at.`
  if (counts.FAIL > 0 && worse) return { text: `Updated to ${r.to}, but something needs fixing that didn't before. ${same}`, tone: 'danger' }
  if (worse) return { text: `Updated to ${r.to}. ${same}`, tone: 'warn' }
  return { text: `Updated from ${r.from} to ${r.to}. ${same}`, tone: counts.FAIL ? 'warn' : 'ok' }
}
