/**
 * Care guides (Mike, Nov 15): the shared shell every guided task uses. A task keeps its steps in the Portal's library as
 * plain text; this file adds what the text can't carry safely: the gates (what Klipper must say before you start), a
 * wait where one is needed, and a pose. Studio decides all of it. Task text is never run as a command.
 * Pure logic: the page (GuideView.vue) reads the machine and feeds the facts in.
 */
import type { Pose } from '@/brand/mascot'

export type GateId = 'ready' | 'noJob' | 'hotendCold' | 'spindleOff' | 'laserOff' | 'toolPowerOff' | 'printHead' | 'homed' | 'heatersOff' | 'toolAgrees' | 'levelOk'

/** What the gates need to know; a null means "this machine has no such thing", which passes */
export interface GateFacts {
  klippyReady: boolean
  jobActive: boolean
  hotendTemp: number | null
  spindleOn: boolean | null
  laserArmed: boolean | null
  toolPowerActive: boolean | null
  /** the verified mounted tool's type, or null when none is confirmed */
  mountedType: string | null
  /** X, Y and Z are all homed */
  homedXyz: boolean
  /** a heater (hotend or bed) has a target above zero */
  heatersOn: boolean
  /** the tool sensor disagrees with the selected tool (the toolchanger's own stop) */
  toolMismatch: boolean
  /** the newest Z_TILT_ADJUST run in the console (src/bed/zscrews.ts lastTiltRun), or null if none */
  levelOutcome: 'done' | 'failed' | 'running' | null
  levelRange: number | null
  levelTolerance: number | null
  levelPasses: number
  levelError: string | null
}

export interface GateResult {
  id: GateId
  label: string
  ok: boolean
  /** why it isn't met, in words */
  why: string
}

/** Below this the hotend is safe to touch */
export const COLD_C = 50

const GATES: Record<GateId, (f: GateFacts) => { label: string; ok: boolean; why: string }> = {
  ready: (f) => ({ label: 'Klipper is ready', ok: f.klippyReady, why: 'Klipper isn’t ready: restart it from Control first.' }),
  noJob: (f) => ({ label: 'No job is running', ok: !f.jobActive, why: 'A job is running. Wait for it to finish, or cancel it from Control.' }),
  hotendCold: (f) => ({
    label: `The hotend is cold (under ${COLD_C}°)`,
    ok: f.hotendTemp == null || f.hotendTemp < COLD_C,
    why: `The hotend is ${Math.round(f.hotendTemp ?? 0)}°. Let it cool first.`,
  }),
  spindleOff: (f) => ({ label: 'The spindle is off', ok: f.spindleOn !== true, why: 'The spindle relay reads on. Switch it off first (Control).' }),
  laserOff: (f) => ({ label: 'The laser power rail is off', ok: f.laserArmed !== true, why: 'The laser rail reads armed. Switch it off first (Control).' }),
  toolPowerOff: (f) => ({ label: 'The tool’s power is off', ok: f.toolPowerActive !== true, why: 'The tool’s power is on. Switch it off first (Control).' }),
  printHead: (f) => ({ label: 'A print head is mounted and confirmed', ok: f.mountedType === 'DEPOSITION', why: 'Mount and confirm a print head first.' }),
  homed: (f) => ({ label: 'X, Y and Z are homed', ok: f.homedXyz, why: 'The axes aren’t homed yet.' }),
  heatersOff: (f) => ({ label: 'No heater is on', ok: !f.heatersOn, why: 'A heater is on. Switch it off from Control first.' }),
  levelOk: (f) => ({
    label: 'The gantry is level',
    ok: f.levelOutcome === 'done',
    why:
      f.levelOutcome === 'failed'
        ? `Levelling failed${f.levelError ? `: ${f.levelError}` : ''}. Bring the bed close to level by eye (Bed › Configuration moves one screw at a time), home, and try again. If it keeps failing, the Z drive needs a look.`
        : f.levelOutcome === 'running'
          ? 'Levelling is still running.'
          : 'Level the gantry first.',
  }),
  toolAgrees: (f) => ({ label: 'The tool sensor agrees with the selected tool', ok: !f.toolMismatch, why: 'The tool sensor disagrees with the selected tool. That is a stop: sort it out in Control first.' }),
}

