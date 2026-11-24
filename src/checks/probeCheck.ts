/**
 * Settings > Probe check: plain logic (Tool Manager docs/proposal-tuning-wizards-2.md, item 1). Reads Klipper's
 * PROBE_ACCURACY result and says in words whether the probe is steady enough to trust a bed mesh. No Vue, no network.
 */
export interface ProbeResult {
  max: number
  min: number
  range: number
  average: number
  median: number
  sd: number
}
export type Rating = 'excellent' | 'good' | 'fair' | 'poor'

/** "probe accuracy results: maximum 1.2, minimum 1.1, range 0.1, average 1.15, median 1.15, standard deviation 0.03" */
export function parseProbeAccuracy(lines: string[]): ProbeResult | null {
  for (const l of lines) {
    const m = /probe accuracy results:\s*maximum\s+(-?[\d.]+),\s*minimum\s+(-?[\d.]+),\s*range\s+(-?[\d.]+),\s*average\s+(-?[\d.]+),\s*median\s+(-?[\d.]+),\s*standard deviation\s+(-?[\d.]+)/i.exec(l)
    if (m) return { max: +m[1]!, min: +m[2]!, range: +m[3]!, average: +m[4]!, median: +m[5]!, sd: +m[6]! }
  }
  return null
}

/** Guidance, not a gate: 0.0125 mm is the usual "excellent", over 0.05 means don't trust a mesh yet. */
export function rate(range: number): Rating {
  return range < 0.0125 ? 'excellent' : range < 0.02 ? 'good' : range < 0.05 ? 'fair' : 'poor'
}
export const RATING_TONE: Record<Rating, 'ok' | 'warn' | 'bad'> = { excellent: 'ok', good: 'ok', fair: 'warn', poor: 'bad' }

const mm = (n: number) => `${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0')} mm`
export function sentence(r: ProbeResult): string {
  const q = rate(r.range)
  const verdict = {
    excellent: 'The probe is very steady. A bed mesh can be trusted.',
    good: 'The probe is steady enough for a bed mesh.',
    fair: 'The probe wobbles a little. A mesh will work but may vary from run to run; check the probe is firmly mounted and its cable isn\'t pulling.',
    poor: 'The probe is not steady. Don\'t trust a bed mesh until this is fixed: check the mounting, the cable, and that nothing touches the probe.',
  }[q]
  return `Ten touches differed by ${mm(r.range)} at most (spread ${mm(r.sd)}). ${verdict}`
}

/** Two runs, cold and warm: how far the answer moved with heat. */
export function driftSentence(cold: ProbeResult, warm: ProbeResult, bedTemp: number): string {
  const d = warm.average - cold.average
  const a = Math.abs(d)
  if (a < 0.02) return `With the bed at ${bedTemp} C the probe read ${mm(a)} ${d >= 0 ? 'higher' : 'lower'} than cold: no real drift.`
  return `With the bed at ${bedTemp} C the probe read ${mm(a)} ${d >= 0 ? 'higher' : 'lower'} than cold. That is thermal drift: probe the bed hot, after a heat soak, and re-measure after it has warmed.`
}

export interface Area {
  min: number[]
  max: number[]
}
/** Where the nozzle goes so the PROBE is over the middle of the bed (the probe sits at an offset from the nozzle). */
export function centreSpot(lim: Area | null, offX: number, offY: number): { x: number; y: number } | null {
  if (!lim) return null
  const cx = (lim.min[0]! + lim.max[0]!) / 2
  const cy = (lim.min[1]! + lim.max[1]!) / 2
  return { x: Math.round((cx - offX) * 10) / 10, y: Math.round((cy - offY) * 10) / 10 }
}

export function problem(x: number, y: number, lim: Area | null): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'X and Y must be numbers.'
  if (!lim) return null
  if (x < lim.min[0]! || x > lim.max[0]! || y < lim.min[1]! || y > lim.max[1]!) return 'That spot is outside the machine\'s travel.'
  return null
}

export const BED_MAX = 130
export function warmProblem(t: number): string | null {
  return !Number.isFinite(t) || t < 30 || t > BED_MAX ? `The bed temperature must be from 30 to ${BED_MAX} C.` : null
}

/** The G-code the wizard runs: go to the spot, then PROBE_ACCURACY. Shown to the person, who may edit it. */
export function script(x: number, y: number, samples = 10): string {
  return ['G90', `G1 X${x} Y${y} F6000`, `PROBE_ACCURACY SAMPLES=${samples}`].join('\n')
}
