/**
 * The design of a chain: the bodies of one 3D file (a 3MF's objects, or an STL/OBJ), each given a part to play, placed on
 * the bed for the picture and the checks. Plain functions, tested without a screen (design.test.ts).
 *
 * Roles: the sheet (a body that stands for the material: it sets the sheet's size and thickness), fixtures (printed first,
 * from the bed), features (printed on the sheet), or left out. The design keeps the bodies' places relative to each other
 * as the file has them; its anchor (the sheet body's centre, else the whole design's centre) sits on the chain's sheet
 * centre, or the bed's middle when there is no sheet. Each group is sliced from the bed (docs/design-process-chain.md).
 * The design is not stored in the chain (only the sheet it sets is): open the file again to see it on a reopened chain.
 */
import type { Check } from '@/slicer/check'
import type { KeepOut } from '@/slicer/types'
import { bounds, footprint } from '@/slicer/model'
import { sheetBox, type Chain, type DesignRef, type Sheet } from './chain'

export type BodyRole = 'sheet' | 'fixture' | 'feature' | 'skip'

export interface Body {
  id: number
  name: string
  /** triangles as loaded, in the file's own coordinates */
  vertices: Float32Array
  role: BodyRole
}

export const ROLE_LABEL: Record<BodyRole, string> = { sheet: 'The sheet', fixture: 'Fixture', feature: 'Feature', skip: 'Leave out' }

const FIXTURE_WORDS = /fixture|jig|guide|holder|clamp|locat|stop|frame|nest|cradle/i
const SHEET_WORDS = /sheet|stock|plate|blank|material|panel/i

/** A first guess at what a body is for, from its name; the person can change it */
export function guessRole(name: string): BodyRole {
  if (FIXTURE_WORDS.test(name)) return 'fixture'
  if (SHEET_WORDS.test(name)) return 'sheet'
  return 'feature'
}

/** Name the bodies and give each a guessed role. Only one body may be the sheet and only when the chain places one. */
export function bodiesFrom(parts: ReadonlyArray<{ vertices: Float32Array; name: string }>, chain: Pick<Chain, 'stages'>): Body[] {
  const roles = rolesAvailable(chain)
  let sheetTaken = false
  return parts
    .filter((p) => p.vertices && p.vertices.length >= 9)
    .map((p, i) => {
      let role = guessRole(p.name)
      if (role === 'sheet' && (!roles.includes('sheet') || sheetTaken)) role = 'feature'
      if (role === 'fixture' && !roles.includes('fixture')) role = 'feature'
      if (role === 'sheet') sheetTaken = true
      return { id: i + 1, name: p.name || `Body ${i + 1}`, vertices: p.vertices, role }
    })
}

/** Which roles make sense for this chain: fixtures and a sheet only when it has those stages */
export function rolesAvailable(chain: Pick<Chain, 'stages'>): BodyRole[] {
  const out: BodyRole[] = []
  if (chain.stages.some((s) => s.role === 'place')) out.push('sheet')
  if (chain.stages.some((s) => s.role === 'fixtures')) out.push('fixture')
  out.push('feature', 'skip')
  return out
}

/** Set one body's role. A second sheet body takes the sheet role off the first (there is one sheet). */
export function setRole(bodies: readonly Body[], id: number, role: BodyRole): Body[] {
  return bodies.map((b) => (b.id === id ? { ...b, role } : role === 'sheet' && b.role === 'sheet' ? { ...b, role: 'feature' as BodyRole } : b))
}

export interface Placed {
  id: number
  name: string
  role: BodyRole
  /** outline from above, machine mm */
  outline: Array<[number, number]>
  /** [x0, y0, x1, y1] */
  box: [number, number, number, number]
  /** how tall it is, mm */
  height: number
}

/**
 * Where each body sits on the bed. `at` is where the design's anchor goes: the chain's sheet centre, or the bed's middle.
 * Bodies keep their places relative to each other.
 */
export function place(bodies: readonly Body[], at: { x: number; y: number }): Placed[] {
  const kept = bodies.filter((b) => b.role !== 'skip')
  if (!kept.length) return []
  const bb = kept.map((b) => ({ b, bd: bounds(b.vertices) }))
  const anchorBody = bb.find((k) => k.b.role === 'sheet')
  const src = anchorBody ? [anchorBody] : bb
  const x0 = Math.min(...src.map((k) => k.bd.min[0]!))
  const y0 = Math.min(...src.map((k) => k.bd.min[1]!))
  const x1 = Math.max(...src.map((k) => k.bd.max[0]!))
  const y1 = Math.max(...src.map((k) => k.bd.max[1]!))
  const dx = at.x - (x0 + x1) / 2
  const dy = at.y - (y0 + y1) / 2
  return bb.map(({ b, bd }) => ({
    id: b.id,
    name: b.name,
    role: b.role,
    outline: footprint(b.vertices).map(([x, y]) => [Math.round((x + dx) * 100) / 100, Math.round((y + dy) * 100) / 100] as [number, number]),
    box: [bd.min[0]! + dx, bd.min[1]! + dy, bd.max[0]! + dx, bd.max[1]! + dy],
    height: Math.round((bd.max[2]! - bd.min[2]!) * 1000) / 1000,
  }))
}

