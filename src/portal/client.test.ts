import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalClient } from './client'

type Call = { url: string; init?: RequestInit }

function fakePortal() {
  let token = 'tok-1'
  const calls: Call[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/portal/')) {
      return new Response(`<meta name="rhino-token" content="${token}"><p class="version">v1.4.1</p>`, { status: 200 })
    }
    if (init?.method === 'POST') {
      const sent = (init.headers as Record<string, string>)['X-Rhino-Token']
      if (sent !== token) return new Response(JSON.stringify({ ok: false, error: 'This page is out of date (the portal was restarted).' }), { status: 400 })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    return new Response(JSON.stringify({ ok: true, tasks: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, restartPortal: () => (token = 'tok-2') }
}

afterEach(() => vi.unstubAllGlobals())

describe('PortalClient', () => {
  it('reads the token and version, then logs work with it', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await c.logWork('t1', { action: 'done', notes: 'ok' })
    expect(c.version).toBe('1.4.1')
    const post = p.calls.find((x) => x.init?.method === 'POST')!
    expect(post.url).toBe('/portal/api/maint/tasks/t1/done')
    expect((post.init!.headers as Record<string, string>)['X-Rhino-Token']).toBe('tok-1')
  })

  it('fetches a new token once if the Portal restarted', async () => {
    const p = fakePortal()
    const c = new PortalClient('/portal')
    await c.snooze('t1', 7)
    p.restartPortal()
    await c.snooze('t1', 7)
    const posts = p.calls.filter((x) => x.init?.method === 'POST')
    expect(posts).toHaveLength(3) // ok, refused, retried
    expect(JSON.parse(String(posts[2]!.init!.body))).toEqual({ days: 7 })
  })

  it('clamps snooze days to the Portal limit', async () => {
    const p = fakePortal()
    await new PortalClient('/portal').snooze('t1', 400)
    expect(JSON.parse(String(p.calls.find((x) => x.init?.method === 'POST')!.init!.body))).toEqual({ days: 90 })
  })
  it('reads jobs per week with a plain GET, no token', async () => {
    const p = fakePortal()
    await new PortalClient('/portal').jobsPerWeek()
    expect(p.calls.map((c) => c.url)).toEqual(['/portal/api/dash/jobs'])
    expect(p.calls[0]!.init?.method ?? 'GET').toBe('GET')
  })
})
