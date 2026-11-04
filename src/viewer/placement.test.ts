import { describe, expect, it } from 'vitest'
import { newJob } from '@/slicer/profiles'
import { partInfo, transform } from '@/slicer/model'
import { DEFAULT_MACHINE, type Placement } from '@/slicer/types'
import { bounds, combine } from '@/slicer/model'
import { PART_GAP, clampCentre, freeSpot, hullHitsRect, hullsOverlap, laidFlat, partsProblems, placementProblems, rectOf, turned } from './placement'

describe('several parts on the bed', () => {
  const square = (x: number, y: number, s = 10): Array<[number, number]> => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
  const bed = { x: 200, y: 100 }

  it('tells overlapping outlines from separate and touching ones', () => {
    expect(hullsOverlap(square(0, 0), square(5, 5))).toBe(true)
    expect(hullsOverlap(square(0, 0), square(20, 0))).toBe(false)
    expect(hullsOverlap(square(0, 0), square(10, 0))).toBe(false)
    // their boxes overlap, the shapes don't
    expect(hullsOverlap([[0, 0], [10, 0], [0, 10]], [[10, 10], [10, 4], [4, 10]])).toBe(false)
  })

  it('puts a new part where it was asked for when that is clear', () => {
    expect(freeSpot({ x: 10, y: 10 }, { x: 50, y: 50 }, [rectOf(20, 50, { x: 10, y: 10 })], bed)).toEqual({ x: 50, y: 50, free: true })
  })

  it('moves on to the next clear spot, keeping the gap', () => {
    const taken = [rectOf(100, 50, { x: 60, y: 60 }), rectOf(10, 10, { x: 20, y: 20 })]
    const s = freeSpot({ x: 20, y: 20 }, { x: 100, y: 50 }, taken, bed)
    expect(s.free).toBe(true)
    const r = rectOf(s.x, s.y, { x: 20, y: 20 })
    expect(r.x0).toBeGreaterThanOrEqual(0)
    expect(r.y0).toBeGreaterThanOrEqual(0)
    for (const t of taken) {
      expect(r.x0 >= t.x1 + PART_GAP || r.x1 <= t.x0 - PART_GAP || r.y0 >= t.y1 + PART_GAP || r.y1 <= t.y0 - PART_GAP).toBe(true)
    }
  })

  it('keeps a part on the bed and says so when there is no room', () => {
    const s = freeSpot({ x: 150, y: 80 }, { x: 900, y: 50 }, [rectOf(100, 50, { x: 200, y: 100 })], bed)
    expect(s.free).toBe(false)
    expect(s.x).toBe(125)
  })

  it('combines parts so each lands where it was placed', () => {
    const a = transform(box(10, 10, 5), 0, 1)
    const b = transform(box(20, 10, 30), 0, 1)
    const c = combine([{ vertices: a, x: 50, y: 40 }, { vertices: b, x: 150, y: 80 }])
    expect(c.x).toBe((45 + 160) / 2)
    expect(c.y).toBe((35 + 85) / 2)
    const all = bounds(c.vertices)
    expect(all.min[0]! + c.x).toBeCloseTo(45)
    expect(all.max[0]! + c.x).toBeCloseTo(160)
    expect(all.min[2]).toBe(0)
    expect(all.max[2]).toBe(30)
    // the first part's own corner keeps its place
    expect(c.vertices[0]! + c.x).toBeCloseTo(45)
    expect(c.vertices[1]! + c.y).toBeCloseTo(35)
    // a shorter part stays on the bed
    expect(Math.min(...c.vertices.slice(2, a.length).filter((_, i) => i % 3 === 0))).toBe(0)
  })

  it('names the part in warnings once there are several, and reports overlaps', () => {
    const j = newJob('BlockOne', 'fdm', [])
    const part = (name: string, x: number, y: number) => {
      const info = partInfo(name, transform(box(40, 40, 10), 0, 1), false)
      return { info, x, y, placement: { x, y, rotate: 0, scale: 1 } }
    }
    const m = { ...DEFAULT_MACHINE, keepOut: [], prime: null }
    expect(partsProblems([part('a', 100, 100), part('b', 200, 100)], j, m)).toEqual([])
    expect(partsProblems([part('a', 100, 100), part('b', 120, 100)], j, m)).toEqual(['a and b overlap. Move them apart.'])
    expect(partsProblems([part('a', 5, 100), part('b', 200, 100)], j, m)).toEqual(['a: The part goes off the bed. Move it in.'])
    expect(partsProblems([part('a', 5, 100)], j, m)).toEqual(['The part goes off the bed. Move it in.'])
  })
})

