/**
 * The positions wizard's plain logic (Tool Manager docs/proposal-park-wizard.md): the five position groups in
 * myrhino/positions.cfg, reading their numbers, changing ONLY those `variable_*` lines (every comment and every other line
 * stays byte for byte), checking them against the travel limits, and the test move. No Vue, no network.
 * The Portal never writes this file (it is the person's own); Studio saves it through Moonraker like the Config editor.
 */
export type GroupId = 'park' | 'swap' | 'safe_z' | 'zero_max_z' | 'prime'

export interface Group {
  id: GroupId
  label: string
  /** the variable names, in the order the wizard shows them */
  vars: string[]
  /** which axes the jog sets: xy, or z alone */
  jog: 'xy' | 'z'
  what: string
}

export const GROUPS: Group[] = [
  { id: 'park', label: 'Park', vars: ['park_x', 'park_y'], jog: 'xy', what: 'where the head waits after a pause, a cancel and a cancelled job' },
  { id: 'swap', label: 'Tool swap', vars: ['swap_x', 'swap_y'], jog: 'xy', what: 'where the head goes so you can change the toolhead (a filament change uses it too)' },
  { id: 'safe_z', label: 'Safe height', vars: ['safe_z'], jog: 'z', what: 'the bed is lowered to at least this before a swap, a park or the end of a job; it must clear every tool' },
  { id: 'zero_max_z', label: 'Lowest bed for Set Z zero', vars: ['zero_max_z'], jog: 'z', what: 'the lowest the Set Z zero window will lower the bed' },
  { id: 'prime', label: 'Prime line', vars: ['prime_x', 'prime_y', 'prime_length'], jog: 'xy', what: 'where a print head\'s prime line starts and how long it is (it runs toward +Y)' },
]
export const ALL_VARS = GROUPS.flatMap((g) => g.vars)

const LINE = /^(\s*variable_)([a-z_]+)(\s*:\s*)(-?\d+(?:\.\d+)?)(\s*(?:[#;].*)?)$/

/** `variable_park_x: 551.0` lines, as numbers. Only the names this wizard knows. */
export function parsePositions(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of text.split('\n')) {
    const m = LINE.exec(l.replace(/\r$/, ''))
    if (m && ALL_VARS.includes(m[2]!)) out[m[2]!] = Number(m[4])
  }
  return out
}

export function fmt(n: number): string {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? r.toFixed(1) : String(r)
}

/**
 * Put new numbers into the file. Only a line that already holds `variable_<name>: <number>` is changed, keeping its
 * indent, spacing and trailing comment. A name with no such line is returned in `missing` and nothing is added.
 */
export function replaceVariables(text: string, changes: Record<string, number>): { text: string; missing: string[] } {
  const left = new Set(Object.keys(changes))
  const lines = text.split('\n').map((l) => {
    const cr = l.endsWith('\r') ? '\r' : ''
    const m = LINE.exec(cr ? l.slice(0, -1) : l)
    if (!m || !left.has(m[2]!)) return l
    left.delete(m[2]!)
    return `${m[1]}${m[2]}${m[3]}${fmt(changes[m[2]!]!)}${m[5]}${cr}`
  })
  return { text: lines.join('\n'), missing: [...left] }
}

export interface Limits {
  min: [number, number, number]
  max: [number, number, number]
}

const AXIS: Record<string, 0 | 1 | 2> = { park_x: 0, park_y: 1, swap_x: 0, swap_y: 1, safe_z: 2, zero_max_z: 2, prime_x: 0, prime_y: 1 }
const LABEL: Record<string, string> = { park_x: 'Park X', park_y: 'Park Y', swap_x: 'Tool swap X', swap_y: 'Tool swap Y', safe_z: 'Safe height', zero_max_z: 'Lowest bed for Set Z zero', prime_x: 'Prime line X', prime_y: 'Prime line Y', prime_length: 'Prime line length' }

/** Each value against the travel limits (what RHINO_POSITIONS checks), as sentences; empty when all are fine. */
export function limitProblems(values: Record<string, number>, lim: Limits | null): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(values)) {
    if (!ALL_VARS.includes(k)) {
      out.push(`${k} isn't one of the positions this wizard changes.`)
      continue
    }
    if (!Number.isFinite(v)) {
      out.push(`${LABEL[k]} isn't a number.`)
      continue
    }
    if (!lim) continue
    const a = AXIS[k]
    if (a != null && (v < lim.min[a]! || v > lim.max[a]!)) out.push(`${LABEL[k]} ${fmt(v)} is outside ${'XYZ'[a]} ${lim.min[a]} to ${lim.max[a]} (the travel limits in printer.cfg).`)
  }
  if (lim && 'prime_y' in values && 'prime_length' in values) {
    const end = values.prime_y! + values.prime_length!
    if (end > lim.max[1]!) out.push(`The prime line would end at Y ${fmt(end)}, past Y ${lim.max[1]}.`)
    if (values.prime_length! <= 0) out.push('The prime line length must be more than 0.')
  }
  return out
}

