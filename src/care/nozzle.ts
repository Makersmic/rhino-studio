/**
 * Replace the nozzle (Care wizards review, Nov 15). A task with a hot step and an easy-to-forget last step (the Z
 * offset). The heat goes through Control's own heater path (control.setHeater: Klipper's max_temp, a confirmed print
 * head, and off always allowed); Studio sends no other command here. It never leaves heat on after the step that needs it.
 */
import type { Answers, GateFacts, GuideDef, GuideStep } from './guide'

export const TEMPS = [
  { id: '210', label: 'PLA: 210°' },
  { id: '235', label: 'PETG: 235°' },
  { id: '250', label: 'ABS or ASA: 250°' },
] as const

export const NOZZLES = [
  { id: '0.25', label: '0.25 mm' },
  { id: '0.4', label: '0.4 mm' },
  { id: '0.6', label: '0.6 mm' },
  { id: '0.8', label: '0.8 mm' },
  { id: '1.0', label: '1.0 mm' },
  { id: 'other', label: 'Another size (say which in the notes)' },
] as const

/** The soak after it reaches temperature, so the whole heater block is hot before you tighten */
export const SOAK_SECONDS = 120

/** The index of the heat step in the list below; the guide's wait follows it */
const HEAT_AT = 2

export function nozzleSteps(a: Answers, _f: GateFacts): GuideStep[] {
  const t = a.temp ?? ''
  return [
    {
      kind: 'tick',
      text: 'Have ready: the new nozzle (same size and type you plan to use), the nozzle wrench, a spare wrench for the heater block, and a cloth. Unload the filament first.',
    },
    {
      kind: 'pick',
      key: 'temp',
      text: 'Heat to your printing temperature. Pick the filament you use.',
      options: TEMPS.map((x) => ({ id: x.id, label: x.label })),
    },
    {
      kind: 'do',
      do: 'heat',
      text: `Heat the hotend to ${t}°. It needs a print head mounted and confirmed. When it reaches ${t}° the guide waits two minutes more so the whole heater block is hot.`,
      before: ['ready', 'noJob', 'printHead'],
      need: ['hotendAtTarget'],
    },
    {
      kind: 'tick',
      text: 'The heater block is hot. Hold the block still with the spare wrench, unscrew the old nozzle, screw in the new one, and hot-tighten it gently with the nozzle wrench. Wipe off any drips.',
    },
    {
      kind: 'pick',
      key: 'nozzle',
      text: 'Which nozzle did you fit?',
      options: NOZZLES.map((x) => ({ id: x.id, label: x.label })),
    },
    {
      kind: 'do',
      do: 'heatOff',
      text: 'Switch the heater off. Let the hotend cool before you touch it again.',
      need: ['heatersOff'],
    },
    {
      kind: 'tick',
      text: 'Redo the Z offset: run the paper test (NOZZLE_HEIGHT_CALIBRATE) from Control › Macros with the nozzle cold, and check a first layer.',
      links: [{ label: 'Open Control', to: '/control' }],
    },
  ]
}

export const NOZZLE: GuideDef = {
  template: 'tool:nozzle_replace',
  gates: ['ready', 'noJob', 'printHead'],
  pose: 'wrench',
  build: nozzleSteps,
  wait: { afterStep: HEAT_AT, seconds: SOAK_SECONDS, label: 'Letting the heater block soak' },
  note: (a, extra) => {
    const size = NOZZLES.find((n) => n.id === a.nozzle)?.label ?? 'a nozzle (size not recorded)'
    const temp = a.temp ? `, hot-tightened at ${a.temp}°` : ''
    return `Replaced the nozzle: fitted ${size}${temp}. Z offset redone.${extra.trim() ? ` ${extra.trim()}` : ''}`
  },
}
