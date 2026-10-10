/**
 * Which toolhead does a G-code file ask for?
 *
 * Read from the file itself, the same way START_JOB checks it on the
 * machine. Recognised, in this order:
 *   1. A Rhino Studio header comment:      ; rhino_toolhead = LightSaber
 *      (Rhino Studio will write this into every file it generates, Phase 3+)
 *   2. A START_JOB call with TOOLHEAD=:    START_JOB TOOLHEAD=BlockOne MATERIAL=PLA ...
 *      (what the BlockOne OrcaSlicer profile emits today)
 * Anything else is "not declared". This is display information only: the
 * machine's START_JOB guard stays the real check.
 */

const HEADER_RE = /^\s*;\s*rhino_toolhead\s*[=:]\s*([A-Za-z0-9_-]+)\s*$/im
const START_JOB_RE = /^\s*START_JOB\b[^\n;]*?\bTOOLHEAD=("?)([A-Za-z0-9_-]+)\1/im

export function toolheadFromGcode(text: string): string | null {
  const h = HEADER_RE.exec(text)
  if (h?.[1]) return h[1]
  const s = START_JOB_RE.exec(text)
  if (s?.[2]) return s[2]
  return null
}

/** How much of the start of a file to read. Thumbnails can push START_JOB down. */
export const HEAD_BYTES = 192 * 1024

/**
 * Read only the start of a file from Moonraker and look for the toolhead.
 * Asks for a byte range, and also stops reading once enough has arrived, so a
 * server that ignores ranges never sends a whole large file.
 */
export async function fetchFileToolhead(url: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` }, signal })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let received = 0
  let ended = false
  try {
    while (received < HEAD_BYTES) {
      const { done, value } = await reader.read()
      if (done) {
        ended = true
        break
      }
      received += value.byteLength
      text += decoder.decode(value, { stream: true })
      // Only look at complete lines, so a name split across chunks isn't cut short
      const found = toolheadFromGcode(text.slice(0, text.lastIndexOf('\n') + 1))
      if (found) return found
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  // If we stopped at the byte limit, the last line may be cut off: ignore it
  return toolheadFromGcode(ended ? text : text.slice(0, text.lastIndexOf('\n') + 1))
}