export function checkGates(ids: readonly GateId[], f: GateFacts): GateResult[] {
  return ids.map((id) => ({ id, ...GATES[id](f) }))
}

export interface GuideDef {
  /** the Task Library id this guide belongs to (task.link.template) */
  template: string
  gates: GateId[]
  pose: Pose
  /** used when the library task has no steps of its own */
  steps?: string[]
  /** after this step (0-based) wait this long before the next, with a countdown */
  wait?: { afterStep: number; seconds: number; label: string }
  /** a wizard builds its own steps from the answers so far and the machine's state */
  build?: (answers: Answers, f: GateFacts) => GuideStep[]
  /** answers worked out when the guide starts (what Klipper said, whether it was down) */
  start?: (ctx: { klippyReady: boolean; message: string | null; homed: boolean }) => Answers
  /** the Work log note, instead of the plain one */
  note?: (answers: Answers, extra: string, f: GateFacts) => string
}

export type Answers = Record<string, string>

/** What a Do step may run. Studio builds the command itself; no task text ever becomes a command. */
export type DoId = 'restart' | 'home' | 'level'
export interface DoDef {
  label: string
  /** what the console shows for it, when that must carry the command's name (the level parser starts a run at "Z_TILT_ADJUST") */
  logLabel?: string
  script: string
  title: string
  body: string
  confirmLabel: string
}
export const DOS: Record<DoId, DoDef> = {
  restart: {
    label: 'Restart Klipper',
    script: 'FIRMWARE_RESTART',
    title: 'Restart Klipper?',
    body: 'This restarts Klipper and the boards. Heaters stay off. Check nothing is in the way first.',
    confirmLabel: 'Restart',
  },
  home: {
    label: 'Home all axes',
    script: 'G28',
    title: 'Home all axes?',
    body: 'The machine will move to its limit switches. Check the bed and gantry are clear, and keep a hand near Stop.',
    confirmLabel: 'Home',
  },
  level: {
    label: 'Level the gantry',
    logLabel: 'Z_TILT_ADJUST (level the gantry)',
    script: 'Z_TILT_ADJUST',
    title: 'Level the gantry?',
    body: 'Probes the points and moves each Z motor until they agree. Check the bed is clear, and keep a hand near Stop.',
    confirmLabel: 'Level',
  },
}

export interface GuideStep {
  kind: 'tick' | 'do' | 'pick'
  text: string
  /** do: which command the button runs */
  do?: DoId
  /** do: what must hold before the button is offered */
  before?: GateId[]
  /** what must hold before you can go on */
  need?: GateId[]
  /** pick: the answer's name, and its choices */
  key?: string
  options?: { id: string; label: string }[]
  /** show Klipper's state and message under the text */
  show?: 'klippy' | 'tilt'
  /** links shown under the text (a later check you may want to open) */
  links?: { label: string; to: string }[]
}

/** The steps for a guide: a wizard's own, else the task's text as ticks */
export function guideSteps(def: GuideDef | null, taskSteps: readonly string[] | undefined, answers: Answers, f: GateFacts): GuideStep[] {
  if (def?.build) return def.build(answers, f)
  return stepsOf(taskSteps, def).map((text) => ({ kind: 'tick' as const, text }))
}

const base: GateId[] = ['noJob']

