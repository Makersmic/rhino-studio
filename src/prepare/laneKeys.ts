/**
 * Filament lanes as piano keys (Mike, Nov 22): one white key per lane, a black key between two neighbours for "when this lane
 * runs out, carry on with the next". Plain logic here, tested; LaneKeys.vue only draws it.
 *
 * Not tied to SwitchFly: a lane is a place filament comes from, so the same keys serve SwitchFly's two lanes or an external
 * switcher with more. The runout sensor (an endstop on the lane) is optional; without one, a lane can still be used, and a
 * running-out lane pauses the job for a hand change instead of continuing on its own.
 */

export const MAX_LANES = 8

export interface LaneInfo {
  /** the material's key in the toolhead's table (PLA_0_4_T0), or null while nothing is chosen */
  material: string | null
  /** a runout sensor is fitted on this lane */
  runoutSensor: boolean
}

export const laneName = (i: number) => `Lane ${i + 1}`

/** "PLA_0_4_T0" and "PLA_0_4" both give "PLA": which filament, whatever the nozzle or path */
export function materialFamily(key: string | null | undefined): string | null {
  if (!key) return null
  const f = key.replace(/_T\d+$/i, '').replace(/_\d+_\d+$/, '').trim().toUpperCase()
  return f || null
}

export type Link = { ok: true } | { ok: false; reason: string }

/**
 * May lane `i` carry on into lane `i + 1` when it runs out? It needs a runout sensor to know, and the same filament in the next
 * lane, or the print would change material in the middle.
 */
export function linkAllowed(lanes: readonly LaneInfo[], i: number): Link {
  const a = lanes[i]
  const b = lanes[i + 1]
  if (!a || !b) return { ok: false, reason: 'There is no lane after this one' }
  const fa = materialFamily(a.material)
  const fb = materialFamily(b.material)
  if (!fa || !fb) return { ok: false, reason: 'Choose a filament for both lanes first' }
  if (fa !== fb) return { ok: false, reason: `${laneName(i)} holds ${fa} and ${laneName(i + 1)} holds ${fb}: a runout can only carry on with the same filament` }
  if (!a.runoutSensor) return { ok: false, reason: `${laneName(i)} has no runout sensor yet: fit an endstop on it to use this` }
  return { ok: true }
}

/** The links that are still allowed (one flag per gap between lanes); anything that stopped making sense is switched off */
export function cleanLinks(lanes: readonly LaneInfo[], links: readonly boolean[]): boolean[] {
  return lanes.slice(0, -1).map((_, i) => !!links[i] && linkAllowed(lanes, i).ok)
}

/** The lanes a print would use in turn when `start` runs out: start, then each linked neighbour */
export function runoutChain(lanes: readonly LaneInfo[], links: readonly boolean[], start: number): number[] {
  const out = [start]
  let i = start
  while (i < lanes.length - 1 && links[i] && linkAllowed(lanes, i).ok) out.push(++i)
  return out
}

/** Resize the lane list to `n` lanes (2 to MAX_LANES), keeping what is already set */
export function resizeLanes(lanes: readonly LaneInfo[], n: number): LaneInfo[] {
  const want = Math.min(MAX_LANES, Math.max(1, Math.round(n)))
  return Array.from({ length: want }, (_, i) => lanes[i] ?? { material: null, runoutSensor: false })
}
