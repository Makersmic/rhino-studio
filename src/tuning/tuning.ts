/**
 * Print head tuning (Tool Manager 1.9.16, docs/phase-tuning-wizards.md): the wizards after Ellis' Print Tuning Guide
 * (https://ellis3dp.com/Print-Tuning-Guide/), what they found, and how a job uses it. Plain sums, tested without a
 * screen; the Portal stores results (rhino/tuning.py), Studio applies them in each prepared file after START_JOB.
 */

export type TuningTest = 'extruder_calibration' | 'first_layer' | 'pressure_advance' | 'extrusion_multiplier'

export interface TunedValue {
  value: number
  time: number
  old: number | null
}
export interface TuningRun {
  tool: string
  test: TuningTest
  value: number
  time: number
  nozzle?: number
  material?: string
}
export interface TuningState {
  ok: boolean
  error?: string
  rev: number
  updated: number
  heads: Record<string, { rotation_distance?: TunedValue }>
  materials: Record<string, { pressure_advance?: TunedValue; extrusion_multiplier?: TunedValue; first_layer_fine?: TunedValue }>
  runs: TuningRun[]
}

/** The wizards, in Ellis' order (extruder, squish, pressure advance, extrusion multiplier), and why each comes there */
export const WIZARDS: Array<{ test: TuningTest; title: string; scope: 'head' | 'material'; why: string }> = [
  { test: 'extruder_calibration', title: 'Extruder calibration', scope: 'head', why: 'First: every other test assumes 100 mm asked for is 100 mm pushed. Once per print head.' },
  { test: 'first_layer', title: 'First-layer squish', scope: 'material', why: 'Before pressure advance and flow: a first layer that is too high or too low spoils every test printed on it.' },
  { test: 'pressure_advance', title: 'Pressure advance', scope: 'material', why: 'Before the extrusion multiplier: it moves where plastic goes at corners, and the flow test reads top surfaces that corners shape.' },
  { test: 'extrusion_multiplier', title: 'Extrusion multiplier', scope: 'material', why: 'Last of the four: with the extruder, squish and corners right, top surfaces show the true flow.' },
]

export function materialKey(tool: string, nozzle: number, material: string): string {
  return `${tool}|${Number(nozzle.toFixed(3))}|${material}`
}

/** What a job with this head, nozzle and material uses from tuning (nothing = the Rhino's own defaults) */
export function tunedFor(st: TuningState | null, tool: string, nozzle: number, material: string): { pressureAdvance?: number; rotationDistance?: number; extrusionMultiplier?: number } {
  if (!st?.ok) return {}
  const m = st.materials[materialKey(tool, nozzle, material)]
  const out: { pressureAdvance?: number; rotationDistance?: number; extrusionMultiplier?: number } = {}
  const rd = st.heads[tool]?.rotation_distance?.value
  if (rd != null) out.rotationDistance = rd
  if (m?.pressure_advance) out.pressureAdvance = m.pressure_advance.value
  if (m?.extrusion_multiplier) out.extrusionMultiplier = m.extrusion_multiplier.value
  return out
}

/** The last run of a test for this head (and nozzle + material when the test is per material), or null */
export function lastRun(st: TuningState | null, tool: string, test: TuningTest, nozzle?: number, material?: string): TuningRun | null {
  if (!st?.ok) return null
  const scope = WIZARDS.find((w) => w.test === test)!.scope
  return st.runs.find((r) => r.tool === tool && r.test === test && (scope === 'head' || (r.material === material && Math.abs((r.nozzle ?? 0) - (nozzle ?? 0)) < 1e-6))) ?? null
}

// ---- extruder calibration (Ellis: mark 120 mm, extrude 100 mm at 1 mm/s, measure what's left) ----------------------

export const EXTRUDER_TEST = { mark: 120, extrude: 100, feed: 60 } as const

/**
 * The lines that push the test length: relative extrusion, 100 mm at 1 mm/s, in equal moves no longer than Klipper
 * allows on their own (max_extrude_only_distance; Klipper's default is 50 and refuses only a move longer than it).
 * The Rhino's [extruder] doesn't set it, so this is two 50 mm moves: no printer.cfg change, and the guard stays at 50.
 */
