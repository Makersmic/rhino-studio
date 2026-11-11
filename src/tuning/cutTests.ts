/**
 * Laser and drag knife tuning (Tool Manager docs/phase-tool-wizards.md, L1-L4 and K1-K2): the test files Studio makes,
 * the values they find, and the sums. Plain functions, tested without a screen (cutTests.test.ts).
 *
 * Every test is an ordinary job of that tool: it starts through LASER_JOB_SETUP / DRAGKNIFE_JOB_SETUP FILE= (checklist,
 * interlocks, hooks, the laser's rails only after the file loads, _TOOL_SAFE_OFF at the end), so nothing here switches
 * a tool on by itself. Files use machine X/Y (laser: LASER_JOB_SETUP clears the X/Y offset; knife: its X/Y zero is the
 * machine origin) and Z0 is the surface the setup macro's SET_Z_ZERO sets.
 *
 * The laser focus ramp is the one file with Z moves: for it, SET_Z_ZERO is taken where the laser's shroud touches the
 * material, and the ramp climbs from 1 mm above that, so it can never press into the stock (focusRampSafe).
 */
import { patternClear, type Rect } from './tuning'

export type CutProcess = 'laser' | 'dragknife'
export type CutTest = 'laser_focus' | 'laser_cut' | 'laser_engrave' | 'laser_passes' | 'laser_kerf' | 'knife_depth' | 'knife_offset'
/** What the Portal keeps (rhino/tuning.py TESTS): head = once per tool, stock = per tool and material */
export type CutValue =
  | 'laser_focus_height' | 'laser_cut_power' | 'laser_cut_speed' | 'laser_engrave_power' | 'laser_engrave_speed'
  | 'laser_passes' | 'laser_kerf' | 'knife_depth' | 'knife_pressure' | 'knife_blade_offset'

export interface CutWizard {
  test: CutTest
  process: CutProcess
  title: string
  scope: 'head' | 'stock'
  saves: CutValue[]
  why: string
}

/** In order: each one assumes the ones above it are done */
export const CUT_WIZARDS: CutWizard[] = [
  { test: 'laser_focus', process: 'laser', title: 'Focus height', scope: 'head', saves: ['laser_focus_height'], why: 'First: every other laser test needs the beam in focus. Once per lens; after this the start wizard sets focus by measurement, not by eye.' },
  { test: 'laser_cut', process: 'laser', title: 'Cut power and speed', scope: 'stock', saves: ['laser_cut_power', 'laser_cut_speed'], why: 'With the focus right, a grid of squares shows the power and speed that cut through cleanly with the least char.' },
  { test: 'laser_engrave', process: 'laser', title: 'Engrave power and speed', scope: 'stock', saves: ['laser_engrave_power', 'laser_engrave_speed'], why: 'The same grid filled in: the darkness you want without burning through.' },
  { test: 'laser_passes', process: 'laser', title: 'Passes', scope: 'stock', saves: ['laser_passes'], why: 'Only if no square in the cut grid dropped out: thicker stock cuts cleaner in more passes than at more power.' },
  { test: 'laser_kerf', process: 'laser', title: 'Kerf', scope: 'stock', saves: ['laser_kerf'], why: 'Last: at the tuned cut settings, a measured square says how much the beam takes away, so parts come out the right size.' },
  { test: 'knife_depth', process: 'dragknife', title: 'Depth', scope: 'stock', saves: ['knife_depth', 'knife_pressure'], why: 'First: a cut that doesn’t go through hides every other result. The shallowest depth that cuts cleanly with the backing intact.' },
  { test: 'knife_offset', process: 'dragknife', title: 'Blade offset', scope: 'head', saves: ['knife_blade_offset'], why: 'At that depth, squares with the offset stepped show which one turns sharp, closed corners. Once per blade.' },
]

/** Lowest and highest the Portal accepts (rhino/tuning.py TESTS keeps the same numbers) */
export const CUT_LIMITS: Record<CutValue, [number, number]> = {
  laser_focus_height: [1, 30],
  laser_cut_power: [0.01, 1],
  laser_cut_speed: [30, 6000],
  laser_engrave_power: [0.01, 1],
  laser_engrave_speed: [30, 12000],
  laser_passes: [1, 10],
  laser_kerf: [0, 1],
  knife_depth: [0.01, 3],
  knife_pressure: [0, 1000],
  knife_blade_offset: [0, 2],
}

