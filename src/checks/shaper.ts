/**
 * Wizards > Input shaping (Tool Manager docs/proposal-tuning-wizards-2.md, item 6): plain logic. Reads what Klipper prints for
 * ACCELEROMETER_QUERY, MEASURE_AXES_NOISE and SHAPER_CALIBRATE, builds the test G-code and the config for a USB accelerometer
 * board, and turns the numbers into sentences. No Vue, no network. SAVE_CONFIG is never sent (the Portal keeps the result).
 */
export type Axis = 'x' | 'y'

export interface Sample {
  x: number
  y: number
  z: number
}
/** "accelerometer values (x, y, z): 0.2, -0.1, 9.81" (metres per second squared) */
export function parseQuery(lines: string[]): Sample | null {
  for (const l of lines) {
    const m = /accelerometer values \(x, y, z\):\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)/i.exec(l)
    if (m) return { x: +m[1]!, y: +m[2]!, z: +m[3]! }
  }
  return null
}
/** At rest the three numbers together are about one g (9.8). Far from that means a wiring or setup problem. */
export function querySentence(s: Sample): { ok: boolean; say: string } {
  const g = Math.hypot(s.x, s.y, s.z)
  const dom = (['x', 'y', 'z'] as const).reduce((a, k) => (Math.abs(s[k]) > Math.abs(s[a]) ? k : a), 'z')
  if (g < 8 || g > 11.5) return { ok: false, say: `The accelerometer answers, but its reading (${g.toFixed(1)}) isn't about one g (9.8). Check it is firmly fixed and the board isn't faulty.` }
  return { ok: true, say: `The accelerometer answers: about one g, mostly on its ${dom.toUpperCase()} axis${dom === 'z' ? ' (flat, as expected)' : ' (tilted: set axes_map to match how it is mounted)'}.` }
}

export interface Noise {
  x: number
  y: number
  z: number
}
/** "Axes noise for xyz-axis accelerometer: 12.3 (x), 11.1 (y), 30.0 (z)" */
export function parseNoise(lines: string[]): Noise | null {
  for (const l of lines) {
    const m = /Axes noise for \S+ accelerometer:\s*([\d.]+) \(x\),\s*([\d.]+) \(y\),\s*([\d.]+) \(z\)/i.exec(l)
    if (m) return { x: +m[1]!, y: +m[2]!, z: +m[3]! }
  }
  return null
}
/** Klipper's guide: a quiet, firmly mounted machine reads roughly 1 to 100. Much higher means a loose mount, a fan close by, or a cable pulling. */
export function noiseSentence(n: Noise): { ok: boolean; say: string } {
  const top = Math.max(n.x, n.y, n.z)
  return top <= 100
    ? { ok: true, say: `Noise is low (highest ${top.toFixed(0)}): the accelerometer is firmly mounted and the machine is quiet.` }
    : { ok: false, say: `Noise is high (highest ${top.toFixed(0)}). Tighten the mount, stop any fan close to it, and let the cable hang free, then measure again.` }
}

export interface Fit {
  name: string
  freq: number
  vibrations: number
  smoothing: number
  maxAccel: number | null
}
export interface AxisResult {
  axis: Axis
  fits: Fit[]
  recommended: { type: string; freq: number } | null
}
/** SHAPER_CALIBRATE output for one axis: the fitted shapers (each with its suggested max acceleration) and Klipper's recommendation. */
export function parseCalibrate(lines: string[]): AxisResult[] {
  const out: AxisResult[] = []
  let cur: AxisResult | null = null
  let last: Fit | null = null
  for (const l of lines) {
    const a = /Calculating the best input shaper parameters for (\w) axis/i.exec(l)
    if (a) {
      cur = { axis: a[1]!.toLowerCase() as Axis, fits: [], recommended: null }
      out.push(cur)
      continue
    }
    const f = /Fitted shaper '(\w+)' frequency = ([\d.]+) Hz \(vibrations = ([\d.]+)%, smoothing ~= ([\d.]+)\)/i.exec(l)
    if (f && cur) {
      last = { name: f[1]!, freq: +f[2]!, vibrations: +f[3]!, smoothing: +f[4]!, maxAccel: null }
      cur.fits.push(last)
      continue
    }
    const m = /suggested max_accel <= (\d+)/i.exec(l)
    if (m && last) last.maxAccel = +m[1]!
    const r = /Recommended shaper_type_(\w) = (\w+), shaper_freq_\w = ([\d.]+) Hz/i.exec(l)
    if (r && cur) cur.recommended = { type: r[2]!, freq: +r[3]! }
  }
  return out
}

export const SHAPER_TYPES = ['zv', 'mzv', 'zvd', 'ei', '2hump_ei', '3hump_ei'] as const
const PLAIN: Record<string, string> = {
  zv: 'ZV: the least smoothing, the weakest cancelling',
  mzv: 'MZV: a good all-round choice',
  zvd: 'ZVD: stronger, more smoothing',
  ei: 'EI: strong against a resonance that shifts, more smoothing',
  '2hump_ei': '2HUMP EI: very strong, noticeably more smoothing',
  '3hump_ei': '3HUMP EI: the strongest and the most smoothing',
}
export const plainShaper = (n: string) => PLAIN[n] ?? n

/** The sentence about a fit: what is left of the ringing and how much the corners are rounded. */
export function fitSentence(f: Fit): string {
  const left = f.vibrations < 5 ? 'almost no ringing left' : f.vibrations < 15 ? 'a little ringing left' : 'noticeable ringing left'
  const soft = f.smoothing < 0.1 ? 'sharp corners' : f.smoothing < 0.2 ? 'slightly rounded corners' : 'rounded corners'
  return `${f.freq.toFixed(1)} Hz: ${left}, ${soft}${f.maxAccel ? `; up to ${f.maxAccel} mm/s² before it smooths too much` : ''}.`
}