export const EXTRUDE_ONLY_DEFAULT = 50
export function extrudeScript(maxOnly: number = EXTRUDE_ONLY_DEFAULT): string {
  const max = Number.isFinite(maxOnly) && maxOnly >= 10 ? maxOnly : EXTRUDE_ONLY_DEFAULT
  const n = Math.ceil(EXTRUDER_TEST.extrude / max - 1e-9)
  const each = Math.floor((EXTRUDER_TEST.extrude / n) * 1000) / 1000
  const moves = Array.from({ length: n }, (_, i) => (i < n - 1 ? each : Number((EXTRUDER_TEST.extrude - each * (n - 1)).toFixed(3))))
  return ['M83', ...moves.map((d) => `G1 E${d} F${EXTRUDER_TEST.feed}`)].join('\n')
}

/**
 * The new rotation distance from what's left to the mark: what went in is mark - left, and Klipper's rotation distance
 * scales with it (new = old × actual / requested; Ellis, Extruder Calibration). Null for a reading that can't be right.
 */
export function newRotationDistance(old: number, leftMm: number): { value: number; actual: number } | { error: string } {
  if (!Number.isFinite(old) || old <= 0) return { error: 'The current rotation distance isn’t known' }
  if (!Number.isFinite(leftMm) || leftMm < 0 || leftMm > EXTRUDER_TEST.mark) return { error: `Enter what's left, 0 to ${EXTRUDER_TEST.mark} mm` }
  const actual = EXTRUDER_TEST.mark - leftMm
  if (actual < 50 || actual > 150) return { error: `${actual.toFixed(1)} mm went in: that's too far from 100 to be a measuring slip. Check the mark and the extruder, then run it again.` }
  return { value: Math.round(old * (actual / EXTRUDER_TEST.extrude) * 10000) / 10000, actual }
}

/** Two runs in a row within half a millimetre of 100 mm: calibrated (Ellis repeats until runs agree) */
export function extruderSettled(actuals: number[]): boolean {
  const last = actuals.slice(-2)
  return last.length === 2 && last.every((a) => Math.abs(a - EXTRUDER_TEST.extrude) <= 0.5)
}

/** For the tool page: each wizard with its last run for this head and material (null = not run) */
export function tuningStatus(st: TuningState | null, tool: string, nozzle: number, material: string): Array<{ test: TuningTest; title: string; run: TuningRun | null }> {
  return WIZARDS.map((w) => ({ test: w.test, title: w.title, run: lastRun(st, tool, w.test, nozzle, material) }))
}

// ---- first-layer squish (Ellis: scattered single-layer patches at 0.25 mm, 120 % lines; babystep live; save) --------

export const SQUISH = { height: 0.25, widthFactor: 1.2, size: 30, feed: 1200, travel: 6000 } as const
/** Filament area for 1.75 mm filament (mm²) */
const FILAMENT_AREA = Math.PI * (1.75 / 2) ** 2

type Rect = { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/** Where the patches go: the middle and four spots towards the corners, each moved clear of the areas to keep clear */
export function squishPatches(bed: { x: number; y: number; keepOut: Rect[] }, size: number = SQUISH.size): Rect[] {
  const spots: Array<[number, number]> = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]
  const out: Rect[] = []
  for (const [fx, fy] of spots) {
    // try the spot, then step it towards the middle until it's clear
    for (let k = 0; k <= 10; k++) {
      const cx = bed.x * (fx + (0.5 - fx) * k * 0.1)
      const cy = bed.y * (fy + (0.5 - fy) * k * 0.1)
      const r = { x0: Math.round(cx - size / 2), y0: Math.round(cy - size / 2), x1: Math.round(cx + size / 2), y1: Math.round(cy + size / 2) }
      if (r.x0 < 5 || r.y0 < 5 || r.x1 > bed.x - 5 || r.y1 > bed.y - 5) continue
      if (bed.keepOut.some((z) => overlaps(r, z)) || out.some((o) => overlaps(r, o))) continue
      out.push(r)
      break
    }
  }
  return out
}

/**
 * The squish test as a job file: START_JOB for the head and material (it heats, homes and sets the Z offset as for any
 * print), then one layer of patches, filled in back-and-forth lines, and END_PRINT. Relative extrusion.
 */