export const cutWizardsFor = (p: CutProcess) => CUT_WIZARDS.filter((w) => w.process === p)
/** Values kept once per tool (the lens, the blade); the rest are per tool and material */
export const HEAD_VALUES: ReadonlySet<CutValue> = new Set<CutValue>(['laser_focus_height', 'knife_blade_offset'])

const fmt = (v: number) => {
  const s = v.toFixed(3)
  return s.replace(/\.?0+$/, '').replace(/^-0$/, '0') || '0'
}
type P = [number, number]

// ---- labels: digits drawn as strokes (seven segments), so a laser can mark them -------------------------------------

// segment ends in a unit cell (x 0..0.6, y 0..1, y up)
const W = 0.6
const SEGS: Record<string, [P, P]> = {
  a: [[0, 1], [W, 1]], b: [[W, 1], [W, 0.5]], c: [[W, 0.5], [W, 0]], d: [[W, 0], [0, 0]],
  e: [[0, 0], [0, 0.5]], f: [[0, 0.5], [0, 1]], g: [[0, 0.5], [W, 0.5]],
}
const DIGITS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
}

/** The strokes for a number label, h mm tall, with its bottom-left corner at (x, y). Digits and '.' only. */
export function labelStrokes(text: string, x: number, y: number, h: number): Array<[P, P]> {
  const out: Array<[P, P]> = []
  let cx = x
  for (const ch of text) {
    if (ch === '.') {
      out.push([[cx, y], [cx + h * 0.08, y]])
      cx += h * 0.35
      continue
    }
    for (const s of DIGITS[ch] ?? '') {
      const [a, b] = SEGS[s]!
      out.push([[cx + a[0] * h, y + a[1] * h], [cx + b[0] * h, y + b[1] * h]])
    }
    cx += h * 0.9
  }
  return out
}
export const labelWidth = (text: string, h: number) => [...text].reduce((w, ch) => w + (ch === '.' ? h * 0.35 : h * 0.9), 0) - h * 0.3

// ---- the file around a test ------------------------------------------------------------------------------------------

export interface CutFileBase {
  tool: string
  material: string
  /** front-left corner of the pattern, machine X/Y */
  x: number
  y: number
}

function wrap(test: CutTest, o: CutFileBase, process: CutProcess, body: string[]): string {
  const w = CUT_WIZARDS.find((c) => c.test === test)!
  const start = process === 'laser'
    ? '; Start with LASER_JOB_SETUP FILE=<this file> (Studio: Files > Start). Z0 is the focus the setup sets.'
    : '; Start with DRAGKNIFE_JOB_SETUP FILE=<this file> (Studio: Files > Start). Z0 is the material surface.'
  const head = [
    `; Made by Rhino Studio: ${w.title} test`,
    `; rhino_toolhead = ${o.tool}`,
    `; rhino_process = ${process}`,
    `; rhino_material = ${o.material}`,
    `; rhino_tuning = ${test}`,
    test === 'laser_focus' ? '; Start with LASER_JOB_SETUP FILE=<this file>. Set Z zero where the shroud just touches the material: this file lifts from there.' : start,
    'G21',
    'G90',
  ]
  const tail = process === 'laser' ? ['M5', 'DEACTIVATE_LASER', 'END_PRINT'] : ['END_PRINT']
  return [...head, ...(process === 'laser' ? ['M5'] : []), ...body, ...tail, ''].join('\n')
}

const TRAVEL = 6000

/** One laser stroke or closed path at power (0..1 of laser_s_max) and feed */
function laserPath(pts: P[], power: number, feed: number, sMax: number): string[] {
  const [s, ...rest] = pts
  return [`G0 X${fmt(s![0])} Y${fmt(s![1])} F${TRAVEL}`, `M3 S${fmt(power * sMax)}`, ...rest.map((p, i) => `G1 X${fmt(p[0])} Y${fmt(p[1])}${i === 0 ? ` F${fmt(feed)}` : ''}`), 'M5']
}
const square = (x: number, y: number, s: number): P[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]

// ---- L1 focus ramp ---------------------------------------------------------------------------------------------------

export const FOCUS = { length: 60, power: 0.1, feed: 600, tick: 2, longTick: 4, label: 2.5 } as const

export interface FocusOpts extends CutFileBase {
  /** Z (mm above the surface) at the start and end of the ramp */
  zFrom: number
  zTo: number
  power?: number
  feed?: number
  sMax: number
}

