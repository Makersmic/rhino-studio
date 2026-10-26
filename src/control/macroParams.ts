/**
 * Macro buttons that take values: read which parameters a macro uses from its own definition (Klipper's
 * configfile settings, as Mainsail does) and the ranges its description states ("SPEED=0..1", the form the
 * Rhino's generated macros use). A macro with parameters opens a small prompt before it's sent; one without
 * runs as before. The prompt's line still goes through the console's safety check.
 */

export interface MacroParam {
  name: string
  /** the macro's own |default(...), when it has one */
  default: string
  /** from the description, e.g. SPEED=0..1 */
  min?: number
  max?: number
}

/** params.SPEED, params['SPEED'], params.SPEED|default(1) -> [{name, default}] in first-use order. */
export function macroParams(gcode: string, description = ''): MacroParam[] {
  const out = new Map<string, MacroParam>()
  const re = /params(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\])(\s*\|\s*default\(\s*([^)]*?)\s*\))?/g
  for (const m of gcode.matchAll(re)) {
    const name = (m[1] ?? m[2]!).toUpperCase()
    const def = (m[4] ?? '').replace(/^['"]|['"]$/g, '')
    const prev = out.get(name)
    if (!prev) out.set(name, { name, default: def })
    else if (!prev.default && def) prev.default = def
  }
  for (const m of description.matchAll(/\b([A-Z_][A-Z0-9_]*)=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)/g)) {
    const p = out.get(m[1]!)
    if (p) Object.assign(p, { min: Number(m[2]), max: Number(m[3]) })
  }
  return [...out.values()]
}

/** A value Klipper will read as one word: no spaces, quotes, braces or ; (nothing a template could run). */
export const SAFE_VALUE = /^[A-Za-z0-9_.\-:/]{1,64}$/

/** "MACRO K=V ..." from the filled-in values; empty values are left out (the macro's default applies). */
export function macroLine(name: string, values: Record<string, string>): { line: string } | { error: string } {
  const parts = [name]
  for (const [k, raw] of Object.entries(values)) {
    const v = raw.trim()
    if (!v) continue
    if (!SAFE_VALUE.test(v)) return { error: `${k}: letters, digits and . _ - : / only` }
    parts.push(`${k}=${v}`)
  }
  return { line: parts.join(' ') }
}

/** Check a ranged value. null = fine. */
export function checkParam(p: MacroParam, v: string): string | null {
  if (p.min == null || p.max == null || !v.trim()) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return `${p.name}: a number`
  if (n < p.min || n > p.max) return `${p.name}: ${p.min} to ${p.max}`
  return null
}
