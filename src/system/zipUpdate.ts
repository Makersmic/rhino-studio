/**
 * Installing a Tool Manager release zip from Studio (Tool Manager 1.5.3+).
 * Pure helpers for Settings > Software's "Install from zip": what each step
 * shows, which zip "Go back" uses, and whether a new zip is older.
 *
 * The Portal only keeps the zip and drops a request; a root-owned updater on
 * the Rhino does the install (Tool Manager scripts/rhino_update_helper.py),
 * so the Portal restarts mid-install and Studio keeps polling through it.
 */
import type { UpdateRun, UpdateState } from '@/portal/client'

export const ZIP_NAME = /^rhino-config-\d+\.\d+\.\d+\.zip$/

/**
 * The two files a release is installed from (Tool Manager 1.9.29): the zip and its `.sig`, the ed25519 signature the
 * release workflow made with Mike's key. The updater refuses a zip without a signature that checks out, so a zip
 * someone else made can't be installed from Studio. `have` is what was dropped before; files replace by kind.
 */
export type ReleasePair = { zip: File | null; sig: File | null }
export function pairFiles(files: ArrayLike<File>, have: ReleasePair = { zip: null, sig: null }): { pair: ReleasePair; problem: string | null } {
  const pair = { ...have }
  const odd: string[] = []
  for (const f of Array.from(files)) {
    if (/\.zip$/i.test(f.name)) pair.zip = f
    else if (/\.zip\.sig$/i.test(f.name)) pair.sig = f
    else odd.push(f.name)
  }
  if (odd.length) return { pair, problem: `${odd.join(', ')} isn't a release zip or its .sig file. Both come from the release on GitHub.` }
  if (pair.zip && pair.sig && pair.sig.name.toLowerCase() !== `${pair.zip.name.toLowerCase()}.sig`)
    return { pair, problem: `${pair.sig.name} doesn't belong to ${pair.zip.name}: the signature is named <zip>.sig.` }
  return { pair, problem: null }
}
/** What the drop area should ask for next, or null when both files are there. */
export function pairMissing(p: ReleasePair): string | null {
  if (p.zip && p.sig) return null
  if (p.zip) return `Now drop ${p.zip.name}.sig, the signature next to the zip on the GitHub release.`
  if (p.sig) return `Now drop ${p.sig.name.replace(/\.sig$/i, '')}, the zip that signature belongs to.`
  return null
}

export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

export type StepMark = 'done' | 'now' | 'todo' | 'failed'

/** Each step with its mark, from the updater's status. */
export function stepMarks(run: UpdateRun): { name: string; mark: StepMark }[] {
  const steps = run.steps ?? []
  const at = run.step ?? -1
  return steps.map((name, i) => ({
    name,
    mark:
      run.state === 'done' ? 'done'
      : i < at ? 'done'
      : i === at ? (run.state === 'failed' ? 'failed' : 'now')
      : 'todo',
  }))
}

/** The kept zip for the newest version older than the installed one, if any (only one with its signature, 1.9.29+). */
export function goBackZip(s: Pick<UpdateState, 'installed' | 'zips'>): { zip: string; version: string } | null {
  const older = s.zips.filter((z) => z.signed !== false && cmpVersion(z.version, s.installed) < 0).sort((a, b) => cmpVersion(b.version, a.version))
  return older[0] ?? null
}

/** A line about an uploaded zip against what's installed. */
export function compareText(version: string, installed: string): string {
  const c = cmpVersion(version, installed)
  if (c > 0) return `Version ${version}, newer than the ${installed} installed.`
  if (c === 0) return `Version ${version}, the same as installed: installing it again repairs a broken install.`
  return `Version ${version} is older than the ${installed} installed: installing it goes back.`
}

/** Why Install can't run now, or null. */
export function installBlock(o: { helper: boolean; busy: boolean; jobState: string | null; portalOnline: boolean }): string | null {
  if (!o.portalOnline) return "Can't reach the Rhino Portal"
  if (!o.helper) return 'The updater comes with Tool Manager 1.5.3: install that zip once by hand (rhino.sh option 3). After that, Studio installs the next ones'
  if (o.busy) return 'An install is running'
  if (o.jobState === 'printing' || o.jobState === 'paused') return 'A job is running: finish or cancel it first'
  return null
}
