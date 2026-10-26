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
 *   blockone  BlockOne (print head) confirmed in slot 1, hotend at 215
 *   switchfly SwitchFly confirmed in slot 2 on path T0 (PLA; PETG in T1), hotend cold.
 *             SWITCH_T0/T1, M221, SET_PRESSURE_ADVANCE and G1 E work; a cold
 *             extrude fails like Klipper's "Extrude below minimum temp".
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
 * Fans: MOCK_FANS=1 adds a driver fan and an exhaust fan with speed signals (rpm); MOCK_FANS=stall makes the
 * driver fan read 0 rpm while driven, for the Dashboard's "isn't turning" notice.
 *
 * Bed mesh: three saved meshes (bed-60 in use, bed-100, default) and an adaptive one.
 * RHINO_MESH_CALIBRATE, BED_MESH_PROFILE LOAD/REMOVE, BED_MESH_CLEAR, RHINO_MESH_REMOVE and
 * SAVE_CONFIG work. MOCK_MESH=none: no [bed_mesh] section; MOCK_MESH=empty: no meshes yet;
 * MOCK_MESH=off: meshes saved, none in use; MOCK_MESH=unsaved: bed-60 just made, not saved.
 *
 * MOCK_AUTH=untrusted: this screen isn't in Moonraker's trusted_clients (Mainsail's
 * "Unauthorized"); the Portal refuses /api the same way and names the address.
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
  blockone: { current_tool: 1, pending_tool: -1, saved: 1 },
  switchfly: { current_tool: 2, pending_tool: -1, saved: 2 },
}[scenario] ?? { current_tool: 3, pending_tool: -1, saved: 3 }

let klippy: 'ready' | 'shutdown' = 'ready'
const status: Record<string, Record<string, unknown>> = {
  webhooks: { state: 'ready', state_message: 'Printer is ready' },
  print_stats: { state: 'standby', filename: '', message: '', print_duration: 0 },
  virtual_sdcard: { progress: 0, is_active: false },
  toolhead: { position: [120.0, 85.5, 12.3, 0], homed_axes: 'xyz', axis_minimum: [0, 0, -5, 0], axis_maximum: [576, 406, 300, 0], max_velocity: 300, max_accel: 3000 },
  gcode_move: { gcode_position: [120.0, 85.5, 12.3, 0], homing_origin: [0, 0, 0, 0], speed_factor: 1, extrude_factor: 1, absolute_coordinates: true },
  pause_resume: { is_paused: false },
  idle_timeout: { state: 'Idle' },
  extruder: { temperature: 24.1, target: 0, can_extrude: false, pressure_advance: 0.024, smooth_time: 0.04 },
  heater_bed: { temperature: 23.6, target: 0 },
  'gcode_macro SWAP_TOOL': { current_tool: tool.current_tool, pending_tool: tool.pending_tool },
  'gcode_macro VARIABLES': { tool_mapping: toolMapping, toolheads },
  'gcode_macro CUSTOM_TOOLS': custom,
  save_variables: {
    variables: {
      current_tool: tool.saved,
      // The material record the Rhino G0/G1 override reads (E is reversed on SwitchFly path 1)
      set_material_toolhead: scenario === 'switchfly' ? 'SwitchFly' : 'BlockOne',
      set_material_extruder_index: 0,
      switchfly_material_t0: 'PLA',
      switchfly_material_t1: 'PETG',
    },
  },
  // Tool outputs, as in the Rhino config
  fan: { speed: 0 },
  // MOCK_FANS=1: fans with a speed signal (Tool Manager 1.9); MOCK_FANS=stall: the driver fan has seized
  ...(process.env.MOCK_FANS
    ? {
        'controller_fan drivers': { speed: 1, rpm: process.env.MOCK_FANS === 'stall' ? 0 : 4870 },
        'fan_generic exhaust': { speed: 0.6, rpm: 2310 },
        'heater_fan hotend_cool': { speed: 0, rpm: null },
      }
    : {}),
  // MOCK_HARDWARE=1: system hardware for Control › Hardware (add the same names in the Portal: driver_fan as a
  // fan, case_light as a switch, chamber as a heater, lid as an interlock)
  ...(process.env.MOCK_HARDWARE
    ? {
        'fan_generic driver_fan': { speed: 0.6, rpm: null },
        'output_pin case_light': { value: 1 },
        'heater_generic chamber': { temperature: 38.4, target: 0, power: 0 },
        'gcode_button lid': { state: 'RELEASED' },
      }
    : {}),
  'output_pin LASER_INITIALIZE': { value: 0 },
  'output_pin SERVO_LASER': { value: 0 },
  'output_pin Spindle_power': { value: 0 },
  'output_pin SPINDLE_SPEED': { value: 0.3 },
}
// ---- bed mesh -------------------------------------------------------------------
const meshMode = process.env.MOCK_MESH ?? 'some'
const MESH_AREA = { min_x: 40, max_x: 500, min_y: 40, max_y: 300, x_count: 5, y_count: 3 }
/** A believable bed: tilted up to the right, a low front-left corner, and a centre that rises as it heats */
function bedShape(bedC: number, seed: number, area = MESH_AREA): number[][] {
  const out: number[][] = []
  for (let j = 0; j < area.y_count; j++) {
    const row: number[] = []
    for (let i = 0; i < area.x_count; i++) {
      const x = area.min_x + ((area.max_x - area.min_x) * i) / Math.max(1, area.x_count - 1)
      const y = area.min_y + ((area.max_y - area.min_y) * j) / Math.max(1, area.y_count - 1)
      const tilt = (x - 270) * 0.00021 + (y - 170) * 0.00008
      const dip = -0.07 * Math.exp(-((x - 40) ** 2 + (y - 40) ** 2) / 9000)
      const dome = (bedC / 100) * 0.09 * Math.exp(-((x - 270) ** 2 / 26000 + (y - 170) ** 2 / 12000))
      const noise = Math.sin(seed * 12.9898 + i * 78.233 + j * 37.719) * 0.006
      row.push(+(tilt + dip + dome + noise).toFixed(4))
    }
    out.push(row)
  }
  return out
}
const day = 86400
const nowS = () => Math.floor(Date.now() / 1000)
const meshProfiles: Record<string, { points: number[][]; mesh_params: Record<string, number> }> =
  meshMode === 'empty' || meshMode === 'none' ? {} : {
    'bed-60': { points: bedShape(60, 1), mesh_params: { ...MESH_AREA } },
    'bed-100': { points: bedShape(100, 2), mesh_params: { ...MESH_AREA } },
    default: { points: bedShape(0, 3), mesh_params: { ...MESH_AREA } },
    'adaptive-5F2A91C0': { points: bedShape(60, 4, { min_x: 150, max_x: 350, min_y: 120, max_y: 260, x_count: 3, y_count: 3 }), mesh_params: { min_x: 150, max_x: 350, min_y: 120, max_y: 260, x_count: 3, y_count: 3 } },
  }
const meshMeta: Record<string, { bed: number; tool: string; when: number }> =
  meshMode === 'empty' || meshMode === 'none' ? {} : {
    'bed-60': { bed: 60, tool: 'BlockOne', when: nowS() - 3 * day },
    'bed-100': { bed: 100, tool: 'BlockOne', when: nowS() - 23 * day },
  }
