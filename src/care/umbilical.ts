/**
 * Umbilical flex test (Care wizards review, Nov 15): the task already says "flex the cable and watch the thermistor for
 * drop-outs". Studio watches (src/care/flex.ts) so the one you miss is still counted. Read only: nothing is moved or
 * powered and nothing is sent to the machine.
 */
import type { Answers, GateFacts, GuideDef, GuideStep } from './guide'

export const FLEX_SECONDS = 60

export function umbilicalSteps(a: Answers, _f: GateFacts): GuideStep[] {
  const n = Number(a.flexEvents)
  const found = Number.isFinite(n) && n > 0
  return [
    { kind: 'tick', text: 'Look into both halves of the 21-pin connector for bent, pushed-back or burnt pins, and check the latch holds firmly.' },
    {
      kind: 'watch',
      key: 'flexEvents',
      seconds: FLEX_SECONDS,
      text: `Press Start watching, then flex the cable slowly along its whole length for a minute, from the toolhead end to the machine end. Studio watches the tool’s thermistor and the tool sensor for drop-outs.`,
      need: ['hasTemp'],
    },
    found
      ? { kind: 'tick', text: `Studio saw ${n} drop-out${n === 1 ? '' : 's'}. Flex the cable again in short sections to find where, and write that in the log notes. Re-seat or re-crimp the pin that goes with it.` }
      : { kind: 'tick', text: 'No drop-outs. The cable and connector are behaving.' },
  ]
}

export const UMBILICAL: GuideDef = {
  template: 'machine:umbilical',
  gates: ['ready', 'noJob'],
  pose: 'cable',
  build: umbilicalSteps,
  note: (a, extra) => {
    const n = Number(a.flexEvents)
    const said = Number.isFinite(n) ? (n > 0 ? `${n} drop-out${n === 1 ? '' : 's'} while flexing the cable for ${FLEX_SECONDS} s` : `no drop-outs while flexing the cable for ${FLEX_SECONDS} s`) : 'flex test not run'
    return `Umbilical inspected: connector halves and latch looked at; ${said}.${a.flexDetail ? ` ${a.flexDetail}` : ''}${extra.trim() ? ` ${extra.trim()}` : ''}`
  },
}
