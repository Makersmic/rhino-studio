/**
 * Assemblies (Mike, Nov 22): several files dropped together keep their places relative to each other and move as one, until one is
 * broken out. A part's height and where it sits in its own file come from its name: h10x50y0.stl is 10 tall, centred 50 along X.
 */
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function box(h: number, dx = 0, dy = 0): Float32Array {
  const v: number[] = []
  const q = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...d)
  const P = (x: number, y: number, z: number) => [x * 10 + dx - 5, y * 10 + dy - 5, z * h]
  q(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)); q(P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), P(1, 0, 1))
  q(P(0, 0, 0), P(0, 0, 1), P(1, 0, 1), P(1, 0, 0)); q(P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0))
  q(P(1, 1, 0), P(1, 1, 1), P(0, 1, 1), P(0, 1, 0)); q(P(0, 1, 0), P(0, 1, 1), P(0, 0, 1), P(0, 0, 0))
  return new Float32Array(v)
}
const sliced: number[] = []
vi.mock('@/slicer/engine', async (orig) => ({
  ...(await orig<object>()),
  loadModelFile: async (f: File) => [{ vertices: box(Number(/h(\d+)/.exec(f.name)![1]), Number(/x(-?\d+)/.exec(f.name)?.[1] ?? 0), Number(/y(-?\d+)/.exec(f.name)?.[1] ?? 0)) }],
  kiriVersion: async () => 'test',
  runKiri: async (model: Float32Array) => {
    let z = 0
    for (let i = 2; i < model.length; i += 3) z = Math.max(z, model[i]!)
    sliced.push(z)
    return `G1 X5 Y5 Z${z} E1\nG1 X6 Y6 Z${z} E2\n`
  },
}))
import { usePrepareStore } from './prepare'

const file = (n: string) => new File(['x'], n)
async function start(names: string[]) {
  const p = usePrepareStore()
  await p.loadFiles(names.map(file))
  p.confirmProcess(p.options.find((o) => o.tool.process === 'fdm')!.tool.name)
  await nextTick()
  return p
}
const at = (p: ReturnType<typeof usePrepareStore>) => p.parts.map((x) => [Math.round(x.x * 10) / 10, Math.round(x.y * 10) / 10])

describe('assemblies', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('keeps several files dropped together where they sit relative to each other, around the bed centre', async () => {
    const p = await start(['h10x0y0.stl', 'h10x50y0.stl', 'h10x0y30.stl'])
    const c = p.machineInfo.workArea
    // centres 0,0 / 50,0 / 0,30: the assembly's middle is 25,15
    expect(at(p)).toEqual([[c.x / 2 - 25, c.y / 2 - 15], [c.x / 2 + 25, c.y / 2 - 15], [c.x / 2 - 25, c.y / 2 + 15]].map(([x, y]) => [Math.round(x! * 10) / 10, Math.round(y! * 10) / 10]))
    expect(p.parts.every((x) => x.group != null && x.group === p.parts[0]!.group)).toBe(true)
    expect(p.selectedInGroup).toBe(true)
  })
  it('moves every part when one moves, whichever one is selected', async () => {
    const p = await start(['h10x0y0.stl', 'h10x50y0.stl'])
    const before = at(p)
    p.job!.placement.x += 20
    p.job!.placement.y -= 5
    expect(at(p)).toEqual(before.map(([x, y]) => [Math.round((x! + 20) * 10) / 10, Math.round((y! - 5) * 10) / 10]))
    p.selectPart(p.parts[1]!.id)
    p.job!.placement.x -= 10
    expect(at(p)).toEqual(before.map(([x, y]) => [Math.round((x! + 10) * 10) / 10, Math.round((y! - 5) * 10) / 10]))
  })
  it('a single file is not an assembly', async () => {
    const p = await start(['h10x0y0.stl'])
    expect(p.parts[0]!.group).toBeUndefined()
    expect(p.selectedInGroup).toBe(false)
  })
  it('breaking it apart frees every part where it is, and a part removed leaves the rest together', async () => {
    const p = await start(['h10x0y0.stl', 'h10x50y0.stl', 'h10x0y30.stl'])
    const before = at(p)
    p.removePart(p.parts[2]!.id)
    expect(p.parts.every((x) => x.group != null)).toBe(true)
    p.removePart(p.parts[1]!.id)
    expect(p.parts[0]!.group).toBeUndefined()
    const q = await start(['h10x0y0.stl', 'h10x50y0.stl'])
    const was = at(q)
    q.breakApart()
    expect(q.parts.some((x) => x.group != null)).toBe(false)
    expect(at(q)).toEqual(was)
    q.job!.placement.x += 30
    expect(at(q)[1]).toEqual(was[1])
    void before
  })
  it('keeps the parts together when another file is added later as a part of its own', async () => {
    const p = await start(['h10x0y0.stl', 'h10x50y0.stl'])
    await p.addFiles([file('h10x0y0.stl')])
    expect(p.parts.map((x) => x.group != null)).toEqual([true, true, false])
    const was = at(p)
    p.selectPart(p.parts[0]!.id)
    p.job!.placement.x += 10
    expect(at(p)[2]).toEqual(was[2])
    expect(at(p)[1]![0]).toBeCloseTo(was[1]![0]! + 10, 1)
  })
})
