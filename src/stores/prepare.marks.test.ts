/**
 * Support marks belong to the model on screen (Mike, Nov 21): a new model starts with none, removing a part takes its
 * marks, and a mark changed after a slice clears that slice. Slicing is faked: a part's height comes from its file name.
 */
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function box(h: number): Float32Array {
  const v: number[] = []
  const q = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...d)
  const P = (x: number, y: number, z: number) => [x * 10, y * 10, z * h]
  q(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)); q(P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), P(1, 0, 1))
  q(P(0, 0, 0), P(0, 0, 1), P(1, 0, 1), P(1, 0, 0)); q(P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0))
  q(P(1, 1, 0), P(1, 1, 1), P(0, 1, 1), P(0, 1, 0)); q(P(0, 1, 0), P(0, 1, 1), P(0, 0, 1), P(0, 0, 0))
  return new Float32Array(v)
}
const sliced: number[] = []
vi.mock('@/slicer/engine', async (orig) => ({
  ...(await orig<object>()),
  loadModelFile: async (f: File) => [{ vertices: box(Number(/h(\d+)/.exec(f.name)![1])) }],
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
async function start() {
  const p = usePrepareStore()
  await p.loadFiles([file('h10.stl')])
  p.confirmProcess(p.options.find((o) => o.tool.process === 'fdm')!.tool.name)
  await nextTick()
  p.job!.engine = 'kiri'
  p.setSupportMode('marked')
  return p
}
const mark = (part: string) => ({ part, x: 1, y: 1, z: 0, r: 4 })

describe('support marks and the model on screen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sliced.length = 0
  })
  it('a new model starts with no marks, and the old slice is gone', async () => {
    const p = await start()
    p.supportMarks!.marks.push(mark('h10.stl'))
    await p.prepare()
    expect(p.result).not.toBeNull()
    await p.loadFiles([file('h20.stl')])
    await nextTick()
    expect(p.supportMarks).toBeNull()
    expect(p.result).toBeNull()
    p.setSupportMode('marked')
    await p.prepare()
    expect(sliced).toEqual([10, 20])
  })
  it('the same file name again brings no marks back', async () => {
    const p = await start()
    p.supportMarks!.marks.push(mark('h10.stl'))
    await nextTick()
    await p.loadFiles([file('h20.stl')])
    await p.loadFiles([file('h10.stl')])
    await nextTick()
    expect(p.supportMarks).toBeNull()
  })
  it('removing a part takes its marks and keeps the other part’s', async () => {
    const p = await start()
    await p.addFiles([file('h20.stl')])
    p.supportMarks!.marks.push(mark('h10.stl'), mark('h20.stl'))
    const first = p.parts.find((x) => x.name === 'h10.stl')!.id
    p.removePart(first)
    expect(p.supportMarks!.marks.map((m) => m.part)).toEqual(['h20.stl'])
  })
  it('a mark added or removed after a slice clears that slice', async () => {
    const p = await start()
    await p.prepare()
    expect(p.result).not.toBeNull()
    p.supportMarks!.marks.push(mark('h10.stl'))
    await nextTick()
    await nextTick()
    expect(p.result).toBeNull()
    await p.prepare()
    p.clearMarks()
    await nextTick()
    await nextTick()
    expect(p.result).toBeNull()
  })
})
