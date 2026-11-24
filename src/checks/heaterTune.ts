/**
 * Wizards > Tune a heater: plain logic (Tool Manager docs/proposal-tuning-wizards-2.md, item 2). Finds the heaters Klipper
 * has (the hotend, the bed and any chamber heater), builds the PID_CALIBRATE G-code, reads the PID numbers Klipper prints and
 * compares them with what the heater has now. No Vue, no network. SAVE_CONFIG is never used: the numbers are kept by the Portal.
 */
export type HeaterKind = 'hotend' | 'bed' | 'chamber'
export interface Heater {
  /** the Klipper object, e.g. "extruder", "heater_bed", "heater_generic chamber" */
  object: string
  /** the name PID_CALIBRATE takes: "extruder", "heater_bed", "chamber" */
  name: string
  kind: HeaterKind
  label: string
}

/** The heaters Klipper has, from its object list. A `heater_generic` is a chamber or another heater the person added. */
export function heatersFrom(objects: Iterable<string>): Heater[] {
  const out: Heater[] = []
  for (const o of objects) {
    if (o === 'extruder') out.push({ object: o, name: 'extruder', kind: 'hotend', label: 'Hotend' })
    else if (o === 'heater_bed') out.push({ object: o, name: 'heater_bed', kind: 'bed', label: 'Bed' })
    else {
      const m = /^heater_generic (\S+)$/.exec(o)
      if (m) out.push({ object: o, name: m[1]!, kind: 'chamber', label: /chamber|enclosure/i.test(m[1]!) ? 'Chamber' : `Heater “${m[1]}”` })
    }
  }
  const rank: Record<HeaterKind, number> = { hotend: 0, bed: 1, chamber: 2 }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name))
}

export interface Pid {
  kp: number
  ki: number
  kd: number
}
/** "PID parameters: pid_Kp=28.729 pid_Ki=2.176 pid_Kd=94.807" */
export function parsePid(lines: string[]): Pid | null {
  for (const l of lines) {
    const m = /PID parameters:\s*pid_Kp=([\d.]+)\s+pid_Ki=([\d.]+)\s+pid_Kd=([\d.]+)/i.exec(l)
    if (m) return { kp: +m[1]!, ki: +m[2]!, kd: +m[3]! }
  }
  return null
}
export const sane = (p: Pid) => [p.kp, p.ki, p.kd].every((v) => Number.isFinite(v) && v > 0 && v < 10000)

export const HEATER_GENERIC_MAX = 120
/** A starting target for each kind: what people usually print or hold at. */
export const SUGGEST: Record<HeaterKind, number> = { hotend: 210, bed: 60, chamber: 45 }
export const MINUTES: Record<HeaterKind, string> = { hotend: '5 to 10', bed: '10 to 20', chamber: '20 to 60' }

/** Why this target can't be used, or null. `limit` is Klipper's max_temp for the heater, when known. */
export function targetProblem(h: Heater, target: number, limit?: number): string | null {
  const cap = Math.min(limit ?? Infinity, h.kind === 'chamber' ? HEATER_GENERIC_MAX : Infinity)
  const top = Number.isFinite(cap) ? cap - (h.kind === 'hotend' ? 15 : 5) : h.kind === 'hotend' ? 275 : 120
  if (!Number.isFinite(target)) return 'The temperature must be a number.'
  if (target < 40) return 'The temperature must be at least 40 C.'
  if (target > top) return `The temperature must be ${top} C or less (the heater's limit is ${Number.isFinite(cap) ? cap : 'not known'} C${Number.isFinite(cap) ? ', and the tune needs a little room under it' : ''}).`
  return null
}

/** A chamber tune starts from a cool chamber, so the reading is the heater's own work and not leftover heat. */
export function startProblem(h: Heater, now: number | null, target: number): string | null {
  if (now === null) return `The ${h.label.toLowerCase()} temperature isn't being read.`
  if (h.kind === 'chamber' && now > target - 10) return `The chamber is already at ${now.toFixed(0)} C. Let it cool to below ${Math.max(0, target - 10)} C first, so the tune measures the heater and not the heat left over.`
  if (h.kind !== 'chamber' && now > target - 5) return `It is already at ${now.toFixed(0)} C. Let it cool a little first.`
  return null
}

const blockWords = /\b(M112|SAVE_CONFIG|FIRMWARE_RESTART|RESTART|FORCE_MOVE|SET_KINEMATIC_POSITION)\b/i
/** What the wizard runs. The part fan goes on for the hotend (as in a print); everything is turned off by Klipper when the tune ends. */
export function script(h: Heater, target: number): string {
  return [...(h.kind === 'hotend' ? ['M106 S255'] : []), `PID_CALIBRATE HEATER=${h.name} TARGET=${target}`, ...(h.kind === 'hotend' ? ['M107'] : [])].join('\n')
}
export function textProblem(text: string, h: Heater): string | null {
  if (blockWords.test(text)) return 'That line isn\'t allowed in this wizard.'
  if (!new RegExp(`PID_CALIBRATE\\s+HEATER=${h.name}\\b`, 'i').test(text)) return `The G-code needs a PID_CALIBRATE line for ${h.name}.`
  const m = /TARGET=([\d.]+)/i.exec(text)
  if (!m) return 'The PID_CALIBRATE line needs a TARGET.'
  return targetProblem(h, +m[1]!)
}

const pct = (a: number, b: number) => (a > 0 ? Math.round(((b - a) / a) * 100) : 0)
/** Old and new side by side, one line per gain. `old` is null when the heater has no PID values of its own (watermark). */
export function compare(old: Pid | null, next: Pid): string[] {
  const row = (name: string, a: number | null, b: number) => (a === null ? `${name} ${b.toFixed(3)}` : `${name} ${a.toFixed(3)} → ${b.toFixed(3)} (${pct(a, b) >= 0 ? '+' : ''}${pct(a, b)}%)`)
  return [row('Kp', old?.kp ?? null, next.kp), row('Ki', old?.ki ?? null, next.ki), row('Kd', old?.kd ?? null, next.kd)]
}
export function explain(old: Pid | null, next: Pid): string {
  if (!old) return 'This heater had no PID values of its own. These are the first.'
  const big = Math.max(Math.abs(pct(old.kp, next.kp)), Math.abs(pct(old.ki, next.ki)), Math.abs(pct(old.kd, next.kd)))
  return big < 10 ? 'The new values are close to the old ones: the heater was already well tuned.' : big < 40 ? 'The new values differ a little from the old ones. That is normal after a change of nozzle, fan or heater.' : 'The new values differ a lot from the old ones. That is normal if the heater, cartridge or the fan changed; if not, run the tune once more to see if it repeats.'
}

/** The lines the Portal will keep in myrhino/tuned.cfg for this heater (shown in "What this does"). */
export function tunedLines(h: Heater, p: Pid): string[] {
  return [`[${h.object}]`, 'control: pid', `pid_Kp: ${p.kp}`, `pid_Ki: ${p.ki}`, `pid_Kd: ${p.kd}`]
}
