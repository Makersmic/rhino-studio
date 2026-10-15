/**
 * A pretend Moonraker for working on Rhino Studio without the machine.
 *
 *   npm run mock                      # listens on http://localhost:7125
 *   MOONRAKER=http://localhost:7125 npm run dev
 *
 * Scenarios (MOCK_SCENARIO=...):
 *   mounted   LightSaber confirmed in slot 3 (default)
 *   restart   Klipper just restarted: current_tool 0, last saved slot 1
 *   swap      a swap from slot 1 to slot 4 is under way
 *   custom    a user-added HotWire in slot 6 is mounted
 *   spindle   HotJoe (CNC) confirmed in slot 4, with a work zero set
 *   toolchanger  NOT a Rhino: a StealthChanger-style machine running
 *             viesturz/klipper-toolchanger with three tools (T0, T1 print
 *             heads, Brush with no extruder) and tool sensors. SELECT_TOOL,
 *             T0..T2, UNSELECT_TOOL and INITIALIZE_TOOLCHANGER work.
 *             MOCK_DETECT T=n makes the sensor see tool n (-1 = none) to
 *             test the mismatch stop. MOCK_TC=uninitialized starts it
 *             uninitialised.
 *
 * It logs every method the app sends, so you can see that Phase 2a only
 * reads. The emergency stop puts the mock Klipper into "shutdown" like M112.
 *
 * Cameras: three pretend cameras (bed, nozzle, side) show rendered frames
 * of a print in progress (scripts/fixtures/webcam), served like crowsnest:
 * /webcam/?action=stream (MJPEG) and ?action=snapshot. MOCK_CAMERAS=0
 * starts with none, to see the empty states. Adding, editing and deleting
 * cameras works and is kept until the mock stops.
 *
 * It also pretends to be the Rhino Portal's maintenance API, using a real
 * overview from the Portal's year-of-use demo (scripts/fixtures). Run the
 * dev server with PORTAL=http://localhost:7125 as well. One task (the laser
 * lens) is made overdue so every state shows.
 */
import { createServer, type IncomingMessage } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { WebSocketServer, type WebSocket } from 'ws'

const PORT = Number(process.env.MOCK_PORT ?? 7125)
const scenario = process.env.MOCK_SCENARIO ?? 'mounted'

const toolMapping: Record<number, string> = { 1: 'BlockOne', 2: 'SwitchFly', 3: 'LightSaber', 4: 'HotJoe', 5: 'DragKnife' }
const toolheads: Record<string, { type: string }> = {
  BlockOne: { type: 'DEPOSITION' },
  SwitchFly: { type: 'DEPOSITION' },
  LightSaber: { type: 'LASER' },
  HotJoe: { type: 'CNC' },
  DragKnife: { type: 'DRAG_KNIFE' },
}
const custom = scenario === 'custom' ? { tool_mapping: { 6: 'HotWire' }, toolheads: { HotWire: { type: 'CNC' } } } : { tool_mapping: {}, toolheads: {} }

const tool = {
  mounted: { current_tool: 3, pending_tool: -1, saved: 3 },
  restart: { current_tool: 0, pending_tool: -1, saved: 1 },
  swap: { current_tool: 1, pending_tool: 4, saved: 1 },
  custom: { current_tool: 6, pending_tool: -1, saved: 6 },
  spindle: { current_tool: 4, pending_tool: -1, saved: 4 },
}[scenario] ?? { current_tool: 3, pending_tool: -1, saved: 3 }

let klippy: 'ready' | 'shutdown' = 'ready'
const status: Record<string, Record<string, unknown>> = {
  webhooks: { state: 'ready', state_message: 'Printer is ready' },
  print_stats: { state: 'standby', filename: '', message: '', print_duration: 0 },
  virtual_sdcard: { progress: 0, is_active: false },
  toolhead: { position: [120.0, 85.5, 12.3, 0], homed_axes: 'xyz', axis_minimum: [0, 0, -5, 0], axis_maximum: [576, 406, 300, 0] },
  gcode_move: { gcode_position: [120.0, 85.5, 12.3, 0], homing_origin: [0, 0, 0, 0], speed_factor: 1, absolute_coordinates: true },
  pause_resume: { is_paused: false },
  idle_timeout: { state: 'Idle' },
  extruder: { temperature: 24.1, target: 0 },
  heater_bed: { temperature: 23.6, target: 0 },
  'gcode_macro SWAP_TOOL': { current_tool: tool.current_tool, pending_tool: tool.pending_tool },
  'gcode_macro VARIABLES': { tool_mapping: toolMapping, toolheads },
  'gcode_macro CUSTOM_TOOLS': custom,
  save_variables: { variables: { current_tool: tool.saved } },
  // Tool outputs, as in the Rhino config
  fan: { speed: 0 },
  'output_pin LASER_INITIALIZE': { value: 0 },
  'output_pin SERVO_LASER': { value: 0 },
  'output_pin Spindle_power': { value: 0 },
  'output_pin SPINDLE_SPEED': { value: 0.3 },
}
if (scenario === 'toolchanger') {
  // Not a Rhino: no Rhino macros or tool pins, a [toolchanger] and [tool ...] objects instead
  for (const k of ['gcode_macro SWAP_TOOL', 'gcode_macro VARIABLES', 'gcode_macro CUSTOM_TOOLS', 'save_variables',
    'output_pin LASER_INITIALIZE', 'output_pin SERVO_LASER', 'output_pin Spindle_power', 'output_pin SPINDLE_SPEED']) delete status[k]
  const uninit = process.env.MOCK_TC === 'uninitialized'
  status.toolchanger = {
    status: uninit ? 'uninitialized' : 'ready', tool: uninit ? null : 'tool T0', tool_number: uninit ? -1 : 0,
    detected_tool: 'tool T0', detected_tool_number: 0, has_detection: true,
    tool_numbers: [0, 1, 2], tool_names: ['tool T0', 'tool T1', 'tool Brush'],
  }
  status['tool T0'] = { tool_number: 0, extruder: 'extruder', fan: 'T0_partfan', active: !uninit, detect_state: 'present' }
  status['tool T1'] = { tool_number: 1, extruder: 'extruder1', fan: 'T1_partfan', active: false, detect_state: 'absent' }
  status['tool Brush'] = { tool_number: 2, extruder: null, fan: null, active: false, detect_state: 'absent' }
  status.extruder1 = { temperature: 23.8, target: 0 }
}
if (scenario === 'spindle') {
  // Work zero set at the corner of a block of wood
  status.gcode_move = { ...status.gcode_move, homing_origin: [80, 60, 4.5, 0], gcode_position: [40, 25.5, 7.8, 0] }
}
/** Work position = machine position minus the work zero */
const workPos = (pos: number[]) => {
  const o = (status.gcode_move.homing_origin as number[]) ?? [0, 0, 0, 0]
  return pos.map((v, i) => +(v - (o[i] ?? 0)).toFixed(3))
}
function outputsOff() {
  update('output_pin LASER_INITIALIZE', { value: 0 })
  update('output_pin SERVO_LASER', { value: 0 })
  update('output_pin Spindle_power', { value: 0 })
  update('output_pin SPINDLE_SPEED', { value: 0.3 })
  update('fan', { speed: 0 })
}