if (meshMode !== 'none') {
  const loaded = meshMode === 'off' || meshMode === 'empty' ? '' : 'bed-60'
  status.bed_mesh = {
    profile_name: loaded,
    mesh_min: loaded ? [MESH_AREA.min_x, MESH_AREA.min_y] : [0, 0],
    mesh_max: loaded ? [MESH_AREA.max_x, MESH_AREA.max_y] : [0, 0],
    probed_matrix: loaded ? meshProfiles[loaded]!.points : [[]],
    profiles: meshProfiles,
  }
}
status.configfile = {
  save_config_pending: meshMode === 'unsaved',
  save_config_pending_items: meshMode === 'unsaved' ? { 'bed_mesh bed-60': { version: '1', points: '...' } } : {},
}
if (scenario !== 'toolchanger') {
  status['gcode_macro RHINO_MESH'] = { match_c: 5, cold_c: 40, soak_min: 5 }
  ;(status.save_variables.variables as Record<string, unknown>).mesh_meta = meshMeta
  ;(status.save_variables.variables as Record<string, unknown>).set_material_bed_temp = 60
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
// A folder with one job in it, for the file manager
files['brackets/shelf_bracket_PETG.gcode'] = '; rhino_toolhead = BlockOne\nSTART_JOB TOOLHEAD=BlockOne MATERIAL=PETG NOZZLE_SIZE=0.4 EXTRUDER=0\nG1 X10\n'
fileTimes['brackets/shelf_bracket_PETG.gcode'] = Date.now() / 1000 - 26 * 3600

// ---- the config root and folders (Files > Config; folders in both roots) --
const cfgFiles: Record<string, string> = {
  'printer.cfg': '# Rhino Multi Motion System\n[include myrhino/*.cfg]\n[include toolchanger.cfg]\n\n[board_pins rhino]\naliases:\n    ENCLOSURE_LIGHT=PB5,\n    DRYBOX_FAN=PA8\n\n[mcu]\nserial: /dev/serial/by-id/usb-Klipper_stm32f446xx_2A0019-if00\n\n[printer]\nkinematics: cartesian\nmax_velocity: 300\nmax_accel: 3000\n\n[output_pin enclosure_light]\npin: ENCLOSURE_LIGHT\nvalue: 0\n\n[fan_generic drybox]\npin: DRYBOX_FAN\n',
  'moonraker.conf': '[server]\nhost: 0.0.0.0\nport: 7125\n\n[authorization]\ncors_domains:\n    *.local\n',
  'crowsnest.conf': '[cam 1]\nmode: ustreamer\ndevice: /dev/video0\n',
  'toolchanger.cfg': '[gcode_macro SWAP_TOOL]\nvariable_current_tool: 0\ngcode:\n    RESPOND MSG="swap"\n',
  'myrhino/positions.cfg': '[gcode_macro RHINO_POSITIONS]\nvariable_park_x: 551.0\ngcode:\n',
  'myrhino/custom_tools.cfg': '# tools added in the Portal\n',
  'notes.txt': 'Rhino notes\n',
}
const cfgTimes: Record<string, number> = Object.fromEntries(Object.keys(cfgFiles).map((f, i) => [f, Date.now() / 1000 - i * 7200]))
/** Empty folders the user made (folders that hold files are found from the file names) */
const madeDirs = new Set<string>(['gcodes/archive'])
const rootStore = (root: string): [Record<string, string>, Record<string, number>] | null =>
  root === 'gcodes' ? [files, fileTimes] : root === 'config' ? [cfgFiles, cfgTimes] : root === 'logs' ? [mockLogs, {}] : null
function splitRoot(path: string): [string, string] {
  const i = path.indexOf('/')
  return i < 0 ? [path, ''] : [path.slice(0, i), path.slice(i + 1)]
}
function fsErr(code: number, msg: string): never {
  const e = new Error(msg) as Error & { code?: number }
  e.code = code
  throw e
}
/** Moonraker refuses to change the file a job is printing, and folders holding it */
function inUse(path: string) {
  const f = status.print_stats?.filename as string | undefined
  if (!f || !['printing', 'paused'].includes(String(status.print_stats?.state))) return
  const busy = `gcodes/${f}`
  if (path === busy || busy.startsWith(`${path}/`)) fsErr(403, `File ${f} is loaded, cannot be modified`)
}
function dirExists(path: string): boolean {
  const [root, rel] = splitRoot(path)
  const st = rootStore(root)
  if (!st) return false
  if (!rel) return true
  return madeDirs.has(path) || Object.keys(st[0]).some((k) => k.startsWith(`${rel}/`))
}
function listDir(path: string) {
  const [root, rel] = splitRoot(path)
  const st = rootStore(root)
  if (!st || !dirExists(path)) fsErr(404, `Directory ${path} does not exist`)
  const [store, times] = st!
  const pre = rel ? `${rel}/` : ''
  const dirs = new Map<string, number>()
  const out: { filename: string; modified: number; size: number; permissions: string }[] = []
  for (const [k, v] of Object.entries(store)) {
    if (!k.startsWith(pre)) continue
    const rest = k.slice(pre.length)
    const t = times[k] ?? Date.now() / 1000
    if (rest.includes('/')) dirs.set(rest.split('/')[0]!, Math.max(dirs.get(rest.split('/')[0]!) ?? 0, t))
    else out.push({ filename: rest, modified: t, size: root === 'gcodes' ? v.length * 900 : v.length, permissions: root === 'logs' ? 'r' : 'rw' })
  }
  for (const d of madeDirs) {
    const [r2, rel2] = splitRoot(d)
    if (r2 === root && rel2.startsWith(pre) && rel2.length > pre.length) {
      const name = rel2.slice(pre.length).split('/')[0]!
      if (!dirs.has(name)) dirs.set(name, Date.now() / 1000 - 3600)
    }
  }
  if (root === 'config' && !rel && !dirs.has('studio_backups') && madeDirs.has('config/studio_backups')) dirs.set('studio_backups', Date.now() / 1000)
  return {
    dirs: [...dirs].map(([dirname, modified]) => ({ dirname, modified, size: 4096, permissions: root === 'logs' ? 'r' : 'rw' })),
    files: out,
    disk_usage: { total: 64e9, used: 21e9, free: 43e9 },
    root_info: { name: root, permissions: root === 'logs' ? 'r' : 'rw' },
  }
}
function writable(path: string): [Record<string, string>, Record<string, number>, string] {
  const [root, rel] = splitRoot(path)
  if (root !== 'gcodes' && root !== 'config') fsErr(403, `Write access to root ${root} is not allowed`)
  const st = rootStore(root)!
  return [st[0], st[1], rel]
}
function fileOp(method: string, params: Record<string, unknown> | undefined): unknown {
  const p = params ?? {}
  console.log(`  FILES ${method} ${JSON.stringify(p)}`)
  if (method === 'server.files.post_directory') {
    const path = String(p.path)
    writable(path)
    if (dirExists(path)) fsErr(400, `Directory ${path} already exists`)
    madeDirs.add(path)
    return { item: { path: splitRoot(path)[1], root: splitRoot(path)[0] }, action: 'create_dir' }
  }
  if (method === 'server.files.delete_file') {
    const path = String(p.path)
    inUse(path)
    const [store, times, rel] = writable(path)
    if (!(rel in store)) fsErr(404, `File ${path} does not exist`)
    delete store[rel]
    delete times[rel]
    return { item: { path: rel, root: splitRoot(path)[0] }, action: 'delete_file' }
  }
  if (method === 'server.files.delete_directory') {
    const path = String(p.path)
    inUse(path)
    const [store, times, rel] = writable(path)
    if (!rel) fsErr(400, 'Cannot delete a root directory')
    const inside = Object.keys(store).filter((k) => k.startsWith(`${rel}/`))
    const sub = [...madeDirs].filter((d) => d.startsWith(`${path}/`))
    if ((inside.length || sub.length) && !p.force) fsErr(400, `Directory ${path} is not empty`)
    for (const k of inside) delete store[k], delete times[k]
    for (const d of [path, ...sub]) madeDirs.delete(d)
    return { item: { path: rel, root: splitRoot(path)[0] }, action: 'delete_dir' }
  }
  if (method === 'server.files.move' || method === 'server.files.copy') {
    const src = String(p.source), dst = String(p.dest)
    if (method === 'server.files.move') inUse(src)
    const [store, times, srel] = writable(src)
    const [dstore, dtimes, drel] = writable(dst)
    const keep = method === 'server.files.copy'
    if (srel in store) {
      if (drel in dstore) fsErr(400, `File ${dst} already exists`) // Studio asks Replace or keep both first
      dstore[drel] = store[srel]!
      dtimes[drel] = keep ? Date.now() / 1000 : (times[srel] ?? Date.now() / 1000)
      if (!keep) delete store[srel], delete times[srel]
    } else if (dirExists(src)) {
      if (dirExists(dst)) fsErr(400, `Directory ${dst} already exists`)
      for (const k of Object.keys(store).filter((k) => k.startsWith(`${srel}/`))) {
        dstore[drel + k.slice(srel.length)] = store[k]!
        dtimes[drel + k.slice(srel.length)] = times[k] ?? Date.now() / 1000
        if (!keep) delete store[k], delete times[k]
      }
      for (const d of [...madeDirs].filter((d) => d === src || d.startsWith(`${src}/`))) {
        madeDirs.add(dst + d.slice(src.length))
        if (!keep) madeDirs.delete(d)
      }
      if (!Object.keys(dstore).some((k) => k.startsWith(`${drel}/`))) madeDirs.add(dst)
    } else fsErr(404, `${src} does not exist`)
    return { item: { path: drel, root: splitRoot(dst)[0] }, action: keep ? 'create_file' : 'move_file' }
  }
  fsErr(404, `Method not found: ${method}`)
}

// ---- logs (Moonraker's read-only "logs" root) ---------------------------
const mockLogs: Record<string, string> = {
  'klippy.log': Array.from({ length: 400 }, (_, i) => `Stats ${1000 + i * 5}.1: gcodein=0 mcu: mcu_awake=0.004 mcu_task_avg=0.000012 bytes_write=${i * 300} sysload=0.42`).join('\n')
    + "\nMCU 'mcu' shutdown: Timer too close\n  This often indicates a host overload. Check sysload and the USB cable.\nTransition to shutdown state: MCU shutdown\n"
    + Array.from({ length: 30 }, (_, i) => `Stats ${3200 + i * 5}.1: gcodein=0 sysload=0.20`).join('\n') + '\n',
  'moonraker.log': '2026-10-19 18:00:01,100 [server.py:start()] - Starting Moonraker\n2026-10-19 18:00:02,000 [klippy_connection.py] - Klippy ready\n',
  'klippy.log.1': 'older log\n',
}

// ---- job history (Moonraker's server.history.list, newest first) --------
type HistJob = { job_id: string; filename: string; status: string; start_time: number; end_time: number; print_duration: number; total_duration: number; filament_used: number; exists: boolean }
let histSeq = 100
const histJob = (filename: string, status: string, hoursAgo: number, mins: number): HistJob => {
  const end = Date.now() / 1000 - hoursAgo * 3600
  return { job_id: String(histSeq++).padStart(6, '0'), filename, status, start_time: end - mins * 60, end_time: end, print_duration: mins * 60, total_duration: mins * 60 + 90, filament_used: filename.includes('benchy') ? 4200 : 0, exists: true }
}
const jobHistory: HistJob[] = process.env.MOCK_HISTORY === '0' ? [] : [
  histJob('benchy_PLA_0.4.gcode', 'completed', 2, 74),
  histJob('sign_engrave.gcode', 'cancelled', 20, 6),
  histJob('benchy_PLA_0.4.gcode', 'error', 30, 12),
  histJob('walnut_coaster_pocket.nc', 'completed', 50, 31),
]
let jobStarted = 0
function recordJob(status: string) {
  if (!jobFile) return
  const end = Date.now() / 1000
  jobHistory.unshift({ job_id: String(histSeq++).padStart(6, '0'), filename: jobFile, status, start_time: jobStarted || end, end_time: end, print_duration: Number(status.print_stats?.print_duration ?? 0), total_duration: end - (jobStarted || end), filament_used: 0, exists: true })
}

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
if (scenario === 'blockone') {
  status.extruder = { ...status.extruder, temperature: 214.6, target: 215, can_extrude: true }
  status.heater_bed = { ...status.heater_bed, temperature: 59.8, target: 60 }
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
  'RHINO_MESH', 'RHINO_MESH_CALIBRATE', 'RHINO_MESH_REMOVE', // Tool Manager 1.6.0 (Bed mesh page)
]
const HW_MACROS: Record<string, { gcode: string; description: string }> = process.env.MOCK_HARDWARE
  ? {
      DRIVER_FAN_SET: { description: 'Driver fan: driver_fan speed SPEED=0..1', gcode: '{% set v = [[params.SPEED|default(1)|float, 0.0]|max, 1.0]|min %}\nSET_FAN_SPEED FAN=driver_fan SPEED={v}' },
      DRIVER_FAN_OFF: { description: 'Driver fan: driver_fan off', gcode: 'SET_FAN_SPEED FAN=driver_fan SPEED=0' },
    }
  : {}
const MACROS = scenario === 'toolchanger'
  ? ['PAUSE', 'RESUME', 'CANCEL_PRINT', 'PRINT_START', 'PRINT_END', 'CLEAN_NOZZLE', 'CHAMBER_LIGHTS_ON', 'CHAMBER_LIGHTS_OFF', 'G28']
  : [...RHINO_MACROS, ...Object.keys(HW_MACROS)]
const HELP: Record<string, string> = Object.fromEntries(MACROS.map((m) => [m, `${scenario === 'toolchanger' ? 'Macro' : 'Rhino macro'} ${m}`]))
Object.assign(HELP, Object.fromEntries(Object.entries(HW_MACROS).map(([k, v]) => [k, v.description])))
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
  jobStarted = Date.now() / 1000
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
      if (/(^|\s)E-?[\d.]/i.test(line) && !status.extruder.can_extrude) throw new Error('Extrude below minimum temp\nSee the \'min_extrude_temp\' config option for details')
      if (/(^|\s)E-?[\d.]/i.test(line)) respond(`// E${/E(-?[\d.]+)/i.exec(line)?.[1]} mm`)
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
    case 'M82':
    case 'M83':
      return
    case 'M220':
      update('gcode_move', { speed_factor: Number(/S([\d.]+)/i.exec(line)?.[1] ?? 100) / 100 })
      return
    case 'SET_GCODE_OFFSET': {
      const o = [...((status.gcode_move.homing_origin as number[]) ?? [0, 0, 0, 0])]
      const adj = arg(line, 'Z_ADJUST'), z = arg(line, 'Z')
      if (adj != null) o[2] = Number((o[2]! + Number(adj)).toFixed(4))
      else if (z != null) o[2] = Number(z)
      update('gcode_move', { homing_origin: o })
      return
    }
    case 'SET_VELOCITY_LIMIT': {
      const v = arg(line, 'VELOCITY'), a = arg(line, 'ACCEL')
      update('toolhead', { ...(v != null ? { max_velocity: Number(v) } : {}), ...(a != null ? { max_accel: Number(a) } : {}) })
      return
    }
    case 'M221':
      update('gcode_move', { extrude_factor: Number(/S([\d.]+)/i.exec(line)?.[1] ?? 100) / 100 })
      return
    case 'SET_PRESSURE_ADVANCE': {
      const a = arg(line, 'ADVANCE')
      const t = arg(line, 'SMOOTH_TIME')
      update('extruder', { ...(a != null ? { pressure_advance: Number(a) } : {}), ...(t != null ? { smooth_time: Number(t) } : {}) })
      return
    }
    case 'SWITCH_T0':
    case 'SWITCH_T1': {
      const p = cmd === 'SWITCH_T1' ? 1 : 0
      if (status.print_stats.state === 'printing') throw new Error('SWITCH_T: not during a job in this mock')
      const sv = status.save_variables.variables as Record<string, unknown>
      update('save_variables', { variables: { ...sv, set_material_toolhead: 'SwitchFly', set_material_extruder_index: p } })
      update('extruder', { target: p ? 240 : 215 })
      respond(`// Switched to path ${p + 1} (T${p}): ${p ? sv.switchfly_material_t1 : sv.switchfly_material_t0}`)
      return
    }
    case 'M84':
      update('toolhead', { homed_axes: '' })
      respond('// Motors off')
      return
    case 'SET_HEATER_TEMPERATURE': {
      if (status[`heater_generic ${arg(line, 'HEATER')}`]) return update(`heater_generic ${arg(line, 'HEATER')}`, { target: Number(arg(line, 'TARGET') ?? 0) })
      const h = arg(line, 'HEATER') === 'heater_bed' ? 'heater_bed' : 'extruder'
      update(h, { target: Number(arg(line, 'TARGET') ?? 0) })
      return
    }
    case 'SET_FAN_SPEED': {
      const f = `fan_generic ${arg(line, 'FAN')}`
      if (status[f]) update(f, { speed: Number(arg(line, 'SPEED') ?? 0) })
      respond(`// ${line} (mock)`)
      return
    }
    case 'DRIVER_FAN_SET':
      if (status['fan_generic driver_fan']) update('fan_generic driver_fan', { speed: Math.max(0, Math.min(1, Number(arg(line, 'SPEED') ?? 1))) })
      return
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
      update('save_variables', { variables: { ...(status.save_variables.variables as object), current_tool: t } })
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
    // ---- bed mesh ----
    case 'RHINO_MESH_CALIBRATE':
    case 'BED_MESH_CALIBRATE': {
      if (!status.bed_mesh) throw new Error(`Unknown command:"${cmd}"`)
      if (status.print_stats.state === 'printing' || status.print_stats.state === 'paused') throw new Error(`${cmd}: a job is running.`)
      const mounted = name(swap.current_tool)
      const type = (toolheads[mounted] ?? (custom.toolheads as Record<string, { type: string }>)[mounted])?.type
      if (cmd === 'RHINO_MESH_CALIBRATE' && type !== 'DEPOSITION')
        throw new Error(`RHINO_MESH_CALIBRATE is for print heads, and ${mounted} is mounted - it would heat the nozzle output and move the bed toward the tool. Swap to BlockOne or SwitchFly first.`)
      const prof = arg(line, 'PROFILE') ?? 'default'
      const bedC = Number(arg(line, 'BED') ?? 60)
      const when = Number(arg(line, 'WHEN') ?? 0)
      const tilt = arg(line, 'TILT') !== '0'
      update('idle_timeout', { state: 'Printing' })
      if (th.homed_axes !== 'xyz') { respond('// homing'); update('toolhead', { homed_axes: 'xyz' }) }
      if (bedC > 0) { update('heater_bed', { target: bedC }); respond(`// Mesh: heating the bed to ${bedC}°C (mock: instant)`) }
      setTimeout(() => {
        if (bedC > 0) update('heater_bed', { temperature: bedC })
        if (tilt) respond('// Z_TILT_ADJUST: probed 3 points, range 0.012 mm (mock)')
        respond('// Mesh: probing the bed')
      }, 1200)
      setTimeout(() => {
        const pts = bedShape(bedC, Math.random() * 9)
        const profiles = { ...(status.bed_mesh!.profiles as object), [prof]: { points: pts, mesh_params: { ...MESH_AREA } } }
        update('bed_mesh', { profile_name: prof, probed_matrix: pts, mesh_min: [MESH_AREA.min_x, MESH_AREA.min_y], mesh_max: [MESH_AREA.max_x, MESH_AREA.max_y], profiles })
        if (cmd === 'RHINO_MESH_CALIBRATE') {
          const sv = status.save_variables.variables as Record<string, unknown>
          const meta = { ...(sv.mesh_meta as object), [prof]: { bed: bedC, tool: mounted, when } }
          update('save_variables', { variables: { ...sv, mesh_meta: meta } })
        }
        const items = { ...(status.configfile!.save_config_pending_items as object), [`bed_mesh ${prof}`]: { version: '1' } }
        update('configfile', { save_config_pending: true, save_config_pending_items: items })
        update('idle_timeout', { state: 'Ready' })
        respond(`Mesh ${prof} made at ${bedC}°C with ${mounted} and loaded. Klipper keeps it until it restarts: save it (Studio, or SAVE_CONFIG) to keep it.`)
      }, 4200)
      return
    }
    case 'BED_MESH_PROFILE':
    case 'RHINO_MESH_REMOVE': {
      if (!status.bed_mesh) throw new Error(`Unknown command:"${cmd}"`)
      const profiles = { ...(status.bed_mesh.profiles as Record<string, { points: number[][] }>) }
      const load = arg(line, 'LOAD')
      const rm = cmd === 'RHINO_MESH_REMOVE' ? arg(line, 'PROFILE') : arg(line, 'REMOVE')
      if (load) {
        if (!profiles[load]) throw new Error(`bed_mesh: Unknown profile [${load}]`)
        update('bed_mesh', { profile_name: load, probed_matrix: profiles[load]!.points, mesh_min: [MESH_AREA.min_x, MESH_AREA.min_y], mesh_max: [MESH_AREA.max_x, MESH_AREA.max_y] })
        respond(`// Mesh ${load} loaded`)
      } else if (rm) {
        if (!profiles[rm]) throw new Error(`RHINO_MESH_REMOVE: there is no mesh called ${rm}.`)
        delete profiles[rm]
        update('bed_mesh', { profiles, ...(status.bed_mesh.profile_name === rm ? { profile_name: '' } : {}) })
        const sv = status.save_variables.variables as Record<string, unknown>
        if (sv.mesh_meta) {
          const meta = { ...(sv.mesh_meta as Record<string, unknown>) }
          delete meta[rm]
          update('save_variables', { variables: { ...sv, mesh_meta: meta } })
        }
        update('configfile', { save_config_pending: true })
        respond(`Mesh ${rm} removed. Save (SAVE_CONFIG) to take it out of printer.cfg too.`)
      }
      return
    }
    case 'BED_MESH_CLEAR':
      if (!status.bed_mesh) throw new Error(`Unknown command:"${cmd}"`)
      update('bed_mesh', { profile_name: '', probed_matrix: [[]] })
      respond('// Bed mesh cleared')
      return
    case 'RHINO_MESH':
      respond(`Bed mesh in use: ${(status.bed_mesh?.profile_name as string) || 'none - moves are not compensated'}`)
      return
    case 'SAVE_CONFIG':
      if (status.print_stats.state === 'printing' || status.print_stats.state === 'paused') throw new Error('SAVE_CONFIG: not during a job')
      update('configfile', { save_config_pending: false, save_config_pending_items: {} })
      respond('// SAVE_CONFIG: printer.cfg written (mock), restarting')
    // falls through: Klipper restarts after SAVE_CONFIG
    case 'FIRMWARE_RESTART':
    case 'RESTART':
      klippy = 'shutdown'
      notify('notify_klippy_disconnected')
      setTimeout(() => {
        klippy = 'ready'
        update('webhooks', { state: 'ready', state_message: 'Printer is ready' })
        update('gcode_macro SWAP_TOOL', { current_tool: 0, pending_tool: -1 })
        // Klipper loads no mesh at start-up (a print loads its own)
        if (status.bed_mesh) update('bed_mesh', { profile_name: '', probed_matrix: [[]] })
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


// ---- Settings / Software: Moonraker's update manager ----------------------
const TM_VERSION = process.env.MOCK_TM_VERSION ?? '1.4.6'
const versionInfo: Record<string, Record<string, unknown>> = {
  system: { configured_type: 'system', package_count: 12, package_list: ['libssl3', 'openssl', 'python3-pip', 'linux-image-rpi-v8'] },
  moonraker: { configured_type: 'git_repo', version: 'v0.9.3-41', remote_version: 'v0.9.3-45', is_valid: true, is_dirty: false, commits_behind_count: 0 },
  klipper: { configured_type: 'git_repo', version: 'v0.13.0-180', remote_version: 'v0.13.0-195', is_valid: true, is_dirty: false, commits_behind_count: 15 },
  crowsnest: { configured_type: 'git_repo', version: 'v4.1.9', remote_version: 'v4.1.9', is_valid: true, is_dirty: false, commits_behind_count: 0 },
  'mainsail-config': { configured_type: 'git_repo', version: 'v1.2.1', remote_version: 'v1.2.2', is_valid: true, is_dirty: false, commits_behind_count: 2 },
  mainsail: { configured_type: 'web', version: 'v2.14.0', remote_version: 'v2.15.0', is_valid: true },
}
let updateBusy = false
const updStatus = () => ({ busy: updateBusy, github_rate_limit: 60, github_requests_remaining: 55, version_info: versionInfo })
async function mockUpgrade(name: string) {
  const v = versionInfo[name]
  if (!v) throw new Error(`Updater ${name} not available`)
  if (status.print_stats.state === 'printing' || status.print_stats.state === 'paused') throw new Error('Unable to update while printing')
  updateBusy = true
  const say = (message: string, complete = false) => notify('notify_update_response', [{ application: name, proc_id: 1, message, complete }])
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  say(`Updating ${name}...`)
  await wait(700)
  say(name === 'system' ? 'Reading package lists... Unpacking 12 packages' : `Pulling from origin... ${v.remote_version}`)
  await wait(900)
  if (name === 'system') v.package_count = 0, v.package_list = []
  else v.version = v.remote_version, v.commits_behind_count = 0
  if (name === 'klipper') {
    say('Restarting Klipper')
    klippy = 'shutdown' as never
    notify('notify_klippy_disconnected')
    await wait(1200)
    klippy = 'ready'
    notify('notify_klippy_ready')
  }
  updateBusy = false
  say(`Update of ${name} complete`, true)
  notify('notify_update_refreshed', [updStatus()])
  if (name === 'moonraker') {
    // Moonraker restarts: every socket drops, Studio reconnects
    setTimeout(() => { for (const s of sockets) s.close(); }, 100)
  }
}

// ---- Settings / Network: the Pi's network through the Portal ----------------
const netState = {
  supported: true, manager: 'NetworkManager', hostname: 'mainsailos', revert_seconds: 120,
  interfaces: [
    { name: 'wlan0', type: 'wifi', state: 'connected', connection: 'ShopNet', ip: '192.168.1.50', prefix: 24, gateway: '192.168.1.1', dns: ['192.168.1.1'], mac: 'b8:27:eb:4c:91:2e', method: 'auto', ssid: 'ShopNet', signal: 58, powersave: true },
    { name: 'eth0', type: 'ethernet', state: 'unavailable', connection: null, ip: null, prefix: null, gateway: null, dns: [], mac: 'b8:27:eb:11:22:33', method: 'auto' },
  ] as Record<string, unknown>[],
  pending: null as null | { kind: string; summary: string; expires_at: number; confirm_url: string | null; before: string },
}
let revertTimer: ReturnType<typeof setTimeout> | null = null
function netPend(kind: string, summary: string, confirm_url: string | null = null) {
  netState.pending = { kind, summary, expires_at: Date.now() / 1000 + netState.revert_seconds, confirm_url, before: JSON.stringify({ ...netState, pending: null }) }
  if (revertTimer) clearTimeout(revertTimer)
  revertTimer = setTimeout(netUndo, netState.revert_seconds * 1000)
}
function netUndo() {
  if (!netState.pending) return
  const before = JSON.parse(netState.pending.before)
  Object.assign(netState, before, { pending: null })
  if (revertTimer) clearTimeout(revertTimer)
  console.log('  NET reverted')
}
const wifiList = [
  { ssid: 'ShopNet', signal: 58, security: 'WPA2', in_use: true },
  { ssid: 'HouseNet-5G', signal: 81, security: 'WPA2', in_use: false },
  { ssid: 'Neighbours', signal: 22, security: 'WPA3', in_use: false },
]
let rx = 8.2e8, tx = 2.1e9
setInterval(() => {
  const bw = 380_000 + Math.random() * 90_000
  rx += bw * 0.2; tx += bw * 0.8
  notify('notify_proc_stat_update', [{
    moonraker_stats: { time: Date.now() / 1000, cpu_usage: 3.1, memory: 42000, mem_units: 'kB' },
    cpu_temp: 51.5, network: { lo: { rx_bytes: 1, tx_bytes: 1, bandwidth: 9000 }, wlan0: { rx_bytes: rx, tx_bytes: tx, bandwidth: bw } },
    system_cpu_usage: { cpu: 12.5 }, websocket_connections: Math.max(1, sockets.size),
  }])
}, 1000)

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
      recordJob('cancelled')
      update('print_stats', { state: 'cancelled' })
      update('virtual_sdcard', { is_active: false })
      update('idle_timeout', { state: 'Ready' })
      outputsOff()
      respond('// Job cancelled, tool off')
      return 'ok'
    case 'machine.update.status': return updStatus()
    case 'machine.update.refresh': return updStatus()
    case 'machine.system_info': return { system_info: { distribution: { name: 'Debian GNU/Linux 12 (bookworm)' }, network: {
      wlan0: { mac_address: 'b8:27:eb:4c:91:2e', ip_addresses: [{ family: 'ipv4', address: '192.168.1.50', is_link_local: false }] },
      lo: { mac_address: '00:00:00:00:00:00', ip_addresses: [{ family: 'ipv4', address: '127.0.0.1', is_link_local: false }] } } } }
    case 'machine.proc_stats': return { websocket_connections: sockets.size }
    case 'server.connection.identify': return { connection_id: 1 }
    case 'server.info': return { klippy_connected: true, klippy_state: klippy, moonraker_version: 'mock' }
    case 'printer.objects.list': return { objects: [...new Set([...Object.keys(status), ...MACROS.map((m) => `gcode_macro ${m}`)])] }
    case 'printer.objects.subscribe': {
      const wanted = Object.keys((params?.objects as object) ?? {})
      return { eventtime: Date.now() / 1000, status: Object.fromEntries(wanted.filter((k) => k in status).map((k) => [k, status[k]])) }
    }
    case 'printer.firmware_restart':
    case 'printer.restart':
      respond(`// ${method === 'printer.restart' ? 'RESTART' : 'FIRMWARE_RESTART'} (pretend)`)
      return 'ok'
    case 'server.restart':
    case 'machine.services.restart':
    case 'machine.reboot':
    case 'machine.shutdown':
      if (status.print_stats?.state === 'printing') throw new Error('Not allowed while printing')
      console.log(`[mock] ${method} ${JSON.stringify(params ?? {})}`)
      return 'ok'
    case 'server.history.totals': {
      const done = jobHistory.filter((j) => j.status !== 'in_progress')
      return {
        job_totals: {
          total_jobs: done.length,
          total_time: done.reduce((a, j) => a + j.total_duration, 0),
          total_print_time: done.reduce((a, j) => a + j.print_duration, 0),
          total_filament_used: done.reduce((a, j) => a + j.filament_used, 0),
          longest_job: Math.max(0, ...done.map((j) => j.total_duration)),
          longest_print: Math.max(0, ...done.map((j) => j.print_duration)),
        },
      }
    }
    case 'server.history.list': {
      const limit = Math.max(1, Math.min(1000, Number(params?.limit ?? 50)))
      return { count: jobHistory.length, jobs: jobHistory.slice(0, limit) }
    }
    case 'server.files.get_directory':
      return listDir(String(params?.path ?? 'gcodes'))
    case 'server.files.post_directory':
    case 'server.files.delete_directory':
    case 'server.files.delete_file':
    case 'server.files.move':
    case 'server.files.copy':
      return fileOp(method, params as Record<string, unknown>)
    case 'server.files.list':
      if (params?.root === 'logs') return Object.entries(mockLogs).map(([path, text]) => ({ path, modified: Date.now() / 1000, size: text.length, permissions: 'r' }))
      return Object.entries(files).map(([path, text]) => ({ path, modified: fileTimes[path], size: text.length * 900, permissions: 'rw' }))
    case 'printer.emergency_stop':
      emergencyStop('websocket')
      return 'ok'
    case 'printer.objects.query': {
      // only what Studio asks for: the macro definitions (configfile settings)
      const settings = Object.fromEntries(Object.entries(HW_MACROS).map(([k, v]) => [`gcode_macro ${k.toLowerCase()}`, v]))
      return { eventtime: Date.now() / 1000, status: { configfile: { settings } } }
    }
    default:
      throw new Error(`Method not found: ${method}`)
  }
}

// ---- pretend Rhino Portal (maintenance) ---------------------------------
const PORTAL_TOKEN = 'mock-token-' + Math.random().toString(36).slice(2)
// ---- pin labels (Tool Manager 1.5.3), on top of the recorded /api/state ------------------
const labels: Record<string, string> = process.env.MOCK_LABELS === '0' ? {} : { ENCLOSURE_LIGHT: 'PB5', DRYBOX_FAN: 'PA8' }
const labelUsers: Record<string, string[]> = { ENCLOSURE_LIGHT: ['printer.cfg [output_pin enclosure_light]'], DRYBOX_FAN: ['printer.cfg [fan_generic drybox]'] }
const labelChoices = ['PB5', 'PA8', 'PB6', 'PB7', 'PC8', 'PC9', 'PE5', 'PE11', 'PE15', 'PG14']
const rawLines = [
  { file: 'printer.cfg', section: 'output_pin Umbilical_LED', key: 'pin', value: 'PD14', pin: 'PD14' },
  { file: 'printer.cfg', section: 'output_pin LASER_INITIALIZE', key: 'pin', value: 'PD13', pin: 'PD13' },
  { file: 'printer.cfg', section: 'output_pin SPINDLE_SPEED', key: 'pin', value: 'PB11', pin: 'PB11' },
  { file: 'printer.cfg', section: 'stepper_x', key: 'step_pin', value: 'PF13', pin: 'PF13' },
  { file: 'printer.cfg', section: 'stepper_x', key: 'endstop_pin', value: '^PG9', pin: 'PG9' },
  { file: 'printer.cfg', section: 'fan', key: 'pin', value: 'PA8', pin: 'PA8' },
]
const restartPending: string[] = []
function withLabels(state: Record<string, unknown>): Record<string, unknown> {
  const pins = { ...(state.pins as Record<string, unknown>) }
  pins.labels = [
    ...Object.entries(labels).sort().map(([alias, pin]) => ({ alias, pin, editable: true, source: 'Rhino labels', used_by: labelUsers[alias] ?? [] })),
    { alias: 'EXP1_3', pin: 'PE9', editable: false, source: 'printer.cfg [board_pins]', used_by: [] },
    { alias: 'EXP2_3', pin: 'PB1', editable: false, source: 'printer.cfg [board_pins]', used_by: [] },
  ]
  pins.raw_pin_lines = rawLines
  pins.free_board_pins = labelChoices.map((pin) => ({ pin, header: pin.startsWith('PE') ? 'EXP1' : '', connector: false, labelled: Object.entries(labels).filter(([, q]) => q === pin).map(([a]) => a) }))
  return restartPending.length ? { ...state, pins, restart_pending: true, pending: { changes: restartPending, since: Date.now() / 1000 - 30 } } : { ...state, pins }
}
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

const sp: {
  profiles: { id: string; name: string; engine: string; process: string; toolhead: string | null; material: string | null; settings: Record<string, unknown>; notes: string; header: Record<string, unknown>; created: number; updated: number; rev: number }[]
  deleted: { id: string; name: string; engine: string; process: string; deleted_at: number }[]
  history: Record<string, unknown[]>
  jobs: Record<string, unknown>
} = { profiles: [], deleted: [], history: {}, jobs: {} }
if (process.env.MOCK_PROFILES !== 'none') {
  const t = Math.floor(Date.now() / 1000) - 86400 * 3
  sp.profiles.push(
    { id: 'p_pla02', name: 'PLA 0.2 everyday', engine: 'kiri', process: 'fdm', toolhead: null, material: 'PLA', settings: { nozzle: 0.4, layerHeight: 0.2, walls: 3, infill: 0.2, speed: 60 }, notes: 'The one that just works.', header: { nozzle: 0.4, layerHeight: 0.2, walls: 3, infill: 0.2, speed: 60 }, created: t, updated: t, rev: 3 },
    { id: 'p_petgs', name: 'PETG strong', engine: 'kiri', process: 'fdm', toolhead: 'BlockOne', material: 'PETG', settings: { nozzle: 0.4, layerHeight: 0.24, walls: 5, infill: 0.4, speed: 45 }, notes: '', header: { nozzle: 0.4, layerHeight: 0.24, walls: 5, infill: 0.4, speed: 45 }, created: t, updated: t, rev: 1 },
    { id: 'p_ply3m', name: 'Plywood 3 mm cut', engine: 'kiri', process: 'laser', toolhead: null, material: 'PLYWOOD', settings: { power: 0.9, feed: 300, passes: 2 }, notes: '', header: { power: 0.9, feed: 300, passes: 2 }, created: t, updated: t, rev: 2 },
  )
  sp.history.p_pla02 = [{ ...sp.profiles[0]!, rev: 2, settings: { ...sp.profiles[0]!.settings, walls: 2 }, header: { ...sp.profiles[0]!.header, walls: 2 } }]
}
const readBody = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve) => {
    let b = ''
    req.on('data', (d) => (b += d))
    req.on('end', () => resolve(b ? JSON.parse(b) : {}))
  })

