/**
 * Your macros: short routines built from a list of steps (Tool Manager 1.9.13, docs/phase-macro-builder.md).
 *
 * The Portal stores them (`/api/user-macros`, checked again there); Studio turns the steps into G-code when the button is
 * pressed. That script then goes through the console's own `check()` and confirm, so a macro can't do anything the
 * console wouldn't ask about first, and nothing here is a new no-confirm path. Klipper never loads these (Mike, Nov 7:
 * Studio-only), so editing one needs no restart.
 *
 * Building refuses, before anything is sent: a job running, the wrong or an unconfirmed toolhead, a move on an axis that
 * isn't homed (unless an earlier step homes it), a move past the machine's travel, a hotend target without a confirmed
 * print head, an unknown Klipper macro, and the never-from-a-button commands the Portal refuses too.
 */

export type MacroStep =
  | { kind: 'home'; axes: 'all' | 'xy' | 'z'; onlyIfNeeded: boolean }
  | { kind: 'moveTo'; x: number | null; y: number | null; z: number | null; speed: number }
  | { kind: 'moveBy'; dx: number | null; dy: number | null; dz: number | null; speed: number }
  | { kind: 'temp'; heater: 'hotend' | 'bed'; target: number; wait: boolean }
  | { kind: 'heatMaterial'; material: string; wait: boolean }
  | { kind: 'fan'; percent: number }
  | { kind: 'wait'; seconds: number }
  | { kind: 'macro'; name: string }
  | { kind: 'message'; text: string }
  | { kind: 'gcode'; line: string }

export type StepKind = MacroStep['kind']

export interface MacroDraft {
  name: string
  /** toolhead names it's for; empty means any (still needs a confirmed one) */
  toolheads: string[]
  steps: MacroStep[]
  notes: string
}
export interface UserMacro extends MacroDraft {
  id: string
  created: number
  updated: number
  rev: number
}

export const MAX_STEPS = 30
/** Never from a macro button, whatever the step: the same list the Portal refuses (rhino/user_macros.py NEVER) */
export const NEVER = ['M112', 'SAVE_CONFIG', 'FIRMWARE_RESTART', 'RESTART', 'SET_KINEMATIC_POSITION', 'FORCE_MOVE', 'SET_STEPPER_ENABLE'] as const
const NEVER_RE = new RegExp(`(?<![A-Za-z0-9_])(${NEVER.join('|')})(?![A-Za-z0-9_])`, 'i')
const HOTEND_MAX = 300
const BED_MAX = 130

/** What a step is called in the list, and a short line of its values for under it */
export const STEP_TITLES: Record<StepKind, string> = {
  home: 'Home',
  moveTo: 'Move to',
  moveBy: 'Move by',
  temp: 'Set temperature',
  heatMaterial: 'Heat for a material',
  fan: 'Part fan',
  wait: 'Wait',
  macro: 'Run a macro',
  message: 'Message',
  gcode: 'G-code line',
}

const n = (v: number) => String(Number(v.toFixed(3)))

export function stepSummary(s: MacroStep): string {
  switch (s.kind) {
    case 'home':
      return `${s.axes === 'all' ? 'All axes' : s.axes.toUpperCase()}${s.onlyIfNeeded ? ', only if not homed' : ''}`
    case 'moveTo':
    case 'moveBy': {
      const vals = s.kind === 'moveTo' ? [s.x, s.y, s.z] : [s.dx, s.dy, s.dz]
      const parts = vals
        .map((v, i) => [['X', 'Y', 'Z'][i]!, v] as const)
        .filter((e): e is readonly [string, number] => e[1] != null)
        .map(([k, v]) => `${k} ${s.kind === 'moveBy' && v > 0 ? '+' : ''}${n(v)}`)
      return `${parts.join(' · ')} mm at ${n(s.speed)} mm/s`
    }
    case 'temp':
      return `${s.heater === 'hotend' ? 'Hotend' : 'Bed'} ${n(s.target)}°${s.target === 0 ? ' (off)' : ''}${s.wait ? ', and wait' : ''}`
    case 'heatMaterial':
      return `${s.material || '(no material)'}: hotend and bed from the mounted toolhead’s table${s.wait ? ', and wait' : ''}`
    case 'fan':
      return s.percent === 0 ? 'Off' : `${n(s.percent)} %`
    case 'wait':
      return `${n(s.seconds)} s`
    case 'macro':
      return s.name
    case 'message':
      return `"${s.text}"`
    case 'gcode':
      return s.line
  }
}

