/**
 * Runs Kiri:Moto in this browser.
 *
 * The engine is the GridSpace grid-apps build in public/kiri/ (MIT, see
 * public/kiri/LICENSE-kiri-moto.md and scripts/kiri/build.mjs). It is loaded
 * the first time it's needed and slices in web workers, so the page stays
 * responsive and nothing runs on the Pi.
 */
import type { KiriJob } from './kiriSettings'

interface KiriEngine {
  widget: { loadVertices(v: Float32Array): { center(): unknown } }
  settings: { stock?: Record<string, unknown> }
  setListener(fn: (msg: Record<string, unknown>) => void): KiriEngine
  setMode(m: string): KiriEngine
  setDevice(d: Record<string, unknown>): KiriEngine
  setProcess(p: Record<string, unknown>): KiriEngine
  setTools(t: unknown[]): KiriEngine
  setStock(s: Record<string, unknown>): KiriEngine
  setOrigin(x: number, y: number, z: number): KiriEngine
  setTopOffset(o: number): KiriEngine
  move(x: number, y: number, z: number): KiriEngine
  slice(): Promise<KiriEngine>
  prepare(): Promise<KiriEngine>
}

interface KiriModule {
  KIRI_VERSION: string
  createEngine(o: { workURL: string; poolURL: string }): KiriEngine
  exportAny(e: KiriEngine): Promise<string>
  loadModel(data: ArrayBuffer, name: string, opt?: Record<string, unknown>): Promise<Array<{ vertices: Float32Array; name: string }>>
}

let mod: Promise<KiriModule> | null = null

const url = (p: string) => new URL(`kiri/${p}`, document.baseURI).href

export function loadKiri(): Promise<KiriModule> {
  mod ??= import(/* @vite-ignore */ url('kiri-studio.js')).catch((e) => {
    mod = null
    throw new Error(`The Kiri:Moto engine didn't load (${(e as Error).message}). Is public/kiri/ in place?`)
  }) as Promise<KiriModule>
  return mod
}

export async function kiriVersion(): Promise<string> {
  return (await loadKiri()).KIRI_VERSION
}

export async function loadModelFile(file: File): Promise<Array<{ vertices: Float32Array; name: string }>> {
  const k = await loadKiri()
  return k.loadModel(await file.arrayBuffer(), file.name)
}

export type Phase = 'Loading the engine' | 'Slicing' | 'Planning the paths' | 'Writing G-code'

/** Slice one part (already turned, scaled and centred) and return Kiri's G-code. */
export async function runKiri(vertices: Float32Array, job: KiriJob, onPhase: (p: Phase, fraction?: number) => void, timeoutMs = 300_000): Promise<string> {
  onPhase('Loading the engine')
  const k = await loadKiri()
  const eng = k.createEngine({ workURL: url('kiri-work.js'), poolURL: url('kiri-pool.js') })
  let failure: string | null = null
  eng.setListener((msg) => {
    const s = msg.slice as Record<string, unknown> | undefined
    if (s?.error) failure = String(s.error)
    if (typeof s?.update === 'number') onPhase('Slicing', s.update)
    const p = msg.prepare as Record<string, unknown> | undefined
    const u = p?.update as unknown
    if (typeof u === 'number') onPhase('Planning the paths', u)
  })
  eng.widget.loadVertices(vertices.slice()).center()
  eng.setMode(job.mode).setDevice(job.device).setProcess(job.process)
  eng.setTopOffset(0)
  if (job.tools) eng.setTools(job.tools)
  if (job.stock) {
    const centre = { ...job.stock.center }
    // Engine.setStock overwrites the centre it's given (with half the stock size), so give it a copy;
    // the part sits in the middle of the stock, bottoms level, at Kiri's world 0,0
    eng.setStock({ ...job.stock, center: { ...centre } })
    eng.settings.stock = { ...eng.settings.stock, center: centre }
  }
  if (job.origin) eng.setOrigin(...job.origin)
  if (job.move && job.move.some((v) => v !== 0)) eng.move(...job.move)

  const timeout = <T>(p: Promise<T>, what: string) =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(failure ?? `${what} took longer than ${Math.round(timeoutMs / 60000)} minutes`)), timeoutMs)),
    ])

  onPhase('Slicing', 0)
  await timeout(eng.slice(), 'Slicing')
  if (failure) throw new Error(failure)
  onPhase('Planning the paths', 0)
  await timeout(eng.prepare(), 'Planning the paths')
  if (failure) throw new Error(failure)
  onPhase('Writing G-code')
  const g = await timeout(k.exportAny(eng), 'Writing G-code')
  if (!g.trim()) throw new Error('Kiri:Moto made an empty file.')
  return g
}