const files: Record<string, string> = {
  'benchy_PLA_0.4.gcode': '; generated by OrcaSlicer\n; thumbnail begin 300x300 1234\n; AAAA\n; thumbnail end\nSTART_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=0\nG1 X10 Y10\n',
  'sign_engrave.gcode': '; rhino_toolhead = LightSaber\n; generated by Rhino Studio\nG0 X0 Y0\n',
  'vinyl_decal.gcode': '; rhino_toolhead = DragKnife\nG0 X0 Y0\n',
  'pocket_test.nc': 'G21\nG90\n; no toolhead declared\nG0 Z5\n',
  'walnut_coaster_pocket.nc': '; rhino_toolhead = HotJoe\n; generated by Rhino Studio\nG21\nG90\nG0 Z5\n',
}
const fileTimes = Object.fromEntries(Object.keys(files).map((f, i) => [f, Date.now() / 1000 - i * 3600]))

// ---- temperature history (Moonraker keeps 20 minutes, one reading a second) --
type Series = { temperatures: number[]; targets: number[]; powers: number[] }
const tempStore: Record<string, Series> = { extruder: { temperatures: [], targets: [], powers: [] }, heater_bed: { temperatures: [], targets: [], powers: [] } }
{
  // A made-up past: the hotend was heated to 210 for a while, then cooled
  let e = 24, b = 23.6
  for (let i = 1200; i > 0; i--) {
    const et = i > 840 || i < 420 ? 0 : 210
    const bt = i > 900 || i < 360 ? 0 : 60
    e += ((et || 24) - e) * (et ? 0.03 : 0.008) + (Math.random() - 0.5) * 0.6
    b += ((bt || 23.6) - b) * (bt ? 0.012 : 0.004) + (Math.random() - 0.5) * 0.2
    tempStore.extruder.temperatures.push(+e.toFixed(2)); tempStore.extruder.targets.push(et); tempStore.extruder.powers.push(0)
    tempStore.heater_bed.temperatures.push(+b.toFixed(2)); tempStore.heater_bed.targets.push(bt); tempStore.heater_bed.powers.push(0)
  }
  status.extruder.temperature = e
  status.heater_bed.temperature = b
}

// ---- pretend cameras -----------------------------------------------------
const frameDir = new URL('./fixtures/webcam/', import.meta.url)
const frames: Record<string, Buffer[]> = {}
for (const f of readdirSync(frameDir).sort()) {
  const m = /^(\w+)-\d+\.jpg$/.exec(f)
  if (m) (frames[m[1]!] ??= []).push(readFileSync(new URL(f, frameDir)))
}
const camPaths: Record<string, string> = { webcam: 'bed', webcam2: 'nozzle', webcam3: 'side' }
let webcamSeq = 0
const cam = (name: string, path: string, service: string, extra: Record<string, unknown> = {}) => ({
  name, uid: `mock-${++webcamSeq}`, location: 'printer', service, enabled: true, icon: 'mdiWebcam',
  target_fps: 15, target_fps_idle: 5, stream_url: `/${path}/?action=stream`, snapshot_url: `/${path}/?action=snapshot`,
  flip_horizontal: false, flip_vertical: false, rotation: 0, aspect_ratio: '16:9', extra_data: {}, source: 'database', ...extra,
})
let webcams: Record<string, unknown>[] = process.env.MOCK_CAMERAS === '0' ? [] : [
  cam('Bed', 'webcam', 'mjpegstreamer'),
  cam('Nozzle', 'webcam2', 'mjpegstreamer-adaptive', { target_fps: 4 }),
  cam('Side', 'webcam3', 'mjpegstreamer'),
]
const frameAt = (set: string) => {
  const list = frames[set] ?? frames.bed ?? []
  return list[Math.floor(Date.now() / 400) % Math.max(1, list.length)]
}

