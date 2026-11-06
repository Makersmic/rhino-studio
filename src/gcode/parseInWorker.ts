/** Starts a parse in its own worker. One worker per file, so cancelling or finishing frees all of its memory. */
import type { ParsedGcode } from './parse'
import { FileTooBig, type ParseSource } from './run'
import type { FromWorker, ToWorker } from './parse.worker'

export interface ParseJob {
  result: Promise<ParsedGcode>
  cancel(): void
}

export function parseInWorker(source: ParseSource, onProgress?: (done: number, total: number | null) => void): ParseJob {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
  const send = (m: ToWorker) => worker.postMessage(m)
  const result = new Promise<ParsedGcode>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'progress') {
        onProgress?.(m.done, m.total)
        return
      }
      worker.terminate()
      if (m.type === 'done') resolve(m.result)
      else reject(m.tooBig !== undefined ? new FileTooBig(m.tooBig) : new Error(m.cancelled ? 'Cancelled' : m.message))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || "The preview couldn't start."))
    }
  })
  send({ source, base: document.baseURI })
  return { result, cancel: () => send({ cancel: true }) }
}
