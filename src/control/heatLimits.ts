/**
 * The heater limits Studio enforces: Klipper's own max_temp for the hotend and the bed (configfile.settings, read
 * once per Klipper start by the machine store), never above Studio's ceiling of 300 / 130. Before Klipper has
 * answered, or on a machine that doesn't say, the ceiling applies (audit 2026-11, S4). One module-level record so
 * the console check, the file check and the macro builder all read the same numbers.
 */
export const HEAT_CEILING = { hotend: 300, bed: 130 } as const

export const HEAT_LIMITS: { hotend: number; bed: number } = { hotend: HEAT_CEILING.hotend, bed: HEAT_CEILING.bed }

function limit(v: unknown, ceiling: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), ceiling) : ceiling
}

/** Klipper's max_temp values; anything missing or above the ceiling becomes the ceiling. */
export function setHeatLimits(l: { hotend?: unknown; bed?: unknown }): void {
  HEAT_LIMITS.hotend = limit(l.hotend, HEAT_CEILING.hotend)
  HEAT_LIMITS.bed = limit(l.bed, HEAT_CEILING.bed)
}

export function resetHeatLimits(): void {
  setHeatLimits({})
}
