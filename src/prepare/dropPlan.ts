/**
 * Several files dropped or picked at once: which ones join the job and which are left out, and why.
 * A job is all 3D models or all flat drawings; a ready-made G-code file is set up on its own (Mike, Nov 2026: load the
 * ones that fit and say which were skipped, rather than refusing the whole drop).
 */
import { GCODE_TYPES } from '@/slicer/gcodeFile'
import { FLAT_TYPES, MODEL_TYPES, extOf } from '@/slicer/model'

export type DropKind = 'model' | 'flat' | 'gcode' | 'other'

export function kindOf(name: string): DropKind {
  const ext = extOf(name)
  if ((GCODE_TYPES as readonly string[]).includes(ext)) return 'gcode'
  if (FLAT_TYPES.has(ext)) return 'flat'
  if ((MODEL_TYPES as readonly string[]).includes(ext)) return 'model'
  return 'other'
}

export interface DropPlan {
  /** what gets loaded, in the order given: models or drawings, or one G-code file on its own */
  load: number[]
  kind: DropKind | null
  skipped: Array<{ name: string; why: string }>
}

const WORD = { model: 'a 3D model', flat: 'a flat drawing' } as const
const HOLDS = { model: '3D models', flat: 'flat drawings' } as const

/**
 * `have` is what the job already holds when files are added to it, or null when they start a new one. Starting fresh,
 * the first model or drawing sets the kind; with none, the first G-code file is loaded alone.
 */
export function planDrop(names: string[], have: 'model' | 'flat' | null = null): DropPlan {
  const kinds = names.map(kindOf)
  let kind: DropKind | null = have ?? kinds.find((k) => k === 'model' || k === 'flat') ?? (kinds.includes('gcode') ? 'gcode' : null)
  const load: number[] = []
  const skipped: DropPlan['skipped'] = []
  names.forEach((name, i) => {
    const k = kinds[i]!
    if (k === 'other') skipped.push({ name, why: "not a file Job setup reads" })
    else if (kind === 'gcode') {
      if (k === 'gcode' && !load.length) load.push(i)
      else skipped.push({ name, why: 'one ready-made G-code file at a time' })
    } else if (k === 'gcode') skipped.push({ name, why: 'a ready-made G-code file is set up on its own' })
    else if (k !== kind) skipped.push({ name, why: `${WORD[k]}, and this job holds ${HOLDS[kind as 'model' | 'flat']}` })
    else load.push(i)
  })
  if (!load.length) kind = null
  return { load, kind, skipped }
}

/** "Skipped plate.svg: a flat drawing, …" for one file; a list for several */
export function skippedMessage(skipped: DropPlan['skipped']): string | null {
  if (!skipped.length) return null
  if (skipped.length === 1) return `Skipped ${skipped[0]!.name}: ${skipped[0]!.why}.`
  return `Skipped ${skipped.length} files: ${skipped.map((s) => `${s.name} (${s.why})`).join(', ')}.`
}
