/**
 * Filament lanes in a job (design-dual-filament.md, step 2) on SwitchFly's two paths: each lane has a material, parts have a lane, supports
 * can come from another lane, and a job that uses two lanes is held back until the slice is built. Slicing is faked as in the marks tests.
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
async function start(tool = 'SwitchFly') {
  const p = usePrepareStore()
  await p.loadFiles([file('h10.stl'), file('h20.stl')])
  p.confirmProcess(tool)
  await nextTick()
  return p
}

describe('lanes on a two-path tool', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('gives SwitchFly two lanes with a material each, and a one-lane tool none', async () => {
    const p = await start()
    expect(p.laneTotal).toBe(2)
    expect(p.job!.lanes!.materials).toEqual(['PLA_0_4_T0', 'PLA_0_4_T1'])
    expect(p.laneBlock).toEqual([])
    const q = await start('BlockOne')
    expect(q.laneTotal).toBe(1)
    expect(q.job!.lanes).toBeUndefined()
  })
  it('parts start in lane 1; a part can go to lane 2, and the job follows its first part', async () => {
    const p = await start()
    expect(p.parts.map((x) => x.lane)).toEqual([0, 0])
    p.setPartLane(p.parts[0]!.id, 1)
    expect(p.parts.map((x) => x.lane)).toEqual([1, 0])
    expect(p.job!.material).toBe('PLA_0_4_T1')
    expect(p.job!.fdm.path).toBe(1)
  })
  it('holds a job back that uses both lanes (until the slice is built), but not one that uses just lane 2', async () => {
    const p = await start()
    p.setPartLane(p.parts[1]!.id, 1)
    expect(p.laneBlock.join(' ')).toContain('can’t be sliced yet')
    await p.prepare()
    expect(p.prepError).toContain('can’t be sliced yet')
    p.setPartLane(p.parts[0]!.id, 1)
    expect(p.laneBlock).toEqual([])
  })
  it('Kiri:Moto moves the whole job to one lane, PrusaSlicer one part at a time', async () => {
    const p = await start()
    p.job!.engine = 'kiri'
    p.setPartLane(p.parts[0]!.id, 1)
    expect(p.parts.map((x) => x.lane)).toEqual([1, 1])
    p.job!.engine = 'prusa'
    p.setPartLane(p.parts[0]!.id, 0)
    expect(p.parts.map((x) => x.lane)).toEqual([0, 1])
  })
  it('keeps the support and interface lanes, and refuses lanes the tool does not have', async () => {
    const p = await start()
    p.setSupportLane(1)
    p.setInterfaceLane(1)
    expect(p.job!.lanes).toMatchObject({ supportLane: 1, interfaceLane: 1 })
    p.setSupportLane(7)
    expect(p.job!.lanes!.supportLane).toBe(1)
    p.setSupportLane(null)
    expect(p.job!.lanes!.supportLane).toBeNull()
    p.setPartLane(p.parts[0]!.id, 5)
    expect(p.parts[0]!.lane).toBe(0)
  })
  it("a lane takes only its own path's materials", async () => {
    const p = await start()
    p.setLaneMaterial(1, 'PLA_0_4_T0')
    expect(p.job!.lanes!.materials[1]).toBe('PLA_0_4_T1')
  })
})
