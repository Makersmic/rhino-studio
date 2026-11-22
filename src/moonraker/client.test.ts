import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoonrakerClient, READ_ONLY_METHODS, ACTION_METHODS, CAMERA_METHODS, SETTINGS_METHODS, UPDATE_METHODS, POWER_METHODS, POWER_SERVICES, FILE_METHODS, FILE_ROOTS, checkRootPath, type Status } from './client'
import { approve, check } from '@/control/commands'

/** A stand-in for the browser WebSocket that answers like Moonraker. */
class FakeSocket {
  static last: FakeSocket | null = null
  static count = 0
  /** open, then drop at once: a server that accepts connections and hangs up */
  static dropOnOpen = false
  /** a connection that looks open but never answers */
  mute = false
  readyState = 0
  sent: { method: string; params?: Record<string, unknown> }[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeSocket.last = this
    FakeSocket.count++
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
      if (FakeSocket.dropOnOpen) this.close()
    })
  }
  send(raw: string) {
    const msg = JSON.parse(raw)
    this.sent.push({ method: msg.method, params: msg.params })
    if (this.mute) return
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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeSocket.count = 0
  FakeSocket.dropOnOpen = false
})

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
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })))
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

describe('MoonrakerClient and trusted_clients (0.6.3, as Mainsail)', () => {
  function withTrust(t: () => Promise<'off' | 'trusted' | 'untrusted' | 'unreachable'>) {
    const states: [string, string | undefined][] = []
    const c = new MoonrakerClient('http://rhino.test', { onState: (s, d) => states.push([s, d]) }, { WebSocketImpl: FakeSocket as unknown as new (url: string) => WebSocket, trust: t })
    return { c, states }
  }
  it('trusted: connects as before', async () => {
    FakeSocket.last = null
    const { c, states } = withTrust(async () => 'trusted')
    c.connect()
    await flush(); await flush(); await flush()
    expect(FakeSocket.last).not.toBeNull()
    expect(states.map((s) => s[0])).toContain('online')
    c.disconnect()
  })
  it('untrusted: no socket, no retry loop, says Unauthorized', async () => {
    vi.useFakeTimers()
    FakeSocket.last = null
    const trust = vi.fn(async () => 'untrusted' as const)
    const { c, states } = withTrust(trust)
    c.connect()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeSocket.last).toBeNull()
    expect(trust).toHaveBeenCalledTimes(1)
    expect(c.untrusted).toBe(true)
    expect(states.at(-1)).toEqual(['error', 'Unauthorized'])
  })
  it('"Unauthorized" from identify (Mainsail\'s case) stops retrying too', async () => {
    vi.useFakeTimers()
    FakeSocket.last = null
    const orig = FakeSocket.prototype.send
    FakeSocket.prototype.send = function (this: FakeSocket, raw: string) {
      const msg = JSON.parse(raw)
      if (msg.method === 'server.connection.identify') {
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: 401, message: 'Unauthorized' } }) }))
        return
      }
      orig.call(this, raw)
    }
    const { c, states } = withTrust(async () => 'unreachable')
    c.connect()
    await vi.advanceTimersByTimeAsync(30_000)
    FakeSocket.prototype.send = orig
    expect(c.untrusted).toBe(true)
    expect(states.at(-1)).toEqual(['error', 'Unauthorized'])
    const sockets = FakeSocket.last
    await vi.advanceTimersByTimeAsync(30_000)
    expect(FakeSocket.last).toBe(sockets)
  })
  it('a late trust answer after disconnect() never opens a socket', async () => {
    FakeSocket.last = null
    let release: (t: 'trusted') => void = () => undefined
    const { c } = withTrust(() => new Promise((r) => (release = r)))
    c.connect()
    c.disconnect()
    release('trusted')
    await flush()
    expect(FakeSocket.last).toBeNull()
  })
})