const sockets = new Set<WebSocket>()
const notify = (method: string, params?: unknown[]) => {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) })
  for (const s of sockets) s.send(msg)
}

function emergencyStop(via: string) {
  console.log(`!! EMERGENCY STOP received (${via})`)
  klippy = 'shutdown'
  status.webhooks = { state: 'shutdown', state_message: 'Shutdown due to M112 command' }
  status.extruder.target = 0
  status.heater_bed.target = 0
  notify('notify_klippy_shutdown')
  notify('notify_status_update', [{ webhooks: status.webhooks }, Date.now() / 1000])
}

// ---- pretend Klipper: console, macros, prompts, jobs ---------------------
const RHINO_MACROS = [
  'SWAP_TOOL', 'RESTORE_TOOL', 'CONFIRM_TOOL_INSTALL', 'SET_Z_ZERO', 'PREHEAT', 'LASER_JOB_SETUP', 'CNC_JOB_SETUP', 'DRAGKNIFE_JOB_SETUP',
  'TOOL_JOB_SETUP', 'SET_WORK_ZERO', 'LASER_FOCUS_ALIGN', 'NOZZLE_HEIGHT_CALIBRATE', 'BACKUP_CFG', 'PM_STATUS', 'LEDMAX', 'LEDOFF',
  'LIST_TOOLHEADS', 'CALIBRATE_ESC', 'DEACTIVATE_LASER', 'SWITCH_T1', 'CANCEL_PRINT', 'PAUSE', 'RESUME', 'G28', 'SWITCH_T0', 'ACTIVATE_LASER', 'SET_TOOL_POWER', 'BED_COOLDOWN',
  'RHINO_POSITIONS', 'CHECK_TOOLHEADS', 'SHOW_BACKUP_LOCATION', 'TURN_ON_MOTORS', 'M0', 'SET_SERVO_ANGLE', // ones a real Rhino (1.4.x) has that no group claims
  '_LASER_START', '_LASER_ABORT', '_RESTORE_TOOL_CONFIRM', 'VARIABLES', 'CUSTOM_TOOLS',
]
const MACROS = scenario === 'toolchanger'
  ? ['PAUSE', 'RESUME', 'CANCEL_PRINT', 'PRINT_START', 'PRINT_END', 'CLEAN_NOZZLE', 'CHAMBER_LIGHTS_ON', 'CHAMBER_LIGHTS_OFF', 'G28']
  : RHINO_MACROS
const HELP: Record<string, string> = Object.fromEntries(MACROS.map((m) => [m, `${scenario === 'toolchanger' ? 'Macro' : 'Rhino macro'} ${m}`]))
Object.assign(HELP, { G1: 'Move', M105: 'Report temperatures', SET_HEATER_TEMPERATURE: 'Set a heater target', FIRMWARE_RESTART: 'Restart firmware', STATUS: 'Report status' })

const gcodeStore: { message: string; time: number; type: 'command' | 'response' }[] = [
  { message: 'Klipper state: Ready', time: Date.now() / 1000 - 600, type: 'response' },
]
function respond(message: string) {
  gcodeStore.push({ message, time: Date.now() / 1000, type: 'response' })
  if (gcodeStore.length > 500) gcodeStore.shift()
  notify('notify_gcode_response', [message])
}
function update(obj: string, fields: Record<string, unknown>) {
  status[obj] = { ...status[obj], ...fields }
  notify('notify_status_update', [{ [obj]: fields }, Date.now() / 1000])
}
const prompt = (lines: string[]) => lines.forEach((l) => respond(`// action:${l}`))
let relative = false
let jobFile = ''
const name = (slot: number) => toolMapping[slot] ?? (custom.tool_mapping as Record<number, string>)[slot] ?? `slot ${slot}`
const arg = (line: string, k: string) => new RegExp(`${k}=("?)([^\\s"]+)\\1`, 'i').exec(line)?.[2]

let busyTimer: ReturnType<typeof setTimeout> | null = null
function busyFor(ms: number) {
  update('idle_timeout', { state: 'Printing' })
  if (busyTimer) clearTimeout(busyTimer)
  busyTimer = setTimeout(() => {
    if (status.print_stats.state !== 'printing') update('idle_timeout', { state: 'Ready' })
  }, ms)
}

function startJob(file: string) {
  if (!(file in files)) throw new Error(`File not found: ${file}`)
  jobFile = file
  update('print_stats', { state: 'printing', filename: file, print_duration: 0 })
  update('virtual_sdcard', { progress: 0, is_active: true })
  update('idle_timeout', { state: 'Printing' })
  const swapNow = status['gcode_macro SWAP_TOOL'] as { current_tool: number } | undefined
  if (swapNow ? name(swapNow.current_tool) === 'BlockOne' : status.toolchanger?.tool_number === 0) update('fan', { speed: 0.8 })
  respond(`File opened:${file}`)
}