export function squishFile(o: { tool: string; material: string; nozzle: number; path: number; rotationDistance?: number; bed: { x: number; y: number; keepOut: Rect[] } }): string {
  const h = SQUISH.height
  const w = Number((o.nozzle * SQUISH.widthFactor).toFixed(3))
  const e = (len: number) => Number(((w * h * len) / FILAMENT_AREA).toFixed(5))
  const f = (v: number) => Number(v.toFixed(3))
  const out = [
    `; rhino_toolhead = ${o.tool}`,
    `; Rhino Studio first-layer squish test (Ellis' Print Tuning Guide): ${h} mm layer, ${w} mm lines`,
    'M140 S0 ; bed off until START_JOB heats it from the material table',
    'M104 S0 ; nozzle off until START_JOB heats it',
    `START_JOB TOOLHEAD=${o.tool} MATERIAL=${o.material} NOZZLE_SIZE=${f(o.nozzle)} EXTRUDER=${o.path}`,
    ...(o.rotationDistance != null ? [`SET_EXTRUDER_ROTATION_DISTANCE EXTRUDER=extruder DISTANCE=${o.rotationDistance} ; calibrated (Studio tuning)`] : []),
    'G90',
    'G21',
    'M83',
    'G92 E0',
    ';LAYER_CHANGE',
    `;Z:${h}`,
    `G1 Z${h} F600`,
  ]
  for (const p of squishPatches(o.bed)) {
    out.push(`G0 X${p.x0} Y${p.y0} F${SQUISH.travel}`, 'G1 E0.8 F1800 ; unretract')
    let x = p.x0
    let y = p.y0
    let dir = 1
    while (y <= p.y1 + 1e-6) {
      const to = dir > 0 ? p.x1 : p.x0
      out.push(`G1 X${f(to)} Y${f(y)} E${e(Math.abs(to - x))} F${SQUISH.feed}`)
      x = to
      const ny = y + w
      if (ny > p.y1 + 1e-6) break
      out.push(`G1 X${f(x)} Y${f(ny)} E${e(w)} F${SQUISH.feed}`)
      y = ny
      dir = -dir
    }
    out.push('G1 E-0.8 F1800 ; retract', `G1 Z${f(h + 2)} F600`, `G1 Z${h} F600`)
  }
  out.push('M107', 'END_PRINT')
  return out.join('\n') + '\n'
}

/** Klipper's variable for a head + material's first-layer fine-tune (what _RHINO_APPLY_Z adds to the paper test) */
export function zFineVariable(tool: string, materialKey: string): string {
  return `rhino_zfine_${tool}_${materialKey}`.toLowerCase()
}
/** The fine-tune to keep: the offset the patches looked right at, less the head's paper-test height */
export function squishFine(liveOffset: number, paperTest: number): number | null {
  if (!Number.isFinite(liveOffset) || !Number.isFinite(paperTest)) return null
  const v = Math.round((liveOffset - paperTest) * 1000) / 1000
  return Math.abs(v) <= 1 ? v : null
}

// ---- pressure advance (Ellis: the pattern method; sharpest corner wins) -------------------------------------------

export const PA_PATTERN = { layers: 4, height: 0.2, walls: 3, leg: 15, pitch: 22, feed: 6000, firstFeed: 1800, travel: 9000 } as const

/** The values tested, one per column, left to right */
export function paValues(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((start + step * i) * 10000) / 10000)
}

/** A finer range round a pick (Ellis: refine at 0.001-0.002 steps for direct drive): 11 columns */
export function paRefine(pick: number): { start: number; step: number; count: number } {
  const step = 0.002
  return { start: Math.max(0, Math.round((pick - 5 * step) * 10000) / 10000), step, count: 11 }
}

/**
 * Ellis' pressure advance pattern as a job file: columns of nested sharp corners (<), one pressure advance each, set
 * just before that column, over a few layers; counting marks under the columns on the first layer (long every fifth,
 * starting with the first). The head goes back to its usual pressure advance before END_PRINT.
 */
