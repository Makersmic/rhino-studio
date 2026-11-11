/**
 * The spindle's bits (Assets › Parts › Bits, Tool Manager 1.9.26): kept on the Rhino in the Portal's lists
 * (rhino/lists.py "bits"). Job setup's CNC tool comes from here, and spindle tuning is kept per bit.
 * The checks below mirror the Portal's, so a form says what's wrong before it saves; the Portal checks again.
 */
export type BitType = 'endmill' | 'ballmill'

export interface Bit {
  name: string
  type: BitType
  /** mm */
  diameter: number
  flutes: number
  /** mm of cutting length */
  length: number
  note: string
}

export const BIT_TYPES: { value: BitType; label: string }[] = [
  { value: 'endmill', label: 'End mill' },
  { value: 'ballmill', label: 'Ball mill' },
]
export const BIT_LIMITS = { diameter: [0.1, 25], flutes: [1, 8], length: [0.5, 100] } as const
/** Same as the Portal's: the name is part of a tuning key */
export const BIT_NAME = /^[A-Za-z0-9_.-]{1,40}$/

export const newBit = (n: number): Bit => ({ name: `bit${n}`, type: 'endmill', diameter: 3.175, flutes: 2, length: 12, note: '' })

/** Why this list can't be saved, or null */
export function bitsProblem(bits: Bit[]): string | null {
  const seen = new Set<string>()
  for (const b of bits) {
    const name = b.name.trim()
    if (!BIT_NAME.test(name)) return `Bit name “${name}”: 1 to 40 letters, digits, dots, dashes or underscores, no spaces.`
    if (seen.has(name)) return `Two bits are called ${name}.`
    seen.add(name)
    for (const k of ['diameter', 'flutes', 'length'] as const) {
      const [lo, hi] = BIT_LIMITS[k]
      const v = b[k]
      if (!Number.isFinite(v) || v < lo || v > hi || (k === 'flutes' && !Number.isInteger(v)))
        return `${name}: ${k === 'length' ? 'cutting length' : k} must be from ${lo} to ${hi}${k === 'flutes' ? ', a whole number' : ''}.`
    }
  }
  return null
}

/** "3.175 mm end mill, 2 flutes, 12 mm cutting" */
export function bitText(b: Bit): string {
  return `${b.diameter} mm ${b.type === 'ballmill' ? 'ball mill' : 'end mill'}, ${b.flutes} flute${b.flutes === 1 ? '' : 's'}, ${b.length} mm cutting`
}
