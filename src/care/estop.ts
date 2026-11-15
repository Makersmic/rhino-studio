/**
 * After an emergency stop or shutdown (Care wizards review, Nov 15). The most important Care task: after a stop the
 * machine's state is the least trustworthy it ever is. The wizard reads why Klipper stopped, makes you look before
 * anything moves, restarts Klipper only on your confirm, homes only once no heater is on and the tool sensor agrees,
 * and asks for gentle moves before it calls the machine fit. It never runs task text; Do steps are Studio's own
 * commands through the same check and confirm as the console (src/care/guide.ts, DOS).
 */
import type { Answers, GateFacts, GuideDef, GuideStep } from './guide'

export const CAUSES = [
  { id: 'estop', label: 'The emergency stop was pressed' },
  { id: 'error', label: 'Klipper stopped on an error' },
  { id: 'power', label: 'A board lost contact (power, USB or CAN cable)' },
  { id: 'heater', label: 'A heater or thermistor fault' },
  { id: 'unsure', label: 'I’m not sure' },
] as const

export type Cause = (typeof CAUSES)[number]['id']

/** What Klipper's own message suggests; null when it says nothing (the person picks) */
export function suggestCause(message: string | null | undefined): Cause | null {
  const m = (message ?? '').trim()
  if (!m) return null
  if (/M112|emergency/i.test(m)) return 'estop'
  if (/thermal runaway|heater|ADC out of range|min_?temp|max_?temp|temperature/i.test(m)) return 'heater'
  if (/lost communication|unable to connect|serial|mcu .*(shutdown|connect)|canbus|can bus|timeout/i.test(m)) return 'power'
  return 'error'
}

const look: GuideStep = {
  kind: 'tick',
  text: 'Look before anything moves: nothing crashed into the bed, a clamp or the frame, the bed is clear, and the toolhead is seated or in its dock.',
}

const extra: Record<string, GuideStep> = {
  estop: { kind: 'tick', text: 'Find out why the emergency stop was pressed, and make sure that cause is dealt with before you restart.' },
  power: { kind: 'tick', text: 'Check the power supply is on, and that the USB and CAN cables and the board’s lights are normal.' },
  heater: { kind: 'tick', text: 'A heater fault: inspect the heater and thermistor wiring and the hotend screws before you heat anything again (the hotend check task is the longer version).' },
  error: { kind: 'tick', text: 'Read Klipper’s message above and the last lines of the console; write down what it says in the log notes.' },
}

/**
 * The steps. `wasDown` (set when the guide starts) says whether Klipper needed a restart, so the list doesn't change
 * under you when it comes back.
 */
export function estopSteps(a: Answers, _f: GateFacts): GuideStep[] {
  const out: GuideStep[] = [
    {
      kind: 'pick',
      key: 'cause',
      text: 'What happened? Klipper’s message is below; pick the nearest.',
      show: 'klippy',
      options: CAUSES.map((c) => ({ id: c.id, label: c.label })),
    },
    look,
  ]
  const e = extra[a.cause ?? '']
  if (e) out.push(e)
  if (a.wasDown === '1')
    out.push({ kind: 'do', do: 'restart', text: 'Restart Klipper. Heaters stay off. Wait for it to say Ready.', need: ['ready'] })
  out.push({
    kind: 'do',
    do: 'home',
    text: 'Home all axes, with a hand near Stop. It needs Klipper ready, no heater on and the tool sensor agreeing with the selected tool.',
    before: ['ready', 'noJob', 'heatersOff', 'toolAgrees'],
    need: ['homed'],
  })
  out.push({
    kind: 'tick',
    text: 'In Control › Motion (unlock it), nudge each axis a few millimetres. Each must move freely and quietly, with no grinding, clicking or binding. Stop and tell me if any does.',
    need: ['ready', 'homed'],
  })
  return out
}

export const ESTOP: GuideDef = {
  template: 'machine:estop',
  gates: [],
  pose: 'shocked',
  build: estopSteps,
  // remembered at the start: Klipper's message goes away once it restarts, and the step list must not change under you
  start: (c) => ({ wasDown: c.klippyReady ? '0' : '1', said: c.message ?? '', cause: suggestCause(c.message) ?? '' }),
  note: (a, extra) => estopNote(a, extra),
}

/** The Work log note: what Klipper said, what was picked, what was done */
export function estopNote(a: Answers, extra: string): string {
  const cause = CAUSES.find((c) => c.id === a.cause)?.label ?? 'cause not picked'
  const said = a.said && a.said.trim() ? ` Klipper said: “${a.said.trim().slice(0, 200)}”.` : ''
  const did = `${a.wasDown === '1' ? 'Restarted Klipper, ' : ''}homed all axes and moved each axis freely.`
  return `After a stop. ${cause}.${said} ${did}${extra.trim() ? ` ${extra.trim()}` : ''}`
}
