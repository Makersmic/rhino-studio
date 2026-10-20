import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoonrakerClient, READ_ONLY_METHODS, ACTION_METHODS, CAMERA_METHODS, SETTINGS_METHODS, UPDATE_METHODS, POWER_METHODS, POWER_SERVICES, FILE_METHODS, FILE_ROOTS, checkRootPath, type Status } from './client'
import { approve, check } from '@/control/commands'

/** A stand-in for the browser WebSocket that answers like Moonraker. */
class FakeSocket {
  static last: FakeSocket | null = null
  readyState = 0
  sent: { method: string; params?: Record<string, unknown> }[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeSocket.last = this
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
    })
  }
  send(raw: string) {
    const msg = JSON.parse(raw)
    this.sent.push({ method: msg.method, params: msg.params })
    const result =
      msg.method === 'server.info' ? { klippy_state: 'ready' }
      : msg.method === 'printer.objects.list' ? { objects: ['webhooks', 'extruder', 'gcode_macro SWAP_TOOL', 'gcode_macro VARIABLES'] }
      : msg.method === 'printer.objects.subscribe' ? { status: { extruder: { temperature: 21 } } }
      : msg.method === 'server.files.list' ? [{ path: 'a.gcode', modified: 1, size: 10 }]
      : msg.method === 'server.webcams.list' ? { webcams: [{ name: 'Bed', uid: 'u1' }] }
      : 'ok'
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) }))
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  push(method: string, params?: unknown[]) {
    this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method, params }) })
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function make() {
  const events = { states: [] as string[], klippy: [] as string[], status: [] as [Status, boolean][] }
  const c = new MoonrakerClient(
    'http://rhino.test',
    {
      onState: (s) => events.states.push(s),
      onKlippy: (k) => events.klippy.push(k),
      onStatus: (s, r) => events.status.push([s, r]),
    },
    { WebSocketImpl: FakeSocket as unknown as new (url: string) => WebSocket },
  )
  return { c, events }
}

afterEach(() => vi.useRealTimers())