function json(res: import('node:http').ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}


// ---- PrusaSlicer on the Rhino (Portal 1.5.0): pretend engine -----------------
const prusaSchema = JSON.parse(readFileSync(new URL('../src/slicer/prusa/schema.json', import.meta.url), 'utf8')) as { options: Record<string, unknown> }
const prusaKeys = [...Object.keys(prusaSchema.options), 'bed_shape', 'autoemit_temperature_commands', 'start_gcode', 'end_gcode', 'post_process', 'gcode_substitutions']
const engine = { installed: process.env.MOCK_PRUSA === '0' ? null as string | null : '2.9.5', latest: '2.9.6', installing: false,
  phase: null as string | null, previous: null as string | null }
// PrusaSlicer keeps itself up to date while it's used (1.5.8)
const engineAuto = { on: true, last_used: Date.now() / 1000 - 2 * 86400, in_use: true, used_days: 30,
  last: { from: '2.9.4', to: '2.9.5', at: Date.now() / 1000 - 9 * 86400, ok: true, error: null } as Record<string, unknown> | null }
// Why the Portal (1.5.2) wouldn't offer the engine: MOCK_SMALL=1 (a Pi 3B), MOCK_FLATPAK=0 (no flatpak yet)
const engineBlocked = process.env.MOCK_SMALL === '1'
  ? 'PrusaSlicer needs a host with 2 GB of memory or more. Kiri:Moto in the browser still slices on this one.'
  : process.env.MOCK_FLATPAK === '0'
    ? 'PrusaSlicer comes from Flathub, so the Rhino’s host needs Flatpak first. Over SSH, run once: sudo apt install flatpak — then press Install again. (The Portal never runs sudo itself.)'
    : null
