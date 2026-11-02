/**
 * Gets G-code to the parser, as text or as a stream from the machine. Kept apart
 * from the worker file so it can be tested without a browser. It only ever reads:
 * the one thing it can reach is a file under Moonraker's gcodes folder.
 */
import { GcodeParser, type ParsedGcode } from './parse'

export type ParseSource = { url: string } | { text: string }

/** A download address for a G-code file, and nothing else on the machine */
export function isGcodeFileUrl(url: string, base = 'http://localhost/'): boolean {
  try {
    const u = new URL(url, base)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.pathname.startsWith('/server/files/gcodes/') && !u.pathname.includes('/../')
  } catch {
    return false
  }
}

export async function runParse(source: ParseSource, onProgress: (done: number, total: number | null) => void, signal?: AbortSignal, base?: string): Promise<ParsedGcode> {
  const parser = new GcodeParser()
  if ('text' in source) {
    parser.push(new TextEncoder().encode(source.text))
    return parser.finish()
  }
  if (!isGcodeFileUrl(source.url, base)) throw new Error('The preview can only read files in the G-code folder.')
  const res = await fetch(source.url, { signal })
  if (!res.ok) throw new Error(`The Rhino couldn't send this file (HTTP ${res.status}).`)
  if (!res.body) throw new Error("This browser can't read the file as a stream.")
  const size = Number(res.headers.get('content-length'))
  const total = Number.isFinite(size) && size > 0 ? size : null
  const reader = res.body.getReader()
  let done = 0
  let reported = 0
  for (;;) {
    const r = await reader.read()
    if (r.done) break
    parser.push(r.value)
    done += r.value.length
    // Every 2 MB at most, so a fast file isn't slowed by its own progress messages
    if (done - reported > 2_097_152) {
      reported = done
      onProgress(done, total)
    }
  }
  onProgress(done, total)
  return parser.finish()
}

/** The buffers to hand over rather than copy, so a big file doesn't briefly exist twice */
export function transferables(p: ParsedGcode): ArrayBuffer[] {
  const list = [p.segments, p.kinds, p.offsets, p.widths, p.layerStarts, p.layerZ]
  if (p.power) list.push(p.power)
  return list.map((a) => a.buffer as ArrayBuffer)
}
