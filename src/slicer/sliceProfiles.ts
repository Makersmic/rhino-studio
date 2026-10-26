/**
 * Slice profiles (Phase 1, Tool Manager 1.8): types and the pure logic behind
 * Prepare's profile picker. Design: Toolhead_Manager docs/phase1-slice-profiles.md.
 *
 * - A profile holds one engine's own settings (Kiri: this app's FdmSettings,
 *   LaserSettings, KnifeSettings, CncSettings; PrusaSlicer: the INI options
 *   changed). No translating between engines.
 * - Built-in profiles are the defaults in profiles.ts; they aren't saved.
 * - A saved job is a profile plus only the settings that differ from it.
 * - The browser holds nothing durable: profiles and jobs live on the Rhino.
 */
import type { CncSettings, FdmSettings, KnifeSettings, LaserSettings, PrepareJob, Process } from './types'
import { DEFAULT_CNC, DEFAULT_FDM, DEFAULT_KNIFE, DEFAULT_LASER } from './profiles'

export type Engine = 'kiri' | 'prusa'
export type ProcessSettings = FdmSettings | LaserSettings | KnifeSettings | CncSettings
export type AnySettings = Record<string, unknown>

export interface ProfileDraft {
  name: string
  engine: Engine
  process: Process
  /** null: any toolhead of this process */
  toolhead: string | null
  material: string | null
  settings: AnySettings
  notes: string
}

export interface SliceProfile extends ProfileDraft {
  id: string
  header: Record<string, number | string | boolean>
  created: number
  updated: number
  rev: number
}

export interface ProfileList {
  ok: boolean
  error?: string
  profiles: (Omit<SliceProfile, 'settings'> & { settings?: AnySettings })[]
  deleted?: { id: string; name: string; engine: Engine; process: Process; deleted_at: number }[]
}

export interface SavedJob {
  /** a saved profile's id, or builtin:<process> */
  profileId: string | null
  profileRev: number | null
  process: Process
  engine: Engine
  toolhead: string | null
  material: string | null
  /** only the settings that differ from the profile */
  overrides: AnySettings
  placement: { x: number; y: number; rotate: number; scale: number }
  saved?: number
}

export const BUILTIN_PREFIX = 'builtin:'
export const builtinId = (process: Process, engine: Engine = 'kiri') => `${BUILTIN_PREFIX}${engine === 'prusa' ? 'prusa' : process}`
export const isBuiltin = (id: string | null | undefined) => !!id && id.startsWith(BUILTIN_PREFIX)

