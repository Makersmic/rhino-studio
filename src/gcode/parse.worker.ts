/** Parses off the main thread, so the page stays responsive during a big file. The work is in run.ts. */
import { runParse, transferables, type ParseSource } from './run'

export type ToWorker = { source: ParseSource; base: string } | { cancel: true }
export type FromWorker =
  | { type: 'progress'; done: number; total: number | null }
  | { type: 'done'; result: Awaited<ReturnType<typeof runParse>> }
  | { type: 'error'; message: string; cancelled: boolean }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
  postMessage(m: FromWorker, transfer?: Transferable[]): void
}
const abort = new AbortController()

scope.onmessage = (e) => {
  const msg = e.data
  if ('cancel' in msg) {
    abort.abort()
    return
  }
  runParse(msg.source, (done, total) => scope.postMessage({ type: 'progress', done, total }), abort.signal, msg.base).then(
    (result) => scope.postMessage({ type: 'done', result }, transferables(result)),
    (err: Error) => scope.postMessage({ type: 'error', message: err.message, cancelled: abort.signal.aborted }),
  )
}
