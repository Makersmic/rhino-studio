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

/** The lines that push the test length: relative extrusion, 100 mm at 1 mm/s */
export function extrudeScript(): string {
  return ['M83', `G1 E${EXTRUDER_TEST.extrude} F${EXTRUDER_TEST.feed}`].join('\n')
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
