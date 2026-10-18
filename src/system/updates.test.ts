import { describe, expect, it } from 'vitest'
import { legacyUpgrade, newer, readPackages, updateBlock, updatePlan } from './updates'

const vi = {
  mainsail: { configured_type: 'web', version: 'v2.14.0', remote_version: 'v2.15.0', is_valid: true },
  crowsnest: { configured_type: 'git_repo', version: 'v4.1.9', remote_version: 'v4.1.10', is_valid: true, is_dirty: false },
  klipper: { configured_type: 'git_repo', version: 'v0.13.0-180', remote_version: 'v0.13.0-195', is_valid: true, commits_behind_count: 15 },
  'rhino-studio': { configured_type: 'web', version: '0.5.0', remote_version: '0.6.0', is_valid: true },
  moonraker: { configured_type: 'git_repo', version: 'v0.9.3-41', remote_version: 'v0.9.3-45', is_valid: true },
  system: { configured_type: 'system', package_count: 12 },
  'mainsail-config': { configured_type: 'git_repo', version: 'v1.2.1', remote_version: 'v1.2.1', is_valid: true, commits_behind_count: 0 },
  klipperscreen: { configured_type: 'git_repo', version: 'v0.4', remote_version: 'v0.5', is_valid: true, is_dirty: true },
}

describe('packages', () => {
  const pk = readPackages(vi)
  it('leaves Mainsail out', () => {
    expect(pk.map((p) => p.name)).not.toContain('mainsail')
  })
  it('lists in dependency order: system, Moonraker, repos, Klipper, web', () => {
    expect(pk.map((p) => p.name)).toEqual(['system', 'moonraker', 'crowsnest', 'klipperscreen', 'mainsail-config', 'klipper', 'rhino-studio'])
  })
  it('marks what needs updating, and refuses a dirty repo', () => {
    const by = Object.fromEntries(pk.map((p) => [p.name, p]))
    expect(by.system!.needsUpdate).toBe(true)
    expect(by['mainsail-config']!.needsUpdate).toBe(false)
    expect(by.klipperscreen!.needsUpdate).toBe(false)
    expect(by.klipperscreen!.problem).toMatch(/local changes/)
  })
  it('Update all: Klipper after every config repo, so it restarts once; up to date and broken ones skipped', () => {
    expect(updatePlan(pk).map((p) => p.name)).toEqual(['system', 'moonraker', 'crowsnest', 'klipper', 'rhino-studio'])
    expect(updatePlan(pk, 'klipper').map((p) => p.name)).toEqual(['klipper'])
  })
  it('system with nothing waiting is up to date', () => {
    expect(readPackages({ system: { package_count: 0 } })[0]!.needsUpdate).toBe(false)
  })
})

describe('updating', () => {
  it('is refused during a job, offline, or while another update runs', () => {
    const base = { online: true, jobActive: false, busy: false, running: false }
    expect(updateBlock(base)).toBeNull()
    expect(updateBlock({ ...base, jobActive: true })).toMatch(/job/)
    expect(updateBlock({ ...base, online: false })).toMatch(/connected/)
    expect(updateBlock({ ...base, busy: true })).toMatch(/busy/)
    expect(updateBlock({ ...base, running: true })).toMatch(/already/)
  })
  it('falls back to the pre-1.5 methods', () => {
    expect(legacyUpgrade({ name: 'system', kind: 'system' }).method).toBe('machine.update.system')
    expect(legacyUpgrade({ name: 'klipper', kind: 'klipper' }).method).toBe('machine.update.klipper')
    expect(legacyUpgrade({ name: 'crowsnest', kind: 'repo' })).toEqual({ method: 'machine.update.client', params: { name: 'crowsnest' } })
  })
  it('compares versions', () => {
    expect(newer('1.4.6', '1.4.7')).toBe(true)
    expect(newer('1.4.7', '1.4.7')).toBe(false)
    expect(newer('1.10.0', '1.9.9')).toBe(false)
    expect(newer('0.5.0', null)).toBe(false)
  })
})