describe('MoonrakerClient', () => {
  it('connects, subscribes only to objects Klipper has, and reports ready', async () => {
    const { c, events } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    const ws = FakeSocket.last!
    expect(ws.url).toBe('ws://rhino.test/websocket')
    const sub = ws.sent.find((m) => m.method === 'printer.objects.subscribe')!
    expect(Object.keys(sub.params!.objects as object).sort()).toEqual(['extruder', 'gcode_macro SWAP_TOOL', 'gcode_macro VARIABLES', 'webhooks'])
    expect(events.states).toContain('online')
    expect(events.klippy).toContain('ready')
    expect(events.status.at(-1)).toEqual([{ extruder: { temperature: 21 } }, true])
  })

  it('only ever sends read-only methods (plus E-stop when asked)', async () => {
    const { c } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    await c.listFiles()
    const methods = FakeSocket.last!.sent.map((m) => m.method)
    expect(methods.every((m) => READ_ONLY_METHODS.has(m))).toBe(true)
  })

  it('refuses anything outside the allowlist', async () => {
    const { c } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    // Reach the private call() deliberately, as a future bug might
    const call = (c as unknown as { call: (m: string, p?: object) => Promise<unknown> }).call.bind(c)
    await expect(call('printer.gcode.script', { script: 'G28' })).rejects.toThrow(/not allowed/)
    await expect(call('printer.print.start', { filename: 'a.gcode' })).rejects.toThrow(/not allowed/)
    expect(FakeSocket.last!.sent.some((m) => m.method === 'printer.gcode.script' || m.method.startsWith('printer.print'))).toBe(false)
  })

  it('sends checked G-code and job actions, and nothing outside the action list', async () => {
    const { c } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    await c.runScript(approve(check('G28', { jobActive: false }), true))
    await c.pausePrint()
    const sent = FakeSocket.last!.sent
    expect(sent.at(-2)).toEqual({ method: 'printer.gcode.script', params: { script: 'G28' } })
    expect(sent.at(-1)!.method).toBe('printer.print.pause')
    const act = (c as unknown as { act: (m: string) => Promise<unknown> }).act.bind(c)
    await expect(act('machine.reboot')).rejects.toThrow(/not an allowed action/)
    await expect(act('server.files.delete_file')).rejects.toThrow(/not an allowed action/)
    expect([...ACTION_METHODS].every((m) => m.startsWith('printer.'))).toBe(true)
  })

  it('software updates go only through update(), and only update-manager methods', async () => {
    const { c } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    void c.update('machine.update.upgrade', { name: 'klipper' })
    expect(FakeSocket.last!.sent.at(-1)).toEqual({ method: 'machine.update.upgrade', params: { name: 'klipper' } })
    await expect(c.update('machine.reboot')).rejects.toThrow(/not an allowed update/)
    await expect(c.update('printer.gcode.script', { script: 'G28' })).rejects.toThrow(/not an allowed update/)
    expect([...UPDATE_METHODS].every((m) => m.startsWith('machine.update.'))).toBe(true)
    expect([...READ_ONLY_METHODS].some((m) => UPDATE_METHODS.has(m))).toBe(false)
  })

  it('passes Klipper output and prompt lines to the app', async () => {
    const lines: string[] = []
    const c = new MoonrakerClient('http://rhino.test', { onGcodeResponse: (l) => lines.push(l) }, {
      WebSocketImpl: FakeSocket as unknown as new (url: string) => WebSocket,
    })
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    FakeSocket.last!.push('notify_gcode_response', ['// action:prompt_begin Swap toolhead'])
    expect(lines).toEqual(['// action:prompt_begin Swap toolhead'])
  })

  it('sends the emergency stop over the websocket', async () => {
    const { c } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    await c.emergencyStop()
    expect(FakeSocket.last!.sent.at(-1)!.method).toBe('printer.emergency_stop')
  })

  it('clears status when Klipper disconnects and when the socket drops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { c, events } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
    FakeSocket.last!.push('notify_klippy_disconnected')
    expect(events.status.at(-1)).toEqual([{}, true])
    expect(events.klippy).toContain('disconnected')
    FakeSocket.last!.close()
    expect(events.status.at(-1)).toEqual([{}, true])
    expect(events.states.at(-1)).toBe('error')
    c.disconnect()
  })
  it('reads the camera list on connect and follows changes', async () => {
    const lists: unknown[][] = []
    const c = new MoonrakerClient('http://rhino.test', { onWebcams: (w) => lists.push(w) }, {
      WebSocketImpl: FakeSocket as unknown as new (url: string) => WebSocket,
    })
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    expect(lists[0]).toEqual([{ name: 'Bed', uid: 'u1' }])
    FakeSocket.last!.push('notify_webcams_changed', [{ webcams: [] }])
    expect(lists.at(-1)).toEqual([])
  })

  it('edits cameras only through the camera list, never anything else', async () => {
    const { c } = make()
    c.connect()
    for (let i = 0; i < 10; i++) await flush()
    await c.saveWebcam({ name: 'Bed', stream_url: '/webcam/?action=stream' })
    await c.deleteWebcam('u1')
    const sent = FakeSocket.last!.sent
    expect(sent.at(-2)!.method).toBe('server.webcams.post_item')
    expect(sent.at(-1)).toEqual({ method: 'server.webcams.delete_item', params: { uid: 'u1' } })
    const configure = (c as unknown as { configure: (m: string, p: object) => Promise<unknown> }).configure.bind(c)
    await expect(configure('printer.gcode.script', { script: 'G28' })).rejects.toThrow(/not an allowed camera change/)
    await expect(configure('server.database.post_item', {})).rejects.toThrow(/not an allowed camera change/)
    expect([...CAMERA_METHODS].every((m) => m.startsWith('server.webcams.'))).toBe(true)
  })

  it("keeps Studio's settings in its own database namespace", async () => {
    const { c } = make()
    const studio = (c as unknown as { studioSetting: (m: string, p: Record<string, unknown>) => Promise<unknown> }).studioSetting.bind(c)
    await expect(studio('server.database.post_item', { namespace: 'moonraker', key: 'x', value: 1 })).rejects.toThrow(/rhino_studio/)
    await expect(studio('server.database.delete_item', { namespace: 'rhino_studio', key: 'x' })).rejects.toThrow(/not an allowed settings call/)
    await expect(studio('printer.gcode.script', { namespace: 'rhino_studio', script: 'G28' })).rejects.toThrow(/not an allowed settings call/)
    expect([...SETTINGS_METHODS].every((m) => m.startsWith('server.database.'))).toBe(true)
  })

  it('resolves camera paths against the machine address', () => {
    const { c } = make()
    expect(c.resolveUrl('/webcam/?action=stream')).toBe('http://rhino.test/webcam/?action=stream')
    expect(c.resolveUrl('webcam2/?action=snapshot')).toBe('http://rhino.test/webcam2/?action=snapshot')
    expect(c.resolveUrl('http://192.168.1.60:8080/stream')).toBe('http://192.168.1.60:8080/stream')
  })
})

