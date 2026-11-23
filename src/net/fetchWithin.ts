/**
 * fetch() with a time limit. A server that is running but stuck never refuses a connection, so a plain fetch can wait
 * for ever (or until the browser's own, very long, limit). Used for the small side requests that must not hold a
 * screen up: the update check and the trust card's address lookup. The Portal client has its own (portal/client.ts).
 * Rejects with an Error("timed out") when the time is up.
 */
export async function fetchWithin(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } catch (e) {
    if (ctl.signal.aborted) throw new Error('timed out')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
