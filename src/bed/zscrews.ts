/**
 * Bed › Configuration: the Z lead screws, and moving one by itself when Z_TILT_ADJUST can't (Mike, Nov 8 2026).
 *
 * Why: when the bed is too far out of level, Z_TILT_ADJUST faults out (a probe point out of range) before it can
 * correct anything. On the Rhino it's easy to bring it close by eye; this screen moves the chosen screw motors on
 * their own so Z-tilt can finish the job. Nothing here is saved.
 *
 * What a press sends (Klipper v0.13.0-820 on the 7050; force_move is already enabled in toolchanger.cfg):
 *   SET_KINEMATIC_POSITION SET_HOMED=none CLEAR_HOMED=Z   only while Z is homed: its position is about to stop being true.
 *                                                          SET_HOMED=none matters: the default marks X, Y and Z homed.
 *   SAVE_VARIABLE VARIABLE=rhino_z_safe VALUE=0           only while set: the saved park height no longer holds, so
 *                                                          _RHINO_HOME_SAFE won't offer to restore Z from it.
 *   FORCE_MOVE STEPPER=stepper_z1 DISTANCE=-0.5 VELOCITY=3 ACCEL=20   one per ticked motor, one after another.
 * Z is marked unhomed before anything moves, so a failed move still leaves it unhomed.
 *
 * On the Rhino, Z moves the bed and Z+ lowers it (position_max 295 is the bed at the bottom), so "bed up" at a screw
 * is a negative distance. Check the direction on the machine with a 0.1 mm step first.
 */
import type { Built } from '@/control/extruder'

export const SCREW_STEPS = [0.1, 0.5, 1, 5] as const
export const SCREW_MAX_STEP = 5
export const SCREW_VELOCITY = 3
export const SCREW_ACCEL = 20

export interface ZScrew {
  /** Klipper's stepper name: stepper_z, stepper_z1, ... */
  stepper: string
  /** where it is, in bed coordinates (mm), from [z_tilt] z_positions */
  x: number
  y: number
  /** "Front left", "Rear centre" ... */
  label: string
}
export interface BedLayout {
  /** bed travel (mm) */
  w: number
  h: number
  screws: ZScrew[]
  /** the points Z_TILT_ADJUST probes */
  points: { x: number; y: number }[]
  /** no [z_tilt] in the config: the screws can't be placed */
  error?: string
}

type Settings = Record<string, Record<string, unknown>>

/** "x,y\nx,y" or [[x,y],...] (configfile.settings gives the parsed lists) -> pairs */
export function pairs(v: unknown): { x: number; y: number }[] {
  const rows: unknown[] = Array.isArray(v)
    ? v
    : String(v ?? '')
        .split('\n')
        .map((l) => l.replace(/#.*$/, '').trim())
        .filter(Boolean)
        .map((l) => l.split(','))
  const out: { x: number; y: number }[] = []
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 2) continue
    const x = Number(r[0]), y = Number(r[1])
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y })
  }
  return out
}

/** Klipper's own order: [stepper_z], [stepper_z1], [stepper_z2] ... (z_positions follow it) */
export function zSteppers(settings: Settings): string[] {
  const out: string[] = []
  if (settings.stepper_z) out.push('stepper_z')
  for (let i = 1; settings[`stepper_z${i}`]; i++) out.push(`stepper_z${i}`)
  return out
}

export function screwLabel(x: number, y: number, w: number, h: number): string {
  const fb = y < h / 2 ? 'Front' : 'Rear'
  const lr = x < w / 3 ? 'left' : x > (2 * w) / 3 ? 'right' : 'centre'
  return `${fb} ${lr}`
}

export function bedLayout(settings: Settings, bed: { w: number; h: number }): BedLayout {
  const steppers = zSteppers(settings)
  const zt = settings.z_tilt
  const base = { w: bed.w, h: bed.h, screws: [] as ZScrew[], points: [] as { x: number; y: number }[] }
  if (!zt) return { ...base, error: 'Klipper has no [z_tilt] section, so the lead screws can’t be placed.' }
  const pos = pairs(zt.z_positions)
  if (pos.length !== steppers.length)
    return { ...base, error: `[z_tilt] lists ${pos.length} screw positions for ${steppers.length} Z motors.` }
  return {
    ...base,
    points: pairs(zt.points),
    screws: steppers.map((s, i) => ({ stepper: s, x: pos[i]!.x, y: pos[i]!.y, label: screwLabel(pos[i]!.x, pos[i]!.y, bed.w, bed.h) })),
  }
}

export interface ZState {
  /** toolhead.homed_axes */
  homed: string
  /** save_variables rhino_z_safe */
  zSafe: unknown
}
/** What has to go first: Z stops being trusted before anything moves. */
function invalidate(z: ZState): string[] {
  const out: string[] = []
  if (z.homed.toLowerCase().includes('z')) out.push('SET_KINEMATIC_POSITION SET_HOMED=none CLEAR_HOMED=Z')
  if (Number(z.zSafe) === 1) out.push('SAVE_VARIABLE VARIABLE=rhino_z_safe VALUE=0')
  return out
}