/** Z at a point of the ramp, and the X of each whole-mm tick */
export function focusTicks(o: { x: number; zFrom: number; zTo: number }): Array<{ z: number; x: number }> {
  const out: Array<{ z: number; x: number }> = []
  for (let z = Math.ceil(o.zFrom - 1e-9); z <= o.zTo + 1e-9; z++) out.push({ z, x: o.x + ((z - o.zFrom) / (o.zTo - o.zFrom)) * FOCUS.length })
  return out
}

/** Refuses a ramp that could touch the material or is too long to judge */
export function focusRampProblem(zFrom: number, zTo: number): string | null {
  if (!(zFrom >= 1)) return 'Start at least 1 mm above the surface, so the shroud never touches the material.'
  if (!(zTo > zFrom)) return 'The ramp has to climb: end higher than it starts.'
  if (zTo > CUT_LIMITS.laser_focus_height[1]) return `End at ${CUT_LIMITS.laser_focus_height[1]} mm or lower.`
  if (zTo - zFrom > 16) return 'Keep the ramp to 16 mm or less, so the ticks are far enough apart to read.'
  return null
}

export function focusFile(o: FocusOpts): string {
  const power = o.power ?? FOCUS.power
  const feed = o.feed ?? FOCUS.feed
  const y = o.y + FOCUS.label + 2 + FOCUS.longTick
  const body = [
    `G0 Z${fmt(o.zTo)} F600 ; lift clear of the material before any X/Y move`,
    `G0 X${fmt(o.x)} Y${fmt(y)} F${TRAVEL}`,
    `G0 Z${fmt(o.zFrom)} F600`,
    `M3 S${fmt(power * o.sMax)}`,
    `G1 X${fmt(o.x + FOCUS.length)} Z${fmt(o.zTo)} F${fmt(feed)}`,
    'M5',
  ]
  // a tick under every whole mm of Z, at that Z, so each one is as sharp as the line above it; a long one and a label
  // every 5 mm
  for (const t of focusTicks(o)) {
    const long = t.z % 5 === 0
    body.push(`G0 Z${fmt(t.z)} F600`)
    body.push(...laserPath([[t.x, y - 0.5], [t.x, y - 0.5 - (long ? FOCUS.longTick : FOCUS.tick)]], power, feed, o.sMax))
    if (long) for (const [a, b] of labelStrokes(String(t.z), t.x - labelWidth(String(t.z), FOCUS.label) / 2, o.y, FOCUS.label)) body.push(...laserPath([a, b], power, feed, o.sMax))
  }
  body.push(`G0 Z${fmt(o.zTo)} F600`)
  return wrap('laser_focus', o, 'laser', body)
}

export function focusBounds(o: { x: number; y: number }): Rect {
  return { x0: o.x - 3, y0: o.y, x1: o.x + FOCUS.length + 3, y1: o.y + FOCUS.label + 2 + FOCUS.longTick + 1 }
}

/** The focus file's own check: Z only between 1 mm and the limit above the surface, power capped low */
export function focusRampSafe(text: string, sMax: number): string | null {
  let zs = 0
  for (const l of text.split('\n')) {
    const z = /^G[01]\b.*\bZ(-?\d*\.?\d+)/.exec(l)
    if (z) {
      zs++
      const v = +z[1]!
      if (v < 1 - 1e-9 || v > CUT_LIMITS.laser_focus_height[1] + 1e-9) return `Z${z[1]} is outside 1 to ${CUT_LIMITS.laser_focus_height[1]} mm above the surface.`
    }
    const s = /^M3\b.*\bS(\d*\.?\d+)/.exec(l)
    if (s && +s[1]! > 0.3 * sMax + 1e-9) return `S${s[1]} is above 30 % power, too much for a focus test.`
  }
  return zs ? null : 'The focus ramp has no Z moves.'
}

// ---- L2 power and speed grid (cut: outlines; engrave: filled) --------------------------------------------------------

export const GRID = { size: 10, pitch: 14, label: 3, margin: 12, hatch: 0.2 } as const

export const stepValues = (from: number, to: number, count: number) =>
  Array.from({ length: count }, (_, i) => Number((count === 1 ? from : from + ((to - from) * i) / (count - 1)).toFixed(3)))

export interface GridOpts extends CutFileBase {
  kind: 'cut' | 'engrave'
  /** 0..1, one per row (front to back) */
  powers: number[]
  /** mm/min, one per column (left to right) */
  feeds: number[]
  sMax: number
}

