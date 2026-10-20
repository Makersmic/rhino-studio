import type { CheckedScript } from '@/control/commands'

/**
 * Moonraker websocket client (JSON-RPC 2.0 over /websocket).
 *
 * Two gates:
 * - Reads go through call(), which only sends READ_ONLY_METHODS.
 * - Actions go through act(), which only sends ACTION_METHODS. G-code goes
 *   out only as a CheckedScript (src/control/commands.ts), so every script
 *   has been through the safety check and any confirmation it needed.
 * - Camera settings go through configure(), which only sends CAMERA_METHODS.
 * - Studio's own settings (panel colours) go through studioSetting(), which
 *   only reads and writes Moonraker's database in the 'rhino_studio' namespace.
 *   They change Moonraker's camera list (shared with Mainsail), never the
 *   machine.
 * The emergency stop needs none of them.
 *
 * Connection life cycle:
 *   connect -> identify -> server.info
 *     klippy ready?  -> printer.objects.list -> printer.objects.subscribe
 *     not ready?     -> ask server.info again every 2 s until it is
 *   notify_status_update        -> status changes
 *   notify_klippy_shutdown      -> Klipper shut down (status kept, marked not ready)
 *   notify_klippy_disconnected  -> Klipper restarting: clear status, wait for ready
 *   notify_klippy_ready         -> subscribe again
 *   socket closed               -> clear everything, reconnect with back-off
 */

import { watchedForAll } from '@/tools/adapters'
import { brand } from '@/brand/brand'

export type ConnectionState = 'offline' | 'connecting' | 'online' | 'error'
export type KlippyState = 'ready' | 'startup' | 'shutdown' | 'error' | 'disconnected' | 'unknown'
export type Status = Record<string, Record<string, unknown>>

/** Every method this client may send in Phase 2a. Nothing here changes the machine. */
export const READ_ONLY_METHODS: ReadonlySet<string> = new Set([
  'server.connection.identify',
  'server.info',
  'printer.objects.list',
  'printer.objects.subscribe',
  'server.files.list',
  'server.files.get_directory',
  'server.history.list',
  'server.history.totals',
  'server.gcode_store',
  'printer.gcode.help',
  'server.webcams.list',
  'server.temperature_store',
  // Settings / Software and Network: versions, interfaces, load. Nothing here changes anything.
  'machine.update.status',
  'machine.system_info',
  'machine.proc_stats',
])

/**
 * Software updates through Moonraker's update manager. They restart services
 * (Moonraker, Klipper) but never move the machine; Moonraker refuses them
 * during a job, and Studio checks first (src/system/updates.ts). Only
 * update() sends these. The legacy ones are for Moonraker before API 1.5.
 */
export const UPDATE_METHODS: ReadonlySet<string> = new Set([
  'machine.update.refresh',
  'machine.update.upgrade',
  'machine.update.system',
  'machine.update.moonraker',
  'machine.update.klipper',
  'machine.update.client',
])

/**
 * Methods that edit the camera list in Moonraker's database (the same list
 * Mainsail and Fluidd use). They never touch Klipper or the machine.
 */
export const CAMERA_METHODS: ReadonlySet<string> = new Set(['server.webcams.post_item', 'server.webcams.delete_item'])

/**
 * Studio's own settings in Moonraker's database, so every screen (PC, phone,
 * pendant) shows the same theme and it's backed up with the config. Only the
 * STUDIO_NAMESPACE is ever read or written; nothing here reaches Klipper.
 */
export const SETTINGS_METHODS: ReadonlySet<string> = new Set(['server.database.get_item', 'server.database.post_item'])
export const STUDIO_NAMESPACE = 'rhino_studio'

/**
 * Restarts and host power (Settings > Host). They never move the machine, but
 * they stop whatever is running, so Studio refuses them during a job and
 * confirms each one (src/system/power.ts). Only power() sends these.
 */
