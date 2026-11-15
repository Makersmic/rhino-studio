/**
 * Belt guide: finding the belt's note in a spectrum, and learning what the room sounds like first.
 * A fan makes steady tones; a plucked belt appears and fades. So the room is recorded for a few seconds, and later
 * frames are compared with that record ("excess" = how many dB above the room each frequency is).
 */
import { FLOOR_DB } from './fft'

export interface Peak {
  hz: number
  db: number
}

/** The frequency range the guide looks at */
export const LO_HZ = 20
export const HI_HZ = 500

function isPeak(db: ArrayLike<number>, k: number): boolean {
  return k > 0 && k < db.length - 1 && db[k]! > db[k - 1]! && db[k]! >= db[k + 1]!
}

/** A peak at bin k with its frequency read between bins (parabola through three points of the dB curve) */
export function peakAt(db: ArrayLike<number>, k: number, bh: number): Peak {
  const a = db[k - 1]!
  const b = db[k]!
  const c = db[k + 1]!
  const den = a - 2 * b + c
  const d = den < 0 ? (0.5 * (a - c)) / den : 0
  return { hz: (k + Math.max(-0.5, Math.min(0.5, d))) * bh, db: b - 0.25 * (a - c) * d }
}

/** The strongest peak between lo and hi Hz, or null when the range is silent */
export function strongestPeak(db: ArrayLike<number>, bh: number, lo = LO_HZ, hi = HI_HZ, minDb = FLOOR_DB + 20): Peak | null {
  const k0 = Math.max(Math.ceil(lo / bh), 1)
  const k1 = Math.min(Math.floor(hi / bh), db.length - 2)
  let best = -1
  for (let k = k0; k <= k1; k++) if (isPeak(db, k) && (best < 0 || db[k]! > db[best]!)) best = k
  if (best < 0 || db[best]! < minDb) return null
  return peakAt(db, best, bh)
}

/** What the room sounds like: the average power in each bin over a few seconds, in dB */
export interface NoiseProfile {
  db: Float32Array
  frames: number
}

export function learnNoise(frames: Float32Array[]): NoiseProfile {
  if (!frames.length) throw new Error('No sound to learn from')
  const n = frames[0]!.length
  const p = new Float64Array(n)
  for (const f of frames) for (let k = 0; k < n; k++) p[k] = p[k]! + Math.pow(10, f[k]! / 10)
  const db = new Float32Array(n)
  for (let k = 0; k < n; k++) db[k] = Math.max(10 * Math.log10(p[k]! / frames.length), FLOOR_DB)
  return { db, frames: frames.length }
}

/** How far above the room each bin is, in dB (0 = as loud as the room was; negative values stay) */
export function excess(db: ArrayLike<number>, profile: NoiseProfile): Float32Array {
  const out = new Float32Array(db.length)
  for (let k = 0; k < db.length; k++) out[k] = db[k]! - profile.db[k]!
  return out
}

export interface Tone {
  hz: number
  db: number
  /** dB above the surrounding noise floor */
  above: number
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Steady tones in the room's profile: peaks that stand `prominence` dB above their neighbours, loudest first */
export function steadyTones(profile: NoiseProfile, bh: number, lo = LO_HZ, hi = HI_HZ, prominence = 8): Tone[] {
  const db = profile.db
  const k0 = Math.max(Math.ceil(lo / bh), 2)
  const k1 = Math.min(Math.floor(hi / bh), db.length - 3)
  const span = Math.max(Math.round(20 / bh), 6)
  const out: Tone[] = []
  for (let k = k0; k <= k1; k++) {
    if (!isPeak(db, k)) continue
    const around: number[] = []
    for (let j = Math.max(k - span, 1); j <= Math.min(k + span, db.length - 1); j++) if (Math.abs(j - k) > 2) around.push(db[j]!)
    const floor = median(around)
    if (db[k]! - floor >= prominence) {
      const p = peakAt(db, k, bh)
      out.push({ hz: p.hz, db: p.db, above: db[k]! - floor })
    }
  }
  return out.sort((a, b) => b.above - a.above)
}

/** Says what the steady tones probably are, in words for the screen. Empty room: says so. */
export function describeNoise(tones: Tone[]): string {
  if (!tones.length) return 'The room is quiet: no steady tones.'
  const t = [...tones].sort((a, b) => a.hz - b.hz)
  for (const base of t) {
    const multiples = t.filter((o) => o !== base && Math.abs(o.hz / base.hz - Math.round(o.hz / base.hz)) < 0.03 && Math.round(o.hz / base.hz) >= 2)
    if (multiples.length >= 1) return `A steady tone at ${base.hz.toFixed(0)} Hz and its multiples: a fan or a motor. It will be subtracted, but stopping it is better.`
  }
  const loud = tones[0]!
  return `A steady tone at ${loud.hz.toFixed(0)} Hz (${tones.length > 1 ? `and ${tones.length - 1} more` : 'on its own'}). It will be subtracted; a pluck near it is harder to hear.`
}
