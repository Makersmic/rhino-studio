/**
 * Every G-code Studio sends goes through here first.
 *
 * check() reads a script line by line and says what each line would do to
 * the machine. Anything that moves it, powers the laser/spindle/servos,
 * changes what Klipper thinks is mounted, restarts Klipper, starts a job or
 * runs an internal (_UNDERSCORE) macro needs an explicit confirmation that
 * says so. The Moonraker client only accepts a CheckedScript, and the only
 * way to make one is approve() on a check result, so nothing can reach the
 * machine without passing through this file.
 *
 * Exceptions, on purpose:
 * - Stop commands (M112, EMERGENCY_STOP) never ask.
 * - Buttons inside a Klipper prompt (the Rhino wizards) are the wizard's own
 *   confirmation; those go through fromPrompt(), like Mainsail and the Portal.
 *
 * This is a guard against slips, not a sandbox: anyone at the console can
 * still confirm a dangerous command. Klipper's own limits and the Rhino
 * macros' checks still apply on the machine.
 */

export type Risk = 'none' | 'heat' | 'motion' | 'power' | 'tool-state' | 'restart' | 'job' | 'internal' | 'stop'

export interface LineCheck {
  line: string
  command: string
  risk: Risk
  reason: string
}

export interface ScriptCheck {
  script: string
  lines: LineCheck[]
  /** Highest risk in the script */
  risk: Risk
  needsConfirm: boolean
  /** Set when the script must not be sent at all */
  blocked: string | null
}

export interface CheckContext {
  /** A job is printing or paused */
  jobActive: boolean
  /** Macros Klipper has (upper case), to tell macros from unknown words */
  macros?: ReadonlySet<string>
}

const CONFIRM: ReadonlySet<Risk> = new Set(['motion', 'power', 'tool-state', 'restart', 'job', 'internal'])
const ORDER: Risk[] = ['none', 'heat', 'internal', 'job', 'restart', 'tool-state', 'motion', 'power', 'stop']

const MOTION: Record<string, string> = {
  G0: 'moves the machine',
  G1: 'moves the machine',
  G2: 'moves the machine in an arc',
  G3: 'moves the machine in an arc',
  G28: 'homes axes (moves to the endstops)',
  G29: 'probes the bed (moves the machine)',
  G30: 'probes (moves the machine)',
  'G38.2': 'probes (moves the machine)',
  'G38.3': 'probes (moves the machine)',
  'G38.4': 'probes (moves the machine)',
  'G38.5': 'probes (moves the machine)',
  G92: 'changes where Klipper thinks the head is',
  SET_KINEMATIC_POSITION: 'tells Klipper the head is somewhere it may not be; the next move can crash',
  FORCE_MOVE: 'moves a stepper with no limits',
  MANUAL_STEPPER: 'moves a stepper directly',
  Z_TILT_ADJUST: 'probes and levels the gantry (moves the machine)',
  QUAD_GANTRY_LEVEL: 'probes and levels the gantry (moves the machine)',
  BED_MESH_CALIBRATE: 'probes the bed (moves the machine)',
  PROBE: 'probes (moves the machine)',
  PROBE_CALIBRATE: 'probes (moves the machine)',
  PROBE_ACCURACY: 'probes repeatedly (moves the machine)',
  SCREWS_TILT_CALCULATE: 'probes (moves the machine)',
  M84: 'turns the motors off: the bed may drop and you will have to home again',
  M18: 'turns the motors off: the bed may drop and you will have to home again',
  SET_STEPPER_ENABLE: 'switches a motor on or off',
  TURN_ON_MOTORS: 'switches the motors on',
  LASERHOME: 'moves the machine',
  PRIME_LINE: 'moves and extrudes',
  PURGE: 'moves and extrudes',
  RESUME: 'continues the paused job: the machine moves and the tool powers back on',
  TOOL_RESUME: 'restores tool power and continues',
}

const POWER: Record<string, string> = {
  M3: 'switches the laser or spindle on',
  M4: 'switches the laser or spindle on',
  SET_PIN: 'drives an output pin directly',
  SET_SERVO: 'drives a servo channel directly (SERVO_LASER is also the laser power)',
  SET_SERVO_ANGLE: 'drives a servo channel directly (SERVO_LASER is also the laser power)',
  SET_TOOL_POWER: 'powers the mounted tool',
  SET_LASER_POWER: 'sets laser power',
  ACTIVATE_LASER: "switches the laser's power rail on",
  SPINDLE_ACTIVATE: 'switches the spindle relay on',
  CALIBRATE_ESC: 'drives the spindle ESC',
  TOOL_POWER_RESTORE: 'restores tool power',
  SWITCH_T0: 'moves the SwitchFly servo, which shares the laser power channel',
  SWITCH_T1: 'moves the SwitchFly servo, which shares the laser power channel',
}