export const POWER_METHODS: ReadonlySet<string> = new Set([
  'printer.firmware_restart',
  'printer.restart',
  'server.restart',
  'machine.services.restart',
  'machine.reboot',
  'machine.shutdown',
])
/** Services Studio offers to restart (Moonraker refuses any not in its own allowed list too). */
export const POWER_SERVICES: ReadonlySet<string> = new Set(['klipper', 'moonraker', 'crowsnest'])

/**
 * File manager changes (Files > Gcode files / Config): folders, delete, move/rename,
 * copy. Only files() sends these, and only inside FILE_ROOTS: never the logs root,
 * never the rest of the disk. Moonraker itself refuses to touch the file a job is
 * printing; Studio refuses first (src/files/fileOps.ts) and says why.
 */
export const FILE_METHODS: ReadonlySet<string> = new Set([
  'server.files.post_directory',
  'server.files.delete_directory',
  'server.files.delete_file',
  'server.files.move',
  'server.files.copy',
])
/** Moonraker roots Studio may change. 'logs' is read-only and not here. */
export const FILE_ROOTS: ReadonlySet<string> = new Set(['gcodes', 'config'])
/** Roots Studio lists and reads. */
export const READ_ROOTS: ReadonlySet<string> = new Set(['gcodes', 'config', 'logs'])

/** A Moonraker path like "gcodes/parts/a.gcode": known root, no "..", no leading slash, no empty parts. */
export function checkRootPath(path: string, roots: ReadonlySet<string>): string | null {
  if (typeof path !== 'string' || !path) return 'No path given'
  if (path.startsWith('/') || path.includes('\\')) return `"${path}" isn't inside a Moonraker folder`
  const parts = path.split('/')
  if (!roots.has(parts[0]!)) return `"${parts[0]}" isn't a folder Studio can change`
  if (parts.some((p, i) => (i > 0 && p === '') || p === '..' || p === '.')) return `"${path}" isn't a plain path`
  return null
}

/** Methods that change the machine. Each has its own public function below. */
export const ACTION_METHODS: ReadonlySet<string> = new Set([
  'printer.gcode.script',
  'printer.print.start',
  'printer.print.pause',
  'printer.print.resume',
  'printer.print.cancel',
])
const EMERGENCY_STOP = 'printer.emergency_stop'

/**
 * What to watch. Only objects Klipper actually has are subscribed
 * (CUSTOM_TOOLS, for example, may not exist on older configs).
 */
export const WATCHED_OBJECTS: Record<string, string[] | null> = {
  webhooks: ['state', 'state_message'],
  print_stats: ['state', 'filename', 'message', 'print_duration'],
  virtual_sdcard: ['progress', 'is_active'],
  toolhead: ['position', 'homed_axes', 'axis_minimum', 'axis_maximum', 'max_velocity', 'max_accel'],
  gcode_move: ['gcode_position', 'homing_origin', 'speed_factor', 'extrude_factor', 'absolute_coordinates'],
  pause_resume: ['is_paused'],
  idle_timeout: ['state'],
  extruder: ['temperature', 'target', 'can_extrude', 'pressure_advance', 'smooth_time'],
  heater_bed: ['temperature', 'target'],
  // Tool state: whatever the tool-change adapters read (src/tools/adapters), added at subscribe time
  // Tool outputs, read only (names from the Rhino config; only those Klipper has are watched)
  fan: ['speed'],
  'output_pin LASER_INITIALIZE': ['value'], // laser power rail
  'output_pin SERVO_LASER': ['value'], // laser power (LightSaber) / filament path servo (SwitchFly)
  'output_pin Spindle_power': ['value'], // spindle relay
  'output_pin SPINDLE_SPEED': ['value'], // spindle ESC throttle: 0.3 = stopped, 1.0 = full
  'gcode_macro TOOL_POWER_STATE': ['active', 'level', 'suspended'], // added powered tools
  // Rhino config 1.4+: the prime line, so Prepare can keep parts off it
  'gcode_macro RHINO_POSITIONS': ['prime_x', 'prime_y', 'prime_length'],
}