function mockInstall(to: string, from: string | null) {
  engine.installing = true
  const steps = from && to !== engine.latest ? [`Going back to ${to}`, 'Checking it slices'] : ['Adding Flathub', from ? 'Updating from Flathub' : 'Downloading from Flathub (the first time brings its runtime too)', 'Checking it slices']
  steps.forEach((ph, i) => setTimeout(() => (engine.phase = ph), i * 1500))
  setTimeout(() => { engine.installed = to; engine.previous = from; engine.installing = false; engine.phase = null }, steps.length * 1500)
}
type SliceJob = { id: string; state: string; phase: string; progress: number | null; error: string | null; started: number; center: [number, number]; ini: string; gcode?: string }
const sliceJobs: Record<string, SliceJob> = {}
function prusaGcode(cx: number, cy: number, ini: string) {
  const lh = Number(/^layer_height = ([\d.]+)/m.exec(ini)?.[1] ?? 0.2)
  const per = Number(/^perimeters = (\d+)/m.exec(ini)?.[1] ?? 3)
  const out = ['; generated by PrusaSlicer 2.9.5 (Rhino mock)', 'M107', 'G21', 'G90', 'M83']
  let z = 0
  for (let L = 0; L < 40; L++) {
    z = +(z + lh).toFixed(3)
    out.push(';LAYER_CHANGE', `;Z:${z}`, `G1 Z${z} F720`, ';TYPE:External perimeter')
    for (let k = 0; k < per; k++) {
      const h = 10 - k * 0.45
      out.push(`G1 X${(cx - h).toFixed(3)} Y${(cy - h).toFixed(3)} F9000`, `G1 X${(cx + h).toFixed(3)} Y${(cy - h).toFixed(3)} E0.8 F2400`,
        `G1 X${(cx + h).toFixed(3)} Y${(cy + h).toFixed(3)} E0.8`, `G1 X${(cx - h).toFixed(3)} Y${(cy + h).toFixed(3)} E0.8`, `G1 X${(cx - h).toFixed(3)} Y${(cy - h).toFixed(3)} E0.8`)
    }
  }
  out.push('M107', `; filament used [mm] = ${(40 * per * 3.2).toFixed(2)}`, `; estimated printing time (normal mode) = ${Math.round(40 * per * 1.5)}m 0s`,
    '; prusaslicer_config = begin', ...ini.split('\n').filter(Boolean).map((l) => `; ${l}`), '; prusaslicer_config = end')
  return out.join('\n') + '\n'
}
function multipart(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (d) => chunks.push(d))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1')
      const out: Record<string, string> = {}
      for (const part of body.split(/\r\n--[^\r\n]+/)) {
        const name = /name="([^"]+)"/.exec(part)?.[1]
        if (name) out[name] = part.split('\r\n\r\n').slice(1).join('\r\n\r\n')
      }
      resolve(out)
    })
  })
}

