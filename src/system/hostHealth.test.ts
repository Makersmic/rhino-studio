import { describe, expect, it } from 'vitest'
import { bytes, coreSummary, sparkPath, coreTemp, duration, findings, mcuStats, procSample, pushSample, report, splitSensors, type HostStats, type ProcSample } from './hostHealth'

const sample = (t: number, cores: number[]): ProcSample => ({ t, cores, total: null, memUsedPct: null, cpuTemp: null })

function stats(over: Partial<HostStats> = {}): HostStats {
  return {
    ok: true, uptime: 90000,
    cpu: { model: 'i5-7500T', cores: [0, 1, 2, 3].map((id) => ({ id, mhz: 2700 })), governor: 'performance', online: '0-3', isolated: '' },
    sensors: [
      { chip: 'coretemp', label: 'Core 1', c: 48, high: 100, crit: 100 },
      { chip: 'coretemp', label: 'Package id 0', c: 50, high: 100, crit: 100 },
      { chip: 'coretemp', label: 'Core 0', c: 47, high: 100, crit: 100 },
      { chip: 'nvme', label: 'Composite', c: 40, high: 81.8, crit: 84.8 },
    ],
    load: [0.5, 0.4, 0.3], pressure: { cpu: { some: 0, full: 0 }, io: { some: 0, full: 0 } },
    memory: { total: 8e9, available: 6e9, swap_total: 1e9, swap_free: 1e9 },
    disks: [{ label: 'System disk', path: '/', total: 128e9, free: 100e9 }],
    processes: { cpus: 4, own: [{ name: 'Klipper', pids: [10], cpu: 12, rss: 50e6, core: 3, allowed: '3', nice: 0, threads: 4 }], others: [] },
    ...over,
  }
}

describe('proc samples', () => {
  it('reads per-core load in core order, and memory used', () => {
    const s = procSample({ system_cpu_usage: { cpu: 20, cpu10: 1, cpu1: 30, cpu0: 10 }, system_memory: { total: 1000, available: 250 }, cpu_temp: 44 }, 5)
    expect(s).toEqual({ t: 5, cores: [10, 30, 1], total: 20, memUsedPct: 75, cpuTemp: 44 })
    expect(procSample({}, 1)).toBeNull()
  })
  it('keeps only the last ten minutes and replaces a same-time sample', () => {
    let l: ProcSample[] = []
    for (let i = 0; i <= 700; i++) l = pushSample(l, sample(i * 1000, [i]))
    expect(l[0]!.t).toBe(100_000)
    expect(l.length).toBe(601)
    l = pushSample(l, sample(700_000, [99]))
    expect(l.length).toBe(601)
    expect(l[l.length - 1]!.cores[0]).toBe(99)
  })
  it('summarises a core', () => {
    expect(coreSummary([sample(1, [10, 0]), sample(2, [30, 0])], 0)).toEqual({ avg: 20, peak: 30 })
    expect(coreSummary([], 0)).toEqual({ avg: null, peak: null })
  })
})

describe('sensors', () => {
  it('puts the package first, then cores in order, and finds a core by number', () => {
    const { cpu, other } = splitSensors(stats().sensors)
    expect(cpu.map((s) => s.label)).toEqual(['Package id 0', 'Core 0', 'Core 1'])
    expect(other.map((s) => s.chip)).toEqual(['nvme'])
    expect(coreTemp(cpu, 1)?.c).toBe(48)
    expect(coreTemp(cpu, 3)).toBeNull()
  })
})

describe('boards', () => {
  it("works out Mainsail's load and awake, and names the main board", () => {
    const b = mcuStats('mcu', { mcu_task_avg: 0.0001, mcu_task_stddev: 0.0001, mcu_awake: 0.5, bytes_retransmit: 9, srtt: 0.0012, freq: 180e6 })
    expect(b.name).toBe('Main board')
    expect(b.load).toBeCloseTo(16)
    expect(b.awake).toBeCloseTo(10)
    expect(b.srttMs).toBeCloseTo(1.2)
    expect(b.freqMHz).toBe(180)
    expect(mcuStats('mcu ebb', null)).toMatchObject({ name: 'ebb', load: null, retransmit: 0 })
  })
})

