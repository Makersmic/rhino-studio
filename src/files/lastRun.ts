/**
 * How each file's most recent job ended, from Moonraker's job history.
 * Pure helpers: FilesView reads the history, this turns it into one word per file.
 */
import type { HistoryJob } from '@/moonraker/client'

export type LastRunKind = 'completed' | 'cancelled' | 'failed' | 'running'

export interface LastRun {
  kind: LastRunKind
  /** Short word for the column */
  label: string
  /** When it ended (or started, while running), seconds since epoch */
  at: number
  /** Longer text for the tooltip */
  detail: string
}

const FAILED: Record<string, string> = {
  error: 'Stopped with an error',
  klippy_shutdown: 'Klipper shut down during the job',
  klippy_disconnect: 'Klipper disconnected during the job',
  server_exit: 'Moonraker stopped during the job',
  interrupted: 'Interrupted (the host restarted)',
}

export function describeRun(job: HistoryJob): LastRun {
  const at = job.end_time ?? job.start_time
  if (job.status === 'completed') return { kind: 'completed', label: 'Completed', at, detail: 'Finished normally' }
  if (job.status === 'cancelled') return { kind: 'cancelled', label: 'Cancelled', at, detail: 'Cancelled before it finished' }
  if (job.status === 'in_progress') return { kind: 'running', label: 'Running', at, detail: 'Running now' }
  return { kind: 'failed', label: 'Failed', at, detail: FAILED[job.status] ?? `Ended: ${job.status}` }
}

/**
 * filename -> its newest job. Moonraker filenames are relative to the gcodes
 * root, the same as the Files list paths. Order of the input doesn't matter.
 */
export function lastRuns(jobs: readonly HistoryJob[]): Map<string, LastRun> {
  const newest = new Map<string, HistoryJob>()
  for (const j of jobs) {
    if (!j?.filename) continue
    const cur = newest.get(j.filename)
    if (!cur || j.start_time > cur.start_time) newest.set(j.filename, j)
  }
  return new Map([...newest].map(([f, j]) => [f, describeRun(j)]))
}