function checkPicked(picked: string[], known: string[]): string | null {
  if (!picked.length) return 'Tick at least one motor'
  const bad = picked.find((p) => !known.includes(p))
  return bad ? `${bad} isn’t a Z motor` : null
}

/** Move the ticked screws: up = the bed rises at those screws. */
export function screwMoveScript(picked: string[], known: string[], up: boolean, step: number, z: ZState): Built {
  const e = checkPicked(picked, known)
  if (e) return { error: e }
  if (!Number.isFinite(step) || step <= 0 || step > SCREW_MAX_STEP + 1e-9) return { error: `A step is at most ${SCREW_MAX_STEP} mm` }
  const d = Number((up ? -step : step).toFixed(3))
  const moves = picked.map((s) => `FORCE_MOVE STEPPER=${s} DISTANCE=${d} VELOCITY=${SCREW_VELOCITY} ACCEL=${SCREW_ACCEL}`)
  return { script: [...invalidate(z), ...moves].join('\n') }
}

/** Switch the ticked motors off so the screws turn by hand; or back on (hold). */
export function screwEnableScript(picked: string[], known: string[], enable: boolean, z: ZState): Built {
  const e = checkPicked(picked, known)
  if (e) return { error: e }
  const lines = picked.map((s) => `SET_STEPPER_ENABLE STEPPER=${s} ENABLE=${enable ? 1 : 0}`)
  return { script: [...(enable ? [] : invalidate(z)), ...lines].join('\n') }
}

/** Only these may go out through the unlocked screw path, and only for Z motors Klipper has. */
export function isScrewScript(script: string, known: string[]): boolean {
  const lines = script.split('\n')
  if (!lines.length) return false
  return lines.every((l) => {
    if (l === 'SET_KINEMATIC_POSITION SET_HOMED=none CLEAR_HOMED=Z') return true
    if (l === 'SAVE_VARIABLE VARIABLE=rhino_z_safe VALUE=0') return true
    let m = /^FORCE_MOVE STEPPER=(\S+) DISTANCE=(-?\d+(?:\.\d+)?) VELOCITY=(\d+) ACCEL=(\d+)$/.exec(l)
    if (m)
      return known.includes(m[1]!) && Math.abs(Number(m[2])) > 0 && Math.abs(Number(m[2])) <= SCREW_MAX_STEP + 1e-9 &&
        Number(m[3]) === SCREW_VELOCITY && Number(m[4]) === SCREW_ACCEL
    m = /^SET_STEPPER_ENABLE STEPPER=(\S+) ENABLE=[01]$/.exec(l)
    return !!m && known.includes(m[1]!)
  })
}

// ---- what the last Z_TILT_ADJUST did, read from the console ----------------------------------------------------

export interface TiltPass {
  /** Klipper's adjustment per stepper (mm), as it printed it */
  adjust: Record<string, number>
  /** probed points range after this pass, and the tolerance */
  range?: number
  tolerance?: number
  retry?: number
  retries?: number
}
export interface TiltRun {
  passes: TiltPass[]
  outcome: 'done' | 'failed' | 'running'
  error?: string
}

/**
 * Klipper (klippy/extras/z_tilt.py) prints, per pass:
 *   // Making the following Z adjustments:
 *   // stepper_z = 0.012345
 *   // Retries: 0/5 Probed points range: 0.031000 tolerance: 0.050000
 * and fails with "!! Too many retries", "!! Retries aborting: ..." or a move/probe error.
 * A run starts where Z_TILT_ADJUST was sent, or at a "Retries: 0/" pass (a print's start, a mesh). Newest run wins.
 */
export function lastTiltRun(lines: { kind: string; text: string }[]): TiltRun | null {
  let run: TiltRun | null = null
  let pass: TiltPass | null = null
  let last: TiltRun | null = null
  for (const l of lines) {
    for (const raw of l.text.split('\n')) {
      const t = raw.replace(/^\/\/\s?/, '').replace(/^!!\s?/, '').trim()
      if (l.kind === 'sent' && /\bZ_TILT_ADJUST\b/.test(t)) {
        run = { passes: [], outcome: 'running' }
        last = run
        pass = null
        continue
      }
      if (/^Making the following Z adjustments:/.test(t)) {
        pass = { adjust: {} }
        if (!run || run.outcome !== 'running') {
          run = { passes: [], outcome: 'running' }
          last = run
        }
        run.passes.push(pass)
        continue
      }
      let m = /^(stepper_z\d*)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(t)
      if (m && pass) {
        pass.adjust[m[1]!] = Number(m[2])
        continue
      }
      m = /^Retries:\s*(\d+)\/(\d+).*?:\s*(-?\d+(?:\.\d+)?)\s+tolerance:\s*(\d+(?:\.\d+)?)/.exec(t)
      if (m && run) {
        if (!pass) {
          pass = { adjust: {} }
          run.passes.push(pass)
        }
        Object.assign(pass, { retry: Number(m[1]), retries: Number(m[2]), range: Number(m[3]), tolerance: Number(m[4]) })
        if (pass.range! <= pass.tolerance!) run.outcome = 'done'
        pass = null
        continue
      }
      if (l.kind === 'error' && run && run.outcome === 'running') {
        run.outcome = 'failed'
        run.error = t
      }
    }
  }
  return last
}
