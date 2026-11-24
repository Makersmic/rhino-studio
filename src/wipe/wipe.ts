/**
 * The nozzle cleaning wizard's plain logic (Tool Manager docs/proposal-nozzle-wipe-wizard.md): measurements to G-code lines,
 * the checks, the slow cold test, and what is already in a toolhead's start G-code. No Vue, no network.
 *
 * The lines work in MACHINE coordinates: they set the G-code offsets to zero first (the Rhino applies the paper-test
 * nozzle height and work zeros as G-code offsets), then put every offset back with RESTORE_GCODE_STATE, so the spot the
 * person jogged to is the spot the head goes to. Z is the bed's height: bigger Z is the bed lower, so "clear" is +Z.
 * One run per print head: tool lengths differ, so a brush spot measured with one head is wrong for another.
 */
import { macroProblem, HOOK_MAX_LINES, type MacroDraft } from '@/control/userMacros'

export type Mount = 'bed' | 'frame'
export interface Spot {
  x: number
  y: number
  z: number
}
export interface WipeSetup {
  mount: Mount
  start: Spot | null
  end: Spot | null
  passes: number
  /** mm/s */
  wipeSpeed: number
  travelSpeed: number
  zSpeed: number
  /** how far the bed is lowered to clear the brush and the part, mm */
  clear: number
}

export const LIMITS_HELP = { passes: [1, 8], wipeSpeed: [10, 200], travelSpeed: [20, 300], zSpeed: [2, 20], clear: [5, 40] } as const

export function defaults(): WipeSetup {
  return { mount: 'bed', start: null, end: null, passes: 3, wipeSpeed: 60, travelSpeed: 100, zSpeed: 10, clear: 10 }
}

export interface Limits {
  min: number[]
  max: number[]
}

const f = (n: number) => String(Math.round(n * 100) / 100)
const F = (mmPerS: number) => Math.round(mmPerS * 60)

/** Why these numbers can't be used, as sentences; empty when they can. */
export function setupProblems(s: WipeSetup, lim: Limits | null): string[] {
  const out: string[] = []
  if (!s.start) out.push('The start of the bristles isn\'t set.')
  if (!s.end) out.push('The end of the bristles isn\'t set.')
  for (const k of ['passes', 'wipeSpeed', 'travelSpeed', 'zSpeed', 'clear'] as const) {
    const [lo, hi] = LIMITS_HELP[k]
    if (!Number.isFinite(s[k]) || s[k] < lo || s[k] > hi) out.push(`${LABELS[k]} must be from ${lo} to ${hi}.`)
  }
  if (!Number.isInteger(s.passes)) out.push('Passes must be a whole number.')
  if (s.start && s.end) {
    if (Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) < 5) out.push('The two ends are less than 5 mm apart: jog to the other end of the bristles.')
    if (s.mount === 'bed' && Math.abs(s.end.z - s.start.z) > 3) out.push('The bristles\' two ends are more than 3 mm apart in height: the head would dig in or lift off. Measure both at the same contact height.')
  }
  if (lim) {
    for (const [name, p] of [['start', s.start], ['end', s.end]] as const) {
      if (!p) continue
      if (p.x < lim.min[0]! || p.x > lim.max[0]! || p.y < lim.min[1]! || p.y > lim.max[1]!) out.push(`The ${name} of the bristles is outside the X/Y travel limits.`)
      if (s.mount === 'bed' && (p.z + s.clear > lim.max[2]! || p.z < lim.min[2]!)) out.push(`The ${name} height plus the clearance is outside the Z travel limits.`)
    }
    if (s.mount === 'frame' && s.clear > lim.max[2]!) out.push('The clearance is more than the Z travel.')
  }
  return out
}
const LABELS = { passes: 'Passes', wipeSpeed: 'Wipe speed', travelSpeed: 'Travel speed', zSpeed: 'Up and down speed', clear: 'Clearance' } as const

