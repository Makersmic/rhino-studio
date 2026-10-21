import { describe, expect, it } from 'vitest'
import { checkTrust, suggestRange } from './trust'

const reply = (status: number, result?: unknown) => async () => new Response(JSON.stringify({ result }), { status })

describe('checkTrust', () => {
  it('no [authorization] (404): off', async () => expect(await checkTrust('', reply(404))).toBe('off'))
  it('trusted address: trusted', async () => expect(await checkTrust('', reply(200, { trusted: true, login_required: false }))).toBe('trusted'))
  it('not in trusted_clients: untrusted', async () => expect(await checkTrust('', reply(200, { trusted: false, login_required: false }))).toBe('untrusted'))
  it('force_logins overrides trust: untrusted (Mainsail can’t connect either)', async () => expect(await checkTrust('', reply(200, { trusted: true, login_required: true }))).toBe('untrusted'))
  it('no answer: unreachable (the socket retry handles it)', async () => expect(await checkTrust('', async () => { throw new TypeError('down') })).toBe('unreachable'))
})

describe('suggestRange', () => {
  it('IPv4 -> its /24', () => expect(suggestRange('192.168.86.31')).toBe('192.168.86.0/24'))
  it('IPv6 -> the address', () => expect(suggestRange('fe80::1')).toBe('fe80::1'))
  it('unknown -> a typical home range', () => expect(suggestRange(null)).toBe('192.168.1.0/24'))
})
