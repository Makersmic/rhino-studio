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
