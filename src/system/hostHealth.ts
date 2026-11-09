/**
 * Settings › Host health: how hard the host and the boards are working, and whether anything is off.
 *
 * Three sources, all read only:
 * - Moonraker's notify_proc_stat_update, once a second: the load on each core, memory, its CPU temperature.
 * - The Portal's GET /api/host/stats (Tool Manager 1.9.19): every temperature sensor (one per core on the 7050),
 *   core clocks, pressure stall, swap, free space and the Rhino's own programs with the cores they run on.
 * - Klipper's system_stats and each mcu's last_stats (printer.objects.query): the host as Klipper sees it, and how
 *   busy each board is. A busy or retransmitting board is what "Timer too close" and "Lost communication" grow from.
 *
 * The limits below say when a reading is worth a look; they inform, they never stop anything.
 */

// ---- Portal snapshot ---------------------------------------------------------

export interface HostSensor { chip: string; label: string; c: number; high: number | null; crit: number | null }
export interface HostProc { name: string; pids: number[]; cpu: number | null; rss: number; core: number; allowed: string | null; nice: number; threads: number }
export interface HostStats {
  ok: boolean
  uptime: number | null
  cpu: { model: string | null; cores: { id: number; mhz: number | null }[]; governor: string | null; online: string | null; isolated: string }
  sensors: HostSensor[]
  load: [number, number, number] | null
  pressure: Partial<Record<'cpu' | 'memory' | 'io', { some?: number; full?: number }>> | null
  memory: { total: number | null; available: number | null; swap_total: number | null; swap_free: number | null }
  disks: { label: string; path: string; total: number; free: number }[]
  processes: { cpus: number; own: HostProc[]; others: HostProc[] }
}

// ---- Moonraker proc stats ----------------------------------------------------

export interface ProcSample { t: number; cores: (number | null)[]; total: number | null; memUsedPct: number | null; cpuTemp: number | null }

/** One notify_proc_stat_update as a sample: per-core load in core order (cpu0, cpu1, ...). */
export function procSample(st: unknown, t: number): ProcSample | null {
  const s = st as { system_cpu_usage?: Record<string, number>; system_memory?: { total?: number; available?: number }; cpu_temp?: number | null } | null
  const u = s?.system_cpu_usage
  if (!u || typeof u !== 'object') return null
  const cores = Object.keys(u)
    .filter((k) => /^cpu\d+$/.test(k))
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
    .map((k) => num(u[k]))
  const m = s?.system_memory
  const memUsedPct = m?.total && m.available != null ? ((m.total - m.available) / m.total) * 100 : null
  return { t, cores, total: typeof u.cpu === 'number' ? u.cpu : null, memUsedPct, cpuTemp: typeof s?.cpu_temp === 'number' ? s.cpu_temp : null }
}

/** Keep the last `seconds` of samples. */
export function pushSample(list: ProcSample[], s: ProcSample, seconds = 600): ProcSample[] {
  const prev = list[list.length - 1]
  const out = prev && prev.t >= s.t ? list.slice(0, -1) : list.slice()
  out.push(s)
  const cut = s.t - seconds * 1000
  let i = 0
  while (i < out.length && out[i]!.t < cut) i++
  return i ? out.slice(i) : out
}

/** Average and peak of one core (or the total when core is null) over the samples. */
export function coreSummary(list: ProcSample[], core: number | null): { avg: number | null; peak: number | null } {
  const v = list.map((s) => (core == null ? s.total : s.cores[core])).filter((x): x is number => typeof x === 'number')
  if (!v.length) return { avg: null, peak: null }
  return { avg: v.reduce((a, b) => a + b, 0) / v.length, peak: Math.max(...v) }
}

// ---- Temperatures --------------------------------------------------------------

/** The CPU's own sensors (coretemp / k10temp): the package first, then cores in order. Anything else is "other". */
export function splitSensors(sensors: HostSensor[]): { cpu: HostSensor[]; other: HostSensor[] } {
  const isCpu = (s: HostSensor) => /^(coretemp|k10temp|zenpower|cpu_thermal|soc_thermal)$/.test(s.chip)
  const rank = (s: HostSensor) => (/package|tctl|tdie/i.test(s.label) ? -1 : Number(/(\d+)\s*$/.exec(s.label)?.[1] ?? 999))
  return { cpu: sensors.filter(isCpu).sort((a, b) => rank(a) - rank(b)), other: sensors.filter((s) => !isCpu(s)) }
}

/** The temperature for core n: coretemp's "Core n" label. Hyper-threaded CPUs share a core's sensor between two. */
export function coreTemp(cpu: HostSensor[], core: number): HostSensor | null {
  return cpu.find((s) => new RegExp(`^core\\s*${core}$`, 'i').test(s.label)) ?? null
}

// ---- Klipper's side --------------------------------------------------------------

export interface McuStats {
  name: string
  /** % of the time the board's processor is awake */
  awake: number | null
  /** Mainsail's "load": (task average + 3 × spread) / 2.5 ms, as % */
  load: number | null
  retransmit: number
  invalid: number
  /** round-trip time, ms */
  srttMs: number | null
  freqMHz: number | null
}