// ---- pretend klipper-toolchanger (scenario 'toolchanger') ----------------
const tcToolName = (n: number) => (status.toolchanger?.tool_names as string[])?.[(status.toolchanger?.tool_numbers as number[]).indexOf(n)] ?? null
function selectTool(n: number) {
  const tc = status.toolchanger!
  if (tc.status === 'changing') throw new Error('Toolchanger is busy')
  if (n >= 0 && !tcToolName(n)) throw new Error(`Select tool: T=${n} not found`)
  const from = tc.tool_number as number
  update('toolchanger', { status: 'changing' })
  respond(`// Changing tool T${from} -> T${n}`)
  setTimeout(() => {
    for (const nm of tc.tool_names as string[]) update(nm, { active: false, detect_state: 'absent' })
    const obj = tcToolName(n)
    if (obj) update(obj, { active: true, detect_state: 'present' })
    update('toolchanger', { status: 'ready', tool: obj, tool_number: n, detected_tool: obj, detected_tool_number: n })
    respond(n >= 0 ? `// Selected T${n}` : '// Tool docked')
  }, 2500)
}
function toolchangerCommand(cmd: string, line: string): boolean {
  const t = /^T(\d+)$/.exec(cmd)
  if (t) { selectTool(Number(t[1])); return true }
  switch (cmd) {
    case 'SELECT_TOOL': selectTool(Number(arg(line, 'T') ?? -1)); return true
    case 'UNSELECT_TOOL': selectTool(-1); return true
    case 'INITIALIZE_TOOLCHANGER': {
      const seen = status.toolchanger!.detected_tool_number as number
      update('toolchanger', { status: 'initializing' })
      setTimeout(() => {
        update('toolchanger', { status: 'ready', tool: tcToolName(seen), tool_number: seen })
        if (tcToolName(seen)) update(tcToolName(seen)!, { active: true })
        respond(`// Toolchanger initialised with T${seen}`)
      }, 1500)
      return true
    }
    case 'MOCK_DETECT': {
      const n = Number(arg(line, 'T') ?? -1)
      update('toolchanger', { detected_tool_number: n, detected_tool: tcToolName(n) })
      respond(`// (mock) tool sensor now sees ${n >= 0 ? `T${n}` : 'no tool'}`)
      return true
    }
  }
  return false
}

