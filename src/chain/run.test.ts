import { describe, expect, it } from 'vitest'
import type { HistoryJob } from '@/moonraker/client'
import { newChain } from './chain'
import { LIFTS_PROVEN, LIFT_BLOCK, fileHasLifts, nextStep, progressOf, runJobs, type RunInput } from './run'

const tools = { print: 'BlockOne', laser: 'LightSaber' }
const chain = () => {
  const c = newChain('Front plate 001', 'sheet-print-laser', tools)
  c.jobs = [{ file: 'front-plate-001_job1_print.gcode', tool: 'BlockOne', stages: [1, 2, 3] }, { file: 'front-plate-001_job2_laser.gcode', tool: 'LightSaber', stages: [4] }]
  return c
}
const hist = (file: string, status: string, start = 1000): HistoryJob => ({ job_id: file + start, filename: file, status, start_time: start, end_time: start + 60, print_duration: 60, filament_used: 0 })
const J1 = 'front-plate-001_job1_print.gcode'
const J2 = 'front-plate-001_job2_laser.gcode'
const input = (over: Partial<RunInput> = {}): RunInput => ({
  jobs: runJobs(chain()), history: [], since: 900, live: { state: 'standby', file: null }, onRhino: new Set([J1, J2]), mounted: 'BlockOne', klippyReady: true, hasLifts: new Map([[J2, false]]), ...over,
})

describe('the jobs of a chain', () => {
  it('are in run order with the saved file names, the pause and the tool', () => {
    const j = runJobs(chain())
    expect(j.map((x) => [x.n, x.file, x.tool, x.kind, x.pauses, x.built])).toEqual([[1, J1, 'BlockOne', 'print', true, true], [2, J2, 'LightSaber', 'laser', false, true]])
  })
  it('a job with no saved file is not built, and gets the name it would have', () => {
    const c = chain(); c.jobs = []
    expect(runJobs(c).map((x) => [x.file, x.built])).toEqual([[J1, false], [J2, false]])
  })
})

describe('progress comes from the live state and the history, never from a stored note', () => {
  const none = { state: 'standby', file: null }
  it('the live state wins', () => {
    expect(progressOf(J1, [], 900, { state: 'printing', file: J1 }).progress).toBe('running')
    expect(progressOf(J1, [], 900, { state: 'paused', file: 'gcodes/' + J1 }).progress).toBe('paused')
  })
  it('history since the run began: completed is done, cancelled or error is failed, older runs are ignored', () => {
    expect(progressOf(J1, [hist(J1, 'completed')], 900, none).progress).toBe('done')
    expect(progressOf(J1, [hist(J1, 'cancelled')], 900, none)).toEqual({ progress: 'failed', status: 'cancelled' })
    expect(progressOf(J1, [hist(J1, 'completed', 500)], 900, none).progress).toBe('todo')
  })
  it('the newest entry decides (a retry after a cancel)', () => {
    expect(progressOf(J1, [hist(J1, 'cancelled', 1000), hist(J1, 'completed', 2000)], 900, none).progress).toBe('done')
    expect(progressOf(J1, [hist(J1, 'completed', 1000), hist(J1, 'cancelled', 2000)], 900, none).progress).toBe('failed')
  })
})

describe('what comes next', () => {
  it('the first job: start it when its tool is mounted, swap when not', () => {
    expect(nextStep(input())).toMatchObject({ kind: 'start', job: { n: 1 } })
    expect(nextStep(input({ mounted: 'LightSaber' }))).toMatchObject({ kind: 'swap', to: 'BlockOne' })
    expect(nextStep(input({ mounted: null }))).toMatchObject({ kind: 'swap' })
  })
  it('while the print runs, it waits; when it pauses at the sheet, it says place it', () => {
    expect(nextStep(input({ live: { state: 'printing', file: J1 } })).kind).toBe('running')
    expect(nextStep(input({ live: { state: 'paused', file: J1 } })).kind).toBe('place')
  })
  it('after job 1 completed: swap to the laser, then start it', () => {
    const h = [hist(J1, 'completed')]
    expect(nextStep(input({ history: h }))).toMatchObject({ kind: 'swap', to: 'LightSaber' })
    expect(nextStep(input({ history: h, mounted: 'LightSaber' }))).toMatchObject({ kind: 'start', job: { n: 2 } })
  })
  it('everything done is finished', () => expect(nextStep(input({ history: [hist(J1, 'completed'), hist(J2, 'completed', 1100)] })).kind).toBe('finished'))
  it('a cancelled job stops the run', () => expect(nextStep(input({ history: [hist(J1, 'cancelled')] }))).toMatchObject({ kind: 'failed', status: 'cancelled' }))
  const blocked = (over: Partial<RunInput>, re: RegExp) => {
    const s = nextStep(input(over))
    expect(s.kind).toBe('blocked')
    expect((s as { why: string }).why).toMatch(re)
  }
  it('blocks, with the reason, when Klipper is not ready, another job runs, the file is missing, or the job was never built', () => {
    blocked({ klippyReady: false }, /Klipper is not ready/)
    blocked({ live: { state: 'printing', file: 'other.gcode' } }, /Another job is running/)
    blocked({ onRhino: new Set([J2]) }, /not on the Rhino/)
    const c = chain(); c.jobs = []
    blocked({ jobs: runJobs(c) }, /no file yet/)
  })
  it('refuses a laser file with travel lifts, and waits while the header is unread', () => {
    const h = [hist(J1, 'completed')]
    expect(LIFTS_PROVEN).toBe(false)
    blocked({ history: h, mounted: 'LightSaber', hasLifts: new Map([[J2, true]]) }, /machine check CH14/)
    expect(nextStep(input({ history: h, mounted: 'LightSaber', hasLifts: new Map([[J2, true]]) }))).toMatchObject({ why: LIFT_BLOCK })
    blocked({ history: h, mounted: 'LightSaber', hasLifts: new Map() }, /Reading the file/)
  })
  it('the lifts gate holds even when the wrong tool is mounted (it is checked before the swap)', () => {
    blocked({ history: [hist(J1, 'completed')], mounted: 'BlockOne', hasLifts: new Map([[J2, true]]) }, /CH14/)
  })
})

describe('reading the lift header', () => {
  it('sees the chain header or a lift line, and not an ordinary laser file', () => {
    expect(fileHasLifts('; rhino_chain_lift = 5\nG21')).toBe(true)
    expect(fileHasLifts('; rhino_chain_features = 3')).toBe(true)
    expect(fileHasLifts('G1 Z5 F600 ;RHINO_CHAIN lift\n')).toBe(true)
    expect(fileHasLifts('; rhino_toolhead = LightSaber\nG21\nM5')).toBe(false)
  })
})