export function mcuStats(name: string, last: Record<string, unknown> | null | undefined): McuStats {
  const l = last ?? {}
  const avg = num(l.mcu_task_avg), sd = num(l.mcu_task_stddev), aw = num(l.mcu_awake)
  return {
    name: name === 'mcu' ? 'Main board' : name.replace(/^mcu\s+/, ''),
    awake: aw == null ? null : (aw / 5) * 100,
    load: avg == null || sd == null ? null : ((avg + 3 * sd) / 0.0025) * 100,
    retransmit: num(l.bytes_retransmit) ?? 0,
    invalid: num(l.bytes_invalid) ?? 0,
    srttMs: num(l.srtt) == null ? null : (num(l.srtt) as number) * 1000,
    freqMHz: num(l.freq) == null ? null : (num(l.freq) as number) / 1e6,
  }
}

// ---- What deserves a look ----------------------------------------------------------

export interface Finding { tone: 'warn' | 'danger'; text: string }

export const LIMITS = {
  coreTempWarn: 85, // °C, or 10 °C under the sensor's own high mark if that is lower
  coreLoadWarn: 90, // % average over the last minute
  mcuLoadWarn: 60, // %
  diskFreeWarnPct: 10,
  diskFreeWarnBytes: 2e9,
  memAvailWarnPct: 10,
  cpuPressureWarn: 10, // % of the last 10 s that tasks waited for a core
  ioPressureWarn: 5, // % of the last 10 s that every task waited for the disk
  driveTempWarn: 65,
}

export interface HealthInput {
  samples: ProcSample[]
  stats: HostStats | null
  mcus: McuStats[]
  /** retransmit counts when the page opened, by board name */
  mcuBase: Record<string, number>
  services: Record<string, { active_state?: string; sub_state?: string }> | null
}

/** Plain-language findings, most serious first. Empty means everything read normal. */
export function findings(h: HealthInput): Finding[] {
  const out: Finding[] = []
  const minute = h.samples.filter((s) => s.t >= (h.samples[h.samples.length - 1]?.t ?? 0) - 60_000)
  const nCores = h.samples[h.samples.length - 1]?.cores.length ?? 0
  for (let i = 0; i < nCores; i++) {
    const { avg } = coreSummary(minute, i)
    if (avg != null && minute.length >= 10 && avg >= LIMITS.coreLoadWarn) out.push({ tone: 'warn', text: `Core ${i} has averaged ${Math.round(avg)} % busy over the last minute.` })
  }
  const st = h.stats
  if (st) {
    const { cpu, other } = splitSensors(st.sensors)
    for (const s of cpu) {
      const lim = Math.min(LIMITS.coreTempWarn, s.high ? s.high - 10 : Infinity)
      if (s.crit && s.c >= s.crit - 5) out.push({ tone: 'danger', text: `${s.label} is at ${s.c} °C, close to its shutdown limit of ${s.crit} °C.` })
      else if (s.c >= lim) out.push({ tone: 'warn', text: `${s.label} is at ${s.c} °C. Check the host's vents and fan.` })
    }
    for (const s of other) if (/nvme|drivetemp/.test(s.chip) && s.c >= LIMITS.driveTempWarn) out.push({ tone: 'warn', text: `The drive is at ${s.c} °C.` })
    for (const d of st.disks) {
      if ((d.total && (d.free / d.total) * 100 < LIMITS.diskFreeWarnPct) || d.free < LIMITS.diskFreeWarnBytes)
        out.push({ tone: 'warn', text: `${d.label} has only ${bytes(d.free)} free.` })
    }
    const m = st.memory
    if (m.total && m.available != null && (m.available / m.total) * 100 < LIMITS.memAvailWarnPct) out.push({ tone: 'warn', text: `Only ${bytes(m.available)} of memory is free.` })
    if (m.swap_total && m.swap_free != null && m.swap_total - m.swap_free > 64e6) out.push({ tone: 'warn', text: `${bytes(m.swap_total - m.swap_free)} has been moved to swap: the host has run short of memory.` })
    const p = st.pressure
    if (p?.cpu?.some != null && p.cpu.some >= LIMITS.cpuPressureWarn) out.push({ tone: 'warn', text: `Programs waited for a free core ${p.cpu.some} % of the last 10 seconds.` })
    if (p?.io?.full != null && p.io.full >= LIMITS.ioPressureWarn) out.push({ tone: 'warn', text: `Everything waited on the disk ${p.io.full} % of the last 10 seconds.` })
    const kl = st.processes.own.find((g) => g.name === 'Klipper')
    if (!kl) out.push({ tone: 'danger', text: 'Klipper is not running on the host.' })
  }
  for (const b of h.mcus) {
    if (b.load != null && b.load >= LIMITS.mcuLoadWarn) out.push({ tone: 'warn', text: `${b.name} is ${Math.round(b.load)} % loaded.` })
    const base = h.mcuBase[b.name]
    if (base != null && b.retransmit > base) out.push({ tone: 'warn', text: `${b.name}: ${b.retransmit - base} bytes resent since this page opened. Check its USB cable.` })
  }
  for (const [name, s] of Object.entries(h.services ?? {})) {
    if (s.active_state && s.active_state !== 'active') out.push({ tone: 'danger', text: `The ${name} service is ${s.active_state}${s.sub_state ? ` (${s.sub_state})` : ''}.` })
  }
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1))
}

