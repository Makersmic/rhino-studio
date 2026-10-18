/**
 * Software Studio runs on, from Moonraker's update manager, and the order to
 * update it in.
 *
 * Order (one pass, each service restarted once, Klipper last):
 *   1. system      OS packages first: everything else runs on them
 *   2. moonraker   Studio talks only to Moonraker; it restarts and Studio reconnects
 *   3. the rest    config repos, crowsnest, KlipperScreen ... (each restarts only its own service)
 *   4. klipper     last, so it restarts once with every config/macro repo already new
 *   5. web apps    Rhino Studio (once it is served from the Pi): files only, no restarts
 * Anything up to date, broken (not valid, dirty, detached) or left out (Mainsail,
 * Fluidd: Mike, 2026-10-18) is skipped. Moonraker refuses updates during a job;
 * so does Studio, before asking.
 */

export type UpdaterKind = 'system' | 'moonraker' | 'klipper' | 'web' | 'repo'

export interface Package {
  /** update_manager name */
  name: string
  label: string
  note?: string
  kind: UpdaterKind
  installed: string | null
  latest: string | null
  /** OS packages: how many can be upgraded */
  packageCount?: number
  needsUpdate: boolean
  /** Why it can't be updated from here (dirty repo, invalid...), or null */
  problem: string | null
}

/** Left out of the list and never updated from Studio */
export const EXCLUDED = new Set(['mainsail', 'fluidd'])

const LABELS: Record<string, [string, string?]> = {
  system: ['System packages', 'Operating system (apt)'],
  moonraker: ['Moonraker', 'Talks to Klipper for Studio'],
  klipper: ['Klipper', 'Firmware host'],
  crowsnest: ['Crowsnest', 'Cameras'],
  'rhino-studio': ['Rhino Studio', 'This app'],
  'mainsail-config': ['Mainsail client macros', 'Pause, resume and cancel base macros'],
  klipperscreen: ['KlipperScreen'],
  'klipper-backup': ['Klipper-Backup', 'Config backup to GitHub'],
  'moonraker-timelapse': ['Moonraker timelapse'],
}

type Info = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

export function readPackages(versionInfo: Record<string, Info> | null | undefined): Package[] {
  const out: Package[] = []
  for (const [name, info] of Object.entries(versionInfo ?? {})) {
    if (EXCLUDED.has(name.toLowerCase())) continue
    const [label, note] = LABELS[name.toLowerCase()] ?? [name]
    if (name === 'system') {
      const n = Number(info.package_count ?? 0) || 0
      out.push({ name, label, note, kind: 'system', installed: null, latest: null, packageCount: n, needsUpdate: n > 0, problem: null })
      continue
    }
    const type = String(info.configured_type ?? info.type ?? '')
    const kind: UpdaterKind = name === 'moonraker' ? 'moonraker' : name === 'klipper' ? 'klipper' : type === 'web' || type === 'zip' ? 'web' : 'repo'
    const installed = str(info.version)
    const latest = str(info.remote_version)
    const behind = Number(info.commits_behind_count ?? (Array.isArray(info.commits_behind) ? info.commits_behind.length : 0)) || 0
    let problem: string | null = null
    if (info.is_valid === false) problem = 'Not a valid install; repair it on the Pi'
    else if (info.corrupt === true) problem = 'Repository is corrupt; recover it on the Pi'
    else if (info.is_dirty === true) problem = 'Has local changes; updating would overwrite them'
    else if (info.detached === true) problem = 'Detached from its branch'
    const differs = !!installed && !!latest && installed !== latest && latest !== '?'
    out.push({ name, label, note, kind, installed, latest, needsUpdate: !problem && (differs || behind > 0), problem })
  }
  const rank = (p: Package) => ORDER[p.kind]
  return out.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}

const ORDER: Record<UpdaterKind, number> = { system: 0, moonraker: 1, repo: 2, klipper: 3, web: 4 }

/** The names to update, in order. `only` limits it to one package. */
export function updatePlan(pkgs: Package[], only?: string): Package[] {
  return pkgs.filter((p) => p.needsUpdate && (!only || p.name === only)).sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

/** What each step restarts, for the confirmation. */
export function restartsOf(p: Package): string {
  switch (p.kind) {
    case 'system': return 'may restart services that use updated libraries'
    case 'moonraker': return 'restarts Moonraker: Studio reconnects by itself'
    case 'klipper': return 'restarts Klipper: heaters and tool outputs go off, confirm the toolhead again'
    case 'web': return 'replaces the app files; reload the page afterwards'
    default: return 'restarts its own service'
  }
}

/** Why updating can't start now, or null. */
export function updateBlock(s: { online: boolean; jobActive: boolean; busy: boolean; running: boolean }): string | null {
  if (!s.online) return 'Not connected to the machine'
  if (s.jobActive) return 'Not while a job is running'
  if (s.running) return 'An update is already running'
  if (s.busy) return 'Moonraker is busy with another update'
  return null
}

/** The legacy method for one package (Moonraker API before 1.5, no machine.update.upgrade). */
export function legacyUpgrade(p: Pick<Package, 'name' | 'kind'>): { method: string; params?: Record<string, unknown> } {
  if (p.kind === 'system') return { method: 'machine.update.system' }
  if (p.kind === 'moonraker') return { method: 'machine.update.moonraker' }
  if (p.kind === 'klipper') return { method: 'machine.update.klipper' }
  return { method: 'machine.update.client', params: { name: p.name } }
}

/** Compare dotted versions ("1.4.6" vs "1.4.7"); true when b is newer. */
export function newer(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const pa = a.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  const pb = b.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d) return d > 0
  }
  return false
}
