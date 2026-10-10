import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoonrakerClient, READ_ONLY_METHODS, type Status } from './client'

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

describe('MoonrakerClient (read-only)', () => {
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
    expect(FakeSocket.last!.sent.some((m) => m.method.startsWith('printer.gcode') || m.method.startsWith('printer.print'))).toBe(false)
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
})
