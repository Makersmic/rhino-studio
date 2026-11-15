/**
 * "What's happening" (Mike, Nov 15): the plain-words line the tuning wizards and the Care guides show while the
 * machine heats, runs a test job or sends a command, so you can tell it is working and that leaving the page is safe.
 * Pure: it only turns facts Klipper already reports into sentences. Nothing here can reach the machine.
 */

export interface HeatFact {
  temp: number | null
  target: number | null
}

export interface HappeningFacts {
  hotend: HeatFact
  bed: HeatFact
  job: { state: string | null; filename: string | null; progress: number | null }
  /** a command Studio is sending right now (control.running) */
  running: string | null
}

export interface Happening {
  headline: string
  /** extra lines under the headline: the other heater, hot-to-touch warnings */
  lines: string[]
  /** set while a job runs: reassurance that leaving the page is fine */
  leaveNote: string | null
}

const deg = (n: number) => `${Math.round(n)}°`

function heat(name: string, h: HeatFact): { text: string; active: boolean } | null {
  if (h.temp == null) return null
  const target = h.target ?? 0
  if (target > 0) {
    return h.temp < target - 3
      ? { text: `Heating the ${name}: ${deg(h.temp)} of ${deg(target)}`, active: true }
      : { text: `The ${name} is at ${deg(target)}`, active: false }
  }
  // off but still hot: worth saying, it is what burns fingers
  return h.temp >= 50 ? { text: `The ${name} is off but still ${deg(h.temp)}: careful`, active: false } : null
}

/** The file name without its folder */
const base = (f: string) => f.split('/').pop() ?? f

export function happening(f: HappeningFacts): Happening | null {
  const hot = heat('hotend', f.hotend)
  const bed = heat('bed', f.bed)
  const heaters = [hot, bed].filter((x): x is { text: string; active: boolean } => x !== null)
  const active = f.job.state === 'printing' || f.job.state === 'paused'

  if (active) {
    const pct = f.job.progress != null ? ` · ${Math.round(f.job.progress * 100)} %` : ''
    const verb = f.job.state === 'paused' ? 'Paused' : 'Running'
    return {
      headline: `${verb} ${f.job.filename ? base(f.job.filename) : 'a job'}${pct}`,
      lines: heaters.map((h) => h.text),
      leaveNote: 'You can leave this page. The job keeps running on the machine; Control has Cancel.',
    }
  }
  const warming = heaters.filter((h) => h.active)
  if (warming.length) return { headline: warming[0]!.text, lines: heaters.filter((h) => h !== warming[0]).map((h) => h.text), leaveNote: null }
  if (f.running) return { headline: `Sending: ${f.running}`, lines: heaters.map((h) => h.text), leaveNote: null }
  if (heaters.length) return { headline: heaters[0]!.text, lines: heaters.slice(1).map((h) => h.text), leaveNote: null }
  return null
}

/** Console lines worth showing in the compact viewer: not empty, not a bare "ok" */
export function worthShowing(text: string): boolean {
  const t = text.trim()
  return t !== '' && !/^ok$/i.test(t)
}
