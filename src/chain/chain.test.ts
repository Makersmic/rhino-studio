import { describe, expect, it } from 'vitest'
import { chainChecks, chipsFor, jobFileName, jobsOf, moveProblem, moveStage, newChain, orderProblem, planSteps, swapsOf, type Stage } from './chain'

const tools = { print: 'BlockOne', laser: 'LightSaber' }
const full = () => newChain('Front plate 001', 'sheet-print-laser', tools)
const short = () => newChain('Bracket', 'print-laser', tools)

describe('presets', () => {
  it('sheet + print + laser is fixtures, place, features, laser', () => {
    expect(full().stages.map((s) => [s.id, s.kind, s.role])).toEqual([
      [1, 'print', 'fixtures'],
      [2, 'manual', 'place'],
      [3, 'print', 'features'],
      [4, 'laser', 'work'],
    ])
  })
  it('print + laser has two stages', () => expect(short().stages).toHaveLength(2))
})

describe('order rules', () => {
  it('the preset order is fine', () => {
    expect(orderProblem(full().stages)).toBeNull()
    expect(orderProblem(short().stages)).toBeNull()
  })
  it('refuses to move a pinned stage, with the reason', () => {
    expect(moveProblem(full().stages, 0, 1)).toMatch(/before anything is on the bed/)
    expect(moveProblem(full().stages, 1, 1)).toMatch(/right after the fixtures/)
  })
  it('refuses the laser before the print (order B is not built)', () => {
    expect(moveProblem(full().stages, 3, -1)).toMatch(/touch check/)
    expect(moveProblem(short().stages, 1, -1)).toMatch(/touch check/)
    expect(moveProblem(short().stages, 0, 1)).toMatch(/touch check/)
  })
  it('refuses to go past either end', () => {
    expect(moveProblem(full().stages, 3, 1)).toMatch(/last/)
    expect(moveProblem(short().stages, 0, -1)).toMatch(/first/)
  })
  it('moveStage leaves the order alone when the move is refused', () => {
    const a = full().stages
    expect(moveStage(a, 3, -1).map((s) => s.id)).toEqual([1, 2, 3, 4])
  })
  it('catches broken orders handed in from a saved file', () => {
    const [f, p, ft, l] = full().stages as [Stage, Stage, Stage, Stage]
    expect(orderProblem([ft, f, p, l])).toMatch(/Fixtures come first/)
    expect(orderProblem([f, ft, p, l])).toMatch(/right after the fixtures/)
    expect(orderProblem([f, p, l, ft])).toMatch(/touch check/)
  })
  it('moveStage can swap two movable stages when the order allows it', () => {
    const s = (id: number, kind: Stage['kind']): Stage => ({ id, kind, role: 'work', what: kind, tool: kind === 'print' ? 'BlockOne' : 'LightSaber' })
    const a = [s(1, 'print'), s(2, 'print')]
    expect(moveStage(a, 1, -1).map((x) => x.id)).toEqual([2, 1])
  })
})

