/**
 * Spindle run-in and runout (Care wizards review, Nov 15).
 *
 * RUN-IN: Studio does NOT power the spindle in this wizard. Powering a 20,000+ RPM spindle from a new path is a safety
 * decision for Mike (the existing warm-up, _CNC_WARMUP, is tied to the CNC job flow: it needs the HotJoe's Z zero and
 * lifts the head). So you type the spindle commands in the console, where each asks first; Studio shows the exact
 * lines, holds the one-minute waits, shows the live throttle and RPM, and owns the safe direction: the gates, a
 * reminder to stop, and a check that the spindle reads off at the end.
 * RUNOUT: hand-measured with a dial indicator; the spindle stays off.
 */
import type { Answers, GateFacts, GuideDef, GuideStep } from './guide'

/** Throttle steps and how long each runs. 0.3 is the ESC's stopped value; 1.0 is full. */
export const RUNIN_STEPS = [0.5, 0.65, 0.8, 1.0] as const
export const RUNIN_SECONDS = 60

const setPin = (v: number) => `SET_PIN PIN=SPINDLE_SPEED VALUE=${v} PWM_CYCLE_TIME=0.0025`

export const NOISE = [
  { id: 'smooth', label: 'Smooth' },
  { id: 'rough', label: 'Rough or gritty' },
  { id: 'rising', label: 'Noise that rose or did not settle' },
] as const
export const HEAT = [
  { id: 'warm', label: 'Warm: I could hold it' },
  { id: 'hot', label: 'Too hot to hold' },
] as const

export function runinSteps(_a: Answers, _f: GateFacts): GuideStep[] {
  const out: GuideStep[] = [
    { kind: 'tick', text: 'Take the bit out (or fit a short one), tighten the collet nut, close the lid, and move the bed well clear of the spindle in Control › Motion.' },
    { kind: 'tick', text: 'Glasses on. Hands, hair and sleeves clear of the collet. Be ready to press Stop. Studio will not start the spindle: you type each command in the console, and it asks first.' },
    {
      kind: 'tick',
      text: 'Arm the spindle: type this in the console. The relay switches on and the ESC arms, stopped at 0.3.',
      command: 'Spindle_ACTIVATE',
      need: ['spindleOn'],
    },
  ]
  for (const v of RUNIN_STEPS) {
    out.push({
      kind: 'tick',
      text: `Throttle ${v}. Type this in the console, then listen for one minute: rough or rising noise is a stop, and touch the body between steps (warm is fine, too hot to hold is not).`,
      command: setPin(v),
      need: ['spindleOn'],
      show: 'spindle',
      wait: { seconds: RUNIN_SECONDS, label: `Running at ${v} throttle` },
      capture: { key: `rpm${Math.round(v * 100)}`, from: 'rpm' },
    })
  }
  out.push(
    { kind: 'pick', key: 'noise', text: 'How did it sound across all four steps?', options: NOISE.map((n) => ({ id: n.id, label: n.label })) },
    { kind: 'pick', key: 'heat', text: 'How did the spindle body feel between steps?', options: HEAT.map((n) => ({ id: n.id, label: n.label })) },
    {
      kind: 'tick',
      text: 'Stop the spindle: type this in the console. If anything was rough, rising or too hot, press Stop now and do the runout check next.',
      command: 'Spindle_DEACTIVATE',
      need: ['spindleOff'],
    },
  )
  return out
}

export const RUNIN: GuideDef = {
  template: 'tool:spindle_runin',
  gates: ['ready', 'noJob'],
  // the spindle must be off to begin, and is then switched on and off by you: only the start checks it
  startGates: ['spindleOff'],
  pose: 'spindle',
  build: runinSteps,
  note: (a, extra) => {
    const rpms = RUNIN_STEPS.map((v) => ({ v, r: Number(a[`rpm${Math.round(v * 100)}`]) })).filter((x) => Number.isFinite(x.r) && x.r > 0)
    const rpm = rpms.length ? ` RPM: ${rpms.map((x) => `${x.v} throttle ${Math.round(x.r)}`).join(', ')}.` : ''
    const noise = NOISE.find((n) => n.id === a.noise)?.label.toLowerCase() ?? 'not recorded'
    const heat = HEAT.find((n) => n.id === a.heat)?.label.split(':')[0]!.toLowerCase() ?? 'not recorded'
    return `Spindle run-in: four one-minute steps at ${RUNIN_STEPS.join(', ')} throttle. Noise: ${noise}. Body: ${heat}.${rpm}${extra.trim() ? ` ${extra.trim()}` : ''}`
  },
}

// ---- runout ----------------------------------------------------------------------------------------------------------

export const RUNOUT_ANGLES = [0, 90, 180, 270] as const
const key = (deg: number) => `r${deg}`

/** Total runout: the spread of the readings, in mm; null until all four are in */
export function totalRunout(a: Answers): number | null {
  const v: number[] = []
  for (const d of RUNOUT_ANGLES) {
    const raw = a[key(d)]
    const n = Number(raw)
    if (raw === undefined || raw.trim() === '' || !Number.isFinite(n)) return null
    v.push(n)
  }
  return Math.max(...v) - Math.min(...v)
}

export function runoutSteps(a: Answers, _f: GateFacts): GuideStep[] {
  const out: GuideStep[] = [
    { kind: 'tick', text: 'Spindle off and the relay off. Take the bit out and fit a ground test rod in the collet (or measure the collet face), and tighten the nut.' },
    { kind: 'tick', text: 'Set a dial indicator on a stand against the rod, close to the collet, with its tip square to the surface and a little preload.' },
  ]
  for (const d of RUNOUT_ANGLES)
    out.push({
      kind: 'number',
      key: key(d),
      unit: 'mm',
      min: -2,
      max: 2,
      text: d === 0 ? 'Reading at the start mark (0°). Turn the spindle by hand, never with power. Type what the dial shows.' : `Turn it by hand a quarter turn to ${d}°. Type what the dial shows.`,
    })
  const t = totalRunout(a)
  out.push({
    kind: 'tick',
    text:
      t == null
        ? 'Enter all four readings.'
        : `Total runout is ${t.toFixed(3)} mm (the spread of the four readings). Compare it with the limit you set. Over it: clean the collet (the collet task), refit, and measure once more.`,
  })
  return out
}

export const RUNOUT: GuideDef = {
  template: 'tool:runout',
  gates: ['noJob', 'spindleOff'],
  pose: 'calipers',
  build: runoutSteps,
  note: (a, extra) => {
    const t = totalRunout(a)
    const readings = RUNOUT_ANGLES.map((d) => `${d}°: ${a[key(d)] ?? '–'}`).join(', ')
    return `Spindle runout (dial indicator, mm) ${readings}. Total ${t == null ? 'not worked out' : `${t.toFixed(3)} mm`}.${extra.trim() ? ` ${extra.trim()}` : ''}`
  },
}