/** The defaults in code, as read-only profiles (Prusa: PrusaSlicer's own defaults, no options changed) */
export function builtinProfile(process: Process, engine: Engine = 'kiri'): SliceProfile {
  const settings = defaultsFor(process, engine)
  const names: Record<Process, string> = { fdm: '3D print', laser: 'Laser', dragknife: 'Drag knife', cnc: 'CNC' }
  return {
    id: builtinId(process, engine),
    name: engine === 'prusa' ? 'PrusaSlicer defaults' : `Built in · ${names[process]}`,
    engine,
    process,
    toolhead: null,
    material: null,
    settings,
    notes: '',
    header: {},
    created: 0,
    updated: 0,
    rev: 0,
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Where a process keeps its settings in a PrepareJob */
export const SETTINGS_KEY = { fdm: 'fdm', laser: 'laser', dragknife: 'knife', cnc: 'cnc' } as const satisfies Record<Process, keyof PrepareJob>
const DEFAULTS: Record<Process, object> = { fdm: DEFAULT_FDM, laser: DEFAULT_LASER, dragknife: DEFAULT_KNIFE, cnc: DEFAULT_CNC }
export const defaultsFor = (process: Process, engine: Engine): AnySettings => (engine === 'prusa' ? {} : clone(DEFAULTS[process] as AnySettings))
export const engineOf = (j: Pick<PrepareJob, 'process' | 'engine'>): Engine => (j.process === 'fdm' && j.engine === 'prusa' ? 'prusa' : 'kiri')
/** The settings a job is using now, in its engine's own shape */
export function jobSettings(j: PrepareJob): AnySettings {
  return engineOf(j) === 'prusa' ? clone(j.prusa ?? {}) : clone(j[SETTINGS_KEY[j.process]] as unknown as AnySettings)
}
export function setJobSettings(j: PrepareJob, s: AnySettings): void {
  if (engineOf(j) === 'prusa') j.prusa = clone(s) as Record<string, string>
  else (j as unknown as Record<string, AnySettings>)[SETTINGS_KEY[j.process]] = clone(s)
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Which profiles Prepare offers: this process and engine; a profile tied to a
 * toolhead only for that toolhead; one tied to a material first when it matches.
 * Order: built-in, then matching material, then the rest, each by name.
 */
export function profilesFor<P extends Pick<SliceProfile, 'id' | 'name' | 'engine' | 'process' | 'toolhead' | 'material'>>(
  all: P[],
  q: { process: Process; engine: Engine; toolhead: string | null; material: string | null },
): P[] {
  const fit = all.filter((p) => p.process === q.process && p.engine === q.engine && (!p.toolhead || p.toolhead === q.toolhead))
  const rank = (p: P) => (isBuiltin(p.id) ? 0 : p.material && p.material === q.material ? 1 : p.material ? 3 : 2)
  return fit.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** The settings that differ from the profile (keys missing from the profile count as changed) */
export function diffSettings(profile: AnySettings, current: AnySettings): AnySettings {
  const out: AnySettings = {}
  for (const [k, v] of Object.entries(current)) if (!same(profile[k], v)) out[k] = clone(v)
  return out
}

/** Profile settings with the job's overrides on top, filled from the defaults for anything missing */
export function applyProfile(defaults: AnySettings, profile: AnySettings, overrides: AnySettings): AnySettings {
  return { ...clone(defaults), ...clone(profile), ...clone(overrides) }
}

export type ProfileStatus =
  | { kind: 'saved' } // on the Rhino, nothing changed
  | { kind: 'changed'; count: number } // edited since the profile
  | { kind: 'builtin'; count: number } // the defaults, maybe changed
  | { kind: 'stale'; from: number; to: number } // the profile moved on since this job was saved
  | { kind: 'offline' } // no Portal: edits slice, but can't be saved

export function profileStatus(a: { online: boolean; builtin: boolean; overrides: number; jobRev: number | null; profileRev: number | null }): ProfileStatus {
  if (!a.online) return { kind: 'offline' }
  if (a.builtin) return { kind: 'builtin', count: a.overrides }
  if (a.jobRev != null && a.profileRev != null && a.jobRev < a.profileRev) return { kind: 'stale', from: a.jobRev, to: a.profileRev }
  return a.overrides ? { kind: 'changed', count: a.overrides } : { kind: 'saved' }
}

export function statusText(s: ProfileStatus): string {
  switch (s.kind) {
    case 'saved':
      return 'Saved on the Rhino'
    case 'changed':
      return `Changed: ${s.count} setting${s.count === 1 ? '' : 's'}`
    case 'builtin':
      return s.count ? `Built-in defaults, ${s.count} changed` : 'Built-in defaults'
    case 'stale':
      return `This profile changed since this file was set up (revision ${s.from} → ${s.to})`
    case 'offline':
      return 'Not on the Rhino yet: these settings slice, but can’t be saved until it’s connected'
  }
}

// ---- the one-time import of browser jobs (rs.prepare.jobs) ------------------

export const OLD_JOBS_KEY = 'rs.prepare.jobs'
export const IMPORT_DONE_KEY = 'rs.prepare.imported'

export interface ImportPlan {
  /** one profile per distinct set of settings */
  profiles: (ProfileDraft & { key: string })[]
  /** each file's job, pointing at its profile by key */
  jobs: { file: string; profileKey: string; job: Omit<SavedJob, 'profileId' | 'profileRev'> }[]
}

/**
 * Turn the browser's saved jobs into profiles and jobs for the Rhino.
 * Each distinct set of settings (per process and engine) becomes one profile,
 * named after the first file that used it; jobs point at those with no overrides.
 */
export function planImport(old: Record<string, PrepareJob>, when: Date): ImportPlan {
  const plan: ImportPlan = { profiles: [], jobs: [] }
  const byKey = new Map<string, ProfileDraft & { key: string }>()
  const day = when.toISOString().slice(0, 10)
  for (const [file, j] of Object.entries(old)) {
    if (!j || typeof j !== 'object' || !j.process) continue
    const engine: Engine = j.process === 'fdm' && j.engine === 'prusa' ? 'prusa' : 'kiri'
    const settings: AnySettings = engine === 'prusa' ? clone(j.prusa ?? {}) : clone((j as unknown as Record<string, AnySettings>)[SETTINGS_KEY[j.process]] ?? {})
    const key = `${j.process}|${engine}|${JSON.stringify(settings)}`
    let p = byKey.get(key)
    if (!p) {
      const base = file.replace(/\.[^.]+$/, '').slice(0, 30)
      p = { key, name: `Imported ${day} ${base}`.slice(0, 60), engine, process: j.process, toolhead: null, material: j.material || null, settings, notes: `From the browser's saved settings for ${file}.` }
      byKey.set(key, p)
      plan.profiles.push(p)
    }
    plan.jobs.push({
      file,
      profileKey: key,
      job: {
        process: j.process,
        engine,
        toolhead: j.toolhead || null,
        material: j.material || null,
        overrides: {},
        placement: j.placement ? { x: j.placement.x, y: j.placement.y, rotate: j.placement.rotate, scale: j.placement.scale } : { x: 0, y: 0, rotate: 0, scale: 1 },
      },
    })
  }
  return plan
}