export function gridBounds(o: { x: number; y: number; rows: number; cols: number }): Rect {
  return { x0: o.x, y0: o.y, x1: o.x + GRID.margin + o.cols * GRID.pitch, y1: o.y + o.rows * GRID.pitch + GRID.label + 2 }
}

/** Where square (row, col) sits */
export const gridCell = (o: { x: number; y: number }, r: number, c: number): P => [o.x + GRID.margin + c * GRID.pitch, o.y + r * GRID.pitch]

export function gridFile(o: GridOpts): string {
  const body: string[] = []
  // labels at the lowest power and the fastest speed: a mark, not a cut
  const lp = Math.min(...o.powers)
  const lf = Math.max(...o.feeds)
  const mark = (t: string, x: number, y: number) => {
    for (const [a, b] of labelStrokes(t, x, y, GRID.label)) body.push(...laserPath([a, b], lp, lf, o.sMax))
  }
  o.feeds.forEach((f, c) => {
    const [cx] = gridCell(o, 0, c)
    const t = String(Math.round(f))
    mark(t, cx + (GRID.size - labelWidth(t, GRID.label)) / 2, o.y + o.powers.length * GRID.pitch)
  })
  o.powers.forEach((p, r) => mark(String(Math.round(p * 100)), o.x, gridCell(o, r, 0)[1] + (GRID.size - GRID.label) / 2))
  o.powers.forEach((p, r) =>
    o.feeds.forEach((f, c) => {
      const [x, y] = gridCell(o, r, c)
      if (o.kind === 'cut') body.push(...laserPath(square(x, y, GRID.size), p, f, o.sMax))
      else {
        // filled: back and forth, GRID.hatch apart, the laser on for the whole square
        const pts: P[] = []
        const n = Math.round(GRID.size / GRID.hatch)
        for (let i = 0; i <= n; i++) {
          const yy = y + i * GRID.hatch
          pts.push(i % 2 ? [x + GRID.size, yy] : [x, yy], i % 2 ? [x, yy] : [x + GRID.size, yy])
        }
        body.push(...laserPath(pts, p, f, o.sMax))
      }
    }),
  )
  return wrap(o.kind === 'cut' ? 'laser_cut' : 'laser_engrave', o, 'laser', body)
}

// ---- L3 passes, L4 kerf ----------------------------------------------------------------------------------------------

export const PASSES = { size: 10, pitch: 14, most: 5 } as const

export function passesFile(o: CutFileBase & { power: number; feed: number; sMax: number }): string {
  const body: string[] = []
  for (let n = 1; n <= PASSES.most; n++) {
    const x = o.x + (n - 1) * PASSES.pitch
    for (let k = 0; k < n; k++) body.push(...laserPath(square(x, o.y, PASSES.size), o.power, o.feed, o.sMax))
  }
  return wrap('laser_passes', o, 'laser', body)
}
export const passesBounds = (o: { x: number; y: number }): Rect => ({ x0: o.x, y0: o.y, x1: o.x + (PASSES.most - 1) * PASSES.pitch + PASSES.size, y1: o.y + PASSES.size })

export const KERF = { size: 20 } as const

export function kerfFile(o: CutFileBase & { power: number; feed: number; passes: number; sMax: number }): string {
  const body: string[] = []
  for (let k = 0; k < o.passes; k++) body.push(...laserPath(square(o.x, o.y, KERF.size), o.power, o.feed, o.sMax))
  return wrap('laser_kerf', o, 'laser', body)
}
export const kerfBounds = (o: { x: number; y: number }): Rect => ({ x0: o.x, y0: o.y, x1: o.x + KERF.size, y1: o.y + KERF.size })

/** Kerf from the cut-out part's measured width: the beam takes (20 - part) / 2 from each side */
export function kerfFrom(part: number): { value: number } | { error: string } {
  if (!Number.isFinite(part) || part <= 0) return { error: 'Measure the part that dropped out, in mm.' }
  const k = Number(((KERF.size - part) / 2).toFixed(3))
  if (k < 0) return { error: `The part measures more than ${KERF.size} mm: measure the part, not the hole.` }
  if (k > CUT_LIMITS.laser_kerf[1]) return { error: `That's a kerf of ${fmt(k)} mm, more than ${CUT_LIMITS.laser_kerf[1]} mm: measure again, edge to edge.` }
  return { value: k }
}

