import { describe, expect, it } from 'vitest'
import {
  age, defaultName, difference, fingerprint, fmtMm, meshForPrint, otherPending, parseMeta, planeFit, profileNameProblem,
  readBedMesh, readMesh, sampleAt, scaleFor, scalePos, stats, tempMismatch, validMatrix, xAt, yAt, type MeshParams, type Profile,
} from './mesh'

const P: MeshParams = { minX: 40, maxX: 500, minY: 40, maxY: 300, xCount: 5, yCount: 3 }
const flat = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]
const prof = (name: string, bed: number | null, when = 1, points = flat, params = P): Profile => ({
  name, points, params, meta: bed == null ? null : { bed, tool: 'BlockOne', when }, adaptive: /^adaptive-/.test(name),
})

describe('point positions', () => {
  it('spans n - 1 gaps, so the last point is at max (mainsail #1520)', () => {
    expect([0, 1, 2, 3, 4].map((i) => xAt(P, i))).toEqual([40, 155, 270, 385, 500])
    expect([0, 1, 2].map((j) => yAt(P, j))).toEqual([40, 170, 300])
  })
  it('one point sits at min', () => {
    expect(xAt({ ...P, xCount: 1 }, 0)).toBe(40)
  })
})

describe('reading Klipper', () => {
  const status = {
    bed_mesh: {
      profile_name: 'bed-60',
      mesh_min: [40, 40], mesh_max: [500, 300],
      probed_matrix: [[0.1, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, -0.1]],
      profiles: {
        'bed-60': { points: [[0.1, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, -0.1]], mesh_params: { min_x: 40, max_x: 500, min_y: 40, max_y: 300, x_count: 5, y_count: 3 } },
        'adaptive-AB12': { points: [[0, 0], [0, 0]], mesh_params: { min_x: 100, max_x: 200, min_y: 100, max_y: 200 } },
        default: { points: flat, mesh_params: { min_x: 40, max_x: 500, min_y: 40, max_y: 300 } },
        broken: { points: [[1, 2], [3]], mesh_params: { min_x: 0, max_x: 1, min_y: 0, max_y: 1 } },
      },
    },
    configfile: { save_config_pending: true, save_config_pending_items: { 'bed_mesh bed-60': { version: 1 }, probe: { z_offset: '1.2' } } },
    save_variables: { variables: { mesh_meta: { 'bed-60': { bed: 60, tool: 'BlockOne', when: 1761000000 }, junk: 'x', bad: { bed: 'hot' } } } },
    'gcode_macro RHINO_MESH': { match_c: 5, cold_c: 40, soak_min: 5 },
  }
  const s = readBedMesh(status)
  it('reads profiles, skips broken ones, puts adaptive last', () => {
    expect(s.configured).toBe(true)
    expect(s.profiles.map((p) => p.name)).toEqual(['bed-60', 'default', 'adaptive-AB12'])
    expect(s.profiles[2]!.adaptive).toBe(true)
  })
  it('joins the Rhino records; unrecorded meshes have none', () => {
    expect(s.profiles[0]!.meta).toEqual({ bed: 60, tool: 'BlockOne', when: 1761000000 })
    expect(s.profiles[1]!.meta).toBeNull()
  })
  it('the loaded mesh and its bounds', () => {
    expect(s.loaded).toBe('bed-60')
    expect(s.current?.params).toMatchObject({ minX: 40, maxX: 500, xCount: 5, yCount: 3 })
  })
  it('pending SAVE_CONFIG, with the non-mesh items picked out', () => {
    expect(s.savePending).toBe(true)
    expect(otherPending(s.pendingSections)).toEqual(['probe'])
    expect(s.rhino).toEqual({ matchC: 5, coldC: 40, soakMin: 5 })
  })
  it('no bed_mesh object: not set up', () => {
    expect(readBedMesh({}).configured).toBe(false)
  })
  it('nothing loaded', () => {
    const r = readBedMesh({ bed_mesh: { profile_name: '', profiles: {} } })
    expect(r.loaded).toBe('')
    expect(r.current).toBeNull()
  })
  it('parseMeta ignores junk', () => {
    expect(parseMeta({ a: { bed: '60', when: -5 }, b: null, c: { tool: 'x' } })).toEqual({ a: { bed: 60, tool: '', when: 0 } })
    expect(parseMeta('nope')).toEqual({})
  })
  it('validMatrix', () => {
    expect(validMatrix([[1, 2], [3, 4]])).toBe(true)
    expect(validMatrix([[]])).toBe(false)
    expect(validMatrix([[1, NaN]])).toBe(false)
  })
})

