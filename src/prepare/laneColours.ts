/**
 * The colour of each filament lane (Mike, Nov 22: click a lane's colour in the style guide and pick one). Plain logic, tested.
 *
 * A lane's colour is the CSS variable `--rs-lane-N` (tokens.css has the defaults, one set for light and one for dark). A colour picked here
 * overrides it for both looks, on the page's root, so every place that draws a lane (the keys, the part chips, the tabs, the Preview) follows.
 * It is kept in this browser only: a convenience, never machine state.
 */
import { MAX_LANES } from './laneKeys'

export const LANE_COLOURS_KEY = 'rs.lane.colours'
/** told to anything that reads the colours itself (the 3D Preview) when they change */
export const LANE_COLOURS_EVENT = 'rs-lane-colours'

const HEX = /^#[0-9a-f]{6}$/i

/** What was saved, made valid: one entry per lane, a #rrggbb colour or null for the default */
export function cleanColours(raw: unknown): (string | null)[] {
  const list = Array.isArray(raw) ? raw : []
  return Array.from({ length: MAX_LANES }, (_, i) => (typeof list[i] === 'string' && HEX.test(list[i] as string) ? (list[i] as string).toLowerCase() : null))
}

/** A colour as #rrggbb from sRGB numbers 0 to 1 */
export function hexOf(c: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}