// ---- install a release zip (Tool Manager 1.5.3): pretend updater -------------
// MOCK_UPDATER=0: the updater isn't set up yet (Tool Manager before 1.5.3 on the Rhino)
const UPD_STEPS = ['Checking the zip', 'Checking no job runs', 'Backing up the config (BACKUP_CFG)', 'Unpacking', 'Installing', 'Restarting Klipper (FIRMWARE_RESTART)']
const upd = {
  installed: process.env.MOCK_TM_VERSION ?? '1.5.2',
  zips: [{ zip: 'rhino-config-1.5.1.zip', version: '1.5.1', size: 5_100_000, at: Date.now() / 1000 - 86400 * 9 }] as { zip: string; version: string; size: number; at: number }[],
  status: { state: 'idle' } as Record<string, unknown>,
  restartingUntil: 0,
}
// MOCK_UPDATE_RUN=failed: start with a stopped install and a long log (the avahi-utils 404 of Oct 2026)
if (process.env.MOCK_UPDATE_RUN === 'failed') {
  const log = ['Zip checked: Rhino Tool Manager 1.5.4', 'No job running (standby)', 'BACKUP_CFG done', 'Unpacked to ~/printer_data/rhino_data/update/work/1.5.4',
    '[1] Checking this Pi', '   OK   config folder: /home/pi/printer_data/config', '   OK   new files: /home/pi/printer_data/rhino_data/update/work/1.5.4',
    '   OK   login: pi (home /home/pi)', '   OK   no job running (standby)', '   note avahi-utils is missing - it will be installed (announces rhinostudio.local)',
    ...Array.from({ length: 18 }, (_, k) => `   OK   check ${k + 1}: fine`),
    '[2] Installing: avahi-utils', 'Reading package lists...', 'Building dependency tree...', 'Reading state information...', 'The following NEW packages will be installed:', '  avahi-utils',
    '0 upgraded, 1 newly installed, 0 to remove and 135 not upgraded.', 'Need to get 60.6 kB of archives.', 'After this operation, 153 kB of additional disk space will be used.',
    'Err:1 http://security.debian.org/debian-security bullseye-security/main arm64 avahi-utils arm64 0.8-5+deb11u3', '  404  Not Found [IP: 2a04:4e42:200::644 80]',
    'E: Failed to fetch http://security.debian.org/debian-security/pool/updates/main/a/avahi/avahi-utils_0.8-5%2bdeb11u3_arm64.deb  404  Not Found [IP: 2a04:4e42:200::644 80]',
    'E: Unable to fetch some archives, maybe run apt-get update or try with --fix-missing?', 'STOPPED: apt could not install avahi-utils.', 'Nothing after this point was changed.']
  upd.status = { state: 'failed', zip: 'rhino-config-1.5.4.zip', version: '1.5.4', from_version: upd.installed, steps: UPD_STEPS, step: 4, step_name: UPD_STEPS[4],
    started: Date.now() / 1000 - 90, finished: Date.now() / 1000 - 30, updated: Date.now() / 1000, log,
    error: 'install.sh stopped (code 1). Your config folder is as the install left it; the last lines above say why. Undo with rhino.sh option 4.' }
}

