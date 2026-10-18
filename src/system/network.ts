/**
 * Settings / Network: this screen's own connection settings, and the shapes
 * and checks for the Rhino's network (changed through the Rhino Portal,
 * config 1.4.8+, which keeps the old settings and switches back after two
 * minutes unless the change is kept).
 */

// ---- this screen ----------------------------------------------------------

export type ReconnectProfile = 'fast' | 'normal' | 'patient'
export const RECONNECT: Record<ReconnectProfile, { delays: number[]; text: string }> = {
  fast: { delays: [500, 1000, 2000, 3000], text: 'Retries every half second, backing off to 3 s' },
  normal: { delays: [1000, 2000, 4000, 8000, 10000], text: 'Retries every second, backing off to 10 s' },
  patient: { delays: [2000, 5000, 15000, 30000], text: 'Retries every 2 s, backing off to 30 s; easier on a busy Wi-Fi' },
}

export type CameraLink = 'live' | 'auto' | 'snapshot'
export const CAMERA_LINK: Record<CameraLink, string> = {
  live: 'Live video everywhere',
  auto: 'Snapshots on phones and when the link is slow',
  snapshot: 'Snapshots only: least load on the Pi',
}
export const SNAPSHOT_FPS = { min: 0.5, max: 10, step: 0.5 } as const

/** A link this slow switches cameras to snapshots in 'auto'. */
export const SLOW_RTT_MS = 250

export function wantsSnapshots(link: CameraLink, ctx: { phone: boolean; rttMs: number | null; saveData?: boolean }): boolean {
  if (link === 'live') return false
  if (link === 'snapshot') return true
  return ctx.phone || !!ctx.saveData || (ctx.rttMs != null && ctx.rttMs > SLOW_RTT_MS)
}

// ---- readouts -------------------------------------------------------------

/** Wi-Fi quality 0-100 % from dBm (the usual -100..-50 scale). */
export function signalPercent(dbm: number | null | undefined): number | null {
  if (dbm == null || !Number.isFinite(dbm)) return null
  return Math.max(0, Math.min(100, Math.round(2 * (dbm + 100))))
}
export function signalWord(pct: number | null): string {
  if (pct == null) return ''
  return pct >= 70 ? 'Strong' : pct >= 45 ? 'Good' : pct >= 25 ? 'Weak' : 'Very weak'
}

/** Bytes per second as "412 kB/s" pieces. */
export function rate(bps: number | null | undefined): { value: string; unit: string } | null {
  if (bps == null || !Number.isFinite(bps)) return null
  if (bps >= 1e6) return { value: (bps / 1e6).toFixed(bps >= 1e7 ? 0 : 1), unit: 'MB/s' }
  return { value: String(Math.round(bps / 1e3)), unit: 'kB/s' }
}

// ---- the Rhino's network (Portal) -----------------------------------------

export interface NetInterface {
  name: string
  type: 'wifi' | 'ethernet' | string
  state: string
  connection: string | null
  ip: string | null
  prefix: number | null
  gateway: string | null
  dns: string[]
  mac: string | null
  method: 'auto' | 'manual' | null
  ssid?: string | null
  signal?: number | null
  powersave?: boolean | null
}

export interface NetPending {
  kind: 'hostname' | 'ipv4' | 'wifi' | 'powersave'
  summary: string
  /** seconds since the epoch when it switches back */
  expires_at: number
  /** where to open the Portal to keep it, when the address changes */
  confirm_url?: string | null
}

export interface NetState {
  supported: boolean
  reason?: string | null
  manager: string | null
  hostname: string
  interfaces: NetInterface[]
  pending: NetPending | null
  revert_seconds?: number
}

export interface WifiNetwork {
  ssid: string
  signal: number
  security: string
  in_use: boolean
}

const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}$`)

export function validIpv4(s: string): boolean {
  return IPV4.test(s.trim())
}

/** RFC 1123 host label: letters, digits, hyphens, 1-63, not starting or ending with a hyphen. */
export function hostnameError(h: string): string | null {
  const t = h.trim()
  if (!t) return 'Enter a name'
  if (t.length > 63) return 'At most 63 characters'
  if (!/^[A-Za-z0-9-]+$/.test(t)) return 'Letters, digits and hyphens only'
  if (t.startsWith('-') || t.endsWith('-')) return 'Can’t start or end with a hyphen'
  return null
}

export interface Ipv4Form {
  method: 'auto' | 'manual'
  address: string
  prefix: number
  gateway: string
  dns: string
}

const toInt = (ip: string) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0

/** Problems with a fixed-address form, or [] when it can be sent. */
export function ipv4Errors(f: Ipv4Form): string[] {
  if (f.method === 'auto') return []
  const e: string[] = []
  if (!validIpv4(f.address)) e.push('Address: four numbers 0-255, like 192.168.1.50')
  if (!Number.isInteger(f.prefix) || f.prefix < 8 || f.prefix > 30) e.push('Prefix: 8 to 30 (24 is a usual home network)')
  if (!validIpv4(f.gateway)) e.push('Gateway: four numbers, usually your router, like 192.168.1.1')
  const dns = dnsList(f.dns)
  if (dns.some((d) => !validIpv4(d))) e.push('DNS: addresses separated by spaces or commas')
  if (!e.length) {
    const mask = f.prefix === 0 ? 0 : (0xffffffff << (32 - f.prefix)) >>> 0
    if ((toInt(f.address) & mask) !== (toInt(f.gateway) & mask)) e.push('The gateway isn’t on the same network as the address')
    if (f.address.trim() === f.gateway.trim()) e.push('The address can’t be the gateway’s')
    const host = toInt(f.address) & ~mask
    if (host === 0 || host === (~mask >>> 0)) e.push('That address is the network or broadcast address')
  }
  return e
}

export function dnsList(s: string): string[] {
  return s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
}

/** Seconds left before a pending change switches back. */
export function secondsLeft(p: NetPending | null, nowMs: number): number {
  if (!p) return 0
  return Math.max(0, Math.ceil(p.expires_at - nowMs / 1000))
}