/** The G-code: save the move state, zero the offsets, lower the bed clear, over the brush, wipe, clear, put it all back. */
export function wipeLines(s: WipeSetup): string[] {
  if (!s.start || !s.end) return []
  const a = s.start
  const b = s.end
  const out: string[] = ['SAVE_GCODE_STATE NAME=_rs_wipe', 'SET_GCODE_OFFSET X=0 Y=0 Z=0', 'G90']
  const zWipe = s.mount === 'bed' ? a.z : null
  const zClear = s.mount === 'bed' ? a.z + s.clear : s.clear
  out.push(`G1 Z${f(zClear)} F${F(s.zSpeed)}`)
  out.push(`G1 X${f(a.x)} Y${f(a.y)} F${F(s.travelSpeed)}`)
  if (zWipe != null) out.push(`G1 Z${f(zWipe)} F${F(s.zSpeed)}`)
  for (let i = 0; i < s.passes; i++) {
    const to = i % 2 === 0 ? b : a
    out.push(`G1 X${f(to.x)} Y${f(to.y)}${s.mount === 'bed' ? ` Z${f(to.z)}` : ''} F${F(s.wipeSpeed)}`)
  }
  out.push(`G1 Z${f(zClear)} F${F(s.zSpeed)}`)
  out.push('RESTORE_GCODE_STATE NAME=_rs_wipe')
  return out
}

/** Read edited text back into lines. */
export function linesOf(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

const AXES = ['X', 'Y', 'Z'] as const
/** Problems with the lines as they will be saved (the Portal checks them again when they are attached to the job hooks). */
export function textProblems(text: string, lim: Limits | null): string | null {
  const lines = linesOf(text)
  if (!lines.length) return 'There is nothing to run.'
  if (lines.length > HOOK_MAX_LINES) return `That is ${lines.length} lines; a job's start G-code holds ${HOOK_MAX_LINES}.`
  const m: MacroDraft = { name: 'Clean nozzle', toolheads: [], notes: '', steps: lines.map((line) => ({ kind: 'gcode' as const, line })) }
  const p = macroProblem(m)
  if (p) return p
  if (lim) {
    let absolute = true
    for (const l of lines) {
      if (/^G91\b/i.test(l)) absolute = false
      else if (/^G90\b/i.test(l)) absolute = true
      const g = /^G[01]\b(.*)$/i.exec(l)
      if (!g || !absolute) continue
      AXES.forEach((ax, i) => {
        const w = new RegExp(`\\b${ax}(-?\\d+(?:\\.\\d+)?)`, 'i').exec(g[1]!)
        if (w && (Number(w[1]) < lim.min[i]! || Number(w[1]) > lim.max[i]!)) throw new RangeError(`"${l}": ${ax} ${w[1]} is outside ${lim.min[i]} to ${lim.max[i]}.`)
      })
    }
  }
  return null
}

/** textProblems that returns the out-of-range message instead of throwing. */
export function problemOf(text: string, lim: Limits | null): string | null {
  try {
    return textProblems(text, lim)
  } catch (e) {
    return e instanceof RangeError ? e.message : String(e)
  }
}

/** The slow test: every feed rate scaled (default 20%), never below 5 mm/s. */
export function slowed(text: string, factor = 0.2): string {
  return text.replace(/\bF(\d+(?:\.\d+)?)\b/gi, (_m, v: string) => `F${Math.max(300, Math.round(Number(v) * factor))}`)
}

/** A sentence for the review step. */
export function sentence(s: WipeSetup): string {
  if (!s.start || !s.end) return ''
  const dist = Math.round(Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y))
  return `The bed lowers ${s.clear} mm, the head goes over the start of the bristles${s.mount === 'bed' ? ' and the bed raises to touch them' : ''}, wipes ${dist} mm along them ${s.passes} time${s.passes === 1 ? '' : 's'} at ${s.wipeSpeed} mm/s, then the bed lowers clear again.`
}

/** What a toolhead's start G-code (after_start) holds, and what attaching would do to it. */
export function attachPlan(existing: string[], lines: string[], mode: 'add' | 'replace'): { next: string[]; problem: string | null } {
  const next = mode === 'replace' ? lines : [...existing, ...lines]
  return { next, problem: next.length > HOOK_MAX_LINES ? `That makes ${next.length} lines; a job's start G-code holds ${HOOK_MAX_LINES}. Replace the existing lines, or shorten them first.` : null }
}
