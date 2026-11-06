import { describe, expect, it } from 'vitest'
import { transform } from '@/slicer/model'
import { markAt, marksForEngine, marksForPrusa, marksNote, marksOnBed, partFrame, type MarkPart } from './supportMarks'

// a lopsided box, so turning it can't look the same by accident
const raw = new Float32Array([0, 0, 0, 40, 0, 0, 40, 10, 0, 0, 10, 0, 0, 0, 20, 40, 0, 20, 40, 10, 20, 0, 10, 20, 5, 3, 7])

describe('partFrame', () => {
  for (const pl of [{ rotate: 0, scale: 1 }, { rotate: 37, scale: 1.5 }, { rotate: 90, scale: 0.5, tiltX: 30, tiltY: -60 }]) {
    it(`agrees with transform for ${JSON.stringify(pl)}`, () => {
      const shaped = transform(raw, pl.rotate, pl.scale, pl.tiltX, pl.tiltY)
      const f = partFrame(raw, shaped, pl)
      for (let i = 0; i < raw.length; i += 3) {
        const q = f.toShaped([raw[i]!, raw[i + 1]!, raw[i + 2]!])
        expect(q[0]).toBeCloseTo(shaped[i]!, 3)
        expect(q[1]).toBeCloseTo(shaped[i + 1]!, 3)
        expect(q[2]).toBeCloseTo(shaped[i + 2]!, 3)
        const back = f.toRaw(q)
        expect(back[0]).toBeCloseTo(raw[i]!, 3)
        expect(back[2]).toBeCloseTo(raw[i + 2]!, 3)
      }
    })
  }
})

const part = (pl: MarkPart['placement'], x = 100, y = 80): MarkPart => ({ name: 'box.stl', raw, shaped: transform(raw, pl.rotate, pl.scale, pl.tiltX, pl.tiltY), placement: pl, x, y })

describe('marks stay on the part', () => {
  it('a mark made on the bed comes back to the same spot, and follows the part when it turns and moves', () => {
    const p1 = part({ rotate: 0, scale: 1 })
    const m = markAt(p1, [110, 82, 20], 4)
    const there = marksOnBed([p1], [m])[0]!
    expect(there.at[0]).toBeCloseTo(110, 2)
    expect(there.at[2]).toBeCloseTo(20, 2)
    // the same raw spot, after a half turn and a move: mirrored round the part's middle
    const p2 = part({ rotate: 180, scale: 1 }, 50, 50)
    const moved = marksOnBed([p2], [m])[0]!
    expect(moved.at[0]).toBeCloseTo(40, 2)
    expect(moved.at[1]).toBeCloseTo(48, 2)
  })
  it('scales its reach with the part', () => {
    const p = part({ rotate: 0, scale: 2 })
    const m = markAt(p, [100, 80, 10], 6)
    expect(m.r).toBe(3)
    expect(marksOnBed([p], [m])[0]!.r).toBe(6)
  })
  it('leaves out marks on parts that aren’t loaded', () => {
    expect(marksOnBed([part({ rotate: 0, scale: 1 })], [{ part: 'other.stl', x: 0, y: 0, z: 0, r: 4 }])).toEqual([])
  })
})

describe('marksForEngine', () => {
  it('puts marks in the one part’s own frame', () => {
    const p = part({ rotate: 0, scale: 1 })
    const [e] = marksForEngine([p], [markAt(p, [110, 82, 20], 4)], null)
    expect(e!.point.x).toBeCloseTo(10)
    expect(e!.point.y).toBeCloseTo(2)
    expect(e!.point.z).toBeCloseTo(20)
    expect(e!.radius).toBe(4)
  })
  it('or in the combined model’s frame', () => {
    const p = part({ rotate: 0, scale: 1 })
    const [e] = marksForEngine([p, { ...p, name: 'b.stl', x: 200 }], [markAt(p, [110, 82, 20], 4)], { x: 150, y: 80 })
    expect(e!.point.x).toBeCloseTo(-40)
  })
})

describe('blocks', () => {
  it('are left out for Kiri, and sent apart to PrusaSlicer', () => {
    const p = part({ rotate: 0, scale: 1 })
    const marks = [markAt(p, [110, 82, 20], 4), markAt(p, [90, 80, 20], 6, true)]
    expect(marks[1]!.kind).toBe('block')
    expect(marksForEngine([p], marks, null)).toHaveLength(1)
    const pr = marksForPrusa([p], marks, null)
    expect(pr.enforce).toEqual([[10, 2, 20, 4]])
    expect(pr.block).toEqual([[-10, 0, 20, 6]])
  })
})

describe('marksNote', () => {
  it('warns when only-where-marked has nothing marked, and counts marks and blocks', () => {
    expect(marksNote({ marks: [] }, 'marked')).toMatch(/nothing will be supported/)
    expect(marksNote(null, 'marked')).toBeNull()
    expect(marksNote({ marks: [] }, 'off')).toBeNull()
    expect(marksNote({ marks: [] }, 'auto')).toMatch(/Automatic supports/)
    expect(marksNote({ marks: [{ part: 'a', x: 0, y: 0, z: 0, r: 4 }, { part: 'a', x: 0, y: 0, z: 0, r: 4, kind: 'block' }] }, 'auto')).toBe('1 spot marked for support, 1 spot blocked.')
  })
})