describe('uploadFile', () => {
  afterEach(() => vi.unstubAllGlobals())
  /** a stand-in XMLHttpRequest that keeps the form it was sent and answers with `status` / `body` */
  function fakeXhr(status: number, body: string) {
    const sent: FormData[] = []
    class X {
      status = status
      responseText = body
      upload = {}
      onload: (() => void) | null = null
      open() {}
      send(f: FormData) { sent.push(f); this.onload?.() }
    }
    vi.stubGlobal('XMLHttpRequest', X)
    return sent
  }
  it('sends a folder as the path field, not inside the file name (Moonraker only makes folders from path)', async () => {
    const sent = fakeXhr(201, JSON.stringify({ item: { path: 'tuning/squish-BlockOne-PLA_0_4.gcode' } }))
    const c = new MoonrakerClient('http://rhino.test', {})
    const got = await c.uploadFile(new File(['G28\n'], 'tuning/squish-BlockOne-PLA_0_4.gcode'))
    expect(got).toBe('tuning/squish-BlockOne-PLA_0_4.gcode')
    expect(sent[0]!.get('path')).toBe('tuning')
    expect((sent[0]!.get('file') as File).name).toBe('squish-BlockOne-PLA_0_4.gcode')
    expect(sent[0]!.get('print')).toBe('false')
  })
  it('a plain name has no path field', async () => {
    const sent = fakeXhr(201, '{}')
    await new MoonrakerClient('http://rhino.test', {}).uploadFile(new File(['G28\n'], 'part.gcode'))
    expect(sent[0]!.get('path')).toBeNull()
  })
  it('a refused upload says why, from Moonraker’s message', async () => {
    fakeXhr(500, JSON.stringify({ error: { message: 'Unable to save file' } }))
    await expect(new MoonrakerClient('http://rhino.test', {}).uploadFile(new File(['x'], 'a.gcode'))).rejects.toThrow('Upload failed: HTTP 500 (Unable to save file)')
  })
})

/** Fake timers, a connected client, and a way to move time */
async function connected() {
  vi.useFakeTimers()
  const { c, events } = make()
  c.connect()
  await vi.advanceTimersByTimeAsync(50)
  return { c, events, ws: FakeSocket.last! }
}
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('emergency stop on a bad connection', () => {
  it('goes out over HTTP at once when the websocket looks open but is silent', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { c, ws } = await connected()
    ws.mute = true
    await expect(c.emergencyStop()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('http://rhino.test/printer/emergency_stop', expect.objectContaining({ method: 'POST' }))
  })

  it('counts the websocket when HTTP hangs or is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const a = await connected()
    await expect(a.c.emergencyStop()).resolves.toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    await expect(a.c.emergencyStop()).resolves.toBeUndefined()
  })

  it('says plainly when neither route was accepted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const { c, ws } = await connected()
    ws.mute = true
    const done = expect(c.emergencyStop()).rejects.toThrow(/NOT confirmed.*boom.*emergency_stop timed out/s)
    await advance(4100)
    await done
  })

  it('gives up on a hung HTTP route after 4 seconds', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))))
    const { c, ws } = await connected()
    ws.mute = true
    const done = expect(c.emergencyStop()).rejects.toThrow(/no answer over HTTP in 4 s/)
    await advance(4100)
    await done
  })
})