/** One finished (or running) job in Moonraker's history. */
export interface HistoryJob {
  job_id: string
  filename: string
  /** completed, cancelled, error, klippy_shutdown, klippy_disconnect, server_exit, interrupted, in_progress */
  status: string
  start_time: number
  end_time: number | null
  print_duration: number
  filament_used: number
  total_duration?: number
  /** false when the file has been deleted or moved since */
  exists?: boolean
}

export interface HistoryTotals {
  total_jobs: number
  total_time: number
  total_print_time: number
  total_filament_used: number
  longest_job: number
  longest_print: number
}

export interface FileEntry {
  path: string
  modified: number
  size: number
}

/** One folder's contents (server.files.get_directory). */
export interface DirListing {
  dirs: { dirname: string; modified: number; size: number }[]
  files: { filename: string; modified: number; size: number; permissions?: string }[]
  disk_usage?: { total: number; used: number; free: number }
}

export interface ClientHandlers {
  onState?: (state: ConnectionState, detail?: string) => void
  onKlippy?: (state: KlippyState, message?: string) => void
  /** replace=true: a full snapshot (after subscribing); false: a partial update to merge. */
  onStatus?: (status: Status, replace: boolean) => void
  /** A line of Klipper output (console, prompts). */
  onGcodeResponse?: (line: string) => void
  /** Recent console history, oldest first, sent once Klipper is ready. */
  onGcodeStore?: (entries: GcodeStoreEntry[]) => void
  /** Every object Klipper has (macros are "gcode_macro NAME"). */
  onObjects?: (objects: string[]) => void
  /** Klipper's command list with descriptions (macros included). */
  onHelp?: (help: Record<string, string>) => void
  /** Moonraker's last 20 minutes of heater readings (raw), sent once Klipper is ready. */
  onTemperatureStore?: (store: unknown) => void
  /** Moonraker's camera list (raw entries); sent on connect and whenever it changes. */
  onWebcams?: (webcams: unknown[]) => void
  /** A line of update progress (notify_update_response) */
  onUpdateResponse?: (r: { application?: string; message?: string; complete?: boolean }) => void
  /** Update manager status changed (notify_update_refreshed) */
  onUpdateRefreshed?: (status: unknown) => void
  /** Once a second: load and network counters (notify_proc_stat_update) */
  onProcStats?: (stats: unknown) => void
}

export interface GcodeStoreEntry {
  message: string
  time: number
  type: 'command' | 'response'
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type WsCtor = new (url: string) => WebSocket

export class MoonrakerClient {
  /** '' = same site as the app (dev proxy, or served from the Pi). Otherwise e.g. http://192.168.1.50 */
  readonly baseUrl: string
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private wanted = false
  private retry = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private handlers: ClientHandlers
  private WS: WsCtor
  private version: string
  private delays = [1000, 2000, 4000, 8000, 10000]

  constructor(baseUrl: string, handlers: ClientHandlers, opts: { WebSocketImpl?: WsCtor; version?: string } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.handlers = handlers
    this.WS = opts.WebSocketImpl ?? WebSocket
    this.version = opts.version ?? '0.0.0'
  }

