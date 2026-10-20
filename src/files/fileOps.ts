/**
 * The file manager's rules (Files > Gcode files / Config / Logs), kept apart
 * from the screens so each one has a unit test.
 *
 * Paths here are Moonraker paths: the root first, then the folders and name,
 * e.g. "gcodes/parts/bracket.gcode" or "config/myrhino/positions.cfg".
 * The client refuses anything outside the roots (src/moonraker/client.ts);
 * these rules decide what Studio offers in the first place.
 */

export type Root = 'gcodes' | 'config' | 'logs'

export const ROOTS: Record<Root, { label: string; writable: boolean }> = {
  gcodes: { label: 'Gcode files', writable: true },
  config: { label: 'Config', writable: true },
  logs: { label: 'Logs', writable: false },
}

export const join = (...parts: string[]) => parts.filter(Boolean).join('/')
export const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)
export const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
export function extOf(name: string): string {
  const b = baseName(name)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i + 1).toLowerCase() : ''
}

/** Why a new file or folder name can't be used, or null when it's fine. */
export function nameProblem(name: string): string | null {
  if (!name || !name.trim()) return 'Give it a name'
  if (name !== name.trim()) return "Names can't start or end with a space"
  if (name === '.' || name === '..') return "That name isn't allowed"
  if (name.startsWith('.')) return "Names can't start with a dot (Moonraker hides those)"
  if (/[/\\]/.test(name)) return 'Names can’t contain / or \\'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return 'Names can’t contain control characters'
  if (name.length > 200) return 'That name is too long (200 characters at most)'
  return null
}

export const GCODE_EXT = new Set(['gcode', 'gco', 'g', 'nc', 'ngc'])
/** Files the editor opens as text. Anything else downloads only. */
export const TEXT_EXT = new Set([...GCODE_EXT, 'cfg', 'conf', 'txt', 'json', 'md', 'log', 'sh', 'py', 'yaml', 'yml', 'ini', 'csv', 'svg', 'bak', ''])

export const isGcode = (name: string) => GCODE_EXT.has(extOf(name))
export const isText = (name: string) => TEXT_EXT.has(extOf(name)) || /\.log(\.[\w-]+)?$/i.test(name)

/** Above this a text file opens read-only (the editor stays quick on a phone). */
export const EDIT_LIMIT = 2 * 1024 * 1024
/** Above this nothing opens; download it. */
export const VIEW_LIMIT = 25 * 1024 * 1024

export type OpenMode = { mode: 'edit' | 'view' | 'download'; why: string | null }

/** What opening a file does: edit it, view it read-only, or only offer the download. */
export function openMode(root: Root, name: string, size: number): OpenMode {
  if (!isText(name)) return { mode: 'download', why: 'Not a text file: download it to open it.' }
  if (size > VIEW_LIMIT) return { mode: 'download', why: `Too big to open here (${mb(size)}): download it.` }
  if (!ROOTS[root].writable) return { mode: 'view', why: 'Logs are read-only.' }
  if (size > EDIT_LIMIT) return { mode: 'view', why: `Big file (${mb(size)}): opened read-only.` }
  return { mode: 'edit', why: null }
}
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`

/**
 * The file a job is using can't be edited, renamed, moved or deleted, and nor
 * can a folder it's in. Copying and downloading it are fine.
 * activeJobFile: print_stats.filename (relative to gcodes), or null.
 */
export function lockReason(rootPath: string, activeJobFile: string | null): string | null {
  if (!activeJobFile) return null
  const busy = `gcodes/${activeJobFile}`
  if (rootPath === busy) return 'A job is using this file'
  if (busy.startsWith(`${rootPath}/`)) return 'A job is using a file in this folder'
  return null
}

/** "part.gcode" -> "part (1).gcode", "part (2).gcode", ... the first one not taken. */
export function keepBothName(name: string, taken: ReadonlySet<string>): string {
  const ext = extOf(name)
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name
  const bare = stem.replace(/ \(\d+\)$/, '')
  for (let i = 1; i < 10000; i++) {
    const n = `${bare} (${i})${ext ? `.${ext}` : ''}`
    if (!taken.has(n)) return n
  }
  return `${bare} (${Date.now()})${ext ? `.${ext}` : ''}`
}

/** "copy of" name for Duplicate. */
export const duplicateName = (name: string, taken: ReadonlySet<string>) => keepBothName(name, taken)

/** Config files are copied here before Studio saves over them. */
export const BACKUP_DIR = 'config/studio_backups'
/**
 * A backup copy's path. ".bak" at the end, so no [include *.cfg] can pick it up;
 * folders flattened with "__" so they all sit in one place.
 */
export function backupPath(configPath: string, when: Date): string {
  const rel = configPath.replace(/^config\//, '').replace(/\//g, '__')
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`
  return `${BACKUP_DIR}/${rel}.${stamp}.bak`
}
/** How many backups of one file to keep (oldest go first). */
export const BACKUPS_KEPT = 10
/** Of a folder's backup names, the ones to delete for this file (all but the newest BACKUPS_KEPT). */
export function backupsToPrune(names: string[], configPath: string): string[] {
  const rel = configPath.replace(/^config\//, '').replace(/\//g, '__')
  const mine = names.filter((n) => n.startsWith(`${rel}.`) && /\.\d{8}-\d{6}\.bak$/.test(n)).sort()
  return mine.slice(0, Math.max(0, mine.length - BACKUPS_KEPT))
}

export type Restart = { kind: 'firmware'; label: string } | { kind: 'service'; service: string; label: string }
/** What applies a saved config file. Nothing restarts by itself: Studio offers this with a confirmation. */
export function restartFor(rootPath: string): Restart | null {
  if (!rootPath.startsWith('config/')) return null
  const name = baseName(rootPath).toLowerCase()
  if (name === 'moonraker.conf') return { kind: 'service', service: 'moonraker', label: 'Restart Moonraker to apply' }
  if (name === 'crowsnest.conf') return { kind: 'service', service: 'crowsnest', label: 'Restart cameras to apply' }
  if (extOf(name) === 'cfg') return { kind: 'firmware', label: 'Restart Klipper to apply' }
  return null
}

export type SortBy = 'name' | 'date' | 'size'
export interface Entry {
  name: string
  dir: boolean
  modified: number
  size: number
}
/** Folders first, then files, each sorted the same way. */
export function sortEntries<T extends Entry>(list: T[], by: SortBy, desc: boolean): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  const cmp = (a: T, b: T) => {
    const primary = by === 'date' ? a.modified - b.modified : by === 'size' ? a.size - b.size : byName(a, b)
    // ties fall back to the name, always A-Z
    return primary !== 0 ? primary * (desc ? -1 : 1) : byName(a, b)
  }
  return [...list].sort((a, b) => (a.dir === b.dir ? cmp(a, b) : a.dir ? -1 : 1))
}

/** Which uploads a folder takes: G-code folders take G-code only, config takes text files. */
export function uploadProblem(root: Root, name: string): string | null {
  if (root === 'logs') return 'Logs are read-only'
  if (root === 'gcodes' && !isGcode(name)) return 'not G-code (.gcode, .nc, .ngc, .gco, .g)'
  if (root === 'config' && !isText(name)) return 'not a text file'
  return nameProblem(name)
}