/** The guided checklists (Care wizards review, Nov 15). Library ids come from Tool Manager's rhino/maint/library.py. */
export const GUIDES: GuideDef[] = [
  { template: 'machine:dust', gates: base, pose: 'screwdriver', wait: { afterStep: 0, seconds: 120, label: 'Letting the power supply discharge' } },
  { template: 'machine:wiring', gates: base, pose: 'cable', steps: ['Machine off and unplugged', 'Look along every cable chain for rubbing or cracked insulation', 'Check each crimp and connector is seated', 'Check the screw terminals for tightness'] },
  { template: 'machine:frame', gates: base, pose: 'calipers' },
  { template: 'tool:nozzle_clean', gates: ['ready', 'noJob', 'printHead'], pose: 'wrench' },
  { template: 'tool:hotend_check', gates: ['noJob', 'hotendCold'], pose: 'meter', steps: ['Check the hotend and heater block screws are tight', 'Check the heater and thermistor wires for chafing or loose crimps', 'Look at the thermistor reading in Studio: it should sit near room temperature and be steady'] },
  { template: 'tool:extruder_gears', gates: base, pose: 'wrench' },
  { template: 'tool:laser_lens', gates: ['noJob', 'laserOff'], pose: 'laser' },
  { template: 'tool:laser_fan', gates: ['noJob', 'laserOff'], pose: 'laser', steps: ['Laser off. Brush dust from the module fan and the air-assist nozzle', 'Check the fan spins freely and air flows'] },
  { template: 'tool:collet', gates: ['noJob', 'spindleOff'], pose: 'spindle' },
  { template: 'tool:cnc_chips', gates: ['noJob', 'spindleOff'], pose: 'spindle', steps: ['Spindle relay off', 'Clear chips from the spindle mount and around the Z axis', 'Check nothing is jammed against the guides'] },
  { template: 'tool:blade', gates: base, pose: 'pipewrench' },
  { template: 'tool:knife_bearing', gates: base, pose: 'pipewrench', steps: ['Remove the blade holder', 'Clean the bearing and check it turns freely', 'Refit it'] },
  { template: 'tool:hot_wire', gates: ['noJob', 'toolPowerOff'], pose: 'zapped', steps: ['Wire off and cool', 'Check the wire tension', 'Replace a kinked wire'] },
  { template: 'tool:needle', gates: base, pose: 'screwdriver', steps: ['Remove the needle or blade', 'Fit the new one and check it sits straight'] },
  { template: 'tool:powered', gates: ['noJob', 'toolPowerOff'], pose: 'cable', steps: ['Tool power off', 'Inspect the tool and its power cable', 'Check the connector'] },
  { template: 'tool:passive', gates: base, pose: 'wrench', steps: ['Inspect the tool', 'Clean it'] },
  { template: 'tool:tool_connector', gates: base, pose: 'connect' },
]

/** A task Studio has no guide for still gets one: its steps as ticks, with no gates */
export const GENERIC: Omit<GuideDef, 'template'> = { gates: [], pose: 'wrench' }

export function guideFor(template: string | null | undefined): GuideDef | null {
  return GUIDES.find((g) => g.template === template) ?? null
}

/** The steps to walk through: the task's own, else the guide's, else one line */
export function stepsOf(taskSteps: readonly string[] | undefined, def: GuideDef | null): string[] {
  const own = (taskSteps ?? []).filter((s) => s.trim() !== '')
  if (own.length) return own
  if (def?.steps?.length) return [...def.steps]
  return ['Do the work, then log it']
}

/** Where the wait falls: set when finishing `step` starts the guide's wait */
export function waitAfter(def: GuideDef | null, step: number): { seconds: number; label: string } | null {
  return def?.wait && def.wait.afterStep === step ? { seconds: def.wait.seconds, label: def.wait.label } : null
}

/** Notes pre-filled for the Work log: what was ticked, then whatever the person adds */
export function logNote(total: number, extra: string): string {
  const base = `Guided: all ${total} step${total === 1 ? '' : 's'} ticked.`
  return extra.trim() ? `${base} ${extra.trim()}` : base
}