  get wsUrl(): string {
    if (this.baseUrl) return this.baseUrl.replace(/^http/, 'ws') + '/websocket'
    const loc = window.location
    return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/websocket`
  }

  /** URL to download a G-code file (used to read its header). */
  fileUrl(path: string): string {
    return `${this.baseUrl}/server/files/gcodes/${path.split('/').map(encodeURIComponent).join('/')}`
  }

  /**
   * A camera's stream or snapshot address. Moonraker stores them as written
   * in the camera settings, usually a path like /webcam/?action=stream that
   * the Pi's nginx serves; paths are taken relative to the machine's address.
   */
  resolveUrl(url: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
    const base = this.baseUrl || window.location.origin
    try {
      return new URL(url.startsWith('/') ? url : `/${url}`, base).toString()
    } catch {
      return url
    }
  }

  connect(): void {
    this.wanted = true
    this.retry = 0
    this.open()
  }

  disconnect(): void {
    this.wanted = false
    this.clearTimers()
    this.ws?.close()
    this.ws = null
    this.failPending('Disconnected')
    this.handlers.onState?.('offline')
  }

  /**
   * Moonraker's job history, newest first (read only). Returns [] when the
   * history component isn't loaded, so Files simply shows no results.
   */
  /** Moonraker's running totals over every job it has kept. */
  async historyTotals(): Promise<HistoryTotals | null> {
    try {
      const r = (await this.call('server.history.totals')) as { job_totals?: HistoryTotals }
      return r?.job_totals ?? null
    } catch {
      return null
    }
  }

  async listHistory(limit = 200): Promise<HistoryJob[]> {
    try {
      const r = (await this.call('server.history.list', { limit, order: 'desc' })) as { jobs?: HistoryJob[] }
      return Array.isArray(r?.jobs) ? r.jobs : []
    } catch {
      return []
    }
  }

  /** Log files Moonraker serves (the read-only "logs" root). */
  async listLogs(): Promise<FileEntry[]> {
    const r = (await this.call('server.files.list', { root: 'logs' })) as FileEntry[]
    return Array.isArray(r) ? r : []
  }

  /** URL of a log file under the "logs" root. */
  logUrl(path: string): string {
    return `${this.baseUrl}/server/files/logs/${path.split('/').map(encodeURIComponent).join('/')}`
  }

  /** Restart / reboot / shut down. Callers check for a running job first (src/system/power.ts). */
  power(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!POWER_METHODS.has(method)) return Promise.reject(new Error(`Blocked: "${method}" is not an allowed power action`))
    if (method === 'machine.services.restart' && !POWER_SERVICES.has(String(params?.service))) {
      return Promise.reject(new Error(`Blocked: Studio doesn't restart "${String(params?.service)}"`))
    }
    return this.send(method, params, 30_000)
  }

  /** One folder of a root, e.g. "gcodes" or "config/myrhino". */
  async getDirectory(path: string): Promise<DirListing> {
    const bad = checkRootPath(path, READ_ROOTS)
    if (bad) throw new Error(`Blocked: ${bad}`)
    const r = (await this.call('server.files.get_directory', { path, extended: false })) as DirListing
    return { dirs: Array.isArray(r?.dirs) ? r.dirs : [], files: Array.isArray(r?.files) ? r.files : [], disk_usage: r?.disk_usage }
  }

  /** URL of any file under a readable root, e.g. ("config", "printer.cfg"). */
  rootUrl(root: string, path: string): string {
    if (!READ_ROOTS.has(root)) throw new Error(`Blocked: "${root}" isn't a folder Studio reads`)
    return `${this.baseUrl}/server/files/${root}/${path.split('/').map(encodeURIComponent).join('/')}`
  }