// ---- K1 depth, K2 blade offset ----------------------------------------------------------------------------------------

export const KNIFE = { lift: 2, plunge: 200, feed: 600, line: 20, linePitch: 6, square: 15, squarePitch: 22, overlap: 1 } as const

export function depthFile(o: CutFileBase & { depths: number[]; feed?: number }): string {
  const body: string[] = []
  o.depths.forEach((d, i) => {
    const x = o.x + i * KNIFE.linePitch
    body.push(`G0 Z${KNIFE.lift} F600`, `G0 X${fmt(x)} Y${fmt(o.y)} F${TRAVEL}`, `G1 Z${fmt(-d)} F${KNIFE.plunge}`, `G1 Y${fmt(o.y + KNIFE.line)} F${fmt(o.feed ?? KNIFE.feed)}`)
  })
  body.push(`G0 Z${KNIFE.lift} F600`)
  return wrap('knife_depth', o, 'dragknife', body)
}
export const depthBounds = (o: { x: number; y: number; count: number }): Rect => ({ x0: o.x, y0: o.y, x1: o.x + (o.count - 1) * KNIFE.linePitch, y1: o.y + KNIFE.line })

/**
 * The knife's centre path for a square cut with a blade trailing `offset` behind it: each edge runs on past its corner by
 * the offset, then the knife swings round the corner on an arc of that radius (short lines: no G2/G3, which needs
 * [gcode_arcs]). Starts and ends mid-way along the first edge, with a little overlap so the cut closes.
 */
