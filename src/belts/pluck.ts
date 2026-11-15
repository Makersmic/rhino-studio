/**
 * Belt guide: turning a stream of "strongest tone above the room" into plucks, readings and a verdict.
 * Times are in seconds and passed in, so the tests don't need a clock.
 */
import type { Peak } from './spectrum'

export interface Capture {
  hz: number
  /** loudest the tone got, dB above the room */
  level: number
  /** how long it rang, seconds */
  length: number
  t: number
}

export interface TrackerOptions {
  /** a tone must be this many dB above the room to count */
  riseDb: number
  /** and stay within this fraction of its own frequency */
  steadyFraction: number
  /** for at least this many seconds */
  minSeconds: number
  /** a tone that never dies this long is treated as noise and ignored until it stops */
  maxSeconds: number
}
export const TRACKER_DEFAULTS: TrackerOptions = { riseDb: 12, steadyFraction: 0.015, minSeconds: 0.5, maxSeconds: 8 }

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * Feed it one frame at a time: `push(t, peak)` where peak is the strongest tone above the room, or null.
 * It answers with a Capture when a tone that appeared, held one pitch and then faded has finished.
 */
export class PluckTracker {
  private run: { t0: number; hz: number[]; level: number } | null = null
  private muted = false

  constructor(private o: TrackerOptions = TRACKER_DEFAULTS) {}

  /** the frequency being tracked right now (for a live marker), or null */
  get current(): number | null {
    return this.run && this.run.hz.length ? median(this.run.hz) : null
  }

  push(t: number, peak: Peak | null): Capture | null {
    const loud = peak && peak.db >= this.o.riseDb ? peak : null
    if (!loud) {
      this.muted = false
      return this.finish(t)
    }
    if (this.muted) return null
    if (!this.run) {
      this.run = { t0: t, hz: [loud.hz], level: loud.db }
      return null
    }
    const mid = median(this.run.hz)
    if (Math.abs(loud.hz - mid) > mid * this.o.steadyFraction) {
      const done = this.finish(t)
      this.run = { t0: t, hz: [loud.hz], level: loud.db }
      return done
    }
    this.run.hz.push(loud.hz)
    this.run.level = Math.max(this.run.level, loud.db)
    if (t - this.run.t0 > this.o.maxSeconds) {
      this.run = null
      this.muted = true
    }
    return null
  }

  private finish(t: number): Capture | null {
    const r = this.run
    this.run = null
    if (!r) return null
    const length = t - r.t0
    if (length < this.o.minSeconds || r.hz.length < 3) return null
    // the later two thirds: the first frames of a pluck are still settling
    const settled = r.hz.slice(Math.floor(r.hz.length / 3))
    return { hz: median(settled), level: r.level, length, t }
  }
}

/** Three plucks that agree within `tol` of their own median settle into one reading, or null */
export function settle(readings: number[], tol = 0.01, need = 3): number | null {
  if (readings.length < need) return null
  const last = readings.slice(-need)
  const mid = median(last)
  return last.every((r) => Math.abs(r - mid) <= mid * tol) ? mid : null
}

export interface Comparison {
  /** how far the lower belt is below the higher, in percent of the higher */
  gapPct: number
  lower: 'a' | 'b' | null
  within: boolean
  text: string
}

/** Two belts. Frequency goes with the square root of tension, so a 5 % gap in note is about 10 % in tension. */
export function compare(a: number, b: number, tol = 0.05, names: [string, string] = ['Belt one', 'Belt two']): Comparison {
  const hi = Math.max(a, b)
  const gap = (hi - Math.min(a, b)) / hi
  const lower = a === b ? null : a < b ? 'a' : 'b'
  const within = gap <= tol
  const pct = (gap * 100).toFixed(1)
  const text = within
    ? `The belts match: ${pct} % apart.`
    : `${lower === 'a' ? names[0] : names[1]} is ${pct} % lower. Tighten it until the note matches the other.`
  return { gapPct: gap * 100, lower: within ? null : lower, within, text }
}
