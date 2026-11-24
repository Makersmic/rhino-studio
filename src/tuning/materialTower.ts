/**
 * Wizards > Material tower: test prints for the two things that change with every filament, the temperature and the retraction.
 * Studio writes the G-code itself (like the pressure-advance pattern), so Klipper needs nothing extra: no firmware retraction,
 * no TUNING_TOWER. The temperature goes up the tower in bands (an M109 at the start of each); in the retraction test two small
 * pillars stand apart and the retraction length changes every band, so the strings between them show which length is enough.
 * Plain logic with tests; the wizard shows the G-code and the person looks at the printed tower and picks a band.
 */
import { FILAMENT_AREA } from './tuning'

export const TOWER = { layer: 0.2, band: 5, size: 20, pillar: 6, gap: 40, widthFactor: 1.2, firstFeed: 1200, feed: 2400, travel: 12000, retractSpeed: 35 } as const
export type Mode = 'temperature' | 'retraction'

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Bottom to top. A temperature tower runs hot to cool, so the first layers stick. */
export function tempValues(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(start - i * step))
}
export function retractValues(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Number((start + i * step).toFixed(2)))
}

export const DEFAULTS: Record<Mode, { start: number; step: number; count: number }> = {
  temperature: { start: 230, step: 5, count: 7 },
  retraction: { start: 0.4, step: 0.4, count: 7 },
}
export const LIMITS: Record<Mode, { min: number; max: number }> = { temperature: { min: 160, max: 290 }, retraction: { min: 0, max: 8 } }

export function valuesProblem(mode: Mode, v: number[], heaterMax?: number): string | null {
  const l = LIMITS[mode]
  if (v.length < 3 || v.length > 10) return 'Use 3 to 10 bands.'
  if (v.some((x) => !Number.isFinite(x) || x < l.min || x > l.max)) return `Every value must be from ${l.min} to ${l.max}${mode === 'temperature' ? ' C' : ' mm'}.`
  if (mode === 'temperature' && heaterMax && v.some((x) => x > heaterMax - 15)) return `The hotend's limit is ${heaterMax} C; keep the tower at ${heaterMax - 15} C or less.`
  return null
}

export function footprint(bed: { x: number; y: number }, mode: Mode): Rect {
  const w = mode === 'temperature' ? TOWER.size : TOWER.gap + TOWER.pillar
  const h = mode === 'temperature' ? TOWER.size : TOWER.pillar
  const x0 = Math.round((bed.x - w) / 2), y0 = Math.round((bed.y - h) / 2)
  return { x0, y0, x1: x0 + w, y1: y0 + h }
}
export const towerHeight = (count: number) => count * TOWER.band

/** Which band a measured height on the printed tower falls in (0 = the bottom band). The first layer isn't counted as a band. */
export function bandAtHeight(mm: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(mm / TOWER.band)))
}

export function towerFile(o: { tool: string; material: string; nozzle: number; path: number; bed: { x: number; y: number }; mode: Mode; values: number[] }): string {
  const h = TOWER.layer
  const w = Number((o.nozzle * TOWER.widthFactor).toFixed(3))
  const f = (v: number) => Number(v.toFixed(3))
  const e = (len: number) => Number(((w * h * len) / FILAMENT_AREA).toFixed(5))
  const out: string[] = [
    `; rhino_toolhead = ${o.tool}`,
    `; Rhino Studio ${o.mode} tower: ${o.values.length} bands of ${TOWER.band} mm, ${o.values.join(', ')}`,
    'M140 S0 ; bed off until START_JOB heats it from the material table',
    'M104 S0 ; nozzle off until START_JOB heats it',
    `START_JOB TOOLHEAD=${o.tool} MATERIAL=${o.material} NOZZLE_SIZE=${f(o.nozzle)} EXTRUDER=${o.path}`,
    'G90',
    'G21',
    'M83',
    'G92 E0',
  ]
  const r = footprint(o.bed, o.mode)
  const loop = (x0: number, y0: number, s: number, feed: number) => {
    out.push(`G0 X${f(x0)} Y${f(y0)} F${TOWER.travel}`, 'G1 E0.8 F1800 ; unretract')
    for (const [x, y] of [[x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]] as const) out.push(`G1 X${f(x)} Y${f(y)} E${e(s)} F${feed}`)
    out.push('G1 E-0.8 F1800 ; retract')
  }
  const perBand = Math.round(TOWER.band / h)
  const layers = o.values.length * perBand
  for (let n = 1; n <= layers; n++) {
    const z = f(h * n)
    const band = Math.min(o.values.length - 1, Math.floor((n - 1) / perBand))
    out.push(';LAYER_CHANGE', `;Z:${z}`, `G1 Z${z} F600`)
    if ((n - 1) % perBand === 0) out.push(o.mode === 'temperature' ? `M109 S${o.values[band]} ; band ${band + 1}: ${o.values[band]} C` : `; band ${band + 1}: retraction ${o.values[band]} mm`)
    const feed = n === 1 ? TOWER.firstFeed : TOWER.feed
    if (o.mode === 'temperature') {
      loop(r.x0, r.y0, TOWER.size, feed)
      if (n === 1) loop(r.x0 + w, r.y0 + w, TOWER.size - 2 * w, feed)     // a second ring on the first layer: a firmer base
    } else {
      const len = o.values[band]!
      const sp = TOWER.retractSpeed * 60
      const ax = r.x0, bx = r.x0 + TOWER.gap
      loop(ax, r.y0, TOWER.pillar, feed)
      out.push(`G1 E-${len} F${sp} ; retract ${len} mm`, `G0 X${f(bx)} Y${f(r.y0)} F${TOWER.travel}`, `G1 E${len} F${sp} ; unretract`)
      loop(bx, r.y0, TOWER.pillar, feed)
      out.push(`G1 E-${len} F${sp}`, `G0 X${f(ax)} Y${f(r.y0)} F${TOWER.travel}`, `G1 E${len} F${sp}`)
    }
  }
  out.push(`G1 Z${f(h * layers + 5)} F600`, 'M107', 'END_PRINT')
  return out.join('\n') + '\n'
}
