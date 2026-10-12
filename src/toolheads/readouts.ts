/**
 * What to show for the mounted tool.
 *
 * Every tool shares the toolhead, position, job, camera, motion, macros and
 * console. The rest depends on the tool: a print head cares about the
 * hotend, bed and part fan; a laser about its rail and power; the spindle
 * about its relay and throttle; the knife about none of those.
 *
 * Two safety exceptions put a reading back even when it "doesn't apply":
 *  - a warm or heating bed under a laser, spindle or knife job (wood, MDF and
 *    vinyl on a hot bed: scorching, warping, fire), shown so it can be
 *    switched off;
 *  - the hotend heater switched on while a non-print tool is mounted: its
 *    output (HE0) is still wired to the tool connector.
 * With no confirmed tool, heaters only show when they are on or still hot.
 *
 * Used by the Control status strip and the Dashboard, so both agree.
 */

export type ToolKind = 'print' | 'laser' | 'cnc' | 'knife' | 'powered' | 'passive' | 'none'

export type ReadoutId =
  | 'hotend' // print head: edit + graph
  | 'body' // tool body temperature from the shared T0 thermistor (read only)
  | 'hotend-on' // non-print tool, but the hotend heater is on: alert, can only be switched off
  | 'bed' // print head: edit + graph
  | 'bed-warm' // non-print tool, bed warm or heating: can only be switched off
  | 'fan' // part cooling fan
  | 'laser' // laser rail and power
  | 'spindle' // spindle relay and throttle
  | 'power' // an added powered tool (hot wire, needle...)

export interface ReadoutInput {
  kind: ToolKind
  hotend: { temp: number | null; target: number | null }
  bed: { temp: number | null; target: number | null }
  /** a believable reading on the T0 input (tool body thermistor fitted) */
  bodyReading: boolean
  has: { fan: boolean; laser: boolean; spindle: boolean; toolPower: boolean }
}

export interface ReadoutPlan {
  readouts: ReadoutId[]
  /** machine position, or the job's work coordinates (after work zero) first */
  position: 'machine' | 'work'
}

/** The bed counts as warm from here: hot enough to matter under wood or vinyl. */
export const BED_WARM = 40
/** A hotend this hot is worth a look even with the heater off. */
export const HOTEND_WARM = 50

export function toolKind(type: string | null | undefined, verified: boolean): ToolKind {
  if (!verified) return 'none'
  switch (type) {
    case 'DEPOSITION': return 'print'
    case 'LASER': return 'laser'
    case 'CNC': return 'cnc'
    case 'DRAG_KNIFE': return 'knife'
    case 'POWERED': return 'powered'
    default: return 'passive'
  }
}

const on = (h: { target: number | null }) => (h.target ?? 0) > 0
const warm = (h: { temp: number | null; target: number | null }, limit: number) => on(h) || (h.temp ?? 0) >= limit

export function readoutPlan(i: ReadoutInput): ReadoutPlan {
  const r: ReadoutId[] = []
  switch (i.kind) {
    case 'print':
      r.push('hotend', 'bed')
      if (i.has.fan) r.push('fan')
      return { readouts: r, position: 'machine' }
    case 'none':
      // Unknown tool (e.g. after a restart): only heaters that are on or hot
      if (warm(i.hotend, HOTEND_WARM)) r.push('hotend-on')
      if (warm(i.bed, BED_WARM)) r.push('bed-warm')
      return { readouts: r, position: 'machine' }
  }
  // Every other tool: its own output first, then its body temperature
  if (i.kind === 'laser' && i.has.laser) r.push('laser')
  if (i.kind === 'cnc' && i.has.spindle) r.push('spindle')
  if (i.kind === 'powered' && i.has.toolPower) r.push('power')
  if (on(i.hotend)) r.push('hotend-on')
  else if (i.bodyReading) r.push('body')
  if (warm(i.bed, BED_WARM)) r.push('bed-warm')
  // Laser files use machine X/Y (its wizard clears work offsets); CNC, knife and added tools work from a work zero
  return { readouts: r, position: i.kind === 'laser' ? 'machine' : 'work' }
}

/** What a tool's job is called. */
export function jobNoun(kind: ToolKind): string {
  return { print: 'Print', laser: 'Laser job', cnc: 'Spindle job', knife: 'Cut', powered: 'Job', passive: 'Job', none: 'Job' }[kind]
}