function updRun(zip: string) {
  const version = /rhino-config-([\d.]+)\.zip/.exec(zip)![1]!
  const log: string[] = []
  upd.status = { state: 'running', zip, version, from_version: upd.installed, steps: UPD_STEPS, step: 0, step_name: UPD_STEPS[0], started: Date.now() / 1000, updated: Date.now() / 1000, log, error: null, finished: null }
  let i = 0
  const lines = ['Zip checked: Rhino Tool Manager ' + version, 'No job running (standby)', 'BACKUP_CFG done', 'Unpacked', '[1] Checking this Pi\n   OK   config folder\n[2] Backing up your config folder\n   OK   backup: ~/rhino-backup-2026-10-19-1840\n[3] Copying the new files\n   OK   files copied\n[4] Starting the portal as a service', 'FIRMWARE_RESTART sent']
  const tick = () => {
    log.push(...lines[i]!.split('\n'))
    i++
    if (i === 5) upd.restartingUntil = Date.now() + 3500 // the Portal restarts during the install
    if (i >= UPD_STEPS.length) {
      const keep = upd.installed
      upd.installed = version
      upd.zips = upd.zips.filter((z) => z.version === version || z.version === keep)
      upd.status = { ...upd.status, state: 'done', step: UPD_STEPS.length, finished: Date.now() / 1000, updated: Date.now() / 1000 }
      return
    }
    upd.status = { ...upd.status, step: i, step_name: UPD_STEPS[i], updated: Date.now() / 1000 }
    setTimeout(tick, 1500)
  }
  setTimeout(tick, 1200)
}