function runLine(raw: string) {
  const line = raw.replace(/;.*$/, '').trim()
  if (!line) return
  const cmd = (/^([GM]\d+(?:\.\d+)?)/i.exec(line)?.[1] ?? line.split(/\s+/)[0]!).toUpperCase()
  const th = status.toolhead as { position: number[]; homed_axes: string; axis_minimum: number[]; axis_maximum: number[] }
  const swap = status['gcode_macro SWAP_TOOL'] as { current_tool: number; pending_tool: number }
  if (scenario === 'toolchanger' && toolchangerCommand(cmd, line)) return
  switch (cmd) {
    case 'G28': {
      const axes = /[XYZ]/i.test(line.slice(3)) ? line.slice(3).toLowerCase().replace(/[^xyz]/g, '') : 'xyz'
      const homed = [...new Set((th.homed_axes + axes).split(''))].sort().join('')
      const pos = [...th.position]
      if (axes.includes('x')) pos[0] = 0
      if (axes.includes('y')) pos[1] = 0
      if (axes.includes('z')) pos[2] = 10
      update('toolhead', { homed_axes: homed, position: pos })
      update('gcode_move', { gcode_position: workPos(pos) })
      return
    }
    case 'G90': relative = false; return
    case 'G91': relative = true; return
    case 'SAVE_GCODE_STATE': return
    case 'RESTORE_GCODE_STATE': relative = false; return
    case 'G0':
    case 'G1': {
      const pos = [...th.position]
      for (const [i, a] of ['X', 'Y', 'Z'].entries()) {
        const v = new RegExp(`${a}(-?[\\d.]+)`, 'i').exec(line)?.[1]
        if (v == null) continue
        if (!th.homed_axes.includes(a.toLowerCase())) throw new Error('Must home axis first')
        pos[i] = relative ? pos[i]! + Number(v) : Number(v)
        if (pos[i]! < th.axis_minimum[i]! || pos[i]! > th.axis_maximum[i]!) throw new Error(`Move out of range: ${pos.slice(0, 3).join(' ')}`)
      }
      update('toolhead', { position: pos })
      update('gcode_move', { gcode_position: workPos(pos) })
      return
    }
    case 'M84':
      update('toolhead', { homed_axes: '' })
      respond('// Motors off')
      return
    case 'SET_HEATER_TEMPERATURE': {
      const h = arg(line, 'HEATER') === 'heater_bed' ? 'heater_bed' : 'extruder'
      update(h, { target: Number(arg(line, 'TARGET') ?? 0) })
      return
    }
    case 'SET_PIN': {
      const pinName = arg(line, 'PIN')
      if (pinName && status[`output_pin ${pinName}`]) update(`output_pin ${pinName}`, { value: Number(arg(line, 'VALUE') ?? 0) })
      return
    }
    case 'SPINDLE_ACTIVATE':
      update('output_pin Spindle_power', { value: 1 })
      update('output_pin SPINDLE_SPEED', { value: 0.3 })
      respond('// Energizing HotJoe CNC spindle power rails...')
      return
    case 'SPINDLE_DEACTIVATE':
    case 'M5':
      outputsOff()
      return
    case 'M106':
      update('fan', { speed: Math.min(1, Number(/S([\d.]+)/i.exec(line)?.[1] ?? 255) / 255) })
      return
    case 'M107':
      update('fan', { speed: 0 })
      return
    case 'M105':
      respond(`ok T:${(status.extruder.temperature as number).toFixed(1)} /${status.extruder.target} B:${(status.heater_bed.temperature as number).toFixed(1)} /${status.heater_bed.target}`)
      return
    case 'RESPOND': {
      const msg = /MSG="?([^"]*)"?/i.exec(line)?.[1] ?? ''
      respond(/TYPE=command/i.test(line) ? `// ${msg}` : `echo: ${msg}`)
      return
    }
    case 'SWAP_TOOL': {
      if (status.print_stats.state === 'printing' || status.print_stats.state === 'paused')
        throw new Error('CRITICAL SAFETY BLOCK: Tool swaps are strictly forbidden while a print job is active or paused!')
      const t = arg(line, 'TOOL')
      if (!t) {
        prompt([
          'prompt_begin Swap toolhead',
          `prompt_text Installed now: slot ${swap.current_tool} (${name(swap.current_tool)})`,
          'prompt_text Pick the toolhead to install. The machine cools down and lowers the bed first.',
          ...Object.entries({ ...toolMapping, ...(custom.tool_mapping as object) }).map(([s, n]) => `prompt_button Slot ${s}: ${n}|SWAP_TOOL TOOL=${s}|info`),
          'prompt_footer_button Cancel|action:prompt_end|error',
          'prompt_show',
        ])
        return
      }
      update('gcode_macro SWAP_TOOL', { pending_tool: Number(t) })
      update('extruder', { target: 0 })
      update('toolhead', { position: [th.position[0], th.position[1], 150, 0] })
      prompt([
        'prompt_begin Fit the new toolhead',
        `prompt_text 1. Unplug and remove ${name(swap.current_tool)} (slot ${swap.current_tool}).`,
        `prompt_text 2. Fit ${name(Number(t))} and plug it in.`,
        `prompt_button ${name(Number(t))} is fitted|CONFIRM_TOOL_INSTALL TOOL=${t}|primary`,
        'prompt_footer_button Abort|ABORT_TOOL_SWAP|error',
        'prompt_show',
      ])
      return
    }
    case 'CONFIRM_TOOL_INSTALL':
    case '_RESTORE_TOOL_CONFIRM': {
      const t = Number(arg(line, 'TOOL') ?? arg(line, 'SLOT'))
      update('gcode_macro SWAP_TOOL', { current_tool: t, pending_tool: -1 })
      update('save_variables', { variables: { current_tool: t } })
      prompt(['prompt_end'])
      respond(`// ${name(t)} confirmed in slot ${t}`)
      return
    }
    case 'ABORT_TOOL_SWAP':
      update('gcode_macro SWAP_TOOL', { pending_tool: -1 })
      prompt(['prompt_end'])
      return
    case 'RESTORE_TOOL': {
      const saved = (status.save_variables.variables as { current_tool: number }).current_tool
      prompt([
        'prompt_begin Klipper started - which toolhead is mounted?',
        `prompt_text Last saved: ${name(saved)} (slot ${saved}). Check the machine before you answer.`,
        `prompt_button ${name(saved)} is mounted|_RESTORE_TOOL_CONFIRM SLOT=${saved}|primary`,
        'prompt_footer_button Not sure - swap instead|SWAP_TOOL',
        'prompt_show',
      ])
      return
    }
    case 'CNC_JOB_SETUP': {
      jobFile = arg(line, 'FILE') ?? ''
      prompt([
        'prompt_begin CNC setup',
        `prompt_text File: ${jobFile || '(none)'}`,
        'prompt_text Bit tight, work clamped, dust extraction on, eye protection on?',
        'prompt_button_group_start',
        'prompt_button Set work zero here|SET_WORK_ZERO',
        'prompt_button Spin up and start|_CNC_START|primary',
        'prompt_button_group_end',
        'prompt_footer_button Stop the spindle and cancel|_CNC_ABORT|error',
        'prompt_show',
      ])
      return
    }
    case '_CNC_START':
      prompt(['prompt_end'])
      update('output_pin Spindle_power', { value: 1 })
      update('output_pin SPINDLE_SPEED', { value: 0.72 })
      startJob(jobFile)
      return
    case '_CNC_ABORT':
      prompt(['prompt_end'])
      outputsOff()
      respond('// Spindle stopped, setup cancelled')
      return
    case 'LASER_JOB_SETUP':
    case 'DRAGKNIFE_JOB_SETUP':
    case 'TOOL_JOB_SETUP': {
      jobFile = arg(line, 'FILE') ?? ''
      prompt([
        `prompt_begin ${cmd === 'LASER_JOB_SETUP' ? 'Laser setup' : 'Job setup'}`,
        `prompt_text File: ${jobFile || '(none)'}`,
        'prompt_text Safety glasses on, enclosure closed, extraction running?',
        'prompt_button_group_start',
        'prompt_button Set Z zero|SET_Z_ZERO',
        'prompt_button Start the job|_LASER_START|primary',
        'prompt_button_group_end',
        'prompt_footer_button Cancel setup|_LASER_ABORT|error',
        'prompt_show',
      ])
      return
    }
    case '_LASER_START':
      prompt(['prompt_end'])
      if (name(swap.current_tool) === 'LightSaber') {
        update('output_pin LASER_INITIALIZE', { value: 1 })
        update('output_pin SERVO_LASER', { value: 0.35 })
      }
      startJob(jobFile)
      return
    case '_LASER_ABORT':
      prompt(['prompt_end'])
      respond('// Setup cancelled, tool off')
      return
    case 'SET_Z_ZERO':
      respond('// SET_Z_ZERO: move the bed with the buttons, then SET (mock)')
      return
    case 'SET_WORK_ZERO':
      update('gcode_move', { homing_origin: [...th.position], gcode_position: [0, 0, 0, 0] })
      respond('// Work zero set')
      return
    case 'FIRMWARE_RESTART':
    case 'RESTART':
      klippy = 'shutdown'
      notify('notify_klippy_disconnected')
      setTimeout(() => {
        klippy = 'ready'
        update('webhooks', { state: 'ready', state_message: 'Printer is ready' })
        update('gcode_macro SWAP_TOOL', { current_tool: 0, pending_tool: -1 })
        notify('notify_klippy_ready')
      }, 1500)
      return
    default:
      if (MACROS.includes(cmd) || cmd === 'STATUS' || cmd === 'M117' || cmd.startsWith('SET_')) {
        respond(`// ${cmd} done (mock)`)
        return
      }
      throw new Error(`Unknown command:"${cmd}"`)
  }
}

