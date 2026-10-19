import { describe, expect, it } from 'vitest'
import { cmpVersion, compareText, goBackZip, installBlock, stepMarks } from './zipUpdate'

describe('zip updates', () => {
  it('compares versions as numbers', () => {
    expect(cmpVersion('1.5.10', '1.5.9')).toBeGreaterThan(0)
    expect(cmpVersion('1.5.3', '1.5.3')).toBe(0)
    expect(cmpVersion('1.4.9', '1.5.0')).toBeLessThan(0)
  })
  it('marks steps', () => {
    const steps = ['a', 'b', 'c']
    expect(stepMarks({ state: 'running', steps, step: 1 }).map((s) => s.mark)).toEqual(['done', 'now', 'todo'])
    expect(stepMarks({ state: 'failed', steps, step: 2 }).map((s) => s.mark)).toEqual(['done', 'done', 'failed'])
    expect(stepMarks({ state: 'done', steps, step: 1 }).map((s) => s.mark)).toEqual(['done', 'done', 'done'])
  })
  it('Go back picks the newest kept zip older than installed', () => {
    const zips = [{ zip: 'rhino-config-1.5.1.zip', version: '1.5.1', size: 1, at: 1 }, { zip: 'rhino-config-1.5.2.zip', version: '1.5.2', size: 1, at: 1 }, { zip: 'rhino-config-1.5.3.zip', version: '1.5.3', size: 1, at: 1 }]
    expect(goBackZip({ installed: '1.5.3', zips })?.version).toBe('1.5.2')
    expect(goBackZip({ installed: '1.5.1', zips })).toBeNull()
  })
  it('says how an upload compares', () => {
    expect(compareText('1.5.3', '1.5.2')).toMatch(/newer/)
    expect(compareText('1.5.2', '1.5.2')).toMatch(/repairs/)
    expect(compareText('1.5.1', '1.5.2')).toMatch(/goes back/)
  })
  it('install is blocked by a job, a running install, no updater, no Portal', () => {
    const base = { helper: true, busy: false, jobState: 'standby', portalOnline: true }
    expect(installBlock(base)).toBeNull()
    expect(installBlock({ ...base, jobState: 'printing' })).toMatch(/job/)
    expect(installBlock({ ...base, busy: true })).toMatch(/running/)
    expect(installBlock({ ...base, helper: false })).toMatch(/once by hand/)
    expect(installBlock({ ...base, portalOnline: false })).toMatch(/Portal/)
  })
})