describe('planSteps: a new job wherever the tool changes', () => {
  it('order A: one print job with the sheet as a pause, a swap, one laser job', () => {
    const steps = planSteps(full().stages)
    expect(steps.map((s) => s.type)).toEqual(['job', 'swap', 'job'])
    const [j1, j2] = jobsOf(steps)
    expect(j1).toEqual({ tool: 'BlockOne', kind: 'print', stages: [1, 2, 3], pauses: [2] })
    expect(j2).toEqual({ tool: 'LightSaber', kind: 'laser', stages: [4], pauses: [] })
    expect(swapsOf(steps)).toBe(1)
  })
  it('print + laser is two jobs and a swap, with no pause', () => {
    const steps = planSteps(short().stages)
    expect(jobsOf(steps).map((j) => j.pauses)).toEqual([[], []])
    expect(steps[1]).toEqual({ type: 'swap', to: 'LightSaber' })
  })
  it('a manual stage before a tool change runs between the jobs', () => {
    const st: Stage[] = [
      { id: 1, kind: 'print', role: 'features', what: 'Print', tool: 'BlockOne' },
      { id: 2, kind: 'manual', role: 'work', what: 'Add inserts', tool: null },
      { id: 3, kind: 'laser', role: 'work', what: 'Laser', tool: 'LightSaber' },
    ]
    expect(planSteps(st).map((s) => s.type)).toEqual(['job', 'prompt', 'swap', 'job'])
  })
  it('a leading or trailing manual stage is a prompt outside any job', () => {
    const m = (id: number): Stage => ({ id, kind: 'manual', role: 'work', what: 'Check', tool: null })
    const p: Stage = { id: 5, kind: 'print', role: 'features', what: 'Print', tool: 'BlockOne' }
    expect(planSteps([m(1), p, m(2)]).map((s) => s.type)).toEqual(['prompt', 'job', 'prompt'])
  })
  it('two prints in a row with no manual stage are one job', () => {
    const p = (id: number): Stage => ({ id, kind: 'print', role: 'work', what: 'Print', tool: 'BlockOne' })
    expect(jobsOf(planSteps([p(1), p(2)]))).toHaveLength(1)
  })
})

describe('chips between cards', () => {
  it('order A: pause, resume, then a swap that cools and lowers the bed', () => {
    expect(chipsFor(full().stages)).toEqual([
      { after: 1, kind: 'pause', text: 'The job pauses' },
      { after: 2, kind: 'resume', text: 'Resume, same job' },
      { after: 3, kind: 'swap', text: 'Swap to LightSaber · the machine cools down and lowers the bed' },
    ])
  })
  it('print + laser has just the swap', () => expect(chipsFor(short().stages).map((c) => c.kind)).toEqual(['swap']))
  it('a manual stage between jobs ends the job, then swaps', () => {
    const st: Stage[] = [
      { id: 1, kind: 'print', role: 'features', what: 'Print', tool: 'BlockOne' },
      { id: 2, kind: 'manual', role: 'work', what: 'Add inserts', tool: null },
      { id: 3, kind: 'laser', role: 'work', what: 'Laser', tool: 'LightSaber' },
    ]
    expect(chipsFor(st).map((c) => c.kind)).toEqual(['end', 'swap'])
  })
})

describe('checks', () => {
  const ctx = { tools: new Set(['BlockOne', 'LightSaber']) }
  it('blocks until the sheet is measured', () => {
    const c = full()
    expect(chainChecks(c, ctx).find((k) => k.id === 'thickness')?.level).toBe('error')
    for (const bad of [0, -1, 0.1, 25, NaN]) expect(chainChecks({ ...c, thickness: bad }, ctx).find((k) => k.id === 'thickness')?.level).toBe('error')
    expect(chainChecks({ ...c, thickness: 3.1 }, ctx).find((k) => k.id === 'thickness')?.level).toBe('ok')
  })
  it('a chain without a sheet has no thickness check', () => expect(chainChecks(short(), ctx).some((k) => k.id === 'thickness')).toBe(false))
  it('names a tool the machine does not have', () => {
    const k = chainChecks(short(), { tools: new Set(['BlockOne']) }).find((x) => x.id === 'tools')
    expect(k?.level).toBe('error')
    expect(k?.detail).toMatch(/LightSaber/)
  })
  it('summarises jobs and swaps', () => {
    expect(chainChecks({ ...full(), thickness: 3 }, ctx).find((k) => k.id === 'jobs')?.label).toBe('2 jobs, 1 tool swap')
  })
})

describe('job file names', () => {
  it('has no spaces or odd characters, so FILE= takes it', () => {
    expect(jobFileName('Front plate 001', 1, 'print')).toBe('front-plate-001_job1_print.gcode')
    expect(jobFileName('  ', 2, 'laser')).toBe('chain_job2_laser.gcode')
    expect(jobFileName('a/b; M112', 1, 'laser')).toBe('a-b-m112_job1_laser.gcode')
  })
})