const UNTRUSTED = process.env.MOCK_AUTH === 'untrusted'
/** Moonraker's [authorization] with this screen not in trusted_clients */
function untrusted(req: IncomingMessage, res: import('node:http').ServerResponse, url: string): boolean {
  if (url === '/access/info') {
    json(res, UNTRUSTED ? 200 : 404, UNTRUSTED ? { result: { default_source: 'moonraker', available_sources: ['moonraker'], login_required: false, trusted: false } } : {})
    return true
  }
  if (!UNTRUSTED || url.startsWith('/webcam') || url === '/') return false
  if (url.startsWith('/api/')) return (json(res, 401, { ok: false, error: "Moonraker doesn't trust this address (192.168.86.31). Add it to trusted_clients in moonraker.conf and restart Moonraker.", untrusted: true, address: '192.168.86.31' }), true)
  if (/^\/(server|printer|machine|access)\//.test(url)) return (json(res, 401, { error: { code: 401, message: 'Unauthorized' } }), true)
  return false
}

// Settings > Trusted addresses (Tool Manager 1.5.4): an in-memory trusted_clients
const trusted = ['127.0.0.0/8', '192.168.86.0/24']
async function trustRoutes(req: IncomingMessage, res: import('node:http').ServerResponse, url: string): Promise<boolean> {
  if (url !== '/api/moonraker-trust') return false
  const state = () => ({ ok: true, configured: true, force_logins: false, include: false, entries: trusted, address: '192.168.86.31', covered: true,
    suggestions: trusted.includes('100.64.0.0/10') ? [] : [{ entry: '100.64.0.0/10', why: 'Tailscale (any device on your tailnet)' }] })
  if (req.method === 'GET') return (json(res, 200, state()), true)
  const entry = String((await readBody(req)).entry ?? '').trim()
  await new Promise((r) => setTimeout(r, 1200)) // Moonraker restarting
  if (req.method === 'POST') {
    if (!/^[\d.:a-fA-F]+(\/\d+)?$/.test(entry)) return (json(res, 400, { ok: false, error: `"${entry}" isn't an address or a range (for example 192.168.1.50 or 192.168.1.0/24).` }), true)
    if (!trusted.includes(entry)) trusted.push(entry)
    console.log(`  TRUST + ${entry} (Moonraker restarted)`)
    return (json(res, 200, state()), true)
  }
  if (req.method === 'DELETE') {
    if (entry === '192.168.86.0/24') return (json(res, 400, { ok: false, error: `${entry} is what lets this screen (192.168.86.31) in. Remove it from another trusted screen, or over SSH.` }), true)
    const i = trusted.indexOf(entry)
    if (i >= 0) trusted.splice(i, 1)
    console.log(`  TRUST - ${entry} (Moonraker restarted)`)
    return (json(res, 200, state()), true)
  }
  return false
}

const BK_ITEMS = { maintenance: 'Maintenance (tasks, work log, meters)', tools: 'Tool registry, lists and umbilical', studio: 'Rhino Studio settings', images: 'Toolhead photos' }
const bk: { archives: { name: string; size: number; time: number; complete: boolean; host?: string; reason?: string; tool_manager?: string; files?: number }[]; github: { state: string; last: { ok: boolean; code: number | null; time: number; tail: string[] } | null } } = {
  archives: process.env.MOCK_BACKUP === 'none' ? [] : [
    { name: 'rhino-mainsailos-20261024-221510.zip', size: 3_398_112, time: Date.now() / 1000 - 19 * 3600, complete: true, host: 'mainsailos', reason: 'after_long_job', tool_manager: '1.7.0', files: 212 },
    { name: 'rhino-mainsailos-20261019-090200.zip', size: 3_351_870, time: Date.now() / 1000 - 6 * 86400, complete: true, host: 'mainsailos', reason: 'BACKUP_CFG', tool_manager: '1.7.0', files: 209 },
  ],
  github: process.env.MOCK_BACKUP === 'nogh' ? { state: 'not_installed', last: null } : { state: 'failed', last: { ok: false, code: 128, time: Date.now() / 1000 - 19 * 3600, tail: ['fatal: Authentication failed'] } },
}

async function portal(req: IncomingMessage, res: import('node:http').ServerResponse, url: string): Promise<boolean> {
  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' }).end(
      `<!doctype html><html><head><meta name="rhino-token" content="${PORTAL_TOKEN}"></head><body><p class="version">v${TM_VERSION}</p></body></html>`,
    )
    return true
  }
  if (url.startsWith('/api/update')) {
    if (process.env.MOCK_UPDATER === 'old') return json(res, 404, { ok: false, error: 'Not found' }), true
    if (Date.now() < upd.restartingUntil) return res.writeHead(502).end(), true
    const busy = upd.status.state === 'running'
    // GitHub's newest release (Tool Manager 1.5.8): MOCK_RELEASE=1.5.9 (default), MOCK_RELEASE=none for none yet
    const relV = process.env.MOCK_RELEASE ?? '1.5.9'
    const latest = relV === 'none' ? { error: 'No releases on GitHub yet.' } : { version: relV, zip: `rhino-config-${relV}.zip`, published: '2026-10-21T16:00:00Z' }
    if (req.method === 'GET' && url === '/api/update') return json(res, 200, { ok: true, installed: upd.installed, helper: process.env.MOCK_UPDATER !== '0', zips: upd.zips, busy, status: upd.status, latest }), true
    if (req.method === 'POST' && url === '/api/update/github') {
      const body = await readBody(req)
      if (busy) return json(res, 400, { ok: false, error: 'An install is already running.' }), true
      if (body.version !== relV) return json(res, 400, { ok: false, error: `GitHub's newest release is now ${relV}, not ${body.version}. Check again.` }), true
      await new Promise((r) => setTimeout(r, 1500)) // downloading
      const zip = `rhino-config-${relV}.zip`
      if (!upd.zips.some((z) => z.zip === zip)) upd.zips.push({ zip, version: relV, size: 4_200_000, at: Date.now() / 1000 })
      console.log(`  UPDATE from GitHub ${zip}`)
      updRun(zip)
      return json(res, 200, { ok: true, zip }), true
    }
    if (req.headers['x-rhino-token'] !== PORTAL_TOKEN) return json(res, 400, { ok: false, error: 'This page is out of date (the portal was restarted). Reload the page and try again.' }), true
    if (req.method === 'POST' && url === '/api/update/upload') {
      const chunks: Buffer[] = []
      for await (const d of req) chunks.push(d as Buffer)
      const name = /filename="([^"]+)"/.exec(Buffer.concat(chunks).toString('latin1'))?.[1] ?? ''
      const v = /rhino-config-(\d+\.\d+\.\d+)\.zip$/.exec(name)?.[1]
      if (busy) return json(res, 400, { ok: false, error: 'An install is running. Wait for it to finish.' }), true
      if (!v) return json(res, 400, { ok: false, error: "This isn't a Rhino Tool Manager release zip (missing VERSION, install.sh, rhino.sh)." }), true
      const zip = `rhino-config-${v}.zip`
      upd.zips = [...upd.zips.filter((z) => z.zip !== zip), { zip, version: v, size: chunks.reduce((n, c) => n + c.length, 0), at: Date.now() / 1000 }]
      return json(res, 200, { ok: true, zip, version: v, installed: upd.installed }), true
    }
    if (req.method === 'POST' && url === '/api/update/install') {
      const body = await readBody(req)
      if (process.env.MOCK_UPDATER === '0') return json(res, 400, { ok: false, error: "The updater isn't set up on this Rhino yet." }), true
      if (busy) return json(res, 400, { ok: false, error: 'An install is already running.' }), true
      if (status.print_stats.state === 'printing' || status.print_stats.state === 'paused') return json(res, 400, { ok: false, error: 'A job is running. Finish or cancel it first.' }), true
      if (!upd.zips.some((z) => z.zip === body.zip)) return json(res, 400, { ok: false, error: "That zip isn't here. Upload it again." }), true
      updRun(String(body.zip))
      return json(res, 200, { ok: true, zip: body.zip }), true
    }
  }
  // Slice profiles and saved Prepare jobs (Tool Manager 1.8). MOCK_PROFILES=old (Portal before 1.8) | none (no profiles yet)
  if (url.startsWith('/api/slice-profiles') || url.startsWith('/api/prepare-jobs')) {
    if (process.env.MOCK_PROFILES === 'old') return json(res, 404, { ok: false, error: 'Not found' }), true
    const path = url.split('?')[0]!
    const pub = (p: (typeof sp.profiles)[number]) => p
    if (req.method === 'GET' && path === '/api/slice-profiles') return json(res, 200, { ok: true, profiles: sp.profiles.map(pub), deleted: sp.deleted }), true
    if (req.method === 'GET' && path === '/api/prepare-jobs') return json(res, 200, { ok: true, jobs: sp.jobs }), true
    const hm = /^\/api\/slice-profiles\/(p_[a-z0-9]+)\/history$/.exec(path)
    if (req.method === 'GET' && hm) return json(res, 200, { ok: true, revisions: sp.history[hm[1]!] ?? [] }), true
    if (req.method === 'GET' && path === '/api/slice-profiles-export') return json(res, 200, { rhino_slice_profiles: 1, profiles: sp.profiles }), true
    if (req.headers['x-rhino-token'] !== PORTAL_TOKEN) return json(res, 400, { ok: false, error: 'This page is out of date (the portal was restarted). Reload the page and try again.' }), true
    const body = req.method === 'POST' || req.method === 'DELETE' ? await readBody(req) : {}
    const now = Math.floor(Date.now() / 1000)
    const header = (s: Record<string, unknown>) => Object.fromEntries(['nozzle', 'layerHeight', 'walls', 'infill', 'speed', 'power', 'feed', 'passes'].filter((k) => k in s).map((k) => [k, s[k]]))
    if (req.method === 'POST' && path === '/api/slice-profiles') {
      const p = { ...(body as Record<string, unknown>), id: `p_${Math.random().toString(36).slice(2, 8)}`, rev: 1, created: now, updated: now, header: header((body.settings ?? {}) as Record<string, unknown>) } as (typeof sp.profiles)[number]
      sp.profiles.push(p)
      return json(res, 200, { ok: true, profile: p }), true
    }
    const m = /^\/api\/slice-profiles\/(p_[a-z0-9]+)(\/revert|\/undelete)?$/.exec(path)
    if (m) {
      const i = sp.profiles.findIndex((x) => x.id === m[1])
      if (req.method === 'DELETE' && i >= 0) {
        const [gone] = sp.profiles.splice(i, 1)
        sp.deleted.unshift({ id: gone!.id, name: gone!.name, engine: gone!.engine, process: gone!.process, deleted_at: now })
        return json(res, 200, { ok: true, deleted: gone!.id }), true
      }
      if (req.method === 'POST' && !m[2] && i >= 0) {
        const old = sp.profiles[i]!
        if (body.rev !== old.rev) return json(res, 400, { ok: false, error: `${old.name} was changed on another device (now revision ${old.rev}). Reload it, then save again.` }), true
        const p = { ...old, ...(body.profile as Record<string, unknown>), id: old.id, rev: old.rev + 1, updated: now } as (typeof sp.profiles)[number]
        p.header = header(p.settings)
        ;(sp.history[old.id] ??= []).unshift(old)
        sp.profiles[i] = p
        return json(res, 200, { ok: true, profile: p }), true
      }
    }
    if (req.method === 'POST' && path === '/api/prepare-jobs') {
      sp.jobs[String(body.file)] = { ...(body.job as Record<string, unknown>), saved: now }
      return json(res, 200, { ok: true, job: sp.jobs[String(body.file)] }), true
    }
    return json(res, 400, { ok: false, error: 'Not in the pretend Portal' }), true
  }
  // Backups (Tool Manager 1.7). MOCK_BACKUP=none (no archives) | old (Portal before 1.7) | nogh (no klipper-backup)
  if (url.startsWith('/api/backup') || url.startsWith('/api/restore')) {
    if (process.env.MOCK_BACKUP === 'old') return json(res, 404, { ok: false, error: 'Not found' }), true
    const busy = status.print_stats.state === 'printing' || status.print_stats.state === 'paused'
    if (req.method === 'GET' && url === '/api/backup') {
      return json(res, 200, { ok: true, archives: bk.archives, keep: 10, folder: '/home/pi/rhino-backups', items: BK_ITEMS, github: { ...bk.github, running: false } }), true
    }
    if (req.method === 'GET' && url.startsWith('/api/backup/file/')) return res.writeHead(200, { 'content-type': 'application/zip' }).end('PK'), true
    if (req.headers['x-rhino-token'] !== PORTAL_TOKEN) return json(res, 400, { ok: false, error: 'This page is out of date (the portal was restarted). Reload the page and try again.' }), true
    if (busy && req.method === 'POST' && url !== '/api/restore/plan') return json(res, 400, { ok: false, error: 'Not during a job: a backup waits until the job is finished.' }), true
    if (req.method === 'POST' && url === '/api/backup') {
      await new Promise((r) => setTimeout(r, 900))
      const t = Date.now() / 1000
      const d = new Date(t * 1000)
      const p2 = (n: number) => String(n).padStart(2, '0')
      const name = `rhino-mainsailos-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.zip`
      const a = { name, size: 3_412_000, time: t, complete: true, host: 'mainsailos', reason: 'button', tool_manager: TM_VERSION, files: 214 }
      bk.archives = [a, ...bk.archives].slice(0, 10)
      if (process.env.MOCK_BACKUP !== 'nogh') bk.github = { state: 'ok', last: { ok: true, code: 0, time: t, tail: [] } }
      return json(res, 200, { ok: true, archive: a }), true
    }
    if (req.method === 'POST' && url === '/api/restore/plan') {
      const b = await readBody(req)
      const all = b.item === 'all'
      const plan = all
        ? { archive: b.archive, item: 'all', this_host: 'mainsailos', host: 'mainsailos', add: ['config/myrhino/umbilical.json'], replace: ['config/printer.cfg', 'config/variables.save', 'config/myrhino/maintenance/history.json'], same: Array.from({ length: 180 }, (_, i) => `f${i}`), keep: ['config/my_extra.cfg'], missing_serial: process.env.MOCK_BACKUP === 'serial' ? [{ file: 'printer.cfg', section: 'mcu', serial: '/dev/serial/by-id/usb-Klipper_stm32f446xx_old-if00' }] : [], history_jobs: 412, backup_version: '1.7.0', installed_version: TM_VERSION }
        : { archive: b.archive, item: b.item, this_host: 'mainsailos', add: [], replace: b.item === 'studio' ? ['theme'] : ['config/myrhino/maintenance/tasks.json'], same: ['config/myrhino/maintenance/meters.json'], keep: [] }
      return json(res, 200, { ok: true, plan }), true
    }
    if (req.method === 'POST' && url === '/api/restore') {
      const b = await readBody(req)
      if (b.item === 'all' && b.confirm !== 'mainsailos') return json(res, 400, { ok: false, error: "Type this machine's name (mainsailos) to confirm a full restore" }), true
      await new Promise((r) => setTimeout(r, 900))
      return json(res, 200, { ok: true, item: b.item, before: 'rhino-mainsailos-before.zip', restored: 3, note: b.item === 'tools' ? 'Restart Klipper to use the restored tools.' : '' }), true
    }
    if (req.method === 'POST' && url === '/api/backup/upload') return json(res, 400, { ok: false, error: 'That backup can\'t be used: config/printer.cfg is damaged (checksum differs).' }), true
  }
  if (req.method === 'GET' && url === '/api/maint') return json(res, 200, maint), true
  if (req.method === 'GET' && url === '/api/maint/history') return json(res, 200, maintHistory), true
  if (req.method === 'GET' && url === '/api/dash/jobs') return json(res, 200, jobsPerWeek()), true
  // Tool library, read-only, from the Portal's demo (scripts/fixtures/portal-*.json). Changes need the real
  // Portal: python3 dev/demo_server.py in Toolhead_Manager, then PORTAL=http://127.0.0.1:5055 npm run dev
  // Settings / Network (Portal 1.4.8)
  if (req.method === 'GET' && url === '/api/net') {
    const { pending, ...rest } = netState
    return json(res, 200, { ok: true, ...rest, pending: pending ? { kind: pending.kind, summary: pending.summary, expires_at: pending.expires_at, confirm_url: pending.confirm_url } : null }), true
  }
  if (req.method === 'GET' && url === '/api/net/wifi') return json(res, 200, { ok: true, networks: wifiList }), true
  const netw = url.match(/^\/api\/net\/(hostname|ipv4|wifi|powersave|keep|undo)$/)
  if (req.method === 'POST' && netw) {
    if (req.headers['x-rhino-token'] !== PORTAL_TOKEN) return json(res, 400, { ok: false, error: 'This page is out of date (the portal was restarted). Reload the page and try again.' }), true
    const body = await readBody(req)
    const what = netw[1]!
    console.log(`  NET ${what} ${JSON.stringify({ ...body, password: body.password ? '***' : undefined })}`)
    if (what === 'keep') { netState.pending = null; if (revertTimer) clearTimeout(revertTimer); return json(res, 200, { ok: true }), true }
    if (what === 'undo') { netUndo(); return json(res, 200, { ok: true }), true }
    if (netState.pending) return json(res, 400, { ok: false, error: 'Keep or undo the waiting network change first.' }), true
    const wl = netState.interfaces[0]!
    if (what === 'hostname') { netPend('hostname', `Renamed to ${body.hostname}.local`); netState.hostname = String(body.hostname) }
    if (what === 'powersave') { netPend('powersave', `Wi-Fi power saving ${body.on ? 'on' : 'off'}`); wl.powersave = !!body.on }
    if (what === 'ipv4') {
      const i = netState.interfaces.find((x) => x.name === body.iface)!
      if (body.method === 'manual') { netPend('ipv4', `${body.iface}: fixed address ${body.address}/${body.prefix}`, body.address !== i.ip ? `http://${body.address}:5000/` : null); Object.assign(i, { method: 'manual', ip: body.address, prefix: body.prefix, gateway: body.gateway, dns: body.dns }) }
      else { netPend('ipv4', `${body.iface}: automatic address`); i.method = 'auto' }
    }
    if (what === 'wifi') { netPend('wifi', `Joined ${body.ssid}`); Object.assign(wl, { ssid: body.ssid, connection: body.ssid }); for (const w of wifiList) w.in_use = w.ssid === body.ssid }
    return json(res, 200, { ok: true, pending: true }), true
  }
  // PrusaSlicer on the Rhino (Portal 1.5.0; from Flathub 1.5.2)
  if (req.method === 'GET' && url === '/api/slicer') {
    const printing = status.print_stats.state === 'printing' || status.print_stats.state === 'paused'
    return json(res, 200, { ok: true, engine: { name: 'PrusaSlicer', source: 'Flathub', installed: engine.installed, latest: engine.latest,
      update_available: !engineBlocked && (!engine.installed || engine.installed !== engine.latest),
      installing: engine.installing, install_phase: engine.phase, install_error: null, can_install: !engineBlocked, blocked: engineBlocked,
      previous: engine.previous, arch: process.env.MOCK_SMALL === '1' ? 'aarch64' : 'x86_64' },
      auto: engineAuto,
      host: { mem_total_mb: process.env.MOCK_SMALL === '1' ? 906 : 15800, cpus: process.env.MOCK_SMALL === '1' ? 4 : 8, small: process.env.MOCK_SMALL === '1' },
      busy: Object.values(sliceJobs).find((j) => j.state === 'running')?.id ?? null, refuse: printing && process.env.MOCK_SMALL === '1' ? 'This host has under 2 GB of memory.' : null }), true
  }
  if (req.method === 'GET' && url === '/api/slicer/keys') return json(res, engine.installed ? 200 : 400, engine.installed ? { ok: true, keys: prusaKeys } : { ok: false, error: 'not installed' }), true
  const sj = url.match(/^\/api\/slicer\/jobs\/([\w-]+)(\/gcode|\/cancel)?$/)
  if (sj) {
    const j = sliceJobs[sj[1]!]
    if (!j) return json(res, 400, { ok: false, error: 'No such slice' }), true
    if (sj[2] === '/gcode') { res.writeHead(200, { 'content-type': 'text/plain' }).end(j.gcode ?? ''); return true }
    if (sj[2] === '/cancel') { j.state = 'cancelled'; return json(res, 200, { ok: true }), true }
    const t = (Date.now() - j.started) / 1000
    if (j.state === 'running' || j.state === 'queued') {
      if (t > 3) { j.state = 'done'; j.phase = 'Done'; j.progress = 1; j.gcode = prusaGcode(j.center[0], j.center[1], j.ini) }
      else { j.state = 'running'; j.progress = Math.min(0.95, t / 3); j.phase = t < 1 ? 'Reading the part' : t < 2 ? 'Walls' : 'Writing G-code' }
    }
    return json(res, 200, { ok: true, id: j.id, state: j.state, phase: j.phase, progress: j.progress, error: j.error, seconds: +t.toFixed(1), cached: false }), true
  }
  if (req.method === 'POST' && /^\/api\/slicer\//.test(url)) {
    if (req.headers['x-rhino-token'] !== PORTAL_TOKEN) return json(res, 400, { ok: false, error: 'This page is out of date (the portal was restarted). Reload the page and try again.' }), true
    if (url === '/api/slicer/slice') {
      const f = await multipart(req)
      if (!engine.installed) return json(res, 400, { ok: false, error: "PrusaSlicer isn't installed on the Rhino yet (Studio: Settings > Software)." }), true
      const [cx, cy] = (f.center ?? '275,187.5').split(',').map(Number)
      for (const j of Object.values(sliceJobs)) if (j.state === 'running' || j.state === 'queued') j.state = 'cancelled'
      const id = Math.random().toString(16).slice(2, 14)
      sliceJobs[id] = { id, state: 'queued', phase: 'Waiting', progress: null, error: null, started: Date.now(), center: [cx!, cy!], ini: f.config ?? '' }
      console.log(`  SLICE ${id} at ${cx},${cy} (${(f.config ?? '').split('\n').length} settings lines)`)
      return json(res, 200, { ok: true, id, state: 'queued' }), true
    }
    if (url === '/api/slicer/engine/check') return json(res, 200, { ok: true }), true
    if (url === '/api/slicer/engine/update') {
      if (engineBlocked) return json(res, 400, { ok: false, error: engineBlocked }), true
      console.log(`  ENGINE install ${engine.latest} from Flathub`)
      mockInstall(engine.latest, engine.installed)
      return json(res, 200, { ok: true, version: engine.latest }), true
    }
    if (url === '/api/slicer/engine/auto') {
      engineAuto.on = !!(await readBody(req)).on
      return json(res, 200, { ok: true, auto: engineAuto }), true
    }
    if (url === '/api/slicer/engine/rollback') {
      if (!engine.previous) return json(res, 400, { ok: false, error: "There's no earlier PrusaSlicer to go back to." }), true
      console.log(`  ENGINE go back to ${engine.previous}`)
      mockInstall(engine.previous, engine.installed)
      return json(res, 200, { ok: true, version: engine.previous }), true
    }
  }
  if (req.method === 'GET' && url === '/api/state') return json(res, 200, withLabels(portalFixture('state') as Record<string, unknown>)), true
  // Pin labels (Tool Manager 1.5.3): [board_pins rhino], kept in memory here
  if (url.startsWith('/api/pins/label') || url === '/api/preview/pins/label') {
    if (req.headers['x-rhino-token'] !== PORTAL_TOKEN) return json(res, 400, { ok: false, error: 'This page is out of date (the portal was restarted). Reload the page and try again.' }), true
    const body = req.method === 'POST' ? await readBody(req) : {}
    console.log(`  LABELS ${req.method} ${url} ${JSON.stringify(body)}`)
    if (req.method === 'POST' && url === '/api/pins/label/use') {
      const line = rawLines.find((r) => r.section === body.section && r.key === body.key && r.file === body.file)
      if (!line) return json(res, 400, { ok: false, error: `No ${body.key} line in ${body.file} [${body.section}]` }), true
      const alias = String(body.alias ?? '').toUpperCase()
      if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(alias)) return json(res, 400, { ok: false, error: 'A label is 2-32 letters, digits and _, starting with a letter (like ENCLOSURE_LIGHT)' }), true
      const made = !(alias in labels)
      if (!made && labels[alias] !== line.pin) return json(res, 400, { ok: false, error: `${alias} names ${labels[alias]}, but [${line.section}] uses ${line.pin}` }), true
      labels[alias] = line.pin
      labelUsers[alias] = [...(labelUsers[alias] ?? []), `${line.file} [${line.section}]`]
      rawLines.splice(rawLines.indexOf(line), 1)
      restartPending.push(`[${line.section}] uses pin label ${alias}`)
      return json(res, 200, { ok: true, alias, pin: line.pin, made_label: made, restart_pending: true }), true
    }
    const del = url.match(/^\/api\/pins\/label\/([A-Za-z0-9_]+)$/)
    if (req.method === 'DELETE' && del) {
      const a = del[1]!.toUpperCase()
      if ((labelUsers[a] ?? []).length) return json(res, 400, { ok: false, error: `${a} is used by ${labelUsers[a]!.join(', ')} - change those to a pin first` }), true
      delete labels[a]
      restartPending.push(`pin label ${a} removed`)
      return json(res, 200, { ok: true, alias: a, restart_pending: true }), true
    }
    if (req.method === 'POST') {
      const alias = String(body.alias ?? '').trim().toUpperCase()
      const pin = String(body.pin ?? '').trim().toUpperCase()
      const original = body.original ? String(body.original).toUpperCase() : null
      if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(alias)) return json(res, 400, { ok: false, error: 'A label is 2-32 letters, digits and _, starting with a letter (like ENCLOSURE_LIGHT)' }), true
      if (!labelChoices.includes(pin)) return json(res, 400, { ok: false, error: `${pin} is already used by printer.cfg` }), true
      const holder = Object.entries(labels).find(([a, q]) => q === pin && a !== (original ?? alias))
      if (holder) return json(res, 400, { ok: false, error: `${pin} is kept for pin label ${holder[0]}` }), true
      if (url.startsWith('/api/preview')) return json(res, 200, { ok: true, alias, pin, warnings: [] }), true
      const previous = labels[original ?? alias] ?? null
      if (original) delete labels[original]
      labels[alias] = pin
      restartPending.push(previous ? `pin label ${alias}: ${previous} -> ${pin}` : `pin label ${alias} = ${pin}`)
      return json(res, 200, { ok: true, alias, pin, previous, warnings: [], restart_needed: true, restart_pending: true }), true
    }
  }
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
  if (untrusted(req, res, url)) return
  if (await trustRoutes(req, res, url)) return
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
      // form fields: root, path (folder), print, file
      const field = (n: string) => new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)\\r\\n`).exec(body)?.[1]
      const root = field('root') ?? 'gcodes'
      const folder = field('path') ?? ''
      const fname = /filename="([^"]+)"/.exec(body)?.[1] ?? 'upload.gcode'
      const fileStart = body.indexOf('\r\n\r\n', body.indexOf('filename="')) + 4
      const content = body.slice(fileStart, body.lastIndexOf('\r\n--'))
      const rel = folder ? `${folder}/${fname}` : fname
      const st = root === 'gcodes' || root === 'config' ? rootStore(root) : null
      if (!st) return void res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: `Write access to root ${root} is not allowed` } }))
      try {
        inUse(`${root}/${rel}`)
      } catch (e) {
        return void res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: (e as Error).message } }))
      }
      st[0][rel] = content
      st[1][rel] = Date.now() / 1000
      console.log(`  UPLOAD ${root}/${rel} (${content.length} bytes)`)
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ item: { path: rel, root }, print_started: false }))
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
  const m = url.match(/^\/server\/files\/(gcodes|config)\/(.+)$/)
  if (m) {
    const store = m[1] === 'gcodes' ? files : cfgFiles
    const rel = decodeURIComponent(m[2]!.split('?')[0]!)
    if (store[rel] != null) return void res.writeHead(200, { 'content-type': 'text/plain' }).end(store[rel])
  }
  const lg = url.match(/^\/server\/files\/logs\/(.+)$/)
  if (lg && mockLogs[decodeURIComponent(lg[1]!)] != null) {
    const body = mockLogs[decodeURIComponent(lg[1]!)]!
    const range = /^bytes=-(\d+)$/.exec(String(req.headers.range ?? ''))
    if (range) return void res.writeHead(206, { 'content-type': 'text/plain' }).end(body.slice(-Number(range[1])))
    return void res.writeHead(200, { 'content-type': 'text/plain' }).end(body)
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
    if (UNTRUSTED) {
      // As Moonraker answers an untrusted socket: every call is refused
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: 401, message: 'Unauthorized' } }))
      return
    }
    if (msg.method === 'machine.update.upgrade') {
      const name = String(msg.params?.name ?? '')
      console.log(`  UPDATE ${name}`)
      mockUpgrade(name).then(
        () => ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: 'ok' })),
        (e: Error) => ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: 400, message: e.message } })),
      )
      return
    }
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
    update(h, { temperature: Number(next.toFixed(2)), ...(h === 'extruder' ? { can_extrude: next >= 170 } : {}) })
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
      recordJob('completed')
      update('print_stats', { state: 'complete' })
      respond(`Done printing file ${jobFile}`)
    }
  }
}, 1000)

server.listen(PORT, () => console.log(`Mock Moonraker (${scenario}) on http://localhost:${PORT}`))