const database: Record<string, Record<string, unknown>> = {}

function handle(method: string, params: Record<string, unknown> | undefined): unknown {
  switch (method) {
    case 'printer.gcode.script': {
      const script = String(params?.script ?? '')
      gcodeStore.push({ message: script, time: Date.now() / 1000, type: 'command' })
      console.log(`  GCODE ${script.replace(/\n/g, ' | ')}`)
      if (klippy !== 'ready' && !/^\s*(FIRMWARE_RESTART|RESTART)\s*$/i.test(script)) throw new Error('Klipper is not ready')
      busyFor(4000) // Klipper reports "Printing" while it works through commands
      for (const l of script.split('\n')) runLine(l)
      return 'ok'
    }
    case 'server.temperature_store': return tempStore
    case 'server.webcams.list': return { webcams }
    // Moonraker's database, only as much as Studio uses (its own namespace)
    case 'server.database.get_item': {
      const ns = String(params?.namespace ?? ''), key = String(params?.key ?? '')
      const v = database[ns]?.[key]
      if (v === undefined) throw new Error(`Key '${key}' in namespace '${ns}' not found`)
      return { namespace: ns, key, value: v }
    }
    case 'server.database.post_item': {
      const ns = String(params?.namespace ?? ''), key = String(params?.key ?? '')
      ;(database[ns] ??= {})[key] = params?.value
      return { namespace: ns, key, value: params?.value }
    }
    case 'server.webcams.post_item': {
      const p = { ...(params ?? {}) } as Record<string, unknown>
      const i = webcams.findIndex((w) => w.uid === p.uid)
      const item = { ...(i >= 0 ? webcams[i] : cam(String(p.name), 'webcam', 'mjpegstreamer')), ...p, source: 'database' }
      if (i >= 0) webcams[i] = item
      else webcams.push(item)
      console.log(`  CAMERA saved ${item.name}`)
      notify('notify_webcams_changed', [{ webcams }])
      return { webcam: item }
    }
    case 'server.webcams.delete_item': {
      const gone = webcams.find((w) => w.uid === params?.uid)
      if (!gone) throw new Error('No such camera')
      webcams = webcams.filter((w) => w !== gone)
      console.log(`  CAMERA deleted ${gone.name}`)
      notify('notify_webcams_changed', [{ webcams }])
      return { webcam: gone }
    }
    case 'server.gcode_store': return { gcode_store: gcodeStore.slice(-Number(params?.count ?? 100)) }
    case 'printer.gcode.help': return HELP
    case 'printer.print.start': startJob(String(params?.filename)); return 'ok'
    case 'printer.print.pause':
      update('print_stats', { state: 'paused' })
      update('pause_resume', { is_paused: true })
      return 'ok'
    case 'printer.print.resume':
      update('print_stats', { state: 'printing' })
      update('pause_resume', { is_paused: false })
      return 'ok'
    case 'printer.print.cancel':
      update('print_stats', { state: 'cancelled' })
      update('virtual_sdcard', { is_active: false })
      update('idle_timeout', { state: 'Ready' })
      outputsOff()
      respond('// Job cancelled, tool off')
      return 'ok'
    case 'server.connection.identify': return { connection_id: 1 }
    case 'server.info': return { klippy_connected: true, klippy_state: klippy, moonraker_version: 'mock' }
    case 'printer.objects.list': return { objects: [...new Set([...Object.keys(status), ...MACROS.map((m) => `gcode_macro ${m}`)])] }
    case 'printer.objects.subscribe': {
      const wanted = Object.keys((params?.objects as object) ?? {})
      return { eventtime: Date.now() / 1000, status: Object.fromEntries(wanted.filter((k) => k in status).map((k) => [k, status[k]])) }
    }
    case 'server.files.list':
      return Object.entries(files).map(([path, text]) => ({ path, modified: fileTimes[path], size: text.length * 900, permissions: 'rw' }))
    case 'printer.emergency_stop':
      emergencyStop('websocket')
      return 'ok'
    default:
      throw new Error(`Method not found: ${method}`)
  }
}

// ---- pretend Rhino Portal (maintenance) ---------------------------------
const PORTAL_TOKEN = 'mock-token-' + Math.random().toString(36).slice(2)
const maint = JSON.parse(readFileSync(new URL('./fixtures/maint-overview.json', import.meta.url), 'utf8'))
const maintHistory = JSON.parse(readFileSync(new URL('./fixtures/maint-history.json', import.meta.url), 'utf8'))
// The fixtures were recorded on a fixed day: move the work log and the jobs up to today, so the
// Dashboard's "last 12 weeks" charts have something in them
const fixtureShift = Math.round(Date.now() / 1000 - (maint.now as number))
for (const r of maintHistory.records as { at: number }[]) r.at += fixtureShift
const maintJobs = (JSON.parse(readFileSync(new URL('./fixtures/maint-jobs.json', import.meta.url), 'utf8')).jobs as { ago_s: number; status: string; duration_s: number }[])