const RESTART: Record<string, string> = {
  FIRMWARE_RESTART: 'restarts Klipper and the MCUs; the mounted tool must be confirmed again',
  RESTART: 'restarts Klipper; the mounted tool must be confirmed again',
  SAVE_CONFIG: 'writes printer.cfg and restarts Klipper',
  RESTART_FOR_TOOLS: 'restarts Klipper to load tool changes',
}

const JOB: Record<string, string> = {
  SDCARD_PRINT_FILE: 'starts a job file',
  START_JOB: 'homes and starts the job sequence',
  CANCEL_PRINT: 'cancels the running job',
}

const STOP = new Set(['M112', 'EMERGENCY_STOP'])
const HEAT = new Set(['M104', 'M109', 'M140', 'M190', 'SET_HEATER_TEMPERATURE'])

/** First word of a line, upper case. "g1x10" -> "G1", "set_pin pin=x" -> "SET_PIN". */
export function commandOf(line: string): string {
  const t = line.trim()
  const g = /^([GMT]\d+(?:\.\d+)?)/i.exec(t)
  if (g) return g[1]!.toUpperCase()
  return (t.split(/\s+/)[0] ?? '').toUpperCase()
}

function param(line: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("?)([^\\s"]*)\\1`, 'i').exec(line)
  if (m) return m[2] ?? null
  // G-code style: S210, Z5
  const g = new RegExp(`(?:^|\\s)${name}(-?[\\d.]+)`, 'i').exec(line)
  return g?.[1] ?? null
}

function checkLine(line: string): LineCheck {
  const command = commandOf(line)
  const r = (risk: Risk, reason: string): LineCheck => ({ line, command, risk, reason })

  if (STOP.has(command)) return r('stop', 'emergency stop')
  if (MOTION[command]) return r('motion', MOTION[command]!)
  if (POWER[command]) return r('power', POWER[command]!)
  if (RESTART[command]) return r('restart', RESTART[command]!)
  if (JOB[command]) return r('job', JOB[command]!)

  if (command === 'SET_GCODE_OFFSET' && /MOVE\s*=\s*1/i.test(line)) return r('motion', 'applies the offset by moving the head')
  if (command === 'SWAP_TOOL' && param(line, 'TOOL') != null)
    return r('motion', 'starts a tool swap straight away: the machine cools down and lowers the bed')
  if (command === 'SET_GCODE_VARIABLE' && /MACRO\s*=\s*SWAP_TOOL/i.test(line))
    return r('tool-state', 'changes which toolhead Klipper believes is mounted, without a physical swap')
  if (command === 'SAVE_VARIABLE' && /VARIABLE\s*=\s*current_tool\b/i.test(line))
    return r('tool-state', 'changes the saved toolhead, without a physical swap')
  if (command === 'CONFIRM_TOOL_INSTALL') return r('tool-state', 'records a toolhead as mounted')

  // Other tool-change families (src/tools/adapters). Classified whatever adapter is active:
  // a T1 typed on any machine might swap tools.
  if (/^T\d+$/.test(command)) return r('motion', 'selects a tool: on a toolchanger this docks one tool and picks up another')
  if (command === 'SELECT_TOOL') return r('motion', 'changes tools: the head docks one tool and picks up another')
  if (command === 'UNSELECT_TOOL') return r('motion', 'docks the tool it holds: the head moves to the dock')
  if (command === 'INITIALIZE_TOOLCHANGER') return r('motion', 'initialises the toolchanger; it may home or move to check the tool')
  if (command === 'TEST_TOOL_DOCKING') return r('motion', 'docks and picks up the tool to test it: the head moves')
  if (command === 'ENTER_DOCKING_MODE' || command === 'EXIT_DOCKING_MODE') return r('motion', 'switches the toolchanger in or out of docking mode')
  if (command === 'ASSIGN_TOOL') return r('tool-state', 'changes which tool number a tool answers to')
  if (command === 'SET_TOOL_PARAMETER' && /(PICKUP|DROPOFF|PARK|ZONE|DOCK)/i.test(line)) return r('tool-state', 'changes where a tool is docked or picked up')
  // A wrong tool offset puts the nozzle into the bed on the next pickup
  if (command === 'SET_TOOL_PARAMETER' && /OFFSET/i.test(line)) return r('tool-state', "changes a tool's offset: the next pickup moves by it")

  // Rhino 1.4.2 lines that belong in job files (Rhino Studio writes them), not the console
  if (command === 'CNC_BIT_CHANGE') return r('motion', 'holds the job for a bit change: spindle off, the bed goes down and the head moves to the swap spot')
  if (command === 'REQUIRE_TOOLHEAD') return r('job', 'checks the running file: if it fails, every tool is switched off and the job stops')
  if (command === 'ACTIVATE_EXTRUDER') return r('tool-state', 'changes which extruder (tool) Klipper drives')
  if (command === 'SET_DUAL_CARRIAGE') return r('motion', 'switches which carriage moves')

  if (HEAT.has(command)) {
    const v = Number(param(line, command.startsWith('SET_') ? 'TARGET' : 'S') ?? 0)
    return v > 0 ? r('heat', `heats to ${v}°`) : r('none', 'heater off')
  }
  if (command.startsWith('_')) return r('internal', 'an internal macro, normally run by other Rhino macros')
  return r('none', '')
}

/** Read a script and say what it would do. Comments and blank lines are ignored. */
export function check(script: string, ctx: CheckContext): ScriptCheck {
  const lines = script
    .split(/\r?\n/)
    .map((l) => l.replace(/;.*$/, '').trim())
    .filter(Boolean)
    .map(checkLine)

  let risk: Risk = 'none'
  for (const l of lines) if (ORDER.indexOf(l.risk) > ORDER.indexOf(risk)) risk = l.risk

  let blocked: string | null = null
  if (!lines.length) blocked = 'Nothing to send'
  else if (script.length > 4000) blocked = 'Too long for the console; put it in a macro or a file'

  const needsConfirm = lines.some((l) => CONFIRM.has(l.risk))
  if (ctx.jobActive) {
    for (const l of lines)
      if (l.risk === 'motion' || l.risk === 'restart' || l.risk === 'tool-state') l.reason += ' while a job is running'
  }
  return { script: lines.map((l) => l.line).join('\n'), lines, risk, needsConfirm, blocked }
}

// ---- the only way to make something sendable -----------------------------

declare const checked: unique symbol
/** A script that has been checked (and confirmed if it needed to be). */
export type CheckedScript = string & { readonly [checked]: true }

/**
 * Turn a check result into something the client will send.
 * confirmed must be true when the check needed a confirmation.
 */
export function approve(c: ScriptCheck, confirmed: boolean): CheckedScript {
  if (c.blocked) throw new Error(c.blocked)
  if (c.needsConfirm && !confirmed) throw new Error('This command needs your confirmation first')
  return c.script as CheckedScript
}

/**
 * A button inside a Klipper prompt (a Rhino wizard). The wizard already asked,
 * so no second confirmation. A button whose command is "action:..." (e.g.
 * "action:prompt_end", used by some Rhino macros) is a prompt instruction, not
 * G-code: send it back as RESPOND so Klipper, Mainsail and Studio all close it.
 */
export function fromPrompt(command: string): CheckedScript {
  const c = command.trim()
  if (!c || c.length > 300 || /[\r\n]/.test(c)) throw new Error('That button has no valid command')
  if (/^action:/i.test(c)) return `RESPOND TYPE=command MSG="${c.replace(/"/g, "'")}"` as CheckedScript
  return c as CheckedScript
}