/** A new step of a kind, with sensible starting values */
export function newStep(kind: StepKind): MacroStep {
  switch (kind) {
    case 'home':
      return { kind, axes: 'all', onlyIfNeeded: true }
    case 'moveTo':
      return { kind, x: null, y: null, z: null, speed: 50 }
    case 'moveBy':
      return { kind, dx: null, dy: null, dz: 5, speed: 10 }
    case 'temp':
      return { kind, heater: 'hotend', target: 200, wait: false }
    case 'heatMaterial':
      return { kind, material: '', wait: true }
    case 'fan':
      return { kind, percent: 100 }
    case 'wait':
      return { kind, seconds: 5 }
    case 'macro':
      return { kind, name: '' }
    case 'message':
      return { kind, text: '' }
    case 'gcode':
      return { kind, line: '' }
  }
}

/** Why a step can't be saved as it is, or null: the same rules the Portal applies */
export function stepProblem(s: MacroStep): string | null {
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
  switch (s.kind) {
    case 'home':
      return null
    case 'moveTo':
    case 'moveBy': {
      const vals = s.kind === 'moveTo' ? [s.x, s.y, s.z] : [s.dx, s.dy, s.dz]
      const lim = s.kind === 'moveTo' ? 2000 : 1000
      if (vals.every((v) => v == null)) return 'Give at least one axis'
      if (vals.some((v) => v != null && !num(v, -lim, lim))) return `Positions from -${lim} to ${lim} mm`
      return num(s.speed, 1, 500) ? null : 'Speed from 1 to 500 mm/s'
    }
    case 'temp':
      return num(s.target, 0, s.heater === 'hotend' ? HOTEND_MAX : BED_MAX) ? null : `0 to ${s.heater === 'hotend' ? HOTEND_MAX : BED_MAX}°`
    case 'heatMaterial':
      return /^[A-Za-z0-9_.-]{1,40}$/.test(s.material) ? null : 'Pick a material'
    case 'fan':
      return num(s.percent, 0, 100) ? null : '0 to 100 %'
    case 'wait':
      return num(s.seconds, 0, 3600) ? null : '0 to 3600 seconds'
    case 'macro':
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(s.name)) return 'Pick one of Klipper’s macros'
      return NEVER_RE.test(s.name) ? `${s.name.toUpperCase()} can’t be run from a macro button` : null
    case 'message':
      return /^[^\x00-\x1f"\\]{1,120}$/.test(s.text) && s.text.trim() ? null : 'One line of up to 120 characters, without quotes'
    case 'gcode': {
      if (!/^[^\x00-\x1f]{1,200}$/.test(s.line) || !s.line.trim()) return 'One line of G-code, up to 200 characters'
      const m = NEVER_RE.exec(s.line)
      return m ? `${m[1]!.toUpperCase()} can’t be run from a macro button` : null
    }
  }
}

/** Why a whole macro can't be saved, or null */
export function macroProblem(m: MacroDraft): string | null {
  if (!m.name.trim() || m.name.length > 60) return 'Give it a name (up to 60 characters)'
  if (!m.steps.length) return 'Add at least one step'
  if (m.steps.length > MAX_STEPS) return `Up to ${MAX_STEPS} steps`
  for (const [i, s] of m.steps.entries()) {
    const p = stepProblem(s)
    if (p) return `Step ${i + 1} (${STEP_TITLES[s.kind]}): ${p}`
  }
  return null
}

