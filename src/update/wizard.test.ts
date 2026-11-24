import { describe, expect, it } from 'vitest'
import { ago, beforeChecks, clearResume, compare, loadResume, saveResume, RESUME_KEY, type BeforeInput, type Resume } from './wizard'

const GB = 1024 ** 3
const base: BeforeInput = { online: true, installed: '1.9.45', latest: { version: '1.9.46', notes_url: 'x' }, helper: true, busy: false, jobState: 'standby', freeBytes: 20 * GB, lastBackup: 1000, now: 1000 + 7200 }
const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('before the update', () => {
  it('is ready when a newer release exists and nothing is in the way', () => {
    const r = beforeChecks(base)
    expect(r.ready).toBe(true)
    expect(r.items.find((i) => /available/.test(i.what))?.what).toBe('Version 1.9.46 is available (you have 1.9.45)')
    expect(r.items.find((i) => /backup/.test(i.what))?.what).toBe('The last backup was 2 hours ago')
  })
  it('is not ready when you already have the newest', () => {
    const r = beforeChecks({ ...base, installed: '1.9.46' })
    expect(r.ready).toBe(false)
    expect(r.newer).toBe(false)
    expect(r.items.some((i) => i.level === 'FAIL')).toBe(false)
  })
  it('stops for a running job, a running install, a missing updater, an offline Portal and a full disk', () => {
    expect(beforeChecks({ ...base, jobState: 'printing' }).items.some((i) => i.level === 'FAIL' && /job is running/.test(i.what))).toBe(true)
    expect(beforeChecks({ ...base, jobState: 'paused' }).ready).toBe(false)
    expect(beforeChecks({ ...base, busy: true }).ready).toBe(false)
    expect(beforeChecks({ ...base, helper: false }).ready).toBe(false)
    expect(beforeChecks({ ...base, online: false }).ready).toBe(false)
    const full = beforeChecks({ ...base, freeBytes: 0.5 * GB })
    expect(full.ready).toBe(false)
    expect(full.items.find((i) => i.level === 'FAIL')?.what).toMatch(/512 MB free/)
  })
  it('warns when space is tight or GitHub is out of reach, without stopping', () => {
    expect(beforeChecks({ ...base, freeBytes: 2 * GB }).items.some((i) => i.level === 'WARN')).toBe(true)
    expect(beforeChecks({ ...base, freeBytes: 2 * GB }).ready).toBe(true)
    const gh = beforeChecks({ ...base, latest: { error: 'Can\'t reach GitHub from the Rhino right now.' } })
    expect(gh.items.some((i) => i.level === 'WARN' && /GitHub/.test(i.what))).toBe(true)
    expect(gh.ready).toBe(false) // no newer version is known
  })
  it('says how old a backup is', () => {
    expect(ago(0, 30)).toBe('just now')
    expect(ago(0, 1800)).toBe('30 minutes ago')
    expect(ago(0, 7200)).toBe('2 hours ago')
    expect(ago(0, 3 * 86400)).toBe('3 days ago')
    expect(beforeChecks({ ...base, lastBackup: null }).items.some((i) => i.what === 'No backup has been made yet')).toBe(true)
  })
})

describe('across the reload', () => {
  const r: Resume = { from: '1.9.45', to: '1.9.46', backup: 'a.zip', before: { fix: 0, look: 1 }, at: 1000 }
  it('is found only when the Rhino now reports the target version and it is recent', () => {
    const s = mem()
    saveResume(s, r)
    expect(loadResume(s, '1.9.46', 2000)).toEqual(r)
    expect(loadResume(s, '1.9.45', 2000)).toBeNull() // install didn't happen
    expect(loadResume(s, '1.9.46', 1000 + 4 * 3600)).toBeNull() // too old
    clearResume(s)
    expect(loadResume(s, '1.9.46', 2000)).toBeNull()
  })
  it('survives broken or missing storage', () => {
    const s = mem()
    s.setItem(RESUME_KEY, '{nope')
    expect(loadResume(s, '1.9.46', 2000)).toBeNull()
    expect(loadResume(undefined, '1.9.46', 2000)).toBeNull()
    expect(() => saveResume({ setItem: () => { throw new Error('blocked') } }, r)).not.toThrow()
  })
})

describe('after the update', () => {
  const r: Resume = { from: '1.9.45', to: '1.9.46', backup: null, before: { fix: 0, look: 1 }, at: 1 }
  it('says the update is not there when the version did not change', () => {
    expect(compare(r, '1.9.45', null).tone).toBe('danger')
  })
  it('compares what needed attention before and after', () => {
    expect(compare(r, '1.9.46', { FAIL: 0, WARN: 1 })).toMatchObject({ tone: 'ok' })
    expect(compare(r, '1.9.46', { FAIL: 0, WARN: 2 })).toMatchObject({ tone: 'warn' })
    const bad = compare(r, '1.9.46', { FAIL: 1, WARN: 1 })
    expect(bad.tone).toBe('danger')
    expect(bad.text).toMatch(/something needs fixing that didn't before/)
  })
  it('works without a "before"', () => {
    expect(compare({ ...r, before: null }, '1.9.46', { FAIL: 0, WARN: 0 }).tone).toBe('ok')
    expect(compare(null, '1.9.46', null).text).toMatch(/Run the check/)
  })
})
