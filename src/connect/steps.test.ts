import { describe, expect, it } from 'vitest'
import { checkLines, classifyHost, describeRange, linkAdvice, rangeProblem, trustedLines } from './steps'
import type { NetInterface } from '@/system/network'

const iface = (o: Partial<NetInterface>): NetInterface => ({ name: 'wlan0', type: 'wifi', state: 'up', connection: null, ip: '192.168.1.5', prefix: 24, gateway: null, dns: [], mac: null, method: 'auto', ...o })

describe('what the address says', () => {
  it('names the kinds', () => {
    expect(classifyHost('rhino.local').kind).toBe('local-name')
    expect(classifyHost('192.168.1.40').kind).toBe('ip')
    expect(classifyHost('100.101.2.3').kind).toBe('tailscale-ip')
    expect(classifyHost('rhino.tail1234.ts.net').kind).toBe('tailscale-name')
    expect(classifyHost('localhost').kind).toBe('localhost')
    expect(classifyHost('127.0.0.1').kind).toBe('localhost')
    expect(classifyHost('printer.example').kind).toBe('name')
    expect(classifyHost('100.200.1.1').kind).toBe('ip') // outside 100.64-127
  })
})

describe('what a range lets in', () => {
  it('says it in words', () => {
    expect(describeRange('192.168.1.0/24')).toBe('your home network (254 addresses)')
    expect(describeRange('10.0.0.0/16')).toBe('a large part of your network (65,534 addresses)')
    expect(describeRange('192.168.1.50')).toBe('one device')
    expect(describeRange('192.168.1.50/32')).toBe('one device')
    expect(describeRange('127.0.0.0/8')).toMatch(/the Rhino itself/)
    expect(describeRange('100.64.0.0/10')).toMatch(/every device on your tailnet/)
    expect(describeRange('8.8.0.0/16')).toMatch(/very large range/)
    expect(describeRange('fe80::/10')).toBe('an IPv6 range')
    expect(describeRange('nonsense')).toMatch(/may not understand/)
  })
})

describe('what can be typed', () => {
  it('accepts an address and an ordinary range', () => {
    for (const ok of ['192.168.1.0/24', '192.168.1.50', '10.0.0.0/8', '100.64.0.0/10', 'fd00::/16']) expect(rangeProblem(ok), ok).toBe('')
  })
  it('refuses what the Portal refuses, with the reason', () => {
    expect(rangeProblem('')).toMatch(/Type an address/)
    expect(rangeProblem('rhino.local')).toMatch(/Host names/)
    expect(rangeProblem('0.0.0.0/0')).toMatch(/too wide/)
    expect(rangeProblem('0.0.0.0')).toMatch(/everyone/)
    expect(rangeProblem('10.0.0.0/7')).toMatch(/too wide/)
    expect(rangeProblem('192.168.1.0/33')).toMatch(/0 to 32/)
    expect(rangeProblem('300.1.1.1')).toMatch(/isn't an address/)
    expect(rangeProblem('1.2.3')).toMatch(/isn't an address/)
  })
  it('shows the lines that will be in moonraker.conf', () => {
    expect(trustedLines(['127.0.0.0/8', '10.0.0.0/24'], '192.168.1.0/24')).toBe('[authorization]\ntrusted_clients:\n    127.0.0.0/8\n    10.0.0.0/24\n    192.168.1.0/24')
    expect(trustedLines(['10.0.0.0/24'], '10.0.0.0/24')).toBe('[authorization]\ntrusted_clients:\n    10.0.0.0/24')
  })
})

describe('how it is connected', () => {
  it('prefers a cable and warns about a weak signal', () => {
    expect(linkAdvice(iface({ type: 'ethernet' })).level).toBe('PASS')
    expect(linkAdvice(iface({ signal: -55 })).level).toBe('PASS')
    expect(linkAdvice(iface({ signal: -85 })).level).toBe('WARN')
    expect(linkAdvice(iface({ signal: null })).level).toBe('INFO')
    expect(linkAdvice(null).level).toBe('INFO')
  })
})

describe('the last step', () => {
  const base = { moonraker: 'online', klippyReady: true, portalOk: true, covered: true, hostKind: 'local-name' } as const
  it('is all good on a healthy connection', () => {
    expect(checkLines(base).every((l) => l.level === 'PASS')).toBe(true)
  })
  it('names what is wrong', () => {
    expect(checkLines({ ...base, moonraker: 'untrusted' }).find((l) => l.level === 'FAIL')?.what).toMatch(/doesn't trust this screen/)
    expect(checkLines({ ...base, moonraker: 'down' }).find((l) => l.level === 'FAIL')?.what).toMatch(/can't reach Moonraker/)
    expect(checkLines({ ...base, portalOk: false }).find((l) => l.level === 'FAIL')?.what).toMatch(/Portal doesn't answer/)
    expect(checkLines({ ...base, klippyReady: false }).find((l) => l.level === 'WARN')?.what).toMatch(/Klipper isn't ready/)
    expect(checkLines({ ...base, hostKind: 'ip' }).find((l) => l.level === 'INFO')?.what).toMatch(/by a number/)
  })
  it('says nothing about Klipper when Moonraker is out of reach', () => {
    expect(checkLines({ ...base, moonraker: 'down' }).some((l) => /Klipper/.test(l.what))).toBe(false)
  })
})