describe('power allowlist', () => {
  it('only power() sends restarts, and nothing else uses them', () => {
    for (const set of [READ_ONLY_METHODS, ACTION_METHODS, CAMERA_METHODS, SETTINGS_METHODS, UPDATE_METHODS]) {
      expect([...POWER_METHODS].some((m) => set.has(m))).toBe(false)
    }
  })
  it('refuses methods and services outside the lists', async () => {
    const c = new MoonrakerClient('http://x', {})
    await expect(c.power('server.files.delete_file')).rejects.toThrow(/not an allowed power action/)
    await expect(c.power('machine.services.restart', { service: 'nginx' })).rejects.toThrow(/doesn't restart/)
    expect(POWER_SERVICES.has('klipper')).toBe(true)
  })
})

describe('file manager allowlist (FILE_METHODS)', () => {
  it('file changes are in no other list, and the read list has no change in it', () => {
    for (const m of FILE_METHODS) {
      for (const other of [READ_ONLY_METHODS, ACTION_METHODS, CAMERA_METHODS, SETTINGS_METHODS, UPDATE_METHODS, POWER_METHODS]) expect(other.has(m), m).toBe(false)
    }
    expect([...READ_ONLY_METHODS].filter((m) => m.startsWith('server.files.'))).toEqual(['server.files.list', 'server.files.get_directory'])
    expect([...FILE_ROOTS].sort()).toEqual(['config', 'gcodes'])
  })
  it('paths stay inside a root: no logs, no "..", no absolute or empty parts', () => {
    for (const p of ['gcodes', 'gcodes/a.gcode', 'config/myrhino/x.cfg']) expect(checkRootPath(p, FILE_ROOTS), p).toBeNull()
    for (const p of ['logs/klippy.log', '/etc/passwd', 'gcodes/../config/printer.cfg', 'gcodes//a', 'config/./x', 'home/pi/x', '', 'gcodes\\a']) {
      expect(checkRootPath(p, FILE_ROOTS), p).not.toBeNull()
    }
  })
  it('files() sends only file methods with checked paths, and never moves between roots', async () => {
    const { c } = make()
    c.connect()
    await flush()
    await flush()
    const ws = FakeSocket.last!
    await c.files('server.files.delete_file', { path: 'gcodes/old.gcode' })
    await c.files('server.files.move', { source: 'config/a.cfg', dest: 'config/sub/a.cfg' })
    await expect(c.files('printer.gcode.script', { path: 'gcodes/a' })).rejects.toThrow(/not an allowed file change/)
    await expect(c.files('server.files.delete_file', { path: 'logs/klippy.log' })).rejects.toThrow(/Blocked/)
    await expect(c.files('server.files.delete_directory', { path: 'gcodes/../config' })).rejects.toThrow(/Blocked/)
    await expect(c.files('server.files.move', { source: 'gcodes/a.gcode', dest: 'config/a.gcode' })).rejects.toThrow(/between G-code and config/)
    await expect(c.files('server.files.copy', { source: 'gcodes/a.gcode' })).rejects.toThrow(/source and a destination/)
    await expect(c.files('server.files.delete_file', {})).rejects.toThrow(/no path/)
    expect(ws.sent.filter((m) => m.method.startsWith('server.files.') && m.method !== 'server.files.list').map((m) => m.method)).toEqual([
      'server.files.delete_file',
      'server.files.move',
    ])
  })
  it('reads folders only inside the readable roots; uploads only into writable ones', async () => {
    const { c } = make()
    c.connect()
    await flush()
    await flush()
    await expect(c.getDirectory('etc')).rejects.toThrow(/Blocked/)
    await expect(c.uploadTo('logs', '', new Blob(['x']), 'x.log')).rejects.toThrow(/G-code or config folders only/)
    await expect(c.uploadTo('config', '../..', new Blob(['x']), 'x.cfg')).rejects.toThrow(/Blocked/)
    await expect(c.uploadTo('config', '', new Blob(['x']), 'a/b.cfg')).rejects.toThrow(/Blocked/)
    expect(() => c.rootUrl('etc', 'passwd')).toThrow(/Blocked/)
    expect(c.rootUrl('config', 'my rhino/a.cfg')).toBe('http://rhino.test/server/files/config/my%20rhino/a.cfg')
  })
})