// ---- building the G-code ----------------------------------------------------------------------------------------

export interface RunContext {
  jobActive: boolean
  /** the mounted toolhead (Klipper's), and whether it's confirmed */
  tool: string | null
  toolConfirmed: boolean
  /** a confirmed print head is mounted: the hotend may be set above 0 */
  printHead: boolean
  /** toolhead.homed_axes, e.g. "xyz" */
  homed: string
  /** toolhead.position, axis_minimum, axis_maximum ([x, y, z, ...]) */
  position: number[] | null
  min: number[] | null
  max: number[] | null
  /** the mounted toolhead's material table (Job setup's), for "Heat for a material" */
  materials: Array<{ key: string; name: string; hotend: number | null; bed: number | null }>
  /** Klipper's macros (upper case) */
  macros: ReadonlySet<string>
}

export type BuildResult = { script: string } | { error: string }

/**
 * The G-code for a macro now, or why it can't run. Moves are checked against the travel as the steps would leave the
 * machine; the whole thing runs inside a saved G-code state, so G90/G91 and the feed rate are put back after.
 */
export function buildMacro(m: MacroDraft, ctx: RunContext): BuildResult {
  if (ctx.jobActive) return { error: 'Not while a job is running' }
  if (!ctx.tool || !ctx.toolConfirmed) return { error: 'Confirm the mounted toolhead first' }
  if (m.toolheads.length && !m.toolheads.includes(ctx.tool)) return { error: `This macro is for ${m.toolheads.join(', ')}; ${ctx.tool} is mounted` }
  const problem = macroProblem(m)
  if (problem) return { error: problem }

  const homed = new Set(ctx.homed.toLowerCase().split(''))
  // where each axis will be, as far as we know (null once it's unknown, e.g. after homing)
  const pos: Array<number | null> = [0, 1, 2].map((i) => ctx.position?.[i] ?? null)
  const out: string[] = ['SAVE_GCODE_STATE NAME=_rs_macro']
  const axes = ['x', 'y', 'z'] as const
  const inTravel = (i: number, v: number) => {
    const lo = ctx.min?.[i]
    const hi = ctx.max?.[i]
    return lo == null || hi == null || (v >= lo - 1e-6 && v <= hi + 1e-6)
  }

  for (const [i, s] of m.steps.entries()) {
    const at = `Step ${i + 1} (${STEP_TITLES[s.kind]})`
    switch (s.kind) {
      case 'home': {
        const want = s.axes === 'all' ? ['x', 'y', 'z'] : s.axes === 'xy' ? ['x', 'y'] : ['z']
        if (s.onlyIfNeeded && want.every((a) => homed.has(a))) break
        out.push(s.axes === 'all' ? 'G28' : s.axes === 'xy' ? 'G28 X Y' : 'G28 Z')
        for (const a of want) {
          homed.add(a)
          pos[axes.indexOf(a as (typeof axes)[number])] = null
        }
        break
      }
      case 'moveTo':
      case 'moveBy': {
        const vals = s.kind === 'moveTo' ? [s.x, s.y, s.z] : [s.dx, s.dy, s.dz]
        const words: string[] = []
        for (let k = 0; k < 3; k++) {
          const v = vals[k]
          if (v == null) continue
          const a = axes[k]!
          if (!homed.has(a)) return { error: `${at}: ${a.toUpperCase()} isn't homed. Home it first, or add a Home step before this one` }
          const target = s.kind === 'moveTo' ? v : pos[k] == null ? null : pos[k]! + v
          if (target != null && !inTravel(k, target)) return { error: `${at}: ${a.toUpperCase()} ${n(target)} is past its travel (${ctx.min?.[k]} to ${ctx.max?.[k]} mm)` }
          pos[k] = target
          words.push(`${a.toUpperCase()}${n(v)}`)
        }
        const f = `F${Math.round(s.speed * 60)}`
        if (s.kind === 'moveTo') out.push('G90', `G1 ${words.join(' ')} ${f}`)
        else out.push('G91', `G1 ${words.join(' ')} ${f}`, 'G90')
        break
      }
      case 'temp': {
        if (s.heater === 'hotend' && s.target > 0 && !ctx.printHead) return { error: `${at}: the hotend can only be heated with a confirmed print head mounted` }
        const t = Math.round(s.target)
        if (s.heater === 'hotend') out.push(s.wait && t > 0 ? `M109 S${t}` : `M104 S${t}`)
        else out.push(s.wait && t > 0 ? `M190 S${t}` : `M140 S${t}`)
        break
      }
      case 'heatMaterial': {
        if (!ctx.printHead) return { error: `${at}: needs a confirmed print head mounted` }
        const mat = ctx.materials.find((x) => x.key === s.material)
        if (!mat) return { error: `${at}: ${s.material} isn't in ${ctx.tool}'s material table` }
        if (mat.hotend == null || mat.bed == null) return { error: `${at}: ${s.material} has no temperatures in the table` }
        const h = Math.round(Math.min(mat.hotend, HOTEND_MAX))
        const b = Math.round(Math.min(mat.bed, BED_MAX))
        // the bed first: it's slowest, and heating both at once is what the console would do anyway
        out.push(`M140 S${b}`, `M104 S${h}`)
        if (s.wait) out.push(`M190 S${b}`, `M109 S${h}`)
        break
      }
      case 'fan':
        out.push(s.percent === 0 ? 'M107' : `M106 S${Math.round((s.percent / 100) * 255)}`)
        break
      case 'wait':
        out.push(`G4 P${Math.round(s.seconds * 1000)}`)
        break
      case 'macro':
        if (!ctx.macros.has(s.name.toUpperCase())) return { error: `${at}: Klipper has no macro called ${s.name}` }
        out.push(s.name.toUpperCase())
        break
      case 'message':
        out.push(`RESPOND MSG="${s.text}"`)
        break
      case 'gcode':
        out.push(s.line.trim())
        break
    }
  }
  out.push('RESTORE_GCODE_STATE NAME=_rs_macro')
  return { script: out.join('\n') }
}

