import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithin } from './fetchWithin'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fetchWithin', () => {
  it('gives up on a server that never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))))))
    const p = fetchWithin('/x', {}, 5000).catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(4999)
    let done = false
    void p.then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(((await p) as Error).message).toBe('timed out')
  })
  it('returns an answer that comes in time, and passes the request on', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response('hi'))
    vi.stubGlobal('fetch', f)
    const r = await fetchWithin('/y', { headers: { A: '1' } })
    expect(await r.text()).toBe('hi')
    expect(f.mock.calls[0]![1]).toMatchObject({ headers: { A: '1' } })
  })
  it('lets a refused connection through as it is, not as a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(fetchWithin('/z')).rejects.toThrow(TypeError)
  })
})