// ---- Report for a problem ---------------------------------------------------------

/** Everything on the page as plain text, to paste into a message or a note. */
export function report(h: HealthInput & { when: Date; version: string; klipper?: { sysload?: number; cputime?: number; memavail?: number } | null }): string {
  const L: string[] = [`Rhino host health, ${h.when.toISOString()} (Studio ${h.version})`]
  const f = findings(h)
  L.push(f.length ? 'Worth a look:' : 'Nothing out of the ordinary.')
  for (const x of f) L.push(`  - ${x.text}`)
  const last = h.samples[h.samples.length - 1]
  if (last) {
    L.push('', 'Core load (now / 10-min average / peak):')
    last.cores.forEach((v, i) => {
      const s = coreSummary(h.samples, i)
      L.push(`  core ${i}: ${pct(v)} / ${pct(s.avg)} / ${pct(s.peak)}`)
    })
  }
  const st = h.stats
  if (st) {
    L.push('', `CPU: ${st.cpu.model ?? '?'}, governor ${st.cpu.governor ?? '?'}, online ${st.cpu.online ?? '?'}, isolated ${st.cpu.isolated || 'none'}`)
    L.push(`  clocks: ${st.cpu.cores.map((c) => `${c.id}:${c.mhz ?? '?'} MHz`).join(', ')}`)
    if (st.load) L.push(`Load average: ${st.load.join(' ')}`)
    if (st.pressure) L.push(`Pressure (avg10): ${Object.entries(st.pressure).map(([k, v]) => `${k} some ${v?.some ?? '-'} full ${v?.full ?? '-'}`).join('; ')}`)
    L.push(`Memory: ${bytes(st.memory.available)} free of ${bytes(st.memory.total)}; swap ${bytes((st.memory.swap_total ?? 0) - (st.memory.swap_free ?? 0))} used of ${bytes(st.memory.swap_total)}`)
    for (const d of st.disks) L.push(`Disk ${d.label} (${d.path}): ${bytes(d.free)} free of ${bytes(d.total)}`)
    L.push('Temperatures:')
    for (const s of st.sensors) L.push(`  ${s.chip} ${s.label}: ${s.c} °C${s.high ? ` (high ${s.high})` : ''}${s.crit ? ` (crit ${s.crit})` : ''}`)
    L.push('Programs (CPU % of one core, memory, last core, allowed cores, nice):')
    for (const g of [...st.processes.own, ...st.processes.others]) L.push(`  ${g.name} [${g.pids.join(',')}]: ${g.cpu ?? '-'} %, ${bytes(g.rss)}, core ${g.core}, cores ${g.allowed ?? '?'}, nice ${g.nice}`)
    if (st.uptime != null) L.push(`Up for ${duration(st.uptime)}`)
  }
  if (h.klipper) L.push(`Klipper: sysload ${h.klipper.sysload ?? '-'}, cputime ${h.klipper.cputime?.toFixed?.(1) ?? '-'} s, memavail ${h.klipper.memavail != null ? bytes(h.klipper.memavail * 1024) : '-'}`)
  for (const b of h.mcus) L.push(`Board ${b.name}: load ${pct(b.load)}, awake ${pct(b.awake)}, resent ${b.retransmit} B, invalid ${b.invalid} B, round trip ${b.srttMs?.toFixed(2) ?? '-'} ms, clock ${b.freqMHz?.toFixed(1) ?? '-'} MHz`)
  for (const [n, s] of Object.entries(h.services ?? {})) L.push(`Service ${n}: ${s.active_state ?? '?'} (${s.sub_state ?? '?'})`)
  return L.join('\n')
}

// ---- formatting ----------------------------------------------------------------------

export function bytes(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = Math.max(0, n)
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++ }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`
}

export function pct(n: number | null | undefined): string {
  return n == null || !isFinite(n) ? '—' : `${Math.round(n)} %`
}

export function duration(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null
}

/** SVG path for a 0-100 % series over the last `spanMs`, newest at the right edge. */
export function sparkPath(list: ProcSample[], pick: (s: ProcSample) => number | null | undefined, spanMs: number, w: number, h: number): string {
  const end = list[list.length - 1]?.t
  if (end == null) return ''
  let d = ''
  for (const s of list) {
    const v = pick(s)
    if (typeof v !== 'number') continue
    const x = w - ((end - s.t) / spanMs) * w
    if (x < 0) continue
    const y = h - (Math.max(0, Math.min(100, v)) / 100) * h
    d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}