describe('a connection that goes quiet', () => {
  it('is dropped and reconnected when Moonraker stops answering', async () => {
    const { events, ws } = await connected()
    ws.mute = true
    await advance(10_000 + 5_000 + 500)
    expect(events.states.at(-1)).toBe('error')
    await advance(1_500)
    expect(FakeSocket.last).not.toBe(ws)
    expect(FakeSocket.count).toBe(2)
  })

  it('is left alone while Moonraker keeps talking', async () => {
    const { events, ws } = await connected()
    ws.mute = true // never answers a request, but the status updates keep coming
    for (let i = 0; i < 15; i++) {
      await advance(4_000)
      ws.push('notify_proc_stat_update', [{}])
    }
    expect(events.states).not.toContain('error')
    expect(FakeSocket.count).toBe(1)
    expect(ws.sent.filter((m) => m.method === 'server.info')).toHaveLength(1)
  })

  it('is left alone when it is idle but answers a check', async () => {
    const { events, ws } = await connected()
    await advance(60_000)
    expect(events.states).not.toContain('error')
    expect(FakeSocket.count).toBe(1)
    expect(ws.sent.filter((m) => m.method === 'server.info').length).toBeGreaterThan(1)
  })

  it('is checked at once when the page comes back or the network returns', async () => {
    // Vitest runs without a browser, so give the client a page and a window that can be told things
    const win = new EventTarget()
    const doc = Object.assign(new EventTarget(), { hidden: false })
    vi.stubGlobal('window', win)
    vi.stubGlobal('document', doc)
    for (const [target, event] of [[doc, 'visibilitychange'], [win, 'online']] as const) {
      const { events, ws } = await connected()
      ws.mute = true
      vi.setSystemTime(Date.now() + 120_000) // the phone slept
      target.dispatchEvent(new Event(event))
      await advance(5_100) // the next timer tick would not have dropped it yet
      expect(events.states.at(-1), event).toBe('error')
    }
  })
})

describe('reconnect back-off', () => {
  it('stays slowed down for a server that accepts and hangs up', async () => {
    vi.useFakeTimers()
    FakeSocket.dropOnOpen = true
    const { c } = make()
    c.setReconnectDelays([1000, 2000, 4000])
    c.connect()
    await advance(10)
    expect(FakeSocket.count).toBe(1)
    await advance(1090) // t = 1.1 s: after the 1 s wait
    expect(FakeSocket.count).toBe(2)
    await advance(1800) // t = 2.9 s: the next wait is 2 s, so not yet
    expect(FakeSocket.count).toBe(2)
    await advance(200)
    expect(FakeSocket.count).toBe(3)
    await advance(3800) // t = 6.9 s: the next wait is 4 s
    expect(FakeSocket.count).toBe(3)
    await advance(200)
    expect(FakeSocket.count).toBe(4)
  })

  it('starts again from the shortest wait once Moonraker answers', async () => {
    vi.useFakeTimers()
    FakeSocket.dropOnOpen = true
    const { c } = make()
    c.setReconnectDelays([1000, 2000, 4000])
    c.connect()
    await advance(1100)
    FakeSocket.dropOnOpen = false
    await advance(2000) // t = 3.1 s: the third socket opens normally and is answered
    expect(FakeSocket.count).toBe(3)
    FakeSocket.last!.close()
    await advance(1100) // 1 s, not the 4 s a stale counter would give
    expect(FakeSocket.count).toBe(4)
  })
})

describe('a request that gets no answer', () => {
  it('an action says it may still have run; a read does not', async () => {
    const { c, ws } = await connected()
    ws.mute = true
    const act = expect(c.startPrint('a.gcode')).rejects.toThrow(/timed out: it may still have run. Check the machine/)
    const read = expect(c.listFiles()).rejects.toThrow(/^server\.files\.list timed out$/)
    await advance(10_100)
    await act
    await read
  })

  it('an action cut off by a closed connection says so too', async () => {
    const { c, ws } = await connected()
    ws.mute = true
    const act = expect(c.startPrint('a.gcode')).rejects.toThrow(/Connection closed: that command may still have run/)
    ws.close()
    await act
  })
})

describe('looking at Klipper', () => {
  it('runs one check at a time and folds requests that arrive meanwhile into one more', async () => {
    const { ws } = await connected()
    const subscribes = () => ws.sent.filter((m) => m.method === 'printer.objects.subscribe').length
    expect(subscribes()).toBe(1)
    ws.push('notify_klippy_ready')
    ws.push('notify_klippy_ready')
    ws.push('notify_klippy_ready')
    await advance(50)
    expect(subscribes()).toBe(3) // the first, plus one more for the two that arrived during it
  })
})
