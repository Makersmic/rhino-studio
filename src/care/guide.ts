/**
 * Care guides (Mike, Nov 15): the shared shell every guided task uses. A task keeps its steps in the Portal's library as
 * plain text; this file adds what the text can't carry safely: the gates (what Klipper must say before you start), a
 * wait where one is needed, and a pose. Studio decides all of it. Task text is never run as a command.
 * Pure logic: the page (GuideView.vue) reads the machine and feeds the facts in.
 */
import type { Pose } from '@/brand/mascot'

export type GateId = 'ready' | 'noJob' | 'hotendCold' | 'spindleOff' | 'laserOff' | 'toolPowerOff' | 'printHead'

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
