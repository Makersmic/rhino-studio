/**
 * Running a chain (Wizards > Run a chain): what the wizard shows next, worked out from what the machine says. Plain functions, tested
 * without a screen (run.test.ts). Nothing here sends anything: each step only says which button may be offered, and the buttons use
 * the existing swap, start and resume paths with their own confirmations (stores/control.ts, the laser start wizard).
 *
 * Progress is never stored. A job is done when Moonraker's job history says its file completed since the run began, the tool in
 * Klipper is the mounted tool, and a job's state comes from print_stats. Reloading, or coming back from the laser start wizard,
 * works out the same step.
 */
import type { HistoryJob } from '@/moonraker/client'
import { jobFileName, jobsOf, planSteps, type Chain, type StageKind } from './chain'

/** Machine check CH14 (docs/testing.md) has not been reported as passed: a laser file with travel lifts is refused. Flip only when Mike reports it. */
export const LIFTS_PROVEN = false

export interface RunJob {
  n: number
  file: string
  tool: string
  kind: StageKind
  /** the file pauses once for the sheet (a manual stage inside the job) */
  pauses: boolean
  /** Studio built this job's file (it is in the chain's jobs) */
  built: boolean
}

/** The chain's jobs in run order, with the file each is saved as */
export function runJobs(chain: Pick<Chain, 'name' | 'stages' | 'jobs'>): RunJob[] {
  return jobsOf(planSteps(chain.stages)).map((j, i) => {
    const saved = chain.jobs.find((s) => s.stages.length === j.stages.length && s.stages.every((id, k) => id === j.stages[k]))
    return { n: i + 1, file: saved?.file ?? jobFileName(chain.name, i + 1, j.kind), tool: j.tool, kind: j.kind, pauses: j.pauses.length > 0, built: !!saved }
  })
}

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)

export type JobProgress = 'todo' | 'running' | 'paused' | 'done' | 'failed'

export interface Live {
  /** print_stats.state: standby, printing, paused, complete, cancelled, error */
  state: string | null
  /** print_stats.filename */
  file: string | null
}

/** Where one job's file stands: the live state first, then the newest history entry since the run began */
export function progressOf(file: string, history: readonly HistoryJob[], since: number, live: Live): { progress: JobProgress; status?: string } {
  if (live.file && base(live.file) === base(file) && (live.state === 'printing' || live.state === 'paused')) return { progress: live.state === 'paused' ? 'paused' : 'running' }
  const mine = history.filter((h) => base(h.filename) === base(file) && h.start_time >= since).sort((a, b) => b.start_time - a.start_time)[0]
  if (!mine) return { progress: 'todo' }
  if (mine.status === 'completed') return { progress: 'done' }
  if (mine.status === 'in_progress') return { progress: 'running', status: mine.status }
  return { progress: 'failed', status: mine.status }
}

export type RunStep =
  | { kind: 'blocked'; job: RunJob; why: string }
  | { kind: 'swap'; job: RunJob; to: string }
  | { kind: 'start'; job: RunJob }
  | { kind: 'running'; job: RunJob }
  | { kind: 'place'; job: RunJob }
  | { kind: 'paused'; job: RunJob }
  | { kind: 'failed'; job: RunJob; status: string }
  | { kind: 'finished' }

export interface RunInput {
  jobs: readonly RunJob[]
  history: readonly HistoryJob[]
  /** when the run began (seconds, Moonraker's clock); older history is not this run's */
  since: number
  live: Live
  /** the files in the Rhino's gcodes folder */
  onRhino: ReadonlySet<string>
  /** the tool Klipper says is mounted and confirmed, or null */
  mounted: string | null
  klippyReady: boolean
  /** each job file's `rhino_chain_lift` header seen (true), not seen (false), or not read yet (undefined) */
  hasLifts: ReadonlyMap<string, boolean>
}

/** A laser file with travel lifts waits for machine check CH14. Two layers: the chain's own header, and this. */
export const LIFT_BLOCK = 'This laser file lifts the head over the printed features, which has not been proven on the machine. Travel lifts wait for machine check CH14.'

export function nextStep(i: RunInput): RunStep {
  const prog = i.jobs.map((j) => ({ j, ...progressOf(j.file, i.history, i.since, i.live) }))
  const cur = prog.find((p) => p.progress !== 'done')
  if (!cur) return { kind: 'finished' }
  const { j } = cur
  if (cur.progress === 'failed') return { kind: 'failed', job: j, status: cur.status ?? 'failed' }
  if (cur.progress === 'paused') return j.pauses && j.kind === 'print' ? { kind: 'place', job: j } : { kind: 'paused', job: j }
  if (cur.progress === 'running') return { kind: 'running', job: j }
  const blocked = (why: string): RunStep => ({ kind: 'blocked', job: j, why })
  if (!j.built) return blocked(`Job ${j.n} has no file yet. Build the job files on the chain screen first.`)
  if (!i.klippyReady) return blocked('Klipper is not ready.')
  if (i.live.state === 'printing' || i.live.state === 'paused') return blocked('Another job is running. Wait for it, or cancel it from Control.')
  if (!i.onRhino.has(j.file)) return blocked(`${j.file} is not on the Rhino. Send it from the chain screen.`)
  if (j.kind === 'laser') {
    const lifts = i.hasLifts.get(j.file)
    if (lifts === undefined) return blocked('Reading the file…')
    if (lifts && !LIFTS_PROVEN) return blocked(LIFT_BLOCK)
  }
  if (i.mounted !== j.tool) return { kind: 'swap', job: j, to: j.tool }
  return { kind: 'start', job: j }
}

/** Does the start of a file carry the chain's lift header? (what this wizard refuses until CH14 passes) */
export const fileHasLifts = (headText: string): boolean => /^;\s*rhino_chain_(lift|features)\s*=/m.test(headText) || /;RHINO_CHAIN lift\b/.test(headText)