describe('stats', () => {
  const m = [[0.1, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, -0.05]]
  const s = stats(m, P)
  it('range, extremes with their coordinates', () => {
    expect(s.range).toBeCloseTo(0.15)
    expect(s.max).toEqual({ value: 0.1, x: 40, y: 40 })
    expect(s.min).toEqual({ value: -0.05, x: 500, y: 300 })
    expect(s.count).toBe(15)
  })
})

describe('tilt and warp', () => {
  // A pure tilt: 0.1 mm per 100 mm to the right
  const tilt = [0, 1, 2].map(() => [0, 1, 2, 3, 4].map((i) => (xAt(P, i) - 40) * 0.001))
  it('a tilted flat bed is all tilt, no warp', () => {
    const f = planeFit(tilt, P)
    expect(f.slopeX).toBeCloseTo(0.1)
    expect(f.slopeY).toBeCloseTo(0)
    expect(f.tiltRange).toBeCloseTo(0.46)
    expect(f.warpRange).toBeCloseTo(0)
    const r = readMesh(stats(tilt, P), f, 0.2)
    expect(r.verdict).toBe('tilt')
    expect(r.advice).toMatch(/Z_TILT_ADJUST/)
  })
  it('a bowl has no tilt, all warp', () => {
    const bowl = [0, 1, 2].map((j) => [0, 1, 2, 3, 4].map((i) => ((i - 2) ** 2 + (j - 1) ** 2) * 0.06))
    const f = planeFit(bowl, P)
    expect(f.tiltRange).toBeCloseTo(0)
    expect(f.warpRange).toBeCloseTo(0.3)
    expect(readMesh(stats(bowl, P), f, 0.2).verdict).toBe('warp')
  })
  it('a nearly flat bed reads flat (and isn’t a mountain)', () => {
    const m = [[0.02, 0, 0, 0, -0.01], [0, 0.01, 0, 0, 0], [0, 0, 0, 0.02, 0]]
    const r = readMesh(stats(m, P), planeFit(m, P), 0.2)
    expect(r.verdict).toBe('flat')
    expect(r.layers).toBeCloseTo(0.15)
  })
  it('in between: good', () => {
    const m = [[0.08, 0, 0, 0, -0.02], [0, 0.03, 0, 0, 0], [-0.03, 0, 0, 0.05, 0]]
    expect(readMesh(stats(m, P), planeFit(m, P), 0.2).verdict).toBe('fine')
  })
  it('one row has no Y slope', () => {
    const p1 = { ...P, yCount: 1 }
    const f = planeFit([[0, 0.1, 0.2, 0.3, 0.4]], p1)
    expect(f.slopeY).toBe(0)
    expect(f.slopeX).toBeCloseTo(0.4 / 4.6)
  })
})

describe('colour scale', () => {
  it('starts fixed at ±0.25 mm and steps up only when needed', () => {
    expect(scaleFor(0.03)).toBe(0.25)
    expect(scaleFor(0.25)).toBe(0.25)
    expect(scaleFor(0.3)).toBe(0.5)
    expect(scaleFor(1.4)).toBe(2)
    expect(scaleFor(3.2)).toBe(4)
  })
  it('positions are clamped to -1..1', () => {
    expect(scalePos(0.1, 0, 0.25)).toBeCloseTo(0.4)
    expect(scalePos(9, 0, 0.25)).toBe(1)
    expect(scalePos(-9, 0, 0.25)).toBe(-1)
  })
  it('fmtMm', () => {
    expect(fmtMm(0.0834)).toBe('0.08 mm')
    expect(fmtMm(0.004)).toBe('0.004 mm')
  })
})

describe('difference', () => {
  it('b minus a on the same points', () => {
    const a = prof('cold', 0, 1, [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]])
    const b = prof('hot', 100, 1, [[0.1, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0.2]])
    expect(difference(a, b)![0]![0]).toBeCloseTo(0.1)
    expect(difference(a, b)![2]![4]).toBeCloseTo(0.2)
  })
  it('different points: null', () => {
    expect(difference(prof('a', 0), prof('b', 0, 1, [[0, 0], [0, 0]], { ...P, xCount: 2, yCount: 2 }))).toBeNull()
  })
})