describe('findings', () => {
  const base = { samples: [], mcus: [], mcuBase: {}, services: null }
  it('says nothing when everything reads normal', () => {
    expect(findings({ ...base, stats: stats() })).toEqual([])
  })
  it('flags a hot core, a near-shutdown one first', () => {
    const f = findings({ ...base, stats: stats({ sensors: [{ chip: 'coretemp', label: 'Core 2', c: 86, high: 100, crit: 100 }, { chip: 'coretemp', label: 'Core 3', c: 97, high: 100, crit: 100 }] }) })
    expect(f.map((x) => x.tone)).toEqual(['danger', 'warn'])
    expect(f[0]!.text).toContain('Core 3')
  })
  it('flags a core busy for a minute, but not a short burst', () => {
    const busy = Array.from({ length: 60 }, (_, i) => sample(i * 1000, [95, 5]))
    expect(findings({ ...base, stats: null, samples: busy })[0]!.text).toMatch(/^Core 0 has averaged 95 %/)
    expect(findings({ ...base, stats: null, samples: busy.slice(0, 5) })).toEqual([])
  })
  it('flags low disk, low memory, swap, pressure, no Klipper', () => {
    const f = findings({
      ...base,
      stats: stats({
        disks: [{ label: 'printer_data', path: '/x', total: 128e9, free: 1e9 }],
        memory: { total: 8e9, available: 0.5e9, swap_total: 1e9, swap_free: 0.5e9 },
        pressure: { cpu: { some: 25 }, io: { full: 9 } },
        processes: { cpus: 4, own: [], others: [] },
      }),
    }).map((x) => x.text)
    expect(f[0]).toBe('Klipper is not running on the host.')
    expect(f.join('\n')).toMatch(/printer_data has only 1.0 GB free/)
    expect(f.join('\n')).toMatch(/500 MB of memory/)
    expect(f.join('\n')).toMatch(/moved to swap/)
    expect(f.join('\n')).toMatch(/waited for a free core 25 %/)
    expect(f.join('\n')).toMatch(/waited on the disk 9 %/)
  })
  it('flags a busy board, resends since the page opened, and a stopped service', () => {
    const f = findings({
      ...base, stats: null,
      mcus: [mcuStats('mcu', { mcu_task_avg: 0.001, mcu_task_stddev: 0.0002, bytes_retransmit: 120 })],
      mcuBase: { 'Main board': 100 },
      services: { klipper: { active_state: 'active' }, crowsnest: { active_state: 'failed', sub_state: 'failed' } },
    }).map((x) => x.text)
    expect(f).toEqual(['The crowsnest service is failed (failed).', 'Main board is 64 % loaded.', 'Main board: 20 bytes resent since this page opened. Check its USB cable.'])
  })
})

describe('report', () => {
  it('writes everything as text', () => {
    const t = report({ samples: [sample(0, [10, 20])], stats: stats(), mcus: [mcuStats('mcu', { mcu_task_avg: 0.0001, mcu_task_stddev: 0 })], mcuBase: {}, services: { klipper: { active_state: 'active', sub_state: 'running' } }, when: new Date(0), version: '0.18.1', klipper: { sysload: 0.4, cputime: 12.34, memavail: 4000000 } })
    expect(t).toContain('Nothing out of the ordinary.')
    expect(t).toContain('core 1: 20 % / 20 % / 20 %')
    expect(t).toContain('Klipper [10]: 12 %, 50 MB, core 3, cores 3, nice 0')
    expect(t).toContain('Klipper: sysload 0.4, cputime 12.3 s, memavail 4.1 GB')
    expect(t).toContain('Service klipper: active (running)')
    expect(t).toContain('Up for 1 d 1 h')
  })
})

describe('formatting', () => {
  it('formats sizes and times', () => {
    expect(bytes(950)).toBe('950 B')
    expect(bytes(1.5e9)).toBe('1.5 GB')
    expect(bytes(null)).toBe('—')
    expect(duration(59 * 60)).toBe('59 min')
    expect(duration(3 * 3600 + 120)).toBe('3 h 2 min')
  })
})

describe('sparkPath', () => {
  it('draws newest at the right, 100 % at the top, and skips what is out of span', () => {
    const l = [sample(0, [50]), sample(1000, [0]), sample(2000, [100])]
    expect(sparkPath(l, (s) => s.cores[0], 1000, 10, 10)).toBe('M0.0 10.0L10.0 0.0')
    expect(sparkPath([], (s) => s.cores[0], 1000, 10, 10)).toBe('')
  })
})
