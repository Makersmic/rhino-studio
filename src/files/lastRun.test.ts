import { describe, expect, it } from 'vitest'
import type { HistoryJob } from '@/moonraker/client'
import { describeRun, lastRuns } from './lastRun'

const job = (filename: string, status: string, start: number): HistoryJob => ({
  job_id: String(start),
  filename,
  status,
  start_time: start,
  end_time: start + 60,
  print_duration: 60,
  filament_used: 0,
})

describe('lastRuns', () => {
  it('keeps only the newest job per file, whatever the order', () => {
    const m = lastRuns([job('a.gcode', 'error', 100), job('a.gcode', 'completed', 300), job('a.gcode', 'cancelled', 200)])
    expect(m.get('a.gcode')?.kind).toBe('completed')
  })

  it('files never run have no entry', () => {
    expect(lastRuns([job('a.gcode', 'completed', 1)]).has('b.gcode')).toBe(false)
  })

  it('ignores junk rows', () => {
    expect(lastRuns([{} as HistoryJob]).size).toBe(0)
  })
})

describe('describeRun', () => {
  it('maps Moonraker statuses to one word', () => {
    expect(describeRun(job('a', 'completed', 1)).label).toBe('Completed')
    expect(describeRun(job('a', 'cancelled', 1)).label).toBe('Cancelled')
    expect(describeRun(job('a', 'in_progress', 1)).kind).toBe('running')
    for (const s of ['error', 'klippy_shutdown', 'klippy_disconnect', 'server_exit', 'interrupted', 'weird']) {
      expect(describeRun(job('a', s, 1)).kind).toBe('failed')
    }
  })

  it('uses the start time while a job has no end time', () => {
    expect(describeRun({ ...job('a', 'in_progress', 50), end_time: null }).at).toBe(50)
  })
})