// ---- starting examples (Mike, Nov 7: he mostly types simple moves and heating) ------------------------------------

/**
 * Park the head, heat for a material, cool down. `park` is RHINO_POSITIONS' park_x / park_y (myrhino/positions.cfg),
 * the spot END_PRINT uses; without it, Park only lifts Z. `material` is the one to heat for (PLA if the mounted
 * toolhead has it); without one, that starter is left out.
 */
export function starterMacros(park: { x: number; y: number } | null, material: string | null): MacroDraft[] {
  const parkSteps: MacroStep[] = [
    { kind: 'home', axes: 'all', onlyIfNeeded: true },
    { kind: 'moveBy', dx: null, dy: null, dz: 10, speed: 10 },
  ]
  if (park) parkSteps.push({ kind: 'moveTo', x: park.x, y: park.y, z: null, speed: 100 })
  const out: MacroDraft[] = [
    { name: 'Park the head', toolheads: [], notes: 'Lifts 10 mm, then goes to the park spot END_PRINT uses (myrhino/positions.cfg).', steps: parkSteps },
  ]
  if (material)
    out.push({ name: `Heat for ${material}`, toolheads: [], notes: 'Hotend and bed from the mounted print head’s material table.', steps: [{ kind: 'heatMaterial', material, wait: true }] })
  out.push({
    name: 'Cool down',
    toolheads: [],
    notes: 'Heaters and part fan off.',
    steps: [
      { kind: 'temp', heater: 'hotend', target: 0, wait: false },
      { kind: 'temp', heater: 'bed', target: 0, wait: false },
      { kind: 'fan', percent: 0 },
    ],
  })
  return out
}

