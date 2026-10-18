import { describe, expect, it } from 'vitest'
import { hostnameError, ipv4Errors, rate, secondsLeft, signalPercent, wantsSnapshots, type Ipv4Form } from './network'

const fixed = (o: Partial<Ipv4Form> = {}): Ipv4Form => ({ method: 'manual', address: '192.168.1.50', prefix: 24, gateway: '192.168.1.1', dns: '192.168.1.1 1.1.1.1', ...o })

describe('fixed address checks', () => {
  it('accepts a normal home setup, and DHCP needs nothing', () => {
    expect(ipv4Errors(fixed())).toEqual([])
    expect(ipv4Errors({ ...fixed({ address: '' }), method: 'auto' })).toEqual([])
  })
  it('refuses bad numbers, a gateway on another network, network and broadcast addresses', () => {
    expect(ipv4Errors(fixed({ address: '192.168.1.256' }))[0]).toMatch(/Address/)
    expect(ipv4Errors(fixed({ prefix: 31 }))[0]).toMatch(/Prefix/)
    expect(ipv4Errors(fixed({ gateway: '10.0.0.1' }))[0]).toMatch(/same network/)
    expect(ipv4Errors(fixed({ address: '192.168.1.255' }))[0]).toMatch(/broadcast/)
    expect(ipv4Errors(fixed({ address: '192.168.1.1' }))[0]).toMatch(/gateway/)
    expect(ipv4Errors(fixed({ dns: '1.1.1' }))[0]).toMatch(/DNS/)
  })
})

describe('hostname', () => {
  it('letters, digits and hyphens, no hyphen at the ends', () => {
    expect(hostnameError('rhino')).toBeNull()
    expect(hostnameError('rhino-shop2')).toBeNull()
    expect(hostnameError('-rhino')).toMatch(/hyphen/)
    expect(hostnameError('rhino.local')).toMatch(/Letters/)
    expect(hostnameError('a'.repeat(64))).toMatch(/63/)
  })
})

describe('readouts and cameras', () => {
  it('signal and rate', () => {
    expect(signalPercent(-62)).toBe(76)
    expect(signalPercent(-110)).toBe(0)
    expect(rate(412_000)).toEqual({ value: '412', unit: 'kB/s' })
    expect(rate(2_500_000)).toEqual({ value: '2.5', unit: 'MB/s' })
  })
  it('auto snapshots on phones and slow links only', () => {
    expect(wantsSnapshots('auto', { phone: false, rttMs: 20 })).toBe(false)
    expect(wantsSnapshots('auto', { phone: true, rttMs: 20 })).toBe(true)
    expect(wantsSnapshots('auto', { phone: false, rttMs: 400 })).toBe(true)
    expect(wantsSnapshots('live', { phone: true, rttMs: 400 })).toBe(false)
    expect(wantsSnapshots('snapshot', { phone: false, rttMs: 5 })).toBe(true)
  })
  it('counts down a waiting change', () => {
    expect(secondsLeft({ kind: 'ipv4', summary: '', expires_at: 1000 }, 940_000)).toBe(60)
    expect(secondsLeft(null, 0)).toBe(0)
  })
})
