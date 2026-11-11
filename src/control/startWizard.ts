/**
 * Studio's start wizard for laser and drag knife jobs (Tool Manager docs/proposal-studio-start.md, applied in 1.9.25):
 * checklist, Set Z zero, an offered frame check, test fire or test cut, then `<SETUP> FILE=… FROM=STUDIO`.
 *
 * The machine side refuses FROM=STUDIO unless SET_Z_ZERO's `zeroed` names the mounted tool, and a swap or a restart
 * clears it. Studio clears it again before its own zero step, so every start sets a fresh zero (a new sheet on the
 * same tool isn't something Klipper can see). Every script here goes through the console check: the zero and frame
 * are motion, the test is an internal macro, the start is a job, so each one asks first.
 */
import { safeFileParam } from './commands'

export type StartKind = 'laser' | 'knife'

export interface StartTool {
  kind: StartKind
  /** The built-in tool the machine side checks `zeroed` against */
  tool: 'LightSaber' | 'DragKnife'
  setup: 'LASER_JOB_SETUP' | 'DRAGKNIFE_JOB_SETUP'
}

export const START_TOOLS: Record<string, StartTool> = {
  LightSaber: { kind: 'laser', tool: 'LightSaber', setup: 'LASER_JOB_SETUP' },
  DragKnife: { kind: 'knife', tool: 'DragKnife', setup: 'DRAGKNIFE_JOB_SETUP' },
}

/**
 * Use the start wizard? Only for the built-in laser and knife (the machine checks their names), and only when the
 * Rhino's config has the zero flag (Tool Manager 1.9.25+: SET_Z_ZERO reports `zeroed`). Otherwise the prompt chain.
 */
export function startToolFor(mounted: string | null, setupMacro: string | null, zeroFlag: unknown): StartTool | null {
  const t = mounted ? START_TOOLS[mounted] : undefined
  if (!t || setupMacro !== t.setup || typeof zeroFlag !== 'string') return null
  return t
}

/** The checklist, word for word as the Rhino's own setup prompts say it (Mike, Nov 10: the same lines). */
export function checklist(kind: StartKind, pressure: number | null): string[] {
  return kind === 'laser'
    ? [
        'Fume extraction is running',
        'Laser glasses on, rated for 450 nm',
        'Material is not PVC, vinyl or another chlorinated plastic',
        'Material lies flat, non-reflective side up',
        'Extinguisher nearby, and you will stay for the whole cut',
      ]
    : [
        'Material is taped down flat, with no wrinkles',
        'A cutting mat is underneath, if the material needs one',
        `Blade is extended and the pressure dial is set to ${pressure ?? 150} g`,
      ]
}

/**
 * Set Z zero: forget the last zero first, so the start needs this one. The knife's X/Y work zero (machine origin) is
 * applied straight after, before its test cut.
 */
export function zeroScript(kind: StartKind): string {
  return ["SET_GCODE_VARIABLE MACRO=SET_Z_ZERO VARIABLE=zeroed VALUE=\"''\"", kind === 'knife' ? 'SET_Z_ZERO NEXT=_DK_XY_ZERO' : 'SET_Z_ZERO'].join('\n')
}

export function testScript(kind: StartKind): string {
  return kind === 'laser' ? '_LASER_TEST_FIRE QUIET=1' : '_DK_TEST_CUT QUIET=1'
}

export function startScript(t: StartTool, file: string): string | null {
  return safeFileParam(file) ? `${t.setup} FILE=${file} FROM=STUDIO` : null
}

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** How high above the zero the frame runs: clear of the material, tool off. */
export const FRAME_Z = 5

/** Why the outline can't be traced, or null. travel: the machine's X/Y limits. */
export function frameProblem(b: Box | null, travel: Box): string | null {
  if (!b) return 'The file has no cutting moves to trace.'
  if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) return 'The outline couldn’t be read.'
  if (b.minX < travel.minX || b.minY < travel.minY || b.maxX > travel.maxX || b.maxY > travel.maxY)
    return 'The job reaches outside the machine’s travel, so its outline can’t be traced. Check where it was placed.'
  return null
}

const f = (n: number) => n.toFixed(2)

/**
 * Trace the job's outline 5 mm above the zero with the tool off. X/Y are machine positions (laser and knife files use
 * them, and both setups clear any X/Y work offset), so the frame clears it too. Ends above the first corner.
 */
export function frameScript(kind: StartKind, b: Box): string {
  return [
    ...(kind === 'laser' ? ['M5'] : []),
    'SET_GCODE_OFFSET X=0 Y=0',
    'G90',
    `G0 Z${FRAME_Z} F600`,
    `G0 X${f(b.minX)} Y${f(b.minY)} F3000`,
    `G0 X${f(b.maxX)} Y${f(b.minY)} F3000`,
    `G0 X${f(b.maxX)} Y${f(b.maxY)} F3000`,
    `G0 X${f(b.minX)} Y${f(b.maxY)} F3000`,
    `G0 X${f(b.minX)} Y${f(b.minY)} F3000`,
  ].join('\n')
}

/** The test's question, word for word as the Rhino's prompt asks it. */
export function testQuestion(kind: StartKind): { lines: string[]; yes: string; no: string; adjust: string[] } {
  return kind === 'laser'
    ? { lines: ['Is there a small, sharp mark on the material?'], yes: 'Yes - continue', no: 'No - set focus again', adjust: [] }
    : {
        lines: [
          'Look at the 10 mm test line:',
          'Did the blade cut cleanly through the material, without skipping or tearing?',
          'Is the backing sheet underneath still uncut?',
        ],
        yes: 'Cut looks good - continue',
        no: 'Cut is wrong - help me adjust',
        adjust: [
          'Turn the pressure dial on the toolhead by hand:',
          '- Blade skipped or barely scored: more pressure, or set Z zero slightly lower (Bed up 0.1 mm).',
          '- Material tore or the backing was cut: less pressure, or set Z zero slightly higher (Bed down 0.1 mm).',
          'Then set Z zero again and cut a new test line.',
        ],
      }
}

/**
 * The laser's focus by measurement: with a tuned focus height, touch the shroud to the material, then move the bed
 * down by that much before SET. -> the steps, or null without a tuned height.
 */
export function focusSteps(height: number | null | undefined): string[] | null {
  if (height == null || !Number.isFinite(height) || height <= 0) return null
  const whole = Math.floor(height)
  const tenths = Math.round((height - whole) * 10)
  const moves = [whole ? `Bed down 1 mm ${whole} time${whole === 1 ? '' : 's'}` : '', tenths ? `Bed down 0.1 mm ${tenths} time${tenths === 1 ? '' : 's'}` : '']
    .filter(Boolean)
    .join(', then ')
  return [
    'Bring the bed up until the shroud just touches the material: a sheet of paper should drag.',
    `Your tuned focus height is ${height} mm: press ${moves}.`,
    'Then press SET.',
  ]
}
