/**
 * The connecting and access wizard's plain logic (docs/proposal-connect-wizard.md): what an address is, what a trusted
 * range covers in plain words, whether a range is acceptable to type, and the lines of the final check. No Vue, no network.
 * The Portal checks every range again before anything is written (rhino/trust.py).
 */
import { signalPercent, signalWord, type NetInterface } from '@/system/network'
import type { HealthItem } from '@/system/healthCheck'

export type HostKind = 'localhost' | 'local-name' | 'name' | 'ip' | 'tailscale-name' | 'tailscale-ip'

function ipv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) return null
  const p = m.slice(1).map(Number)
  return p.every((n) => n <= 255) ? p : null
}
const inTailnet = (p: number[]) => p[0] === 100 && p[1]! >= 64 && p[1]! <= 127

/** What the address this screen used says about how it reached the Rhino (location.hostname). */
export function classifyHost(host: string): { kind: HostKind; text: string } {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const ip = ipv4(h)
  if (h === 'localhost' || (ip && ip[0] === 127)) return { kind: 'localhost', text: 'This computer itself (localhost), so this is a test copy of Studio, not the Rhino.' }
  if (ip && inTailnet(ip)) return { kind: 'tailscale-ip', text: 'A Tailscale address: you are reaching the Rhino over your tailnet.' }
  if (ip) return { kind: 'ip', text: 'A number. It works on every device, but it changes if the router hands the Rhino a new one, unless you reserve it in the router.' }
  if (h.endsWith('.ts.net')) return { kind: 'tailscale-name', text: 'A Tailscale name: you are reaching the Rhino over your tailnet.' }
  if (h.endsWith('.local')) return { kind: 'local-name', text: 'A .local name. It follows the Rhino if its number changes, and works on most computers and iPhones; some Android phones can\'t use .local names.' }
  return { kind: 'name', text: 'A name. It follows the Rhino if its number changes, as long as your network knows the name.' }
}

/** A trusted_clients entry in words: who it lets in. */
export function describeRange(entry: string): string {
  const [addr = '', len] = entry.trim().split('/')
  if (addr.includes(':')) return len ? 'an IPv6 range' : 'one IPv6 address'
  const ip = ipv4(addr)
  if (!ip) return 'an entry Moonraker may not understand'
  if (ip[0] === 127) return 'the Rhino itself (the Portal and Moonraker talk through this)'
  const bits = len === undefined ? 32 : Number(len)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return 'an entry Moonraker may not understand'
  if (inTailnet(ip) && bits <= 10) return 'Tailscale: every device on your tailnet, including any shared with you'
  if (bits === 32) return 'one device'
  const n = 2 ** (32 - bits)
  const count = bits <= 30 ? n - 2 : n
  const priv = ip[0] === 10 || (ip[0] === 172 && ip[1]! >= 16 && ip[1]! <= 31) || (ip[0] === 192 && ip[1] === 168)
  if (priv && bits >= 24) return `your home network (${count.toLocaleString()} addresses)`
  if (priv && bits >= 16) return `a large part of your network (${count.toLocaleString()} addresses)`
  return `a very large range (${count.toLocaleString()} addresses)`
}

/** Why a typed range can't be added, or '' if it can. The Portal makes the same checks again. */
export function rangeProblem(text: string): string {
  const t = text.trim()
  if (!t) return 'Type an address or a range, like 192.168.1.0/24.'
  if (/\s/.test(t) || /[a-z]{2,}/i.test(t.replace(/[0-9a-f:./]/gi, '')) || /^[a-z]/i.test(t) && !t.includes(':')) return 'Only numbers: an address or a range. Host names can\'t be used.'
  const [addr = '', len] = t.split('/')
  if (addr.includes(':')) {
    if (!/^[0-9a-f:]+$/i.test(addr)) return 'That isn\'t an IPv6 address.'
    return len !== undefined && (!/^\d+$/.test(len) || Number(len) < 16 || Number(len) > 128) ? 'An IPv6 range can\'t be wider than /16.' : ''
  }
  const ip = ipv4(addr)
  if (!ip) return 'That isn\'t an address. Four numbers from 0 to 255, like 192.168.1.50.'
  if (len !== undefined) {
    if (!/^\d+$/.test(len) || Number(len) > 32) return 'After the slash goes a number from 0 to 32, like /24.'
    if (Number(len) < 8) return 'That range is too wide. Nothing wider than /8 can be trusted: it would let in far more than your own devices.'
  }
  if (ip.every((n) => n === 0)) return 'That would trust everyone. It can\'t be added.'
  return ''
}

