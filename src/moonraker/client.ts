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
  'server.gcode_store',
  'printer.gcode.help',
  'server.webcams.list',
  'server.temperature_store',
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
  toolhead: ['position', 'homed_axes', 'axis_minimum', 'axis_maximum'],
  gcode_move: ['gcode_position', 'homing_origin', 'speed_factor', 'absolute_coordinates'],
  pause_resume: ['is_paused'],
  idle_timeout: ['state'],
  extruder: ['temperature', 'target'],
  heater_bed: ['temperature', 'target'],
  // Tool state: whatever the tool-change adapters read (src/tools/adapters), added at subscribe time
  // Tool outputs, read only (names from the Rhino config; only those Klipper has are watched)
  fan: ['speed'],
  'output_pin LASER_INITIALIZE': ['value'], // laser power rail
  'output_pin SERVO_LASER': ['value'], // laser power (LightSaber) / filament path servo (SwitchFly)
  'output_pin Spindle_power': ['value'], // spindle relay
  'output_pin SPINDLE_SPEED': ['value'], // spindle ESC throttle: 0.3 = stopped, 1.0 = full
  'gcode_macro TOOL_POWER_STATE': ['active', 'level', 'suspended'], // added powered tools
}

export interface FileEntry {
  path: string
  modified: number
  size: number
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
    const delay = [1000, 2000, 4000, 8000][this.retry] ?? 10000
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