describe('which mesh a print uses (as _RHINO_JOB_MESH)', () => {
  const list = [prof('bed-60', 60, 10), prof('bed-63', 63, 5), prof('bed-100', 100), prof('bed-cold', 0), prof('adaptive-1', 60, 99), prof('default', null)]
  it('the closest within 5°C', () => {
    expect(meshForPrint(list, 62).use?.name).toBe('bed-63')
    expect(meshForPrint(list, 60).use?.name).toBe('bed-60')
  })
  it('same distance: the newest', () => {
    expect(meshForPrint([prof('a', 60, 1), prof('b', 60, 9)], 60).use?.name).toBe('b')
  })
  it('cold matches cold', () => {
    expect(meshForPrint(list, 0).use?.name).toBe('bed-cold')
    expect(meshForPrint(list, 25).use?.name).toBe('bed-cold')
  })
  it('none within 5°C: no mesh, and the closest is offered', () => {
    const r = meshForPrint(list, 80)
    expect(r.use).toBeNull()
    expect(['bed-63', 'bed-100']).toContain(r.closest?.name)
  })
  it('never adaptive, never unrecorded', () => {
    expect(meshForPrint([prof('adaptive-1', 60), prof('default', null)], 60)).toEqual({ use: null, closest: null })
  })
})

describe('names, ages, temperatures', () => {
  it('profile names', () => {
    expect(profileNameProblem('bed-60')).toBeNull()
    expect(profileNameProblem('')).toMatch(/name/)
    expect(profileNameProblem('my mesh')).toMatch(/spaces/)
    expect(profileNameProblem('adaptive-x')).toMatch(/adaptive/)
    expect(profileNameProblem('x'.repeat(33))).toMatch(/32/)
  })
  it('default names match the Rhino macro', () => {
    expect(defaultName(60)).toBe('bed-60')
    expect(defaultName(0)).toBe('bed-cold')
    expect(defaultName(39)).toBe('bed-cold')
  })
  it('ages', () => {
    const now = 1_800_000_000
    expect(age(now - 100, now)).toBe('today')
    expect(age(now - 86400 * 1.5, now)).toBe('yesterday')
    expect(age(now - 86400 * 5, now)).toBe('5 days ago')
    expect(age(now - 86400 * 30, now)).toBe('4 weeks ago')
    expect(age(now - 86400 * 200, now)).toBe('7 months ago')
  })
  it('a mesh made hot used cold is flagged; close or both cold is not', () => {
    expect(tempMismatch({ bed: 100, tool: '', when: 0 }, 60)).toMatch(/Made at 100°C.*60°C/)
    expect(tempMismatch({ bed: 60, tool: '', when: 0 }, 63)).toBeNull()
    expect(tempMismatch({ bed: 0, tool: '', when: 0 }, 22)).toBeNull()
    expect(tempMismatch(null, 60)).toBeNull()
  })
  it('fingerprints change when the points do', () => {
    expect(fingerprint(flat)).toBe(fingerprint(flat.map((r) => [...r])))
    expect(fingerprint(flat)).not.toBe(fingerprint([[0.01, 0, 0, 0, 0], ...flat.slice(1)]))
  })
})

describe('shading between points', () => {
  const m = [[0, 1, 2, 3, 4], [0, 1, 2, 3, 4], [10, 11, 12, 13, 14]]
  it('hits the probed points exactly', () => {
    expect(sampleAt(m, P, 40, 40)).toBe(0)
    expect(sampleAt(m, P, 500, 300)).toBe(14)
    expect(sampleAt(m, P, 270, 170)).toBe(2)
  })
  it('blends in between, and clamps outside', () => {
    expect(sampleAt(m, P, 97.5, 40)).toBeCloseTo(0.5)
    expect(sampleAt(m, P, 40, 235)).toBeCloseTo(5)
    expect(sampleAt(m, P, 0, 0)).toBe(0)
  })
  it('a single row', () => {
    expect(sampleAt([[0, 2]], { ...P, xCount: 2, yCount: 1 }, 270, 999)).toBeCloseTo(1)
  })
})
