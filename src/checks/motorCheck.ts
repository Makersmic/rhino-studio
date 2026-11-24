/**
 * Settings > Motor check: plain logic (Tool Manager docs/proposal-tuning-wizards-2.md, item 3). Reads what Klipper
 * says about the end switches (QUERY_ENDSTOPS) and the motor drivers (DUMP_TMC) and turns it into sentences, and
 * builds the small moves of the motor test. No Vue, no network. Nothing here changes a setting.
 */
export interface Endstop {
  name: string
  triggered: boolean
}

/** "x:open y:open z:TRIGGERED probe:open" */
export function parseEndstops(lines: string[]): Endstop[] {
  const out: Endstop[] = []
  for (const l of lines) for (const m of l.matchAll(/([A-Za-z_][\w]*):(open|TRIGGERED)/g)) out.push({ name: m[1]!, triggered: m[2] === 'TRIGGERED' })
  return out
}

export interface Driver {
  object: string
  kind: string
  stepper: string
}
/** The TMC drivers Klipper has, from its object list ("tmc2240 stepper_x"). */
export function driversFrom(objects: Iterable<string>): Driver[] {
  const out: Driver[] = []
  for (const o of objects) {
    const m = /^(tmc\d+) (\S+)$/.exec(o)
    if (m) out.push({ object: o, kind: m[1]!, stepper: m[2]! })
  }
  const rank = (s: string) => ['stepper_x', 'stepper_y', 'stepper_z', 'stepper_z1', 'stepper_z2', 'extruder'].indexOf(s)
  return out.sort((a, b) => (rank(a.stepper) < 0 ? 99 : rank(a.stepper)) - (rank(b.stepper) < 0 ? 99 : rank(b.stepper)) || a.stepper.localeCompare(b.stepper))
}

export type Level = 'ok' | 'warn' | 'bad'
export interface Finding {
  flag: string
  level: Level
  say: string
}
/** What each flag in a driver's status register means, in a sentence. Anything not listed is ignored (it is normal state, like stst). */
const FLAGS: Record<string, [Level, string]> = {
  ot: ['bad', 'The driver is too hot and has shut itself down. Check its fan and the current.'],
  otpw: ['warn', 'The driver is getting hot (over-temperature warning). Check its fan and the current.'],
  t120: ['warn', 'The driver is above 120 C.'],
  t143: ['warn', 'The driver is above 143 C.'],
  t150: ['bad', 'The driver is above 150 C.'],
  t157: ['bad', 'The driver is above 157 C.'],
  s2ga: ['bad', 'A short to ground on one motor wire (coil A). Power off and check the wiring.'],
  s2gb: ['bad', 'A short to ground on one motor wire (coil B). Power off and check the wiring.'],
  s2vsa: ['bad', 'A short to the supply on coil A. Power off and check the wiring.'],
  s2vsb: ['bad', 'A short to the supply on coil B. Power off and check the wiring.'],
  ola: ['warn', 'Open load on coil A: the motor may be unplugged or a wire broken. (This can show once at a standstill; run it again while the motor moves.)'],
  olb: ['warn', 'Open load on coil B: the motor may be unplugged or a wire broken. (This can show once at a standstill; run it again while the motor moves.)'],
  drv_err: ['bad', 'The driver reports an error (overtemperature or a short).'],
  uv_cp: ['bad', 'The driver\'s charge pump is under voltage: check the motor supply.'],
  vm_uvlo: ['bad', 'The motor supply is too low: check the power supply and its wiring.'],
  reset: ['warn', 'The driver was reset since Klipper started (a power dip?). Its settings are re-sent by Klipper; if this keeps happening check the supply.'],
}

/** The registers DUMP_TMC prints: "DRV_STATUS: c0150000 cs_actual=21(21) stst=1" */
export function parseDump(lines: string[]): { reg: string; hex: string; fields: Record<string, number> }[] {
  const out: { reg: string; hex: string; fields: Record<string, number> }[] = []
  for (const l of lines) {
    const m = /^\s*([A-Z0-9_]+):\s+([0-9a-fA-F]{8})\b(.*)$/.exec(l)
    if (!m) continue
    const fields: Record<string, number> = {}
    for (const f of m[3]!.matchAll(/([A-Za-z0-9_]+)=(-?\d+)/g)) fields[f[1]!] = +f[2]!
    out.push({ reg: m[1]!, hex: m[2]!, fields })
  }
  return out
}

/** What is wrong, in order of how bad it is; empty when the driver is fine. Only the registers that carry flags are read. */
export function findings(lines: string[]): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  for (const r of parseDump(lines)) {
    if (r.reg !== 'DRV_STATUS' && r.reg !== 'GSTAT') continue
    for (const [name, v] of Object.entries(r.fields)) {
      const f = FLAGS[name]
      if (f && v && !seen.has(name)) {
        seen.add(name)
        out.push({ flag: name, level: f[0], say: f[1] })
      }
    }
  }
  const rank = { bad: 0, warn: 1, ok: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}
export const worst = (f: Finding[]): Level => (f.some((x) => x.level === 'bad') ? 'bad' : f.some((x) => x.level === 'warn') ? 'warn' : 'ok')

/** Did the driver answer at all? (A dead or unwired driver prints nothing readable, or all ones.) */
export function answered(lines: string[]): boolean {
  const regs = parseDump(lines)
  return regs.length > 0 && !regs.every((r) => r.hex.toLowerCase() === 'ffffffff' || r.hex === '00000000')
}

export interface Area {
  min: number[]
  max: number[]
}
/** Before the motors buzz: the bed down 10 mm (bigger Z is the bed lower) and the head to the middle, so nothing can touch. */
export function prepScript(lim: Area | null, z: number | null): string | null {
  if (!lim || z === null) return null
  const cx = Math.round((lim.min[0]! + lim.max[0]!) / 2)
  const cy = Math.round((lim.min[1]! + lim.max[1]!) / 2)
  const down = Math.min(10, Math.max(0, lim.max[2]! - z))
  return [...(down > 0 ? ['G91', `G1 Z${down} F600`] : []), 'G90', `G1 X${cx} Y${cy} F6000`].join('\n')
}
export const buzzScript = (stepper: string) => `STEPPER_BUZZ STEPPER=${stepper}`
export const validStepper = (s: string) => /^(stepper_[xyz]\d?|extruder\d*)$/.test(s)

export const LABEL: Record<string, string> = { stepper_x: 'X motor', stepper_y: 'Y motor', stepper_z: 'Z motor', stepper_z1: 'Z1 motor', stepper_z2: 'Z2 motor', extruder: 'Extruder motor' }
export const labelOf = (s: string) => LABEL[s] ?? s