/** What moonraker.conf will hold: the list as it is now, then the new entry. */
export function trustedLines(entries: string[], add?: string): string {
  const all = add && !entries.includes(add) ? [...entries, add] : entries
  return `[authorization]\ntrusted_clients:\n${all.map((e) => `    ${e}`).join('\n')}`
}

/** How the Rhino is connected, in a sentence and a level (Settings > Network's own readings). */
export function linkAdvice(i: NetInterface | null | undefined): { level: 'PASS' | 'WARN' | 'INFO'; text: string } {
  if (!i) return { level: 'INFO', text: 'This host\'s network settings can\'t be read from here (it doesn\'t use NetworkManager). Check it on the host with "ip addr".' }
  if (i.type === 'ethernet') return { level: 'PASS', text: 'Connected by cable. That is the sturdy choice for a machine left alone.' }
  if (i.type === 'wifi') {
    const pct = signalPercent(i.signal ?? null)
    if (pct == null) return { level: 'INFO', text: 'Connected by Wi-Fi. The signal strength isn\'t reported.' }
    const word = signalWord(pct)
    return pct >= 45
      ? { level: 'PASS', text: `Connected by Wi-Fi, signal ${word.toLowerCase()} (${pct}%). Fine, though a cable is sturdier for a machine left alone.` }
      : { level: 'WARN', text: `Connected by Wi-Fi, signal ${word.toLowerCase()} (${pct}%). A weak signal drops out during long jobs: move the Rhino, add an access point, or use a cable.` }
  }
  return { level: 'INFO', text: `Connected through ${i.name}.` }
}

export interface CheckInput {
  moonraker: 'online' | 'untrusted' | 'down'
  klippyReady: boolean
  portalOk: boolean
  covered: boolean | null
  hostKind: HostKind
}

/** The last step's lines, in the Health check page's words (Good, Look, Fix, Note). */
export function checkLines(c: CheckInput): HealthItem[] {
  const out: HealthItem[] = []
  const add = (level: HealthItem['level'], what: string, detail = '') => out.push({ section: 'Connection', level, what, detail })
  if (c.moonraker === 'online') add('PASS', 'Studio is connected to Moonraker')
  else if (c.moonraker === 'untrusted') add('FAIL', 'Moonraker doesn\'t trust this screen', 'Add this screen\'s network in the "Who may connect" step, from a screen that is already trusted, or in moonraker.conf on the host.')
  else add('FAIL', 'Studio can\'t reach Moonraker', 'Check the address in Settings > Connection, that the Rhino is on, and that the host is on the same network.')
  if (c.moonraker === 'online') c.klippyReady ? add('PASS', 'Klipper is ready') : add('WARN', 'Klipper isn\'t ready', 'That isn\'t a connection problem. Look in Control, or restart Klipper from Settings > Host.')
  c.portalOk ? add('PASS', 'The Rhino Portal answers') : add('FAIL', 'The Rhino Portal doesn\'t answer', 'Moonraker works without it, but changes to the Rhino\'s own settings need it. Run the Health check.')
  if (c.covered === true) add('PASS', 'This screen\'s address is on the trusted list')
  else if (c.covered === false) add('WARN', 'This screen\'s address isn\'t on the trusted list', 'Moonraker may still be letting it in by another rule; add it in the "Who may connect" step.')
  if (c.hostKind === 'ip') add('INFO', 'You reached the Rhino by a number', 'If the router gives it a new number, this address stops working. Reserve its number in your router, or use the .local name.')
  if (c.hostKind === 'localhost') add('INFO', 'This is a test copy of Studio on this computer', 'Open Studio from the Rhino\'s own address to check the real connection.')
  return out
}
