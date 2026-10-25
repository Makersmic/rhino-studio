import { describe, expect, it } from 'vitest'
import { archiveLine, backupBlock, githubLine, headline, planLines, serialProblem } from './backup'
import type { BackupState, RestorePlan } from '@/portal/client'

const NOW = 1_800_000_000
const state = (over: Partial<BackupState> = {}): BackupState => ({
  archives: [], keep: 10, folder: '/home/pi/rhino-backups', items: {},
  github: { state: 'never', running: false, last: null }, ...over,
})
const plan = (over: Partial<RestorePlan> = {}): RestorePlan => ({ archive: 'a', item: 'maintenance', this_host: 'pi', add: [], replace: [], same: [], keep: [], ...over })

describe('backup panel words', () => {
  it('headline: none yet, fresh, and older than 30 days', () => {
    expect(headline(state(), NOW)).toEqual({ text: 'No backup on this Rhino yet', tone: 'warn' })
    const a = { name: 'rhino-pi-1.zip', size: 2_000_000, time: NOW - 7200, complete: true }
    expect(headline(state({ archives: [a] }), NOW)).toEqual({ text: 'Last backup 2 h ago', tone: 'ok' })
    expect(headline(state({ archives: [{ ...a, time: NOW - 40 * 86400 }] }), NOW).tone).toBe('warn')
  })
  it('headline skips an archive that is not readable', () => {
    const bad = { name: 'rhino-pi-2.zip', size: 10, time: NOW - 60, complete: false }
    expect(headline(state({ archives: [bad] }), NOW).text).toBe('No backup on this Rhino yet')
  })
  it('INV-B8: GitHub is only "pushed" after a push that worked', () => {
    expect(githubLine(state({ github: { state: 'not_installed', running: false, last: null } })).bad).toBe(true)
    expect(githubLine(state({ github: { state: 'no_env', running: false, last: null } })).bad).toBe(true)
    const failed = githubLine(state({ github: { state: 'failed', running: false, last: { ok: false, code: 1, time: NOW - 60, tail: ['fatal: auth'] } } }), NOW)
    expect(failed.bad).toBe(true)
    expect(failed.text).toMatch(/failed/)
    expect(failed.text).not.toMatch(/pushed/)
    expect(githubLine(state({ github: { state: 'ok', running: false, last: { ok: true, code: 0, time: NOW - 60, tail: [] } } }), NOW).text).toBe('GitHub copy: pushed just now.')
  })
  it('no backup or restore during a job, or without Moonraker or the Portal', () => {
    expect(backupBlock({ online: true, jobState: 'printing', portal: true })).toBe('Not during a job')
    expect(backupBlock({ online: true, jobState: 'paused', portal: true })).toBe('Not during a job')
    expect(backupBlock({ online: false, jobState: '', portal: true })).toMatch(/Moonraker/)
    expect(backupBlock({ online: true, jobState: 'standby', portal: false })).toMatch(/Portal/)
    expect(backupBlock({ online: true, jobState: 'complete', portal: true })).toBeNull()
  })
  it('details go under the name: date, size, reason', () => {
    const l = archiveLine({ name: 'x', size: 3_500_000, time: NOW, complete: true, reason: 'after_long_job' })
    expect(l).toMatch(/3\.3 MB · after long job$/)
  })
  it('plan lines say what changes, and what a full restore leaves alone', () => {
    expect(planLines(plan({ replace: ['a'], same: ['b', 'c'] }))).toEqual(['1 file goes back to how the backup has it', '2 files are already the same'])
    expect(planLines(plan())).toEqual(['Nothing to change: this part of the backup matches what’s here'])
    const all = planLines(plan({ item: 'all', keep: ['x'], history_jobs: 12, backup_version: '1.7.0', installed_version: '1.7.1' }))
    expect(all.join('\n')).toMatch(/12 jobs/)
    expect(all.join('\n')).toMatch(/1\.7\.1 stays installed/)
    expect(planLines(plan({ item: 'studio', replace: ['theme'] }))[0]).toBe('1 setting goes back to how the backup has it')
  })
  it('a full restore names the board that is not connected here', () => {
    expect(serialProblem(plan())).toBeNull()
    expect(serialProblem(plan({ item: 'all', missing_serial: [{ file: 'printer.cfg', section: 'mcu', serial: '/dev/serial/by-id/usb-x' }] }))).toMatch(/\[mcu\] \/dev\/serial\/by-id\/usb-x/)
  })
})
