import { describe, expect, it, vi } from 'vitest'
import { listen, micError, micSettingOf, volumeOf } from './mic'

class FakeStream {
  tracks: unknown[] = []
  addTrack(t: unknown) { this.tracks.push(t) }
}
;(globalThis as { MediaStream?: unknown }).MediaStream ??= FakeStream

function fakePc() {
  const pc = {
    iceGatheringState: 'complete' as RTCIceGatheringState,
    localDescription: null as { sdp: string } | null,
    remote: null as unknown,
    closed: false,
    dir: '',
    addTransceiver: vi.fn((kind: string, o: { direction: string }) => ((pc.dir = `${kind}/${o.direction}`), { receiver: { track: { kind } } })),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'v=0 offer' })),
    setLocalDescription: vi.fn(async (d: { sdp: string }) => void (pc.localDescription = d)),
    setRemoteDescription: vi.fn(async (d: unknown) => void (pc.remote = d)),
    close: vi.fn(() => void (pc.closed = true)),
    addEventListener: vi.fn(),
  }
  return pc
}
const reply = (status: number, body: string) => vi.fn(async () => new Response(body, { status }))

describe('microphone', () => {
  it('asks for receive-only audio with one SDP offer and plays the answer', async () => {
    const pc = fakePc()
    const fetchFn = reply(201, 'v=0 answer')
    const l = await listen('/mic/webrtc', { makePc: () => pc as never, fetchFn: fetchFn as never })
    expect(pc.dir).toBe('audio/recvonly')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/mic/webrtc')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/sdp')
    expect(init.body).toBe('v=0 offer')
    expect(pc.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' })
    l.close()
    expect(pc.closed).toBe(true)
  })
  it('says the service is missing when nginx has nothing behind /mic', async () => {
    const pc = fakePc()
    await expect(listen('/mic/webrtc', { makePc: () => pc as never, fetchFn: reply(502, 'Bad Gateway') as never })).rejects.toThrow(/isn't running on the Rhino/)
    expect(pc.closed).toBe(true)
  })
  it('refuses an answer that is not SDP', async () => {
    const pc = fakePc()
    await expect(listen('/mic/webrtc', { makePc: () => pc as never, fetchFn: reply(200, '<html>') as never })).rejects.toThrow(/not a WebRTC answer/)
  })
  it('turns a network failure into words', async () => {
    const pc = fakePc()
    const fetchFn = vi.fn(async () => { throw new Error('Failed to fetch') })
    await expect(listen('/mic/webrtc', { makePc: () => pc as never, fetchFn: fetchFn as never })).rejects.toThrow("The Rhino didn't answer (Failed to fetch).")
  })
  it('reads settings safely', () => {
    expect(micSettingOf({ on: true })).toEqual({ on: true })
    expect(micSettingOf({ on: 'yes' })).toEqual({ on: false })
    expect(micSettingOf(null)).toEqual({ on: false })
    expect(volumeOf(140)).toBe(100)
    expect(volumeOf('x')).toBe(60)
    expect(micError(403)).toMatch(/home network/)
  })
})