function portalFixture(name: string): unknown {
  try {
    return JSON.parse(readFileSync(new URL(`./fixtures/portal-${name}.json`, import.meta.url), 'utf8'))
  } catch {
    return null
  }
}

/** The Portal's /api/dash/jobs (rhino/portal/routes.py dash_jobs): 12 Monday-based weeks, oldest first. */
function jobsPerWeek() {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime() / 1000
  const starts = Array.from({ length: 12 }, (_, i) => monday - 7 * 86400 * (11 - i))
  const weeks = starts.map((start) => ({ start, completed: 0, cancelled: 0, error: 0, hours: 0 }))
  const t0 = Date.now() / 1000 - 2 * 3600
  for (const j of maintJobs) {
    const start = t0 - j.ago_s - j.duration_s
    if (start < starts[0]!) continue
    const w = weeks[Math.min(11, Math.floor((start - starts[0]!) / (7 * 86400)))]!
    if (j.status === 'completed') w.completed++
    else if (j.status === 'cancelled') w.cancelled++
    else if (['error', 'klippy_shutdown', 'klippy_disconnect', 'server_exit'].includes(j.status)) w.error++
    w.hours += j.duration_s / 3600
  }
  return { ok: true, weeks, available: true }
}
maint.now = Date.now() / 1000
const lens = maint.tasks.find((t: { title: string }) => t.title.startsWith('Clean the laser lens'))
if (lens) {
  lens.status.state = 'overdue'
  lens.status.fraction = 1.08
  lens.status.next = { ...lens.status.next, state: 'overdue', fraction: 1.08, text: '0.6 h over (due at 71 h)' }
}
function recount() {
  const c = { overdue: 0, due_soon: 0, snoozed: 0, held: 0 }
  for (const t of maint.tasks) {
    const st = t.status
    if (!st) continue
    if (st.hold) {
      c.held++
      if (st.hold.list !== 'due') continue
    }
    if (st.state === 'overdue' || st.state === 'due_soon') st.snoozed ? c.snoozed++ : (c[st.state as 'overdue' | 'due_soon'] += 1)
  }
  maint.counts = c
}
recount()

const readBody = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve) => {
    let b = ''
    req.on('data', (d) => (b += d))
    req.on('end', () => resolve(b ? JSON.parse(b) : {}))
  })