/** The sheet a sheet body describes (its size seen from above) and the thickness it implies, rounded to 0.01 mm */
export function sheetFrom(p: Placed): { sheet: Sheet; thickness: number } {
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    sheet: { width: r(p.box[2] - p.box[0]), depth: r(p.box[3] - p.box[1]), x: r((p.box[0] + p.box[2]) / 2), y: r((p.box[1] + p.box[3]) / 2) },
    thickness: r(p.height),
  }
}

const inside = (b: [number, number, number, number], a: { x: number; y: number }) => b[0] >= 0 && b[1] >= 0 && b[2] <= a.x && b[3] <= a.y
const overlaps = (b: [number, number, number, number], k: KeepOut) => b[0] < k.x1 && b[2] > k.x0 && b[1] < k.y1 && b[3] > k.y0
const TOL = 0.05

/** Checks for the design, shown with the chain's own. Errors block the start; a fixture touching the sheet is only a note. */
export function designChecks(placed: readonly Placed[], chain: Pick<Chain, 'stages' | 'sheet'>, area: { x: number; y: number }, keepOut: readonly KeepOut[]): Check[] {
  const out: Check[] = []
  const ok = (id: string, label: string) => out.push({ id, level: 'ok', label })
  const err = (id: string, label: string, detail: string) => out.push({ id, level: 'error', label, detail })
  const warn = (id: string, label: string, detail: string) => out.push({ id, level: 'warn', label, detail })
  const fixtures = placed.filter((p) => p.role === 'fixture')
  const features = placed.filter((p) => p.role === 'feature')

  const needsFixtures = chain.stages.some((s) => s.role === 'fixtures')
  const needsFeatures = chain.stages.some((s) => s.role === 'features')
  if (needsFixtures && !fixtures.length) err('design-fixtures', 'The fixtures stage has something to print', 'No body is marked as a fixture. Mark one, or take the fixtures stage out by starting a chain without a sheet.')
  if (needsFeatures && !features.length) err('design-features', 'The features stage has something to print', 'No body is marked as a feature.')

  const drawn = placed.filter((p) => p.role !== 'sheet')
  const outside = drawn.find((p) => !inside(p.box, area))
  if (outside) err('design-bed', 'The design is on the bed', `${outside.name} reaches outside the area parts may use (${area.x} × ${area.y} mm).`)
  else {
    const hit = drawn.map((p) => ({ p, k: keepOut.find((k) => overlaps(p.box, k)) })).find((h) => h.k)
    hit ? err('design-keepout', 'The design is clear of keep-out areas', `${hit.p.name} overlaps the ${hit.k!.label} keep-clear area.`) : drawn.length && ok('design-bed', 'The design is on the bed, clear of keep-out areas')
  }

  const sheet = chain.sheet ? sheetBox(chain.sheet) : null
  if (sheet && chain.stages.some((s) => s.role === 'place')) {
    const off = features.find((p) => p.box[0] < sheet[0] - TOL || p.box[1] < sheet[1] - TOL || p.box[2] > sheet[2] + TOL || p.box[3] > sheet[3] + TOL)
    if (off) err('design-sheet', 'The features are on the sheet', `${off.name} reaches past the sheet’s edge. It would print in the air. Make the sheet bigger or move it.`)
    else if (features.length) ok('design-sheet', 'The features are on the sheet')
    const touch = fixtures.find((p) => p.box[0] < sheet[2] - TOL && p.box[2] > sheet[0] + TOL && p.box[1] < sheet[3] - TOL && p.box[3] > sheet[1] + TOL)
    if (touch) warn('design-clash', 'The fixtures clear the sheet', `${touch.name}’s outline box overlaps the sheet. That is fine for an L or a frame that holds the sheet; check the picture.`)
  }
  return out
}

// ---- remembering the design (the file lives in the Portal's model library; the chain keeps its path and the parts)

export const DESIGN_FOLDER = 'Chains'

/** Where a chain's design file goes in the model library: its own folder, named by the chain so two chains never share a file */
export function libraryPath(chainName: string, fileName: string): string {
  const clean = (t: string) => t.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '')
  const dot = fileName.lastIndexOf('.')
  const stem = clean(dot >= 0 ? fileName.slice(0, dot) : fileName) || 'design'
  const ext = dot >= 0 ? clean(fileName.slice(dot + 1)).toLowerCase() : 'stl'
  return `${DESIGN_FOLDER}/${(clean(chainName) || 'chain').toLowerCase()}__${stem}.${ext}`
}

export const designRef = (file: string, bodies: readonly Body[]): DesignRef => ({ file, roles: bodies.map((b) => ({ name: b.name, role: b.role })) })

/** Put the remembered parts back on freshly loaded bodies: a part is only taken where the body at that position has the same name */
export function applyRoles(bodies: readonly Body[], roles: DesignRef['roles'], chain: Pick<Chain, 'stages'>): Body[] {
  const allowed = rolesAvailable(chain)
  let sheetTaken = false
  return bodies.map((b, i) => {
    const r = roles[i]
    if (!r || r.name !== b.name || !allowed.includes(r.role) || (r.role === 'sheet' && sheetTaken)) return b
    if (r.role === 'sheet') sheetTaken = true
    return { ...b, role: r.role }
  })
}