const base: Placement = { x: 100, y: 100, rotate: 0, scale: 1 }

/** A 10 x 20 x 30 box as triangles (only its corners matter to the tests) */
function box(x = 10, y = 20, z = 30): Float32Array {
  const p: number[] = []
  for (const a of [0, x]) for (const b of [0, y]) for (const c of [0, z]) p.push(a, b, c)
  return Float32Array.from(p)
}
const sizeOf = (p: Placement, v = box()) => {
  const i = partInfo('p', transform(v, p.rotate, p.scale, p.tiltX ?? 0, p.tiltY ?? 0), false)
  return [i.size.x, i.size.y, i.size.z].map((n) => Math.round(n * 100) / 100)
}
const job = () => {
  const j = newJob('BlockOne', 'fdm', [])
  j.placement = { ...base }
  return j
}
const partAt = (v = box()) => partInfo('p', transform(v, 0, 1), false)

describe('turning', () => {
  it('turns around the bed’s own axes', () => {
    expect(sizeOf(turned(base, 'z', 90))).toEqual([20, 10, 30])
    expect(sizeOf(turned(base, 'x', 90))).toEqual([10, 30, 20])
    expect(sizeOf(turned(base, 'y', 90))).toEqual([30, 20, 10])
  })
  it('a turn on a part that is already tilted still goes around the bed’s axis', () => {
    const once = turned(base, 'x', 90)
    expect(sizeOf(turned(once, 'y', 90))).toEqual([20, 30, 10])
    expect(sizeOf(turned(turned(once, 'z', 90), 'x', 90))).toEqual([30, 20, 10])
  })
  it('four turns come back, and a plain job gets no tilt values', () => {
    let p = base
    for (let i = 0; i < 4; i++) p = turned(p, 'y', 90)
    expect(sizeOf(p)).toEqual([10, 20, 30])
    expect(p.tiltX).toBeUndefined()
    expect(p.tiltY).toBeUndefined()
    expect(Object.keys(turned(base, 'z', 90))).not.toContain('tiltX')
  })
  it('keeps where it sits and its scale', () => {
    const p = turned({ ...base, x: 7, y: 8, scale: 2 }, 'x', 90)
    expect([p.x, p.y, p.scale]).toEqual([7, 8, 2])
  })
  it('turn stays inside what the Turn box accepts', () => {
    for (let i = 0; i < 40; i++) {
      const p = turned(base, 'z', i * 37 + 0.0001)
      expect(p.rotate).toBeGreaterThanOrEqual(0)
      expect(p.rotate).toBeLessThan(360)
    }
  })
})

describe('Lay flat', () => {
  it('puts the clicked face on the bed', () => {
    expect(sizeOf(laidFlat(base, [1, 0, 0]))).toEqual([30, 20, 10])
    expect(sizeOf(laidFlat(base, [-1, 0, 0]))).toEqual([30, 20, 10])
    expect(sizeOf(laidFlat(base, [0, 1, 0]))).toEqual([10, 30, 20])
  })
  it('the bottom already down changes nothing; the top turns over', () => {
    expect(laidFlat(base, [0, 0, -1])).toEqual(base)
    expect(sizeOf(laidFlat(base, [0, 0, 1]))).toEqual([10, 20, 30])
    expect(laidFlat(base, [0, 0, 1]).tiltX ?? laidFlat(base, [0, 0, 1]).tiltY).toBeDefined()
  })
  it('a slanted face really ends up flat: its three corners share one height at the lowest point', () => {
    // A wedge with a sloped face; laying that face down must bring its corners to Z 0
    const tri = [0, 0, 0, 40, 0, 0, 0, 30, 20]
    const apex = [0, 0, 50]
    const v = Float32Array.from([...tri, ...apex])
    // the side of the face away from the apex
    const a = [40, 0, 0]
    const b = [0, 30, 20]
    const n: [number, number, number] = [-(a[1]! * b[2]! - a[2]! * b[1]!), -(a[2]! * b[0]! - a[0]! * b[2]!), -(a[0]! * b[1]! - a[1]! * b[0]!)]
    const p = laidFlat(base, n)
    const t = transform(v, p.rotate, p.scale, p.tiltX ?? 0, p.tiltY ?? 0)
    // whichever way the normal pointed, the three corners of the face are level
    const zs = [t[2]!, t[5]!, t[8]!]
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.002)
    // and that face is the one on the bed, with the rest of the part above it
    expect(Math.max(...zs)).toBeLessThan(0.002)
    expect(t[11]!).toBeGreaterThan(1)
  })
  it('works from a part already tilted and turned', () => {
    const start = turned(turned(base, 'x', 30), 'z', 40)
    const p = laidFlat(start, [0.3, -0.4, 0.5])
    expect(Number.isFinite(p.rotate)).toBe(true)
    const again = laidFlat(p, [0, 0, -1])
    expect(again).toEqual(p)
  })
})