export function paPatternFile(o: {
  tool: string
  material: string
  nozzle: number
  path: number
  rotationDistance?: number
  bed: { x: number; y: number; keepOut: Rect[] }
  values: number[]
  /** what to put back afterwards (printer.cfg's [extruder] pressure_advance) */
  restore: number
}): string {
  const P = PA_PATTERN
  const w = Number((o.nozzle * 1.2).toFixed(3))
  const h = P.height
  const e = (len: number) => Number(((w * h * len) / FILAMENT_AREA).toFixed(5))
  const f = (v: number) => Number(v.toFixed(3))
  const width = o.values.length * P.pitch
  const x0 = Math.round((o.bed.x - width) / 2)
  const yc = Math.round(o.bed.y / 2)
  const out = [
    `; rhino_toolhead = ${o.tool}`,
    `; Rhino Studio pressure advance pattern (Ellis' Print Tuning Guide): ${o.values.length} columns, ${o.values[0]} to ${o.values.at(-1)}`,
    'M140 S0 ; bed off until START_JOB heats it from the material table',
    'M104 S0 ; nozzle off until START_JOB heats it',
    `START_JOB TOOLHEAD=${o.tool} MATERIAL=${o.material} NOZZLE_SIZE=${f(o.nozzle)} EXTRUDER=${o.path}`,
    ...(o.rotationDistance != null ? [`SET_EXTRUDER_ROTATION_DISTANCE EXTRUDER=extruder DISTANCE=${o.rotationDistance} ; calibrated (Studio tuning)`] : []),
    'G90',
    'G21',
    'M83',
    'G92 E0',
  ]
  const move = (x: number, y: number) => out.push(`G0 X${f(x)} Y${f(y)} F${P.travel}`)
  for (let layer = 1; layer <= P.layers; layer++) {
    const z = f(h * layer)
    out.push(';LAYER_CHANGE', `;Z:${z}`, `G1 Z${z} F600`)
    const feed = layer === 1 ? P.firstFeed : P.feed
    if (layer === 1) {
      // counting marks under the columns: long every fifth, from the first
      out.push('SET_PRESSURE_ADVANCE ADVANCE=0')
      o.values.forEach((_, i) => {
        const x = x0 + i * P.pitch + P.leg / 2
        const len = i % 5 === 0 ? 8 : 3
        const y = yc - P.leg - 4
        move(x, y)
        out.push('G1 E0.8 F1800', `G1 X${f(x)} Y${f(y - len)} E${e(len)} F${P.firstFeed}`, 'G1 E-0.8 F1800')
      })
    }
    o.values.forEach((pa, i) => {
      const cx = x0 + i * P.pitch
      out.push(`SET_PRESSURE_ADVANCE ADVANCE=${pa}`)
      for (let k = 0; k < P.walls; k++) {
        // each wall one line width further out, so the walls touch along the legs
        const dx = k * w * Math.SQRT2
        const a = [cx + dx, yc + P.leg]
        const c = [cx + P.leg + dx, yc]
        const b = [cx + dx, yc - P.leg]
        const leg = P.leg * Math.SQRT2
        move(a[0]!, a[1]!)
        out.push('G1 E0.8 F1800', `G1 X${f(c[0]!)} Y${f(c[1]!)} E${e(leg)} F${feed}`, `G1 X${f(b[0]!)} Y${f(b[1]!)} E${e(leg)} F${feed}`, 'G1 E-0.8 F1800')
      }
    })
  }
  out.push(`SET_PRESSURE_ADVANCE ADVANCE=${o.restore} ; back to the usual`, `G1 Z${f(h * P.layers + 5)} F600`, 'M107', 'END_PRINT')
  return out.join('\n') + '\n'
}

/** The pattern's footprint on the bed (for checking it against the areas to keep clear) */
export function paPatternBounds(bed: { x: number; y: number }, columns: number): Rect {
  const P = PA_PATTERN
  const x0 = Math.round((bed.x - columns * P.pitch) / 2)
  const yc = Math.round(bed.y / 2)
  return { x0, y0: yc - P.leg - 12, x1: x0 + columns * P.pitch, y1: yc + P.leg }
}
export const patternClear = (r: Rect, keepOut: Rect[]) => !keepOut.some((z) => r.x0 < z.x1 && r.x1 > z.x0 && r.y0 < z.y1 && r.y1 > z.y0)

// ---- extrusion multiplier (Ellis: 30x30x3 cubes, many top layers, monotonic top, smoothest top wins) ---------------

export const EM_CUBES = { size: 30, height: 3, layer: 0.2, pitch: 40, bottom: 2, infill: 2, walls: 2, infillGap: 3.3 } as const
const FEED = { first: 1200, walls: 2400, infill: 3600, top: 3600, travel: 9000 }

/** The multipliers tried, one cube each, left to right */
export function emValues(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((start + step * i) * 1000) / 1000)
}
/** Finer, round a pick (Ellis: then 0.5 % steps) */
export function emRefine(pick: number): { start: number; step: number; count: number } {
  return { start: Math.round((pick - 0.01) * 1000) / 1000, step: 0.005, count: 5 }
}
/** When every cube looks alike: a wider spread round the middle */
export function emWider(): { start: number; step: number; count: number } {
  return { start: 0.86, step: 0.04, count: 6 }
}

export function emCubesBounds(bed: { x: number; y: number }, count: number): Rect {
  const C = EM_CUBES
  const x0 = Math.round((bed.x - (count * C.pitch - (C.pitch - C.size))) / 2)
  const y0 = Math.round(bed.y / 2 - C.size / 2)
  return { x0, y0, x1: x0 + count * C.pitch, y1: y0 + C.size }
}

