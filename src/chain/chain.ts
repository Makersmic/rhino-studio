/**
 * Process chains (docs/design-process-chain.md): one placement, several stages, each on its own tool, with the pauses and
 * tool swaps worked out for you. Plain functions, tested without a screen (chain.test.ts); the screens stay thin.
 *
 * One rule decides everything: a new job starts wherever the tool changes, because SWAP_TOOL refuses during a job.
 * A manual stage (place the sheet) with the same tool on both sides is a pause inside the job; any other manual stage
 * runs between jobs. This build covers order A (print, then laser). A print after a laser, knife or spindle stage
 * needs the machine to keep Z homed and a touch check (the proposal's order B), so it is refused with that reason.
 */
import type { Check } from '@/slicer/check'

export type StageKind = 'print' | 'manual' | 'laser' | 'knife' | 'cnc'
/** fixtures and place are pinned; features is the print that goes on the placed material; work is any other tool stage */
export type StageRole = 'fixtures' | 'place' | 'features' | 'work'

export interface Stage {
  id: number
  kind: StageKind
  role: StageRole
  /** "Print fixtures", "Engrave" */
  what: string
  /** the toolhead's name; manual stages have none */
  tool: string | null
}

export type PresetId = 'sheet-print-laser' | 'print-laser'

/** A job file the chain made: its plain file name, the tool it needs and the stages it covers */
export interface ChainJob {
  file: string
  tool: string
  stages: number[]
}

/** What Studio builds and the Portal stores (rhino/chains.py checks it again) */
export interface Chain {
  name: string
  preset: PresetId
  /** the sheet's measured thickness in mm (null until measured; only chains with a place stage need it) */
  thickness: number | null
  stages: Stage[]
  /** the job files, once Studio has written them */
  jobs: ChainJob[]
}

/** A chain as the Portal keeps it */
export interface SavedChain extends Chain {
  id: string
  created: number
  updated: number
  /** the revision a save must start from */
  rev: number
}

export const PRESETS: { id: PresetId; label: string; blurb: string }[] = [
  { id: 'sheet-print-laser', label: 'Sheet + print + laser', blurb: 'Print fixtures, place a sheet, print features on it, then laser it.' },
  { id: 'print-laser', label: 'Print + laser', blurb: 'Print a part, then laser it.' },
]

/** thickness limits a sheet may have: below, it is a measuring slip; above, the bed can't be back off far enough */
export const SHEET_MIN = 0.2
export const SHEET_MAX = 20

export function presetStages(preset: PresetId, tools: { print: string; laser: string }): Stage[] {
  const s = (id: number, kind: StageKind, role: StageRole, what: string, tool: string | null): Stage => ({ id, kind, role, what, tool })
  return preset === 'sheet-print-laser'
    ? [
        s(1, 'print', 'fixtures', 'Print fixtures', tools.print),
        s(2, 'manual', 'place', 'Place the sheet', null),
        s(3, 'print', 'features', 'Print features', tools.print),
        s(4, 'laser', 'work', 'Laser', tools.laser),
      ]
    : [s(1, 'print', 'features', 'Print', tools.print), s(2, 'laser', 'work', 'Laser', tools.laser)]
}

export const newChain = (name: string, preset: PresetId, tools: { print: string; laser: string }): Chain => ({
  name,
  preset,
  thickness: null,
  stages: presetStages(preset, tools),
  jobs: [],
})

// ---- order rules

/** Why a stage can't be moved at all, or null */
export function pinnedReason(s: Stage): string | null {
  if (s.role === 'fixtures') return 'Fixtures print before anything is on the bed.'
  if (s.role === 'place') return 'The sheet is placed right after the fixtures, before anything works on it.'
  return null
}

const isTool = (s: Stage) => s.kind !== 'manual'

/** The first rule an order breaks, or null. Rule numbers follow the proposal. */
export function orderProblem(stages: readonly Stage[]): string | null {
  const fx = stages.findIndex((s) => s.role === 'fixtures')
  if (fx > 0) return 'Fixtures come first.'
  const pl = stages.findIndex((s) => s.role === 'place')
  if (pl >= 0) {
    if (fx >= 0 && pl !== fx + 1) return 'The sheet is placed right after the fixtures.'
    if (stages.slice(0, pl).some((s) => s.role !== 'fixtures')) return 'The sheet is placed before any stage that works on it.'
  }
  const firstOther = stages.findIndex((s) => isTool(s) && s.kind !== 'print')
  if (firstOther >= 0 && stages.slice(firstOther).some((s) => s.kind === 'print'))
    return 'A print after a laser, knife or spindle stage needs the machine to keep Z homed and a touch check, which is not built yet. Put the print first.'
  return null
}

/** Can the stage at `index` move up (-1) or down (+1)? A refused move gives the reason. */
export function moveProblem(stages: readonly Stage[], index: number, dir: -1 | 1): string | null {
  const s = stages[index]
  if (!s) return 'No such stage.'
  const pinned = pinnedReason(s)
  if (pinned) return pinned
  const to = index + dir
  if (to < 0) return 'It is already first.'
  if (to >= stages.length) return 'It is already last.'
  const next = stages.slice()
  next[index] = stages[to]!
  next[to] = s
  return orderProblem(next)
}

