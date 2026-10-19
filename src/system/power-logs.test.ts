import { describe, expect, it } from 'vitest'
import { POWER_METHODS, POWER_SERVICES } from '@/moonraker/client'
import { POWER_ACTIONS, powerBlock } from './power'
import { cleanTail, lastError, sortLogs } from './logs'

describe('power actions', () => {
  it('only use allowed methods and services', () => {
    for (const a of POWER_ACTIONS) {
      expect(POWER_METHODS.has(a.method)).toBe(true)
      if (a.method === 'machine.services.restart') expect(POWER_SERVICES.has(String(a.params?.service))).toBe(true)
    }
  })
  it('are refused during a job and when offline', () => {
    expect(powerBlock({ online: true, jobState: 'printing' })).toMatch(/job is running/)
    expect(powerBlock({ online: true, jobState: 'paused' })).toMatch(/job is running/)
    expect(powerBlock({ online: false, jobState: 'standby' })).toMatch(/Not connected/)
    expect(powerBlock({ online: true, jobState: 'complete' })).toBeNull()
  })
  it('reboot and shut down are the heavy ones', () => {
    expect(POWER_ACTIONS.filter((a) => a.heavy).map((a) => a.id)).toEqual(['reboot', 'shutdown'])
  })
})

describe('logs', () => {
  const f = (path: string) => ({ path, modified: 0, size: 1, permissions: 'r' })
  it('main logs first, rotated last', () => {
    expect(sortLogs([f('klippy.log.1'), f('zz.log'), f('moonraker.log'), f('klippy.log')]).map((x) => x.path)).toEqual([
      'klippy.log', 'moonraker.log', 'zz.log', 'klippy.log.1',
    ])
  })
  it('drops the cut first line of a tail', () => {
    expect(cleanTail('half line\nfull\n', true)).toBe('full\n')
    expect(cleanTail('whole\n', false)).toBe('whole\n')
  })
  it('finds the last Klipper error with its detail lines', () => {
    const log = ['Stats 1: ok', "MCU 'mcu' shutdown: Timer too close", '  This often indicates a host overload', 'Stats 2: ok'].join('\n')
    expect(lastError(log)).toBe("MCU 'mcu' shutdown: Timer too close\n  This often indicates a host overload")
    const withTransition = log.replace('Stats 2: ok', 'Transition to shutdown state: MCU shutdown\nStats 2: ok')
    expect(lastError(withTransition)).toBe("MCU 'mcu' shutdown: Timer too close\n  This often indicates a host overload\nTransition to shutdown state: MCU shutdown")
  })
  it('finds a whole Python traceback', () => {
    const log = ['start', 'Traceback (most recent call last):', '  File "x.py", line 1', '    boom()', 'ValueError: bad', 'later ok'].join('\n')
    const e = lastError(log)!
    expect(e.startsWith('Traceback')).toBe(true)
    expect(e.endsWith('ValueError: bad')).toBe(true)
  })
  it('null when nothing looks like an error', () => {
    expect(lastError('Stats 1\nStats 2')).toBeNull()
  })
})
