/**
 * Umbilical flex test (Care wizards review, Nov 15). While you flex the cable, this watches the tool's thermistor
 * and the tool sensor for the drop-outs a bad conductor or crimp causes, so the one you miss while your eyes are on
 * the cable is still counted. Pure: it is fed samples and says what it saw. Read only; nothing is sent to the machine.
 */

export interface FlexSample {
  /** seconds since the watch began */
  t: number
  /** the tool's thermistor in degrees, or null / NaN when there is no reading */
  temp: number | null
  /** the tool sensor still agrees (a mounted, verified tool) */
  toolOk: boolean
}

export interface FlexEvent {
  t: number
  kind: 'dropout' | 'spike' | 'toolsensor'
  detail: string
}

/** a jump this big between two samples a quarter of a second apart is not a real temperature change */
export const SPIKE_C = 8
/** events closer than this count as one, so one bad moment is not counted a dozen times */
export const DEBOUNCE_S = 1

export class FlexWatch {
  private last: FlexSample | null = null
  private lastEvent = -Infinity
  readonly events: FlexEvent[] = []

  push(s: FlexSample): FlexEvent | null {
    const prev = this.last
    this.last = s
    let found: FlexEvent | null = null
    if (s.temp == null || !Number.isFinite(s.temp)) found = { t: s.t, kind: 'dropout', detail: 'no thermistor reading' }
    else if (prev && prev.temp != null && Number.isFinite(prev.temp) && Math.abs(s.temp - prev.temp) >= SPIKE_C)
      found = { t: s.t, kind: 'spike', detail: `${prev.temp.toFixed(0)}° to ${s.temp.toFixed(0)}° in a moment` }
    else if (prev && prev.toolOk && !s.toolOk) found = { t: s.t, kind: 'toolsensor', detail: 'the tool sensor lost the tool' }
    if (!found || s.t - this.lastEvent < DEBOUNCE_S) return null
    this.lastEvent = s.t
    this.events.push(found)
    return found
  }

  get count(): number {
    return this.events.length
  }

  /** One line for the screen and the log */
  summary(): string {
    if (!this.events.length) return 'No drop-outs.'
    const first = this.events[0]!
    return `${this.events.length} drop-out${this.events.length === 1 ? '' : 's'} (first at ${first.t.toFixed(0)} s: ${first.detail}).`
  }
}