export function moveStage(stages: readonly Stage[], index: number, dir: -1 | 1): Stage[] {
  if (moveProblem(stages, index, dir)) return stages.slice()
  const next = stages.slice()
  const to = index + dir
  next[index] = stages[to]!
  next[to] = stages[index]!
  return next
}

// ---- jobs

export interface PlannedJob {
  tool: string
  kind: StageKind
  /** stage ids in run order, including any pause inside the job */
  stages: number[]
  /** manual stages that pause this job */
  pauses: number[]
}
export type Step = { type: 'job'; job: PlannedJob } | { type: 'swap'; to: string } | { type: 'prompt'; stage: number }

/** Walk the stages; a new job wherever the tool changes. */
export function planSteps(stages: readonly Stage[]): Step[] {
  const steps: Step[] = []
  let job: PlannedJob | null = null
  let pending: number[] = []
  const closeJob = () => {
    if (job) steps.push({ type: 'job', job })
  }
  for (const s of stages) {
    if (!isTool(s)) {
      pending.push(s.id)
      continue
    }
    if (job && job.tool === s.tool) {
      job.stages.push(...pending, s.id)
      job.pauses.push(...pending)
    } else {
      closeJob()
      for (const id of pending) steps.push({ type: 'prompt', stage: id })
      if (job) steps.push({ type: 'swap', to: s.tool! })
      job = { tool: s.tool!, kind: s.kind, stages: [s.id], pauses: [] }
    }
    pending = []
  }
  closeJob()
  for (const id of pending) steps.push({ type: 'prompt', stage: id })
  return steps
}

export const jobsOf = (steps: readonly Step[]): PlannedJob[] => steps.flatMap((s) => (s.type === 'job' ? [s.job] : []))
export const swapsOf = (steps: readonly Step[]) => steps.filter((s) => s.type === 'swap').length

/** `front-plate-001_job1_print.gcode`: no spaces or odd characters, because a start wizard takes it as FILE= */
export function jobFileName(chainName: string, n: number, kind: StageKind): string {
  const slug = chainName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chain'
  return `${slug}_job${n}_${kind === 'print' ? 'print' : kind}.gcode`
}

// ---- the chips between cards

export interface Chip {
  /** shown after the card with this stage id */
  after: number
  kind: 'pause' | 'resume' | 'end' | 'swap'
  text: string
}

/** What happens between each two cards. Generated from the order, never edited. No chip where one job simply carries on. */
export function chipsFor(stages: readonly Stage[]): Chip[] {
  const out: Chip[] = []
  const steps = planSteps(stages)
  const paused = new Set(jobsOf(steps).flatMap((j) => j.pauses))
  for (let i = 0; i + 1 < stages.length; i++) {
    const a = stages[i]!
    const b = stages[i + 1]!
    if (!isTool(b) && isTool(a)) {
      out.push(paused.has(b.id) ? { after: a.id, kind: 'pause', text: 'The job pauses' } : { after: a.id, kind: 'end', text: 'The job ends, parts stay on the plate' })
    } else if (!isTool(a)) {
      if (paused.has(a.id)) out.push({ after: a.id, kind: 'resume', text: 'Resume, same job' })
      else out.push(swapChip(stages[i - 1], b, a.id))
    } else if (a.tool !== b.tool) {
      out.push(swapChip(a, b, a.id))
    }
  }
  return out
}

function swapChip(from: Stage | undefined, to: Stage, after: number): Chip {
  // SWAP_TOOL's own prompt: "The machine cools down and lowers the bed first."
  const cools = from?.kind === 'print' ? ' · the machine cools down and lowers the bed' : ''
  return { after, kind: 'swap', text: `Swap to ${to.tool}${cools}` }
}

// ---- checks

export interface ChainContext {
  /** toolhead names the machine has */
  tools: ReadonlySet<string>
}

/** The checks under the stage column: a sentence each, an error only if it blocks the start */
export function chainChecks(chain: Chain, ctx: ChainContext): Check[] {
  const out: Check[] = []
  const ok = (id: string, label: string) => out.push({ id, level: 'ok', label })
  const bad = (id: string, label: string, detail: string) => out.push({ id, level: 'error', label, detail })

  const order = orderProblem(chain.stages)
  order ? bad('order', 'The stages are in a safe order', order) : ok('order', 'The stages are in a safe order')

  const missing = [...new Set(chain.stages.filter((s) => s.tool && !ctx.tools.has(s.tool)).map((s) => s.tool!))]
  missing.length
    ? bad('tools', 'Every tool is on this machine', `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not in the machine's tool list.`)
    : ok('tools', 'Every tool is on this machine')

  if (chain.stages.some((s) => s.role === 'place')) {
    const t = chain.thickness
    if (t == null || !Number.isFinite(t) || t < SHEET_MIN || t > SHEET_MAX)
      bad('thickness', 'The sheet is measured', `Measure the sheet and enter its thickness, between ${SHEET_MIN} and ${SHEET_MAX} mm. The features print that far above the bed.`)
    else ok('thickness', `The sheet is ${t} mm thick`)
  }

  const steps = planSteps(chain.stages)
  ok('jobs', `${jobsOf(steps).length} job${jobsOf(steps).length === 1 ? '' : 's'}, ${swapsOf(steps)} tool swap${swapsOf(steps) === 1 ? '' : 's'}`)
  return out
}
