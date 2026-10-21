/**
 * Does Moonraker trust this screen? Mainsail's way (0.6.3): no login, no tokens.
 * Moonraker's [authorization] trusted_clients decides; an untrusted screen is told
 * how to add itself, exactly the fix Mainsail's docs give for "Unauthorized".
 *
 *   GET /access/info (answers without trust)
 *     404 (no [authorization])                 -> 'off'      as before
 *     trusted and not force_logins             -> 'trusted'
 *     otherwise                                -> 'untrusted'
 *     no answer                                -> 'unreachable' (the socket's own retry handles it)
 */
export type Trust = 'off' | 'trusted' | 'untrusted' | 'unreachable'

export async function checkTrust(baseUrl: string, f: typeof fetch = (...a) => fetch(...a)): Promise<Trust> {
  try {
    const res = await f(`${baseUrl.replace(/\/+$/, '')}/access/info`, { cache: 'no-store' })
    if (res.status === 404) return 'off'
    if (res.status === 401 || res.status === 403) return 'untrusted'
    if (!res.ok) return 'off'
    const info = ((await res.json()) as { result?: { trusted?: boolean | null; login_required?: boolean } }).result ?? {}
    return info.trusted && !info.login_required ? 'trusted' : 'untrusted'
  } catch {
    return 'unreachable'
  }
}

/** The trusted_clients range to suggest for an address: its /24 for IPv4, the address itself otherwise. */
export function suggestRange(address: string | null): string {
  const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(address ?? '')
  return m ? `${m[1]}.${m[2]}.${m[3]}.0/24` : address || '192.168.1.0/24'
}
