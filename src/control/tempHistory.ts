/**
 * Temperature history for the little graphs beside each temperature.
 *
 * Moonraker keeps the last 20 minutes of every heater at one reading per
 * second (server.temperature_store), so a graph has history as soon as the
 * page opens. After that Studio adds a reading every second from the live
 * status. Pure functions here; the store in src/stores/temps.ts holds them.
 */

export type HeaterId = 'extruder' | 'heater_bed'
export const HEATERS: HeaterId[] = ['extruder', 'heater_bed']

export interface Sample {
  /** ms since epoch */
  t: number
  temp: number
  target: number
}

/** Collapsed graph: last 5 minutes. Expanded (three times wider): all 20. */
export const SPAN_SMALL = 5 * 60_000
export const SPAN_WIDE = 20 * 60_000
export const KEEP = 20 * 60 + 30 // samples, one per second

/**
 * Moonraker's store, oldest first, one per second ending now:
 *   { extruder: { temperatures: [...], targets: [...] }, heater_bed: {...} }
 */
export function seedFromStore(store: unknown, now: number): Record<HeaterId, Sample[]> {
  const out: Record<HeaterId, Sample[]> = { extruder: [], heater_bed: [] }
  if (!store || typeof store !== 'object') return out
  for (const id of HEATERS) {
    const h = (store as Record<string, { temperatures?: unknown; targets?: unknown }>)[id]
    const temps = Array.isArray(h?.temperatures) ? (h.temperatures as unknown[]) : []
    const targets = Array.isArray(h?.targets) ? (h.targets as unknown[]) : []
    const n = temps.length
    out[id] = temps
      .map((v, i) => ({ t: now - (n - 1 - i) * 1000, temp: Number(v), target: Number(targets[i] ?? 0) || 0 }))
      .filter((s) => Number.isFinite(s.temp))
      .slice(-KEEP)
  }
  return out
}

/** Adds one reading and drops the oldest past the limit. */
export function push(list: Sample[], s: Sample): Sample[] {
  const next = list.length >= KEEP ? list.slice(list.length - KEEP + 1) : list.slice()
  next.push(s)
  return next
}

/** Range for the vertical axis: covers readings and target, at least 10° tall, a little headroom. */
export function yRange(samples: Sample[]): [number, number] {
  if (!samples.length) return [0, 10]
  let lo = Infinity
  let hi = -Infinity
  for (const s of samples) {
    lo = Math.min(lo, s.temp)
    hi = Math.max(hi, s.temp)
    if (s.target > 0) {
      lo = Math.min(lo, s.target)
      hi = Math.max(hi, s.target)
    }
  }
  if (hi - lo < 10) {
    const mid = (hi + lo) / 2
    lo = mid - 5
    hi = mid + 5
  }
  const pad = (hi - lo) * 0.12
  return [lo - pad, hi + pad]
}

/**
 * SVG paths for the graph (viewBox 0 0 w h): the measured temperature, and
 * the target as a step line (only where a target is set).
 */
export function graphPaths(samples: Sample[], now: number, span: number, w: number, h: number): { temp: string; target: string } {
  const inView = samples.filter((s) => s.t >= now - span)
  if (inView.length < 2) return { temp: '', target: '' }
  const [lo, hi] = yRange(inView)
  const x = (t: number) => (((t - (now - span)) / span) * w).toFixed(1)
  const y = (v: number) => (h - ((v - lo) / (hi - lo)) * h).toFixed(1)
  const temp = inView.map((s, i) => `${i ? 'L' : 'M'}${x(s.t)} ${y(s.temp)}`).join('')
  let target = ''
  let on = false
  for (const s of inView) {
    if (s.target > 0) {
      target += `${on ? 'L' : 'M'}${x(s.t)} ${y(s.target)}`
      on = true
    } else on = false
  }
  return { temp, target }
}

/**
 * A tool's body thermistor (and the hotend's) share the T0 input. Readings
 * far outside anything real mean nothing is plugged in.
 */
export const plausible = (t: number | null): t is number => t != null && t > -20 && t < 400