// ---- builders for the Control screen's own buttons ------------------------

export type Axis = 'X' | 'Y' | 'Z'

export interface JogContext {
  /** Machine position [x, y, z] from toolhead.position */
  position: number[] | null
  /** toolhead.axis_minimum / axis_maximum */
  min: number[] | null
  max: number[] | null
  homed: string
}

export const JOG_FEED: Record<Axis, number> = { X: 6000, Y: 6000, Z: 600 }

/**
 * A relative jog that leaves the G-code state as it was (G90/G91, feed rate).
 * Refused before sending if the axis isn't homed or the move would leave the
 * machine's travel (Klipper would refuse too, but this says why).
 */
export function jogScript(axis: Axis, delta: number, ctx: JogContext): { script: string } | { error: string } {
  const i = { X: 0, Y: 1, Z: 2 }[axis]
  if (!ctx.homed.toLowerCase().includes(axis.toLowerCase())) return { error: `Home ${axis} first` }
  const pos = ctx.position?.[i]
  const lo = ctx.min?.[i]
  const hi = ctx.max?.[i]
  if (pos == null || lo == null || hi == null) return { error: 'Position not known yet' }
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > (axis === 'Z' ? 25 : 100)) return { error: 'Step out of range' }
  const target = pos + delta
  if (target < lo - 1e-6 || target > hi + 1e-6) return { error: `${axis} would go past its travel (${lo} to ${hi} mm)` }
  const d = Number(delta.toFixed(3))
  return {
    script: ['SAVE_GCODE_STATE NAME=_rs_jog', 'G91', `G1 ${axis}${d} F${JOG_FEED[axis]}`, 'RESTORE_GCODE_STATE NAME=_rs_jog'].join('\n'),
  }
}

export function heaterScript(heater: 'extruder' | 'heater_bed', target: number): { script: string } | { error: string } {
  const max = heater === 'extruder' ? 300 : 130
  if (!Number.isFinite(target) || target < 0 || target > max) return { error: `Enter 0 to ${max}°` }
  return { script: `SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${Math.round(target)}` }
}

/** Names safe to pass as FILE= to the Rhino job wizards (no quoting in Klipper params). */
export function safeFileParam(path: string): boolean {
  return /^[A-Za-z0-9._/-]{1,200}$/.test(path) && !path.includes('..')
}