/** The changed lines the wizard shows in its edit box: `variable_name: value`, in file order of GROUPS. */
export function changedLines(values: Record<string, number>): string {
  return ALL_VARS.filter((v) => v in values).map((v) => `variable_${v}: ${fmt(values[v]!)}`).join('\n')
}

/** Read back what a person typed in the edit box. Anything but a known variable with a number is a problem. */
export function parseEdited(text: string): { values: Record<string, number>; problem: string | null } {
  const values: Record<string, number> = {}
  for (const raw of text.split('\n')) {
    const l = raw.trim()
    if (!l || l.startsWith('#') || l.startsWith(';')) continue
    const m = /^variable_([a-z_]+)\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:[#;].*)?$/.exec(l)
    if (!m) return { values, problem: `"${l}" isn't a line like variable_park_x: 551.0. Only the position numbers can be edited here.` }
    if (!ALL_VARS.includes(m[1]!)) return { values, problem: `variable_${m[1]} isn't one of the positions this wizard changes.` }
    values[m[1]!] = Number(m[2])
  }
  return { values, problem: null }
}

/** One sentence for the review: what will be different in use. */
export function sentence(id: GroupId, before: Record<string, number>, after: Record<string, number>): string {
  const n = (k: string, src: Record<string, number>) => (k in src ? fmt(src[k]!) : '?')
  switch (id) {
    case 'park':
      return `After a pause or cancel the head will wait at X${n('park_x', after)} Y${n('park_y', after)} (was X${n('park_x', before)} Y${n('park_y', before)}).`
    case 'swap':
      return `To change a toolhead the head will go to X${n('swap_x', after)} Y${n('swap_y', after)} (was X${n('swap_x', before)} Y${n('swap_y', before)}).`
    case 'safe_z':
      return `The bed will be lowered to at least Z${n('safe_z', after)} before a swap, a park or the end of a job (was Z${n('safe_z', before)}).`
    case 'zero_max_z':
      return `Set Z zero will lower the bed no further than Z${n('zero_max_z', after)} (was Z${n('zero_max_z', before)}).`
    case 'prime':
      return `The prime line will start at X${n('prime_x', after)} Y${n('prime_y', after)} and run ${n('prime_length', after)} mm toward +Y (was X${n('prime_x', before)} Y${n('prime_y', before)}, ${n('prime_length', before)} mm).`
  }
}

/** The test: set the new numbers live (until the next restart), lift, and go slowly there. Park and swap only. */
export function testScript(id: 'park' | 'swap', values: Record<string, number>): string {
  const x = values[`${id}_x`]
  const y = values[`${id}_y`]
  if (x == null || y == null) return ''
  return [
    `SET_GCODE_VARIABLE MACRO=RHINO_POSITIONS VARIABLE=${id}_x VALUE=${fmt(x)}`,
    `SET_GCODE_VARIABLE MACRO=RHINO_POSITIONS VARIABLE=${id}_y VALUE=${fmt(y)}`,
    'SAVE_GCODE_STATE NAME=_rs_pos_test',
    'G91',
    'G1 Z10 F600',
    'G90',
    `G1 X${fmt(x)} Y${fmt(y)} F2400`,
    'RESTORE_GCODE_STATE NAME=_rs_pos_test',
  ].join('\n')
}