/**
 * The extrusion multiplier test as a job file: cubes in a row, each at its own multiplier (M221 before it on every
 * layer), two walls, two solid bottom layers, two of sparse infill, then solid top layers to the top; the last one laid
 * in one direction (monotonic) at 60 mm/s, line width 100 % of the nozzle (Ellis' settings). M221 S100 at the end.
 */
export function emCubesFile(o: { tool: string; material: string; nozzle: number; path: number; rotationDistance?: number; pressureAdvance?: number; bed: { x: number; y: number }; values: number[] }): string {
  const C = EM_CUBES
  const w = o.nozzle
  const h = C.layer
  const e = (len: number) => Number(((w * h * len) / FILAMENT_AREA).toFixed(5))
  const f = (v: number) => Number(v.toFixed(3))
  const layers = Math.round(C.height / h)
  const b = emCubesBounds(o.bed, o.values.length)
  const out = [
    `; rhino_toolhead = ${o.tool}`,
    `; Rhino Studio extrusion multiplier cubes (Ellis' Print Tuning Guide): ${o.values.join(', ')}`,
    'M140 S0 ; bed off until START_JOB heats it from the material table',
    'M104 S0 ; nozzle off until START_JOB heats it',
    `START_JOB TOOLHEAD=${o.tool} MATERIAL=${o.material} NOZZLE_SIZE=${f(o.nozzle)} EXTRUDER=${o.path}`,
    ...(o.rotationDistance != null ? [`SET_EXTRUDER_ROTATION_DISTANCE EXTRUDER=extruder DISTANCE=${o.rotationDistance} ; calibrated (Studio tuning)`] : []),
    ...(o.pressureAdvance != null ? [`SET_PRESSURE_ADVANCE ADVANCE=${o.pressureAdvance} ; tuned (Studio tuning)`] : []),
    'G90',
    'G21',
    'M83',
    'G92 E0',
  ]
  let px = 0
  let py = 0
  const to = (x: number, y: number, feed: number) => {
    out.push(`G1 X${f(x)} Y${f(y)} E${e(Math.hypot(x - px, y - py))} F${feed}`)
    px = x
    py = y
  }
  const travel = (x: number, y: number, retract = true) => {
    if (retract) out.push('G1 E-0.8 F1800', `G0 X${f(x)} Y${f(y)} F${FEED.travel}`, 'G1 E0.8 F1800')
    else out.push(`G0 X${f(x)} Y${f(y)} F${FEED.travel}`)
    px = x
    py = y
  }
  for (let layer = 1; layer <= layers; layer++) {
    const z = f(h * layer)
    out.push(';LAYER_CHANGE', `;Z:${z}`, `G1 Z${z} F600`)
    const first = layer === 1
    const top = layer === layers
    const solid = layer <= C.bottom || layer > C.bottom + C.infill
    o.values.forEach((em, i) => {
      const x0 = b.x0 + i * C.pitch
      const y0 = b.y0
      out.push(`M221 S${f(em * 100)}`)
      // walls, outside in
      for (let k = 0; k < C.walls; k++) {
        const d = w / 2 + k * w
        const feed = first ? FEED.first : FEED.walls
        travel(x0 + d, y0 + d)
        to(x0 + C.size - d, y0 + d, feed)
        to(x0 + C.size - d, y0 + C.size - d, feed)
        to(x0 + d, y0 + C.size - d, feed)
        to(x0 + d, y0 + d, feed)
      }
      // inside: solid lines (monotonic on top, back and forth below), or sparse infill
      const lo = C.walls * w
      const hi = C.size - C.walls * w
      const gap = solid ? w : C.infillGap
      const alongX = layer % 2 === 0
      const feed = first ? FEED.first : top ? FEED.top : FEED.infill
      let dir = 1
      for (let s = lo + w / 2; s <= hi - w / 2 + 1e-6; s += gap) {
        const a = dir > 0 || top ? lo : hi
        const c = dir > 0 || top ? hi : lo
        const [sx, sy, ex, ey] = alongX ? [x0 + a, y0 + s, x0 + c, y0 + s] : [x0 + s, y0 + a, x0 + s, y0 + c]
        // the top's lines all run one way: back to the start of the next over what's printed, no retract needed
        if (s === lo + w / 2) travel(sx, sy)
        else if (top) travel(sx, sy, false)
        else {
          // step over to the next line along the edge
          to(sx, sy, feed)
        }
        to(ex, ey, feed)
        dir = -dir
      }
    })
  }
  out.push('M221 S100 ; back to 100 %', `G1 Z${f(C.height + 5)} F600`, 'M107', 'END_PRINT')
  return out.join('\n') + '\n'
}
