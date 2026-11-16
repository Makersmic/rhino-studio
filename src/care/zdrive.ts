/**
 * Z drive service (Care wizards review, Nov 15): two tasks, one wizard shape. "Clean and lubricate the Z leadscrews" and
 * "Check the Z belt drive (2:1)". Both involve reaching the screws, moving Z, and ending with a known position.
 * Studio never guesses a Z height or a sweep range (they depend on the tool and bed; Mike hasn't fixed them): where a
 * move through the travel is needed it says so and you do it in Control › Motion (padlocked, one tap one step). The
 * only commands Studio sends are its own G28 and Z_TILT_ADJUST, through the console's check and confirm.
 */
import type { Answers, GateFacts, GuideDef, GuideStep } from './guide'
import { LEVEL_STEP } from './level'

export const BACKLASH = [
  { id: 'none', label: 'None' },
  { id: 'slight', label: 'Slight' },
  { id: 'lots', label: 'A lot' },
] as const

export const BELT_FINDINGS = [
  { id: 'ok', label: 'Fine: nothing needed' },
  { id: 'tightened', label: 'Tightened a set screw or the belt' },
  { id: 'replaced', label: 'Replaced the belt' },
  { id: 'worn', label: 'Worn: it needs replacing soon' },
] as const

const control = { label: 'Open Control', to: '/control' }

/** Home all again after the work (and after a release, which un-homes Z): it has to be run, not just read as homed */
const rehome = (why: string): GuideStep => ({
  kind: 'do',
  do: 'home',
  id: 'rehome',
  text: `${why} Home all axes, with a hand near Stop. It needs Klipper ready, no heater on and the tool sensor agreeing.`,
  before: ['ready', 'noJob', 'heatersOff', 'toolAgrees'],
  need: ['homed'],
})

export function zScrewSteps(_a: Answers, _f: GateFacts): GuideStep[] {
  return [
    {
      kind: 'tick',
      text: 'Move the bed to a height where you can reach all three leadscrews: in Control › Motion, unlock it and jog Z. Stay clear of the toolhead.',
      links: [control],
    },
    { kind: 'tick', text: 'Brush the three leadscrews clean with a dry brush or cloth, top to bottom.' },
    { kind: 'tick', text: 'Apply leadscrew grease sparingly along the thread of each screw, then wipe off any that is not on the thread.' },
    rehome('The Z drive moved, so check it is still where Klipper thinks.'),
    {
      kind: 'tick',
      text: 'Run Z up and down through its whole travel in Control › Motion, in big steps, with a hand near Stop. It must be smooth and quiet, with no tight spots or clicking.',
      links: [control],
      need: ['ready', 'homed'],
    },
    {
      kind: 'pick',
      key: 'backlash',
      text: 'Check the nuts for backlash: with the bed held, try to rock it up and down on the screws by hand. How much play is there?',
      options: BACKLASH.map((b) => ({ id: b.id, label: b.label })),
    },
    {
      kind: 'tick',
      text: 'The Z drive moved, so check the level: open Care › Tasks and run the “Level the gantry” guide.',
      links: [{ label: 'Open Care tasks', to: '/care/tasks' }],
    },
  ]
}

export function zBeltSteps(_a: Answers, _f: GateFacts): GuideStep[] {
  return [
    { kind: 'tick', text: 'Look at the Z drive belt (the 2:1 reduction) along its length: no cracks, fraying, missing teeth or glazing, and it sits square on the pulleys.' },
    { kind: 'tick', text: 'Check the set screws on the motor pulley and on all three leadscrew pulleys are tight.' },
    {
      kind: 'tick',
      text: 'Turn the drive by hand: in Bed › Configuration tick all three screws and press Release to turn by hand. All three screws must turn together. Press Hold again when done.',
      links: [{ label: 'Open Bed › Configuration', to: '/bed/config' }],
    },
    {
      kind: 'pick',
      key: 'belt',
      text: 'What did you find with the belt and the pulleys?',
      options: BELT_FINDINGS.map((b) => ({ id: b.id, label: b.label })),
    },
    rehome('Releasing the motors un-homes Z.'),
    { ...LEVEL_STEP, text: 'Level the gantry, as belt work changes the Z drive. It probes the points and adjusts each Z motor. Keep a hand near Stop.' },
  ]
}

const label = (list: readonly { id: string; label: string }[], id: string | undefined, none: string) => list.find((x) => x.id === id)?.label ?? none

export const ZSCREWS: GuideDef = {
  template: 'machine:z_screws',
  gates: ['ready', 'noJob'],
  pose: 'wrench',
  build: zScrewSteps,
  note: (a, extra) =>
    `Z leadscrews cleaned and lubricated. Nut backlash: ${label(BACKLASH, a.backlash, 'not recorded').toLowerCase()}. Re-homed and ran Z through its travel.${extra.trim() ? ` ${extra.trim()}` : ''}`,
}

export const ZBELT: GuideDef = {
  template: 'machine:z_belt',
  gates: ['ready', 'noJob', 'printHead'],
  pose: 'screwdriver',
  build: zBeltSteps,
  note: (a, extra, f) => {
    const lv = f.levelPasses > 0 && f.levelRange != null ? ` Levelled: ${f.levelPasses} pass${f.levelPasses === 1 ? '' : 'es'}, final range ${f.levelRange.toFixed(3)} mm.` : ''
    return `Z belt drive checked: ${label(BELT_FINDINGS, a.belt, 'finding not recorded').toLowerCase()}. All three screws turned together by hand.${lv}${extra.trim() ? ` ${extra.trim()}` : ''}`
  },
}
