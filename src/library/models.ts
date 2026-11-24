/**
 * The model library's plain logic (Files > Models; Tool Manager docs/proposal-stl-library.md): sorting, searching, which
 * dropped files can be kept, what "set up a job" takes from a selection, and the sentences. No Vue, no network.
 */
import { MODEL_TYPES } from '@/slicer/model'
import type { LibraryEntry } from '@/portal/client'

export type SortKey = 'name' | 'date' | 'size'
export const SORTS: [SortKey, string][] = [['name', 'Name'], ['date', 'Date'], ['size', 'Size']]

export const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name)
export const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
export const MAX_DEPTH = 6
export const depthOf = (p: string) => (p ? p.split('/').length : 0)

const ext = (n: string) => (n.includes('.') ? n.slice(n.lastIndexOf('.') + 1).toLowerCase() : '')
export const isModelName = (n: string) => (MODEL_TYPES as readonly string[]).includes(ext(n))

/** Folders first, then the chosen order; name order is the tie-break. */
export function arrange(entries: LibraryEntry[], by: SortKey, desc: boolean, query: string): LibraryEntry[] {
  const q = query.trim().toLowerCase()
  const list = entries.filter((e) => !q || e.name.toLowerCase().includes(q))
  const dir = desc ? -1 : 1
  const key = (e: LibraryEntry) => (by === 'size' ? (e.dir ? e.items ?? 0 : e.size ?? 0) : by === 'date' ? e.modified : 0)
  return list.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1
    const d = by === 'name' ? 0 : (key(a) - key(b)) * dir
    if (d) return d
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * (by === 'name' ? dir : 1)
  })
}

export function sizeText(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} kB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(1)} GB`
}

/** Which of the chosen files the library keeps, and the rest with the reason. Types only: the Portal checks the contents. */
export function planUpload(files: { name: string; size: number }[], maxFile: number): { keep: number[]; skipped: { name: string; why: string }[] } {
  const keep: number[] = []
  const skipped: { name: string; why: string }[] = []
  files.forEach((f, i) => {
    if (f.name.startsWith('.')) skipped.push({ name: f.name, why: 'hidden file' })
    else if (!isModelName(f.name)) skipped.push({ name: f.name, why: `not a model (${MODEL_TYPES.join(', ')})` })
    else if (f.size > maxFile) skipped.push({ name: f.name, why: `over ${sizeText(maxFile)}` })
    else keep.push(i)
  })
  return { keep, skipped }
}

export function skippedText(s: { name: string; why: string }[]): string | null {
  if (!s.length) return null
  const shown = s.slice(0, 3).map((x) => `${x.name} (${x.why})`).join(', ')
  return `Left out: ${shown}${s.length > 3 ? ` and ${s.length - 3} more` : ''}.`
}

/**
 * What "Set up a job" takes from what is selected: the selected files, plus the model files of each selected folder
 * (one level: a folder is one assembly, never a tree). `folderFiles` gives a folder's model file names.
 */
export function setupPaths(folder: string, selected: LibraryEntry[], folderFiles: Record<string, string[]>): string[] {
  const out: string[] = []
  for (const e of selected) {
    if (e.dir) for (const n of folderFiles[e.name] ?? []) out.push(join(join(folder, e.name), n))
    else out.push(join(folder, e.name))
  }
  return out
}

/** The delete confirmation, naming what goes. */
export function deleteSentence(names: string[], counts: { files: number; folders: number }): string {
  const what = [counts.files ? `${counts.files} file${counts.files === 1 ? '' : 's'}` : '', counts.folders ? `${counts.folders} folder${counts.folders === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')
  const label = names.length === 1 ? `“${names[0]}”` : `${names.length} items`
  return `Delete ${label}? That removes ${what || 'nothing'} from the Rhino now. There is no trash to get them back from.`
}

export function spaceText(u: { free: number; floor: number; bytes: number; files: number }): string {
  const room = Math.max(0, u.free - u.floor)
  return `${u.files} model${u.files === 1 ? '' : 's'} · ${sizeText(u.bytes)} · room for ${sizeText(room)} more`
}

/** Files that came out of the library (so "Add to library" doesn't offer them back). */
export const fromLibrary = new WeakSet<File>()

/** The original files of a job's parts that could be added to the library: each file once, no library file, models only. */
export function addable(parts: { id: number }[], sources: Record<number, File>): File[] {
  const seen = new Set<File>()
  const out: File[] = []
  for (const p of parts) {
    const f = sources[p.id]
    if (f && !seen.has(f) && !fromLibrary.has(f) && isModelName(f.name)) (seen.add(f), out.push(f))
  }
  return out
}