describe('keeping it on the bed', () => {
  it('keeps the box on the bed, to 0.5 mm', () => {
    expect(clampCentre(2, 20, 100)).toBe(10)
    expect(clampCentre(99, 20, 100)).toBe(90)
    expect(clampCentre(33.3, 20, 100)).toBe(33.5)
  })
  it('a part wider than the bed goes central rather than jumping about', () => {
    expect(clampCentre(5, 120, 100)).toBe(50)
    expect(clampCentre(95, 120, 100)).toBe(50)
  })
  it('an outline and a rectangle: touching, apart, and a diagonal that only looks close', () => {
    const rect = { x0: 10, y0: 10, x1: 20, y1: 20 }
    expect(hullHitsRect([[0, 0], [15, 0], [15, 15], [0, 15]], rect)).toBe(true)
    expect(hullHitsRect([[0, 0], [5, 0], [5, 5], [0, 5]], rect)).toBe(false)
    expect(hullHitsRect([[0, 18], [8, 30], [0, 30]], rect)).toBe(false)
    // same bounding box overlap, but the slanted edge passes clear of the corner
    expect(hullHitsRect([[0, 0], [14, 0], [0, 14]], rect)).toBe(false)
    expect(hullHitsRect([], rect)).toBe(false)
  })
})

describe('problems', () => {
  const m = DEFAULT_MACHINE
  it('nothing to say about a part in clear space', () => {
    expect(placementProblems(partAt(), job(), m)).toEqual([])
  })
  it('off the bed', () => {
    const j = job()
    j.placement.x = 1
    expect(placementProblems(partAt(), j, m).join()).toMatch(/goes off the bed/)
  })
  it('bigger than the bed says to scale it', () => {
    expect(placementProblems(partAt(box(600, 20, 30)), job(), m).join()).toMatch(/bigger than the bed/)
  })
  it('over a keep-out, named', () => {
    const j = job()
    j.placement.x = 500
    j.placement.y = 320
    expect(placementProblems(partAt(), j, m).join()).toMatch(/leadscrew area/)
  })
  it('too tall uses the same limit as the check after preparing', () => {
    const limit = m.travelMax[2] - 5
    expect(placementProblems(partAt(box(10, 10, limit)), job(), m)).toEqual([])
    expect(placementProblems(partAt(box(10, 10, limit + 1)), job(), m).join()).toMatch(/tall/)
  })
  it('height only counts for printing', () => {
    const j = newJob('LightSaber', 'laser', [])
    j.placement = { ...base }
    expect(placementProblems(partAt(box(10, 10, 900)), j, m)).toEqual([])
  })
  it('CNC is judged on its stock, not on the bed', () => {
    const j = newJob('HotJoe', 'cnc', [])
    j.placement = { ...base, x: 1, y: 1 }
    expect(placementProblems(partAt(), j, m)).toEqual([])
    expect(placementProblems(partAt(box(700, 20, 30)), j, m).join()).toMatch(/stock/)
  })
})

describe('transform', () => {
  it('leaves plain jobs exactly as before', () => {
    const v = box()
    expect(transform(v, 30, 1.5, 0, 0)).toEqual(transform(v, 30, 1.5))
  })
  it('still sits on Z 0, centred, after a tilt', () => {
    const t = transform(box(), 0, 1, 45, 20)
    let zMin = Infinity
    for (let i = 2; i < t.length; i += 3) zMin = Math.min(zMin, t[i]!)
    expect(zMin).toBeCloseTo(0)
  })
})
