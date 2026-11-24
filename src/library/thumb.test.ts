import { describe, expect, it } from 'vitest'
import { project, thumbKey } from './thumb'

const tri = (...p: number[]) => new Float32Array(p)

describe('thumb projection', () => {
  it('nothing to draw gives nothing', () => expect(project(new Float32Array(0), 48)).toEqual([]))
  it('fits the box, centred, with a margin', () => {
    const cube = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 0, 0, 10, 10, 10, 10, 10])
    const t = project(cube, 48)
    expect(t).toHaveLength(3)
    const xs = t.flatMap((x) => [x.p[0], x.p[2], x.p[4]]), ys = t.flatMap((x) => [x.p[1], x.p[3], x.p[5]])
    expect(Math.min(...xs, ...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs, ...ys)).toBeLessThanOrEqual(48)
    expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeCloseTo(48 * 0.88, 5)
  })
  it('far triangles come first and shades stay in range', () => {
    const t = project(new Float32Array([...tri(0, 0, 0, 5, 0, 0, 0, 5, 0), ...tri(0, 0, 9, 5, 0, 9, 0, 5, 9)]), 48)
    expect(t[0]!.depth).toBeLessThanOrEqual(t[1]!.depth)
    for (const x of t) { expect(x.shade).toBeGreaterThanOrEqual(0.35); expect(x.shade).toBeLessThanOrEqual(1) }
  })
  it('a big mesh is thinned to the limit', () => {
    const v = new Float32Array(9 * 50000)
    for (let i = 0; i < v.length; i++) v[i] = Math.sin(i) * 10
    expect(project(v, 48, 6000).length).toBeLessThanOrEqual(6000)
  })
  it('the cache key changes with the file', () => {
    expect(thumbKey('a/b.stl', 10, 5.4)).toBe('a/b.stl|10|5')
    expect(thumbKey('a/b.stl', 11, 5.4)).not.toBe(thumbKey('a/b.stl', 10, 5.4))
  })
})
