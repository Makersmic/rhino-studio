import { describe, expect, it } from 'vitest'
import { formatDuration, notices, operationName, remainingSeconds, type NoticeInput } from './notices'

const base: NoticeInput = {
  online: true,
  klippy: 'ready',
  klippyMessage: null,
  toolState: { kind: 'mounted', slot: 1, name: 'BlockOne', type: 'DEPOSITION' },
  busy: false,
  running: null,
  promptTitle: null,
  job: { state: 'standby', filename: null, progress: null, duration: null, message: null },
  hotend: { temp: 24, target: 0 },
  bed: { temp: 23, target: 0 },
  care: null,
}
const ids = (i: NoticeInput) => notices(i).map((n) => n.id)

describe('dashboard notices', () => {
  it('says Ready when nothing is going on', () => {
    expect(notices(base)).toEqual([{ id: 'ready', tone: 'info', title: 'Ready', detail: 'BlockOne mounted, idle.', to: '/control' }])
  })

  it('offline says only that, so nothing stale looks live', () => {
    const n = notices({ ...base, online: false, job: { ...base.job, state: 'printing' } })
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ id: 'offline', tone: 'alert' })
  })

  it('names the operation and its safety line by tool', () => {
    const laser = notices({
      ...base,
      toolState: { kind: 'mounted', slot: 3, name: 'LightSaber', type: 'LASER' },
      job: { state: 'printing', filename: 'sign.gcode', progress: 0.5, duration: 600, message: null },
    })
    expect(laser[0]!.title).toBe('Laser job running: sign.gcode')
    expect(laser[0]!.detail).toMatch(/50 %.*about 10 min left.*Laser can fire/)
    expect(operationName('CNC')).toBe('Spindle job')
    expect(operationName('DRAG_KNIFE')).toBe('Cut')
    expect(operationName(undefined)).toBe('Job')
  })

  it('shows busy when Klipper is working without a job', () => {
    expect(ids({ ...base, busy: true })).toEqual(['busy'])
    expect(notices({ ...base, running: 'Home all' })[0]!.detail).toBe('Running: Home all')
    expect(ids({ ...base, busy: true, job: { ...base.job, state: 'printing', filename: 'a.gcode' } })).not.toContain('busy')
  })

  it('puts alerts first: questions, unconfirmed tool, paused job, overdue care', () => {
    const n = notices({
      ...base,
      promptTitle: 'Swap toolhead',
      job: { state: 'paused', filename: 'a.gcode', progress: 0.3, duration: 100, message: null },
      hotend: { temp: 150, target: 210 },
      care: { overdue: 1, dueSoon: 0, text: '1 overdue' },
    })
    expect(n.map((x) => [x.id, x.tone])).toEqual([
      ['prompt', 'alert'],
      ['job', 'alert'],
      ['care', 'alert'],
      ['hotend', 'info'],
    ])
    expect(ids({ ...base, toolState: { kind: 'none-confirmed', lastSavedSlot: 1, lastSavedName: 'BlockOne' } })[0]).toBe('tool')
  })

  it('reports heating and still-hot heaters, but no hotend for non-print tools', () => {
    expect(notices({ ...base, hotend: { temp: 120, target: 210 } })[0]!.title).toBe('Heating hotend to 210°')
    expect(notices({ ...base, bed: { temp: 70, target: 0 } })[0]!.title).toBe('Bed still hot: 70°')
    const knife = { ...base, toolState: { kind: 'mounted' as const, slot: 5, name: 'DragKnife', type: 'DRAG_KNIFE' }, hotend: { temp: 200, target: 0 } }
    expect(ids(knife)).toEqual(['ready'])
    expect(notices({ ...knife, hotend: { temp: 40, target: 60 } })[0]).toMatchObject({ id: 'hotend', tone: 'alert' })
  })

  it('formats time and only estimates after 2 %', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(600)).toBe('10 min')
    expect(formatDuration(4380)).toBe('1 h 13 min')
    expect(formatDuration(null)).toBe('—')
    expect(remainingSeconds(0.01, 100)).toBeNull()
    expect(remainingSeconds(0.25, 300)).toBe(900)
  })
})

describe('tool changes on machines that change tools themselves', () => {
  it('stays quiet about routine changes during a job, but not otherwise', async () => {
    const { notices } = await import('./notices')
    const swapping = { kind: 'swapping', fromSlot: 0, toSlot: -1, toName: null } as const
    const running = notices({ ...base, autoTools: true, toolState: swapping, job: { ...base.job, state: "printing" } })
    expect(running.some((n) => n.id === 'tool')).toBe(false)
    const idle = notices({ ...base, autoTools: true, toolState: swapping })
    expect(idle.some((n) => n.id === 'tool')).toBe(true)
  })

  it('a fan that is driven but not turning is a red notice that names it', () => {
    const n = notices({ ...base, stalledFans: [{ name: 'drivers', label: 'Drivers fan', speed: 1 }] })
    const f = n.find((x) => x.id === 'fan-drivers')
    expect(f?.tone).toBe('alert')
    expect(f?.title).toBe("Drivers fan isn't turning")
    expect(f?.detail).toMatch(/100 %/)
  })
})
