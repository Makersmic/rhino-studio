/**
 * Log helpers for Settings > Logs. Pure: which files to show first, and the
 * last error in a Klipper or Moonraker log, so "Copy last error" can grab it.
 */
import type { FileEntry } from '@/moonraker/client'

/** Read at most the end of a log: the Pi doesn't need to send megabytes to a phone. */
export const TAIL_BYTES = 256 * 1024

const MAIN = ['klippy.log', 'moonraker.log', 'crowsnest.log']

/** Main logs first in that order, then the rest by name; rotated copies (.log.1, .log.2025-…) last. */
export function sortLogs(files: readonly FileEntry[]): FileEntry[] {
  const rank = (p: string) => {
    const i = MAIN.indexOf(p)
    if (i >= 0) return i
    return /\.log$/i.test(p) ? 10 : 20
  }
  return [...files].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path))
}

/** Drop a partial first line (the tail starts mid-line). */
export function cleanTail(text: string, wasCut: boolean): string {
  if (!wasCut) return text
  const nl = text.indexOf('\n')
  return nl >= 0 ? text.slice(nl + 1) : text
}

const ERROR_START = /^(Traceback \(most recent call last\)|!! |Error |.*\b(ERROR|Error|error)\b[: ]|Internal error|MCU '.*' shutdown|Transition to shutdown state|Config error|Unhandled exception)/

/**
 * The last error block: the last line that looks like an error, plus the
 * lines that belong to it (a Python traceback, or Klipper's indented detail),
 * at most 40 lines. null when there's nothing that looks like an error.
 */
export function lastError(text: string): string | null {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!ERROR_START.test(lines[i]!)) continue
    // walk back over the lines that belong to it: a traceback's body, Klipper's
    // indented detail, and the error lines just before it (e.g. "MCU shutdown"
    // right before "Transition to shutdown state")
    let start = i
    while (start > 0 && i - start < 40 && /^(\s+|Traceback|\w+(Error|Exception)\b)/.test(lines[start]!) && !/^Traceback/.test(lines[start]!)) start--
    while (start > 0 && i - start < 40 && (ERROR_START.test(lines[start - 1]!) || /^\s+\S/.test(lines[start - 1]!))) start--
    let end = i + 1
    while (end < lines.length && end - start < 40 && /^(\s+|\w+(Error|Exception)\b|!! )/.test(lines[end]!)) end++
    return lines.slice(start, end).join('\n').trim() || null
  }
  return null
}
