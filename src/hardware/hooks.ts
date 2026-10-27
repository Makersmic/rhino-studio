/**
 * Job hooks (Tool Manager 1.9+): G-code lines Klipper runs at seven moments of every job, for the whole machine,
 * a kind of tool or one tool. The Portal owns every rule (no axis moves before the job starts, only macros and
 * commands that exist, heaters under their limit, at most 20 lines) and writes them into job_hooks.cfg as
 * _RHINO_HOOKS, which START_JOB, END_PRINT, cancel, pause and resume call. This module only shapes the editor.
 */

export type Slot = 'before_start' | 'after_start' | 'before_end' | 'after_end' | 'on_cancel' | 'on_pause' | 'on_resume'
/** scope ("machine", "category:subtractive", "tool:HotJoe") -> slot -> lines */
export type Hooks = Record<string, Partial<Record<Slot, string[]>>>

export interface HooksState {
  ok: boolean
  rev: number
  hooks: Hooks
  warnings: string[]
  slots: Slot[]
  scopes: { id: string; label: string }[]
  macro?: string
  live?: boolean
}

export const SLOT_LABEL: Record<Slot, string> = {
  before_start: 'Before the job starts',
  after_start: 'When the job starts',
  before_end: 'Before the job ends',
  after_end: 'After the job ends',
  on_cancel: 'If it is cancelled',
  on_pause: 'When it pauses',
  on_resume: 'When it resumes',
}

export const SLOT_HELP: Record<Slot, string> = {
  before_start: 'After the tool and material check, before homing or heating. Nothing may move here.',
  after_start: 'Just before the file runs: switch on what the job needs (dust collection, air, a light).',
  before_end: 'Before END_PRINT parks and switches the tool off.',
  after_end: 'Once the job is over: switch off what you switched on.',
  on_cancel: 'Runs on cancel. Anything a start hook switched on is also switched off here by itself.',
  on_pause: 'When the job pauses (button, filament runout, an open interlock).',
  on_resume: 'Before the job carries on after a pause.',
}

export const MAX_LINES = 20

/** A textarea's text -> lines: trimmed, blank lines dropped. */
export function linesOf(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

/** Set one scope's slot, dropping empty slots and scopes, so an unchanged editor compares equal. */
export function setSlot(hooks: Hooks, scope: string, slot: Slot, lines: string[]): Hooks {
  const out: Hooks = JSON.parse(JSON.stringify(hooks))
  const s = { ...(out[scope] ?? {}) }
  if (lines.length) s[slot] = lines
  else delete s[slot]
  if (Object.keys(s).length) out[scope] = s
  else delete out[scope]
  return out
}

/** Lines in one scope, for the scope list's counts. */
export function lineCount(hooks: Hooks, scope: string): number {
  return Object.values(hooks[scope] ?? {}).reduce((n, l) => n + (l?.length ?? 0), 0)
}

/** Same hooks, ignoring key order. */
export function sameHooks(a: Hooks, b: Hooks): boolean {
  const norm = (h: Hooks) =>
    JSON.stringify(Object.keys(h).sort().map((k) => [k, Object.keys(h[k]!).sort().map((s) => [s, h[k]![s as Slot]])]))
  return norm(a) === norm(b)
}

/** Scopes in the order the editor lists them, each with its line count; a scope saved for a tool that's gone is kept and flagged. */
export function scopeList(state: Pick<HooksState, 'scopes'>, hooks: Hooks): { id: string; label: string; count: number; gone: boolean }[] {
  const known = state.scopes.map((s) => ({ ...s, count: lineCount(hooks, s.id), gone: false }))
  const gone = Object.keys(hooks)
    .filter((k) => !state.scopes.some((s) => s.id === k))
    .map((id) => ({ id, label: `${id.replace(/^tool:/, '')} (no longer a tool)`, count: lineCount(hooks, id), gone: true }))
  return [...known, ...gone]
}