export function offsetSquarePath(x: number, y: number, s: number, offset: number, segs = 9): P[] {
  const c: P[] = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
  const dir: P[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
  const r = offset
  const add = (p: P, d: P, k: number): P => [p[0] + d[0] * k, p[1] + d[1] * k]
  const pts: P[] = [add([x + s / 2, y], dir[0]!, r)]
  for (let i = 0; i < 4; i++) {
    const corner = c[(i + 1) % 4]!
    const a = dir[i]!
    pts.push(add(corner, a, r))
    if (r > 0) {
      const a0 = Math.atan2(a[1], a[0])
      for (let k = 1; k <= segs; k++) {
        const t = a0 + ((Math.PI / 2) * k) / segs
        pts.push([corner[0] + r * Math.cos(t), corner[1] + r * Math.sin(t)])
      }
    }
  }
  pts.push(add([x + s / 2 + KNIFE.overlap, y], dir[0]!, r))
  return pts
}

export function offsetFile(o: CutFileBase & { offsets: number[]; depth: number; feed?: number }): string {
  const body: string[] = []
  o.offsets.forEach((r, i) => {
    const pts = offsetSquarePath(o.x + i * KNIFE.squarePitch, o.y, KNIFE.square, r)
    body.push(`G0 Z${KNIFE.lift} F600`, `G0 X${fmt(pts[0]![0])} Y${fmt(pts[0]![1])} F${TRAVEL}`, `G1 Z${fmt(-o.depth)} F${KNIFE.plunge}`)
    pts.slice(1).forEach((p, k) => body.push(`G1 X${fmt(p[0])} Y${fmt(p[1])}${k === 0 ? ` F${fmt(o.feed ?? KNIFE.feed)}` : ''}`))
  })
  body.push(`G0 Z${KNIFE.lift} F600`)
  return wrap('knife_offset', o, 'dragknife', body)
}
export const offsetBounds = (o: { x: number; y: number; count: number; most: number }): Rect => ({
  x0: o.x - o.most, y0: o.y - o.most, x1: o.x + (o.count - 1) * KNIFE.squarePitch + KNIFE.square + o.most, y1: o.y + KNIFE.square + o.most,
})

// ---- results -----------------------------------------------------------------------------------------------------------

export interface CutRun { tool: string; test: string; value: number; time: number; material?: string }

/** The last saved run of a value, for this tool (and material when it's per material) */
export function lastCut(runs: CutRun[] | undefined, tool: string, value: CutValue, material?: string): CutRun | null {
  return runs?.find((r) => r.tool === tool && r.test === value && (HEAD_VALUES.has(value) || r.material === material)) ?? null
}

/** A value inside the Portal's limits, or why not */
export function cutValueProblem(v: CutValue, value: number): string | null {
  const [lo, hi] = CUT_LIMITS[v]
  return Number.isFinite(value) && value >= lo && value <= hi ? null : `Must be from ${lo} to ${hi}.`
}

// ---- one wizard run: its settings, where it goes, the file, and what you pick from ----------------------------------


export interface CutInputs {
  x: number
  y: number
  /** focus ramp */
  zFrom: number
  zTo: number
  /** grids: first and last power (0..1) and feed */
  powerFrom: number
  powerTo: number
  feedFrom: number
  feedTo: number
  /** passes and kerf: the cut settings they use */
  power: number
  feed: number
  passes: number
  /** knife */
  depthFrom: number
  depthStep: number
  offsetFrom: number
  offsetTo: number
  depth: number
}
export const COUNT = { grid: 5, depth: 6, offset: 5 } as const

/** Starting values: tuned results where there are some, else the material's, else safe defaults */
export function cutDefaults(test: CutTest, known: { power?: number; feed?: number; passes?: number; depth?: number }): Omit<CutInputs, 'x' | 'y'> {
  const base = {
    zFrom: 2, zTo: 14,
    powerFrom: 0.4, powerTo: 1, feedFrom: 200, feedTo: 1000,
    power: known.power ?? 0.8, feed: known.feed ?? 600, passes: known.passes ?? 1,
    depthFrom: 0.1, depthStep: 0.05, offsetFrom: 0.1, offsetTo: 0.5, depth: known.depth ?? 0.3,
  }
  if (test === 'laser_engrave') return { ...base, powerFrom: 0.1, powerTo: 0.5, feedFrom: 1000, feedTo: 3000 }
  if (test === 'knife_depth' || test === 'knife_offset') return { ...base, feed: known.feed ?? KNIFE.feed }
  return base
}

export function cutBounds(test: CutTest, i: CutInputs): Rect {
  switch (test) {
    case 'laser_focus': return focusBounds(i)
    case 'laser_cut':
    case 'laser_engrave': return gridBounds({ x: i.x, y: i.y, rows: COUNT.grid, cols: COUNT.grid })
    case 'laser_passes': return passesBounds(i)
    case 'laser_kerf': return kerfBounds(i)
    case 'knife_depth': return depthBounds({ x: i.x, y: i.y, count: COUNT.depth })
    case 'knife_offset': return offsetBounds({ x: i.x, y: i.y, count: COUNT.offset, most: i.offsetTo })
  }
}

/** Front-left corner that puts the pattern in the middle of the work area */
export function centred(test: CutTest, i: Omit<CutInputs, 'x' | 'y'>, area: { x: number; y: number }): { x: number; y: number } {
  const b = cutBounds(test, { ...i, x: 0, y: 0 })
  return { x: Math.round(area.x / 2 - (b.x1 + b.x0) / 2), y: Math.round(area.y / 2 - (b.y1 + b.y0) / 2) }
}

/** Why these settings can't make a test, or null */
export function cutProblem(test: CutTest, i: CutInputs, m: { workArea: { x: number; y: number }; keepOut: Rect[] }): string | null {
  const b = cutBounds(test, i)
  if (b.x0 < 0 || b.y0 < 0 || b.x1 > m.workArea.x || b.y1 > m.workArea.y)
    return `The test needs X ${fmt(b.x0)} to ${fmt(b.x1)}, Y ${fmt(b.y0)} to ${fmt(b.y1)}: move it inside the bed (${fmt(m.workArea.x)} x ${fmt(m.workArea.y)} mm).`
  if (!patternClear(b, m.keepOut)) return 'The test is over a keep-out area (the leadscrew): move it.'
  const pw = (p: number) => p > 0 && p <= 1
  if (test === 'laser_focus') return focusRampProblem(i.zFrom, i.zTo)
  if ((test === 'laser_cut' || test === 'laser_engrave') && !(pw(i.powerFrom) && pw(i.powerTo) && i.powerTo > i.powerFrom)) return 'Power runs from a lower to a higher %, at most 100 %.'
  if ((test === 'laser_cut' || test === 'laser_engrave') && !(i.feedFrom >= 30 && i.feedTo > i.feedFrom && i.feedTo <= CUT_LIMITS.laser_engrave_speed[1])) return 'Speed runs from a slower to a faster feed (30 mm/min or more).'
  if ((test === 'laser_passes' || test === 'laser_kerf') && !(pw(i.power) && i.feed >= 30)) return 'Set the cut power (up to 100 %) and speed first.'
  if (test === 'laser_kerf' && !(Number.isInteger(i.passes) && i.passes >= 1 && i.passes <= CUT_LIMITS.laser_passes[1])) return 'Passes: 1 to 10.'
  if (test === 'knife_depth' && !(i.depthFrom > 0 && i.depthStep > 0 && i.depthFrom + i.depthStep * (COUNT.depth - 1) <= 3)) return 'Depths from above 0 to at most 3 mm.'
  if (test === 'knife_offset' && !(i.offsetFrom >= 0 && i.offsetTo > i.offsetFrom && i.offsetTo <= CUT_LIMITS.knife_blade_offset[1])) return `Offsets from 0 to at most ${CUT_LIMITS.knife_blade_offset[1]} mm, lowest first.`
  if (test === 'knife_offset' && !(i.depth > 0 && i.depth <= 3)) return 'Depth: above 0, at most 3 mm.'
  return null
}

export function cutFile(test: CutTest, base: Omit<CutFileBase, 'x' | 'y'>, i: CutInputs, sMax: number): string {
  const o = { ...base, x: i.x, y: i.y }
  switch (test) {
    case 'laser_focus': return focusFile({ ...o, zFrom: i.zFrom, zTo: i.zTo, sMax })
    case 'laser_cut':
    case 'laser_engrave':
      return gridFile({ ...o, kind: test === 'laser_cut' ? 'cut' : 'engrave', powers: stepValues(i.powerFrom, i.powerTo, COUNT.grid), feeds: stepValues(i.feedFrom, i.feedTo, COUNT.grid), sMax })
    case 'laser_passes': return passesFile({ ...o, power: i.power, feed: i.feed, sMax })
    case 'laser_kerf': return kerfFile({ ...o, power: i.power, feed: i.feed, passes: i.passes, sMax })
    case 'knife_depth': return depthFile({ ...o, depths: depthValues(i), feed: i.feed })
    case 'knife_offset': return offsetFile({ ...o, offsets: stepValues(i.offsetFrom, i.offsetTo, COUNT.offset), depth: i.depth, feed: i.feed })
  }
}
export const depthValues = (i: Pick<CutInputs, 'depthFrom' | 'depthStep'>) => Array.from({ length: COUNT.depth }, (_, k) => Number((i.depthFrom + k * i.depthStep).toFixed(3)))

export interface CutChoice {
  /** what the button says */
  label: string
  /** grids: where it sits (row 0 = front) */
  row?: number
  col?: number
  values: Partial<Record<CutValue, number>>
}

/** What you pick from after the test (kerf: none, you measure) */
export function cutChoices(test: CutTest, i: CutInputs): CutChoice[] {
  switch (test) {
    case 'laser_focus': return focusTicks(i).map((t) => ({ label: `${t.z} mm`, values: { laser_focus_height: t.z } }))
    case 'laser_cut':
    case 'laser_engrave': {
      const p = stepValues(i.powerFrom, i.powerTo, COUNT.grid)
      const f = stepValues(i.feedFrom, i.feedTo, COUNT.grid)
      const [pk, fk] = test === 'laser_cut' ? (['laser_cut_power', 'laser_cut_speed'] as const) : (['laser_engrave_power', 'laser_engrave_speed'] as const)
      return p.flatMap((pp, r) => f.map((ff, c) => ({ label: `${Math.round(pp * 100)} % · ${Math.round(ff)}`, row: r, col: c, values: { [pk]: pp, [fk]: Math.round(ff) } })))
    }
    case 'laser_passes': return Array.from({ length: PASSES.most }, (_, k) => ({ label: `${k + 1}`, values: { laser_passes: k + 1, laser_cut_power: i.power, laser_cut_speed: i.feed } }))
    case 'laser_kerf': return []
    case 'knife_depth': return depthValues(i).map((d) => ({ label: `${fmt(d)} mm`, values: { knife_depth: d } }))
    case 'knife_offset': return stepValues(i.offsetFrom, i.offsetTo, COUNT.offset).map((r) => ({ label: `${fmt(r)} mm`, values: { knife_blade_offset: r } }))
  }
}

/** The file's name on the Rhino: letters, digits, - _ . only (FILE= on the setup macros) */
export function cutFileName(test: CutTest, tool: string, material: string): string {
  return `tune-${test}-${tool}-${material}`.replace(/[^A-Za-z0-9_-]+/g, '_') + '.gcode'
}