function json(res: import('node:http').ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

async function portal(req: IncomingMessage, res: import('node:http').ServerResponse, url: string): Promise<boolean> {
  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' }).end(
      `<!doctype html><html><head><meta name="rhino-token" content="${PORTAL_TOKEN}"></head><body><p class="version">v1.4.1</p></body></html>`,
    )
    return true
  }
  if (req.method === 'GET' && url === '/api/maint') return json(res, 200, maint), true
  if (req.method === 'GET' && url === '/api/maint/history') return json(res, 200, maintHistory), true
  if (req.method === 'GET' && url === '/api/dash/jobs') return json(res, 200, jobsPerWeek()), true
  // Tool library, read-only, from the Portal's demo (scripts/fixtures/portal-*.json). Changes need the real
  // Portal: python3 dev/demo_server.py in Toolhead_Manager, then PORTAL=http://127.0.0.1:5055 npm run dev
  if (req.method === 'GET' && url === '/api/state') return json(res, 200, portalFixture('state')), true
  if (req.method === 'GET' && url === '/api/options') return json(res, 200, portalFixture('options')), true
  if (req.method === 'GET' && url === '/api/lists') return json(res, 200, portalFixture('lists')), true
  if (req.method === 'GET' && url === '/api/maint/tasklib') return json(res, 200, portalFixture('tasklib')), true
  if (req.method === 'GET' && url === '/api/maint/lists') return json(res, 200, portalFixture('maint-lists')), true
  const sheet = url.match(/^\/api\/tools\/([^/]+)\/sheet$/)
  if (req.method === 'GET' && sheet) {
    const f = portalFixture(`sheet-${decodeURIComponent(sheet[1]!)}`)
    return json(res, f ? 200 : 400, f ?? { ok: false, error: 'The pretend Pi only has the BlockOne and FoamWire pages' }), true
  }
  const tool = url.match(/^\/api\/tools\/([^/]+)$/)
  if (req.method === 'GET' && tool) {
    const f = portalFixture(`tool-${decodeURIComponent(tool[1]!)}`)
    return json(res, f ? 200 : 400, f ?? { ok: false, error: 'The pretend Pi can only open FoamWire for editing' }), true
  }
  if ((req.method === 'POST' || req.method === 'DELETE') && /^\/api\/(tools|preview|restart|lists|hardware)/.test(url))
    return json(res, 400, { ok: false, error: "The pretend Pi doesn't save tool changes. Run the Portal's demo (dev/demo_server.py) and point PORTAL at it." }), true
  const m = url.match(/^\/api\/maint\/tasks\/([^/]+)\/(done|snooze)$/)
  if (req.method === 'POST' && m) {
    if (req.headers['x-rhino-token'] !== PORTAL_TOKEN) return json(res, 400, { ok: false, error: 'This page is out of date (the portal was restarted). Reload the page and try again.' }), true
    const body = await readBody(req)
    const task = maint.tasks.find((t: { id: string }) => t.id === m[1])
    if (!task) return json(res, 400, { ok: false, error: 'No such task' }), true
    console.log(`  PORTAL ${m[2]} ${task.title} ${JSON.stringify(body)}`)
    if (m[2] === 'done') {
      const now = Date.now() / 1000
      task.last = { at: now, action: body.action }
      task.status = { ...task.status, state: 'ok', fraction: 0, snoozed: false, hold: undefined, next: { ...task.status.next, state: 'ok', fraction: 0, text: 'Restarted from today' } }
      maintHistory.records.unshift({ id: 'h' + now, task: task.id, title: task.title, asset: task.asset, asset_label: task.asset_label, action: body.action, at: now, notes: body.notes ?? '', was: 'due_soon', status: '' })
    } else {
      task.status.snoozed = Number(body.days) > 0
    }
    recount()
    return json(res, 200, { ok: true }), true
  }
  // Care editing (tasks, library, books, meters, setup) needs the real Portal too
  if ((req.method === 'POST' || req.method === 'DELETE') && url.startsWith('/api/maint/'))
    return json(res, 400, { ok: false, error: "The pretend Pi only logs work and snoozes. Run the Portal's demo (dev/demo_server.py) and point PORTAL at it to edit tasks." }), true
  return false
}

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '').split('?')[0]!)
  if (!url.startsWith("/webcam")) console.log(`HTTP ${req.method} ${url}${req.headers.range ? ` (${req.headers.range})` : ''}`)
  if (await portal(req, res, url)) return
  if (req.method === 'POST' && url === '/printer/emergency_stop') {
    emergencyStop('http')
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"result":"ok"}')
    return
  }
  if (req.method === 'POST' && url === '/server/files/upload') {
    const chunks: Buffer[] = []
    req.on('data', (d) => chunks.push(d))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      const fname = /filename="([^"]+)"/.exec(body)?.[1] ?? 'upload.gcode'
      const content = body.split(/\r\n\r\n/).slice(-1)[0]?.split(/\r\n--/)[0] ?? ''
      files[fname] = content
      fileTimes[fname] = Date.now() / 1000
      console.log(`  UPLOAD ${fname} (${content.length} bytes)`)
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ item: { path: fname, root: 'gcodes' }, print_started: false }))
    })
    return
  }
  const camm = url.match(/^\/(webcam\d*)\/?$/)
  if (req.method === 'GET' && camm && camPaths[camm[1]!]) {
    const set = camPaths[camm[1]!]!
    const action = new URL(req.url ?? '/', 'http://x').searchParams.get('action')
    if (action === 'snapshot') {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' }).end(frameAt(set))
      return
    }
    // MJPEG: one JPEG after another in a multipart response, like crowsnest
    res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=rsframe', 'cache-control': 'no-store', connection: 'close' })
    const send = () => {
      const jpg = frameAt(set)
      if (!jpg) return
      res.write(`--rsframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`)
      res.write(jpg)
      res.write('\r\n')
    }
    send()
    const t = setInterval(send, 200)
    req.on('close', () => {
      clearInterval(t)
      console.log(`  CAMERA ${camm[1]} stream closed`)
    })
    return
  }
  const m = url.match(/^\/server\/files\/gcodes\/(.+)$/)
  if (m && files[m[1]!] != null) {
    res.writeHead(200, { 'content-type': 'text/plain' }).end(files[m[1]!])
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ server, path: '/websocket' })
wss.on('connection', (ws) => {
  sockets.add(ws)
  console.log('client connected')
  ws.on('close', () => sockets.delete(ws))
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as { id: number; method: string; params?: Record<string, unknown> }
    console.log(`  -> ${msg.method}`)
    try {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: handle(msg.method, msg.params) }))
    } catch (e) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: (e as Error).message } }))
    }
  })
})

// Gentle temperature drift so the readouts move
setInterval(() => {
  if (klippy !== 'ready') return
  // Heaters creep toward their targets; idle ones drift around room temperature
  for (const h of ['extruder', 'heater_bed']) {
    const cur = status[h]!.temperature as number
    const target = (status[h]!.target as number) || 24 + Math.sin(Date.now() / 4000) * 0.4
    const next = cur + Math.max(-6, Math.min(6, (target - cur) * 0.25))
    update(h, { temperature: Number(next.toFixed(2)) })
    const series = tempStore[h]!
    series.temperatures.push(Number(next.toFixed(2))); series.targets.push((status[h]!.target as number) || 0); series.powers.push(0)
    if (series.temperatures.length > 1200) { series.temperatures.shift(); series.targets.shift(); series.powers.shift() }
  }
  if (status.print_stats.state === 'printing') {
    const p = Math.min(1, (status.virtual_sdcard.progress as number) + 0.01)
    update('virtual_sdcard', { progress: p })
    // pretend each second is 40 s of a real job, so the time estimates look real
    update('print_stats', { print_duration: (status.print_stats.print_duration as number) + 40 })
    if (p >= 1) {
      update('idle_timeout', { state: 'Ready' })
      outputsOff()
      update('print_stats', { state: 'complete' })
      respond(`Done printing file ${jobFile}`)
    }
  }
}, 1000)

server.listen(PORT, () => console.log(`Mock Moonraker (${scenario}) on http://localhost:${PORT}`))
