/**
 * The PrusaSlicer path with the engine faked: what Studio hands to runPrusa for each model on screen, and what the
 * Preview step shows afterwards (Mike, Nov 21: a first model kept coming back).
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
const sent: number[] = []
const withMarks: boolean[] = []
vi.mock('@/slicer/engine', async (orig) => ({
  ...(await orig<object>()),
  loadModelFile: async (f: File) => [{ vertices: box(Number(/h(\d+)/.exec(f.name)![1])) }],
  kiriVersion: async () => 'test',
}))
vi.mock('@/slicer/prusa/config', async (orig) => ({
  ...(await orig<object>()),
  loadSchema: async () => ({}),
  buildIni: () => 'x = 1\n',
  valueOf: () => ({ value: '0.2' }),
}))
vi.mock('@/slicer/prusa/portal', async (orig) => ({
  ...(await orig<object>()),
  runPrusa: async (_p: unknown, v: Float32Array, _i: string, _n: string, _c: unknown, _o: unknown, _s: unknown, _t: unknown, sup: { enforce: number[][] } | null) => {
    let z = 0
    for (let i = 2; i < v.length; i += 3) z = Math.max(z, v[i]!)
    sent.push(z)
    withMarks.push(!!sup)
    return { gcode: `G1 X5 Y5 Z${z} E1\nG1 X6 Y6 Z${z} E2\n`, seconds: 1, filamentMm: 1, cached: false, sent: { triangles: 12, bytes: 1, crc: String(z) }, received: { triangles: 12, bytes: 1, crc: String(z), as: 'stl', enforce: 0, block: 0 } }
  },
}))
vi.mock('./maintenance', () => ({
  useMaintenanceStore: () => ({
    portal: () => ({
      slicerState: async () => ({ engine: { installed: '2.9.7' }, refuse: null }),
      slicerKeys: async () => [],
    }),
  }),
}))
import { usePrepareStore } from './prepare'

const file = (n: string) => new File(['x'], n)
const mark = (part: string) => ({ part, x: 1, y: 1, z: 0, r: 4 })
async function start(mode: 'auto' | 'marked') {
  const p = usePrepareStore()
  await p.loadFiles([file('h10.stl')])
  p.confirmProcess(p.options.find((o) => o.tool.process === 'fdm')!.tool.name)
  await nextTick()
  p.job!.engine = 'prusa'
  p.setSupportMode(mode)
  return p
}
const topZ = (p: ReturnType<typeof usePrepareStore>) => /Z([\d.]+)/.exec(p.result!.file.text)![1]

describe.each(['auto', 'marked'] as const)('PrusaSlicer path, supports %s', (mode) => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sent.length = 0
    withMarks.length = 0
  })
  it('each model on screen is the one sent and the one shown', async () => {
    const p = await start(mode)
    p.supportMarks = { marks: [mark('h10.stl')] }
    await p.prepare()
    expect(topZ(p)).toBe('10')
    await p.loadFiles([file('h20.stl')])
    await nextTick()
    expect(p.result).toBeNull()
    p.setSupportMode(mode)
    p.supportMarks = { marks: [mark('h20.stl')] }
    await p.prepare()
    expect(topZ(p)).toBe('20')
    await p.loadFiles([file('h30.stl')])
    await p.addFiles([file('h5.stl')])
    await nextTick()
    p.supportMarks = { marks: [mark('h30.stl')] }
    await p.prepare()
    expect(sent).toEqual([10, 20, 30])
  })
})