// ---- the test G-code (shown to the person, who may edit it)
export const csvName = (axis: Axis) => `rhino_${axis}`
/** A first, gentle run: low force over a narrow band, so the person hears and sees it is mild. */
export const gentleScript = (axis: Axis) => `TEST_RESONANCES AXIS=${axis.toUpperCase()} ACCEL_PER_HZ=25 FREQ_START=20 FREQ_END=50 OUTPUT=raw_data NAME=gentle_${axis}`
export const calibrateScript = (axis: Axis) => `SHAPER_CALIBRATE AXIS=${axis.toUpperCase()} NAME=${csvName(axis)}`
const blocked = /\b(M112|SAVE_CONFIG|FIRMWARE_RESTART|RESTART|FORCE_MOVE|SET_KINEMATIC_POSITION)\b/i
export function scriptProblem(text: string): string | null {
  if (blocked.test(text)) return 'That line isn\'t allowed in this wizard.'
  if (!/^\s*(TEST_RESONANCES|SHAPER_CALIBRATE|MEASURE_AXES_NOISE|ACCELEROMETER_QUERY)\b/im.test(text)) return 'The G-code needs a TEST_RESONANCES or SHAPER_CALIBRATE line.'
  return null
}

// ---- the accelerometer's config (for a USB board running Klipper's firmware)
export interface Board {
  serial: string
  csPin: string
  spiBus: string
  axesMap: string
}
/** Presets are a starting point only: the maker's page has the right pins for the exact board. */
export const PRESETS: { id: string; label: string; pins: Pick<Board, 'csPin' | 'spiBus'> }[] = [
  { id: 'rp2040', label: 'A common RP2040 USB ADXL345 board (check the maker\'s page)', pins: { csPin: 'adxl:gpio1', spiBus: 'spi0a' } },
]
export function boardProblem(b: Board): string | null {
  if (!/^\/dev\/serial\/by-id\/[\w.:+-]+$/.test(b.serial)) return 'The serial name looks like /dev/serial/by-id/usb-Klipper_rp2040_… (copy it from ls /dev/serial/by-id/).'
  if (!/^adxl:gpio\d{1,2}$/.test(b.csPin)) return 'The chip-select pin looks like adxl:gpio1.'
  if (!/^spi\d[a-z]?$/.test(b.spiBus)) return 'The SPI bus looks like spi0a.'
  if (!/^[-]?[xyz],[-]?[xyz],[-]?[xyz]$/.test(b.axesMap)) return 'The axes map looks like x,y,z (or y,x,-z).'
  return null
}
/** The sections the Portal keeps in tuned.cfg for the accelerometer. */
export function boardLines(b: Board, probe: { x: number; y: number; z: number }): string[] {
  return ['[mcu adxl]', `serial: ${b.serial}`, '', '[adxl345]', `cs_pin: ${b.csPin}`, `spi_bus: ${b.spiBus}`, `axes_map: ${b.axesMap}`, '', '[resonance_tester]', 'accel_chip: adxl345', `probe_points: ${probe.x},${probe.y},${probe.z}`]
}
/** The input_shaper section for a result. */
export function shaperLines(x: { type: string; freq: number }, y: { type: string; freq: number }): string[] {
  return ['[input_shaper]', `shaper_type_x: ${x.type}`, `shaper_freq_x: ${x.freq}`, `shaper_type_y: ${y.type}`, `shaper_freq_y: ${y.freq}`]
}

// ---- the chart: Klipper's calibration CSV ("freq,psd_x,psd_y,psd_z,psd_xyz,zv(59.4),mzv(47.8),...")
export interface Curves {
  freq: number[]
  psd: number[]
  shapers: { name: string; freq: number; values: number[] }[]
}
export function parseCsv(text: string): Curves | null {
  const lines = text.trim().split(/\r?\n/)
  const head = lines[0]?.split(',').map((h) => h.trim())
  if (!head || head[0] !== 'freq' || !head.includes('psd_xyz')) return null
  const xyz = head.indexOf('psd_xyz')
  const cols = head.map((h, i) => ({ h, i })).filter(({ i }) => i > xyz)
  const freq: number[] = []
  const psd: number[] = []
  const sh = cols.map(({ h }) => ({ name: /^([^(]+)/.exec(h)?.[1] ?? h, freq: +(/\(([\d.]+)\)/.exec(h)?.[1] ?? 0), values: [] as number[] }))
  for (const l of lines.slice(1)) {
    const c = l.split(',').map(Number)
    if (c.length < head.length || c.some((v) => !Number.isFinite(v))) continue
    freq.push(c[0]!)
    psd.push(c[xyz]!)
    cols.forEach(({ i }, k) => sh[k]!.values.push(c[i]!))
  }
  return freq.length ? { freq, psd, shapers: sh } : null
}
/** SVG path data for a curve in a w × h box, y scaled to the tallest value (shared across curves). */
export function pathFor(values: number[], freq: number[], w: number, h: number, ymax: number): string {
  if (!values.length) return ''
  const f0 = freq[0]!, f1 = freq[freq.length - 1]! || f0 + 1
  return values.map((v, i) => `${i ? 'L' : 'M'}${(((freq[i]! - f0) / (f1 - f0)) * w).toFixed(1)} ${(h - (Math.max(0, v) / ymax) * h).toFixed(1)}`).join('')
}