  /**
   * File manager changes. Every path parameter (path, source, dest) must be a
   * plain path inside FILE_ROOTS; anything else is refused before it's sent.
   */
  files(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!FILE_METHODS.has(method)) return Promise.reject(new Error(`Blocked: "${method}" is not an allowed file change`))
    for (const k of ['path', 'source', 'dest']) {
      if (!(k in params)) continue
      const bad = checkRootPath(String(params[k]), FILE_ROOTS)
      if (bad) return Promise.reject(new Error(`Blocked: ${bad}`))
    }
    if (!('path' in params) && !('source' in params)) return Promise.reject(new Error('Blocked: no path given'))
    if (method === 'server.files.move' || method === 'server.files.copy') {
      if (!('source' in params) || !('dest' in params)) return Promise.reject(new Error('Blocked: move and copy need a source and a destination'))
      if (String(params.source).split('/')[0] !== String(params.dest).split('/')[0]) return Promise.reject(new Error("Blocked: files don't move between G-code and config folders"))
    }
    return this.send(method, params, 30_000)
  }

  /**
   * Upload into a folder of a writable root (path '' = the root itself).
   * Never starts a job. `name` lets a text edit be saved under its own name.
   */
  uploadTo(root: string, folder: string, file: Blob, name: string, onProgress?: (fraction: number) => void): Promise<string> {
    if (!FILE_ROOTS.has(root)) return Promise.reject(new Error(`Blocked: uploads go to G-code or config folders only`))
    const bad = checkRootPath(folder ? `${root}/${folder}/${name}` : `${root}/${name}`, FILE_ROOTS)
    if (bad || name.includes('/')) return Promise.reject(new Error(`Blocked: ${bad ?? `"${name}" isn't a plain file name`}`))
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('root', root)
      if (folder) form.append('path', folder)
      form.append('print', 'false')
      form.append('file', file, name)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${this.baseUrl}/server/files/upload`)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const r = JSON.parse(xhr.responseText) as { item?: { path?: string }; result?: { item?: { path?: string } } }
            resolve(r.item?.path ?? r.result?.item?.path ?? name)
          } catch {
            resolve(name)
          }
        } else {
          let msg = `HTTP ${xhr.status}`
          try {
            msg = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message ?? msg
          } catch { /* not JSON */ }
          reject(new Error(`Upload failed: ${msg}`))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed: network error'))
      xhr.send(form)
    })
  }

  async listFiles(): Promise<FileEntry[]> {
    const r = (await this.call('server.files.list', { root: 'gcodes' })) as FileEntry[]
    return Array.isArray(r) ? r : []
  }

  /**
   * Emergency stop (Klipper M112). Over the websocket if it's open, otherwise
   * over HTTP, so it still works while the socket is reconnecting.
   */
  async emergencyStop(): Promise<void> {
    if (this.ws?.readyState === 1) {
      await this.send(EMERGENCY_STOP, undefined, 4000)
      return
    }
    const res = await fetch(`${this.baseUrl}/printer/emergency_stop`, { method: 'POST' })
    if (!res.ok) throw new Error(`Emergency stop failed: HTTP ${res.status}`)
  }

  async listWebcams(): Promise<unknown[]> {
    const r = (await this.call('server.webcams.list')) as { webcams?: unknown[] }
    return Array.isArray(r?.webcams) ? r.webcams : []
  }

  // ---- camera settings (Moonraker database, not the machine) ------------

  /** Add a camera (no uid) or change one (with its uid). */
  saveWebcam(item: Record<string, unknown>): Promise<unknown> {
    return this.configure('server.webcams.post_item', item)
  }

  deleteWebcam(uid: string): Promise<unknown> {
    return this.configure('server.webcams.delete_item', { uid })
  }

  /** Read one of Studio's settings; null when it was never saved. */
  async getStudioSetting(key: string): Promise<unknown> {
    try {
      const r = (await this.studioSetting('server.database.get_item', { namespace: STUDIO_NAMESPACE, key })) as { value?: unknown }
      return r?.value ?? null
    } catch (e) {
      // Moonraker answers "not found" for a key (or namespace) that was never written
      if (/not found|does not exist|404/i.test((e as Error).message)) return null
      throw e
    }
  }

  /** Save one of Studio's settings. */
  setStudioSetting(key: string, value: unknown): Promise<unknown> {
    return this.studioSetting('server.database.post_item', { namespace: STUDIO_NAMESPACE, key, value })
  }

  // ---- Settings: software and network ------------------------------------

  updateStatus(): Promise<unknown> {
    return this.call('machine.update.status')
  }
  systemInfo(): Promise<unknown> {
    return this.call('machine.system_info')
  }
  procStats(): Promise<unknown> {
    return this.call('machine.proc_stats')
  }
  /** Round trip to Moonraker in ms (a server.info request). */
  async ping(): Promise<number> {
    const t = performance.now()
    await this.call('server.info')
    return performance.now() - t
  }
  /** Run an update-manager method. Updates can take many minutes. */
  update(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!UPDATE_METHODS.has(method)) return Promise.reject(new Error(`Blocked: "${method}" is not an allowed update call`))
    return this.send(method, params, method === 'machine.update.refresh' ? 120_000 : 1_800_000)
  }
  /** Reconnect waits (ms), first to last; the last repeats. */
  setReconnectDelays(delays: number[]) {
    if (delays.length && delays.every((d) => Number.isFinite(d) && d >= 250)) this.delays = [...delays]
  }

  // ---- actions ---------------------------------------------------------

  /**
   * Run checked G-code. Moonraker answers when Klipper has finished, which
   * can take minutes (homing, M190), so the timeout is long.
   */
  runScript(script: CheckedScript): Promise<unknown> {
    return this.act('printer.gcode.script', { script }, 3_600_000)
  }

  startPrint(filename: string): Promise<unknown> {
    return this.act('printer.print.start', { filename })
  }

  pausePrint(): Promise<unknown> {
    return this.act('printer.print.pause')
  }

  resumePrint(): Promise<unknown> {
    return this.act('printer.print.resume')
  }

  cancelPrint(): Promise<unknown> {
    return this.act('printer.print.cancel', undefined, 60_000)
  }

  /** Upload a G-code file to the gcodes folder. Never starts it. */
  uploadFile(file: File, onProgress?: (fraction: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('root', 'gcodes')
      form.append('print', 'false')
      form.append('file', file, file.name)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${this.baseUrl}/server/files/upload`)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const r = JSON.parse(xhr.responseText) as { item?: { path?: string }; result?: { item?: { path?: string } } }
            resolve(r.item?.path ?? r.result?.item?.path ?? file.name)
          } catch {
            resolve(file.name)
          }
        } else reject(new Error(`Upload failed: HTTP ${xhr.status}`))
      }
      xhr.onerror = () => reject(new Error('Upload failed: network error'))
      xhr.send(form)
    })
  }

  // ---- internals -------------------------------------------------------

  private act(method: string, params?: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
    if (!ACTION_METHODS.has(method)) return Promise.reject(new Error(`Blocked: "${method}" is not an allowed action`))
    return this.send(method, params, timeoutMs)
  }

  private configure(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!CAMERA_METHODS.has(method)) return Promise.reject(new Error(`Blocked: "${method}" is not an allowed camera change`))
    return this.send(method, params)
  }

  private studioSetting(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!SETTINGS_METHODS.has(method)) return Promise.reject(new Error(`Blocked: "${method}" is not an allowed settings call`))
    if (params.namespace !== STUDIO_NAMESPACE) return Promise.reject(new Error(`Blocked: settings stay in the "${STUDIO_NAMESPACE}" namespace`))
    return this.send(method, params)
  }

  /** The only path for normal requests: refuses anything outside the read-only list. */
  private call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!READ_ONLY_METHODS.has(method)) {
      return Promise.reject(new Error(`Blocked: "${method}" is not allowed in read-only mode`))
    }
    return this.send(method, params)
  }

  private send(method: string, params?: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
    const ws = this.ws
    if (!ws || ws.readyState !== 1) return Promise.reject(new Error('Not connected'))
    const id = this.nextId++
    const msg: Record<string, unknown> = { jsonrpc: '2.0', method, id }
    if (params) msg.params = params
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      ws.send(JSON.stringify(msg))
    })
  }

  private open() {
    this.clearTimers()
    this.handlers.onState?.('connecting')
    let ws: WebSocket
    try {
      ws = new this.WS(this.wsUrl)
    } catch (e) {
      this.handlers.onState?.('error', (e as Error).message)
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      void this.handshake()
    }
    ws.onmessage = (ev) => this.onMessage(String(ev.data))
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.failPending('Connection closed')
      this.handlers.onStatus?.({}, true)
      this.handlers.onKlippy?.('unknown')
      this.handlers.onWebcams?.([])
      if (this.wanted) {
        this.handlers.onState?.('error', `Can't reach Moonraker at ${this.wsUrl}`)
        this.scheduleReconnect()
      } else {
        this.handlers.onState?.('offline')
      }
    }
    ws.onerror = () => {
      /* onclose follows and handles it */
    }
  }

  private async handshake() {
    try {
      await this.call('server.connection.identify', {
        client_name: brand.name,
        version: this.version,
        type: 'web',
        url: 'https://github.com/Makersmic/rhino-studio',
      })
    } catch {
      /* older Moonraker without identify: carry on */
    }
    this.handlers.onState?.('online')
    // Cameras come from Moonraker, so they work even while Klipper is down
    this.listWebcams()
      .then((w) => this.handlers.onWebcams?.(w))
      .catch(() => this.handlers.onWebcams?.([]))
    await this.checkKlippy()
  }

  private async checkKlippy() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    try {
      const info = (await this.call('server.info')) as { klippy_state?: string; klippy_connected?: boolean }
      const state = (info.klippy_state ?? 'unknown') as KlippyState
      if (state === 'ready') {
        await this.subscribe()
        this.handlers.onKlippy?.('ready')
        return
      }
      this.handlers.onKlippy?.(state)
    } catch (e) {
      this.handlers.onKlippy?.('unknown', (e as Error).message)
    }
    // Not ready yet (starting, shut down, disconnected): look again shortly
    if (this.ws?.readyState === 1) this.pollTimer = setTimeout(() => void this.checkKlippy(), 2000)
  }

  private async subscribe() {
    const list = (await this.call('printer.objects.list')) as { objects?: string[] }
    const present = new Set(list.objects ?? [])
    this.handlers.onObjects?.(list.objects ?? [])
    const objects: Record<string, string[] | null> = { ...watchedForAll(list.objects ?? []) }
    for (const [name, fields] of Object.entries(WATCHED_OBJECTS)) {
      if (present.has(name)) objects[name] = fields
    }
    const r = (await this.call('printer.objects.subscribe', { objects })) as { status?: Status }
    this.handlers.onStatus?.(r.status ?? {}, true)
    // Console history and command list: nice to have, never fatal
    this.call('server.gcode_store', { count: 200 })
      .then((g) => this.handlers.onGcodeStore?.(((g as { gcode_store?: GcodeStoreEntry[] }).gcode_store ?? [])))
      .catch(() => {})
    this.call('printer.gcode.help')
      .then((h) => this.handlers.onHelp?.((h ?? {}) as Record<string, string>))
      .catch(() => {})
    this.call('server.temperature_store', { include_monitors: false })
      .then((t) => this.handlers.onTemperatureStore?.(t))
      .catch(() => {})
  }

  private onMessage(raw: string) {
    let msg: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: unknown[] }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!
      this.pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new Error(msg.error.message ?? 'Moonraker error'))
      else p.resolve(msg.result)
      return
    }
    switch (msg.method) {
      case 'notify_status_update': {
        const diff = msg.params?.[0]
        if (diff && typeof diff === 'object') this.handlers.onStatus?.(diff as Status, false)
        break
      }
      case 'notify_gcode_response': {
        const line = msg.params?.[0]
        if (typeof line === 'string') this.handlers.onGcodeResponse?.(line)
        break
      }
      case 'notify_webcams_changed': {
        const p = msg.params?.[0] as { webcams?: unknown[] } | undefined
        if (Array.isArray(p?.webcams)) this.handlers.onWebcams?.(p.webcams)
        else this.listWebcams().then((w) => this.handlers.onWebcams?.(w)).catch(() => {})
        break
      }
      case 'notify_update_response': {
        const r = msg.params?.[0]
        if (r && typeof r === 'object') this.handlers.onUpdateResponse?.(r as never)
        break
      }
      case 'notify_update_refreshed':
        this.handlers.onUpdateRefreshed?.(msg.params?.[0])
        break
      case 'notify_proc_stat_update':
        this.handlers.onProcStats?.(msg.params?.[0])
        break
      case 'notify_klippy_ready':
        void this.checkKlippy()
        break
      case 'notify_klippy_shutdown':
        this.handlers.onKlippy?.('shutdown')
        break
      case 'notify_klippy_disconnected':
        this.handlers.onStatus?.({}, true)
        this.handlers.onKlippy?.('disconnected')
        void this.checkKlippy()
        break
    }
  }

  private scheduleReconnect() {
    if (!this.wanted) return
    const delay = this.delays[Math.min(this.retry, this.delays.length - 1)]!
    this.retry++
    this.retryTimer = setTimeout(() => this.open(), delay)
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.retryTimer = this.pollTimer = null
  }

  private failPending(reason: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    this.pending.clear()
  }
}
