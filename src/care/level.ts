/**
 * Level the gantry and check the first layer (Care wizards review, Nov 15). Wraps what Bed › Configuration already
 * does (Z_TILT_ADJUST, with each pass read from the console by src/bed/zscrews.ts) and adds the order, the gates and
 * a verdict. Studio's own command, through the console's check and confirm; nothing here is taken from task text.
 */
import type { TiltRun } from '@/bed/zscrews'
import type { Answers, GateFacts, GuideDef, GuideStep } from './guide'

/** The gate facts from the newest Z_TILT_ADJUST run in the console */
export function levelFacts(run: TiltRun | null): Pick<GateFacts, 'levelOutcome' | 'levelRange' | 'levelTolerance' | 'levelPasses' | 'levelError'> {
  const passes = run?.passes.filter((p) => p.range != null) ?? []
  const last = passes[passes.length - 1]
  return {
    levelOutcome: run?.outcome ?? null,
    levelRange: last?.range ?? null,
    levelTolerance: last?.tolerance ?? null,
    levelPasses: passes.length,
    levelError: run?.error ?? null,
  }
}

const mm = (n: number) => `${n.toFixed(3)} mm`

/** One line for the screen under the level step: how each pass went */
export function passLines(run: TiltRun | null): string[] {
  const rows = run?.passes.filter((p) => p.range != null) ?? []
  const out = rows.map((p, i) => `Pass ${i + 1}: range ${mm(p.range!)}${p.tolerance != null && p.range! <= p.tolerance ? ' (within tolerance)' : ''}`)
  if (run?.outcome === 'failed') out.push(`Stopped: ${run.error ?? 'Z-tilt failed'}`)
  if (run?.outcome === 'running' && !rows.length) out.push('Probing…')
  return out
}

/** The levelling step itself, shared with the Z drive wizard (a belt or screw job ends with a level) */
export const LEVEL_STEP: GuideStep = {
  kind: 'do',
  do: 'level',
  text: 'Level the gantry. It probes the points and adjusts each Z motor until they agree within Klipper’s tolerance. Keep a hand near Stop.',
  before: ['ready', 'noJob', 'printHead', 'homed'],
  need: ['levelOk'],
  show: 'tilt',
}

/**
 * The steps. Homing is only a step when the axes weren't homed at the start (`wasHomed`), so the list doesn't change
 * when Klipper reports them homed.
 */
export function levelSteps(a: Answers, _f: GateFacts): GuideStep[] {
  const out: GuideStep[] = []
  if (a.wasHomed === '0')
    out.push({
      kind: 'do',
      do: 'home',
      text: 'Home all axes, with a hand near Stop. Z-tilt needs X, Y and Z homed first.',
      before: ['ready', 'noJob', 'heatersOff', 'toolAgrees'],
      need: ['homed'],
    })
  out.push(LEVEL_STEP)
  out.push({
    kind: 'tick',
    text: 'Check a real first layer. Print the First-layer squish test (Assets › BlockOne › Tune), or make a bed mesh and look at the shape. Skip it if you checked one recently.',
    links: [{ label: 'Open Bed mesh', to: '/bed/mesh' }],
  })
  return out
}

export const LEVEL: GuideDef = {
  template: 'machine:z_tilt',
  gates: ['ready', 'noJob', 'printHead'],
  pose: 'wrench',
  build: levelSteps,
  start: (c) => ({ wasHomed: c.homed ? '1' : '0' }),
  note: (_a, extra, f) => {
    const range = f.levelRange != null ? mm(f.levelRange) : 'unknown'
    const tol = f.levelTolerance != null ? `, tolerance ${mm(f.levelTolerance)}` : ''
    const n = f.levelPasses
    return `Levelled the gantry: ${n} pass${n === 1 ? '' : 'es'}, final range ${range}${tol}.${extra.trim() ? ` ${extra.trim()}` : ''}`
  },
}