// ---- as a toolhead's start or end G-code (job hooks, Tool Manager 1.9.13) ----------------------------------------

/** A hook holds at most this many lines (rhino/job_hooks.py MAX_LINES) */
export const HOOK_MAX_LINES = 20
const HOOK_TEXT = /^[A-Za-z0-9 .,:!?()/+-]{0,80}$/

/**
 * A macro's steps as job-hook lines, to copy into a toolhead's start (after_start) or end (before_end) G-code. The
 * Portal checks every line again with the hooks' own rules (commands must exist, heater limits). Klipper runs these
 * inside the job, so: "only if needed" homing is left out (the machine is homed during a job), messages become M118,
 * and "Heat for a material" is refused (START_JOB already heats from the material table).
 */
export function hookLines(m: MacroDraft): { lines: string[] } | { error: string } {
  const problem = macroProblem(m)
  if (problem) return { error: problem }
  const out: string[] = []
  const moves = m.steps.some((s) => s.kind === 'moveTo' || s.kind === 'moveBy')
  if (moves) out.push('SAVE_GCODE_STATE NAME=_rs_hook')
  for (const [i, s] of m.steps.entries()) {
    const at = `Step ${i + 1} (${STEP_TITLES[s.kind]})`
    switch (s.kind) {
      case 'home':
        if (!s.onlyIfNeeded) out.push(s.axes === 'all' ? 'G28' : s.axes === 'xy' ? 'G28 X0 Y0' : 'G28 Z0')
        break
      case 'moveTo':
      case 'moveBy': {
        const vals = s.kind === 'moveTo' ? [s.x, s.y, s.z] : [s.dx, s.dy, s.dz]
        const words = vals.map((v, k) => (v == null ? '' : `${'XYZ'[k]}${n(v)}`)).filter(Boolean)
        const g1 = `G1 ${words.join(' ')} F${Math.round(s.speed * 60)}`
        if (s.kind === 'moveTo') out.push('G90', g1)
        else out.push('G91', g1, 'G90')
        break
      }
      case 'temp': {
        const t = Math.round(s.target)
        if (s.heater === 'hotend') out.push(s.wait && t > 0 ? `M109 S${t}` : `M104 S${t}`)
        else out.push(s.wait && t > 0 ? `M190 S${t}` : `M140 S${t}`)
        break
      }
      case 'heatMaterial':
        return { error: `${at}: START_JOB already heats from the material table, so this step can't be start or end G-code` }
      case 'fan':
        out.push(s.percent === 0 ? 'M107' : `M106 S${Math.round((s.percent / 100) * 255)}`)
        break
      case 'wait':
        out.push(`G4 P${Math.round(s.seconds * 1000)}`)
        break
      case 'macro':
        out.push(s.name.toUpperCase())
        break
      case 'message':
        if (!HOOK_TEXT.test(s.text)) return { error: `${at}: in start or end G-code a message may use only letters, digits, spaces and . , : ! ? ( ) / + -` }
        out.push(`M118 ${s.text}`)
        break
      case 'gcode':
        out.push(s.line.trim())
        break
    }
  }
  if (moves) out.push('RESTORE_GCODE_STATE NAME=_rs_hook')
  if (!out.length) return { error: 'Nothing to run in a job (only "home if needed" steps, and the machine is homed then)' }
  if (out.length > HOOK_MAX_LINES) return { error: `That's ${out.length} lines of G-code; start or end G-code holds ${HOOK_MAX_LINES}` }
  return { lines: out }
}

/** Is this toolhead's start or end G-code still the same as the macro it was copied from? */
export function sourceState(src: { macro: string; rev: number } | undefined, macros: UserMacro[]): 'none' | 'current' | 'changed' | 'gone' {
  if (!src) return 'none'
  const m = macros.find((x) => x.id === src.macro)
  if (!m) return 'gone'
  return m.rev === src.rev ? 'current' : 'changed'
}
