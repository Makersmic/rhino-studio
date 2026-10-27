/**
 * Rhino Portal client: the tool manager and maintenance engine that already
 * runs on the Pi (Flask, port 5000, rhino/ in Toolhead_Manager).
 *
 * Studio is the new face for it; the Portal keeps the data and the rules
 * (tool registry, custom_tools.cfg, schedules, meters, Task Books, work log),
 * so there is exactly one tool manager and one maintenance engine.
 *
 * Reads: GET /api/maint, /api/maint/history, /api/dash/jobs, /api/state,
 * /api/options, /api/tools/<name>, /api/tools/<name>/sheet.
 *
 * Writes are allow-listed by kind, each with its fixed request (WRITE_ROUTES).
 * A write that isn't listed is refused before it leaves the browser:
 *
 *   PORTAL_WRITES        maintenance records: log work, snooze
 *   PORTAL_TOOL_CHECKS   validate a tool, control or macro; change nothing
 *   PORTAL_TOOL_WRITES   add, edit, rename and delete *added* tools and their
 *                        photos. They change the registry and custom_tools.cfg,
 *                        which Klipper only loads at its next restart; the
 *                        Portal refuses to touch built-in tools, the mounted
 *                        tool's removal, and anything during a job that would
 *                        need Klipper.
 *   PORTAL_RESTART       restart Klipper to load waiting tool changes, or ask
 *                        the Portal to do it when the job ends. The Portal
 *                        refuses while a job runs; Studio asks first.
 *   PORTAL_CARE_WRITES   maintenance tasks, the Task Library and Task Books,
 *                        statuses on tasks, meter readings, the reminder
 *                        setting. Maintenance records only.
 *   PORTAL_CARE_SETUP    machine areas, kinds of work, priorities, status
 *                        codes. Maintenance records only.
 *   PORTAL_TOOL_SETUP    the add-a-tool lists (kinds of tool, material names,
 *                        nozzle sizes, hardware categories). Portal data only.
 *   PORTAL_BACKUP        Back up now, add a backup from another Rhino, show
 *                        what a restore would change, restore (Tool Manager
 *                        1.7). Refused during a job; a full restore needs the
 *                        machine's name typed and backs up first.
 *   PORTAL_PROFILES      slice profiles and saved Prepare jobs (Tool Manager
 *                        1.8): save with the revision it started from, delete
 *                        (undo for 30 days), revert, import. Nothing reaches
 *                        Klipper; the Portal checks every setting again.
 *   PORTAL_HARDWARE      check, save and remove system hardware (fans,
 *                        lights, pumps on the board). Writes custom_tools.cfg,
 *                        live after the next Klipper restart, like tools.
 *   PORTAL_HW_WIZARD     the Add hardware wizard (Tool Manager 1.9): check a
 *                        typed pin, check / save / remove a device or a second
 *                        board ([mcu name]). Same file and restart rule as
 *                        system hardware.
 *   PORTAL_HOOKS         job hooks (Tool Manager 1.9): check, then save the
 *                        lines Klipper runs at each moment of a job. The Portal
 *                        checks every line again and writes job_hooks.cfg.
 *
 * Nothing here moves the machine or switches a tool on.
 *
 * Writes need the Portal's per-process token (X-Rhino-Token). The Portal puts
 * it in a <meta name="rhino-token"> tag on its home page, so we read it from
 * there, and read it again if the Portal was restarted.
 */
import type { JobsWeeks, MaintHistory, MaintOverview, TaskLibrary, MaintLists, TaskDef, BookDef, StatusEdit } from '@/maintenance/types'
import type { NetState, WifiNetwork } from '@/system/network'
import type { EngineAuto, SliceJobState, SlicerState } from '@/slicer/prusa/portal'
import type { ProfileDraft, ProfileList, SavedJob, SliceProfile } from '@/slicer/sliceProfiles'
import type { BoardsState, DevicePreview, HwCatalog, PinChoice, PinChoices } from '@/hardware/wizard'
import type { Hooks, HooksState } from '@/hardware/hooks'
import type { PortalState, PreviewResult, ToolDetail, ToolLists, ToolOptions, ToolSheetData, WriteResult } from '@/toolmgr/types'

/** GET /api/update (Tool Manager 1.5.3+) */
export interface UpdateRun {
  state: 'idle' | 'running' | 'done' | 'failed'
  zip?: string
  version?: string
  from_version?: string | null
  step?: number
  step_name?: string
  steps?: string[]
  error?: string | null
  log?: string[]
  started?: number
  finished?: number | null
  updated?: number
}
export interface UpdateState {
  installed: string
  /** the updater is set up on this Rhino (installed once by hand) */
  helper: boolean
  zips: { zip: string; version: string; size: number; at: number }[]
  busy: boolean
  status: UpdateRun
  /** GitHub's newest release (Tool Manager 1.5.8+), or why it can't say */
  latest?: { version?: string; zip?: string; published?: string; notes_url?: string; error?: string } | null
}

export const PORTAL_WRITES = ['done', 'snooze'] as const
export const PORTAL_TOOL_CHECKS = ['tool-check', 'preview-control', 'preview-macro'] as const
export const PORTAL_TOOL_WRITES = ['tool-add', 'tool-edit', 'tool-rename', 'tool-delete', 'photo-add', 'photo-delete'] as const
export const PORTAL_RESTART = ['restart', 'restart-auto'] as const
export const PORTAL_CARE_WRITES = [
  'task-create', 'task-update', 'task-delete', 'task-status', 'task-to-library', 'meter-set', 'care-settings',
  'template-create', 'template-update', 'template-delete', 'template-assign', 'book-create', 'book-update', 'book-delete', 'book-assign',
] as const
export const PORTAL_CARE_SETUP = ['areas', 'maint-lists', 'statuses'] as const
export const PORTAL_TOOL_SETUP = ['tool-lists'] as const
export const PORTAL_HARDWARE = ['preview-hardware', 'hardware-save', 'hardware-delete'] as const
/** Job hooks (Tool Manager 1.9+): a check that writes nothing, and the save (rev-checked; the Portal checks every
 *  line again and rewrites job_hooks.cfg, live after a Klipper restart). */
export const PORTAL_HOOKS = ['hooks-preview', 'hooks-save'] as const
export const PORTAL_HW_WIZARD = ['hw-pin-check', 'device-preview', 'device-save', 'device-delete', 'board-preview', 'board-save', 'board-delete'] as const
/**
 * PORTAL_LABELS (Tool Manager 1.5.3+): pin labels, Klipper aliases in [board_pins rhino].
 * Save/remove only change the Portal's generated file; label-use rewrites ONE pin line in a
 * config file (backed up first, read back, put back if it doesn't resolve). Nothing restarts.
 */
export const PORTAL_LABELS = ['label-preview', 'label-save', 'label-delete', 'label-use'] as const
/** The Rhino's network (config 1.4.8+). Each change switches back after a while unless kept. */
/** PrusaSlicer on the Rhino (config 1.5.0+): slicing jobs and the engine's own updates. */
export const PORTAL_SLICER = ['slice', 'slice-cancel', 'engine-check', 'engine-update', 'engine-rollback', 'engine-auto'] as const
/** Install a Tool Manager release zip through the root-owned updater (config 1.5.3+). */
export const PORTAL_UPDATE = ['update-upload', 'update-install', 'update-github'] as const
/** Moonraker's trusted_clients (Tool Manager 1.5.4). Each restarts Moonraker; the Portal refuses during a job. */
export const PORTAL_TRUST = ['trust-add', 'trust-remove'] as const
/** Backups (Tool Manager 1.7, INV-B3/B4): a complete archive or none; restore one item or everything. */
export const PORTAL_BACKUP = ['backup-now', 'backup-upload', 'restore-plan', 'restore'] as const
/** Slice profiles and saved Prepare jobs (Tool Manager 1.8). Files on the Rhino only; nothing reaches Klipper. */
export const PORTAL_PROFILES = [
  'profile-create', 'profile-save', 'profile-delete', 'profile-revert', 'profile-undelete', 'profile-import', 'job-save', 'job-delete',
] as const
export const PORTAL_NETWORK = ['net-hostname', 'net-ipv4', 'net-wifi', 'net-powersave', 'net-keep', 'net-undo'] as const

export type WriteKind =
  | (typeof PORTAL_WRITES)[number]
  | (typeof PORTAL_LABELS)[number]
  | (typeof PORTAL_TOOL_CHECKS)[number]
  | (typeof PORTAL_TOOL_WRITES)[number]
  | (typeof PORTAL_RESTART)[number]
  | (typeof PORTAL_CARE_WRITES)[number]
  | (typeof PORTAL_CARE_SETUP)[number]
  | (typeof PORTAL_TOOL_SETUP)[number]
  | (typeof PORTAL_HARDWARE)[number]
  | (typeof PORTAL_HW_WIZARD)[number]
  | (typeof PORTAL_HOOKS)[number]
  | (typeof PORTAL_NETWORK)[number]
  | (typeof PORTAL_SLICER)[number]
  | (typeof PORTAL_UPDATE)[number]
  | (typeof PORTAL_TRUST)[number]
  | (typeof PORTAL_BACKUP)[number]
  | (typeof PORTAL_PROFILES)[number]

/** The one request each write kind may make. */
export const WRITE_ROUTES: Record<WriteKind, { method: 'POST' | 'DELETE'; path: RegExp }> = {
  done: { method: 'POST', path: /^\/api\/maint\/tasks\/[^/]+\/done$/ },
  snooze: { method: 'POST', path: /^\/api\/maint\/tasks\/[^/]+\/snooze$/ },
  'tool-check': { method: 'POST', path: /^\/api\/tools\/check$/ },
  'preview-control': { method: 'POST', path: /^\/api\/preview\/control$/ },
  'preview-macro': { method: 'POST', path: /^\/api\/preview\/macro$/ },
  'tool-add': { method: 'POST', path: /^\/api\/tools$/ },
  'tool-edit': { method: 'POST', path: /^\/api\/tools\/[^/]+\/edit$/ },
  'tool-rename': { method: 'POST', path: /^\/api\/tools\/[^/]+\/rename$/ },
  'tool-delete': { method: 'DELETE', path: /^\/api\/tools\/[^/]+$/ },
  'photo-add': { method: 'POST', path: /^\/api\/tools\/[^/]+\/photos$/ },
  'photo-delete': { method: 'DELETE', path: /^\/api\/tools\/[^/]+\/photos\/[^/]+$/ },
  restart: { method: 'POST', path: /^\/api\/restart$/ },
  'restart-auto': { method: 'POST', path: /^\/api\/restart\/auto$/ },
  'task-create': { method: 'POST', path: /^\/api\/maint\/tasks$/ },
  'task-update': { method: 'POST', path: /^\/api\/maint\/tasks\/[^/]+$/ },
  'task-delete': { method: 'DELETE', path: /^\/api\/maint\/tasks\/[^/]+$/ },
  'task-status': { method: 'POST', path: /^\/api\/maint\/tasks\/[^/]+\/status$/ },
  'task-to-library': { method: 'POST', path: /^\/api\/maint\/tasks\/[^/]+\/to-library$/ },
  'meter-set': { method: 'POST', path: /^\/api\/maint\/meters$/ },
  'care-settings': { method: 'POST', path: /^\/api\/maint\/settings$/ },
  'template-create': { method: 'POST', path: /^\/api\/maint\/templates$/ },
  'template-update': { method: 'POST', path: /^\/api\/maint\/templates\/[^/]+$/ },
  'template-delete': { method: 'DELETE', path: /^\/api\/maint\/templates\/[^/]+$/ },
  'template-assign': { method: 'POST', path: /^\/api\/maint\/templates\/[^/]+\/assign$/ },
  'book-create': { method: 'POST', path: /^\/api\/maint\/books$/ },
  'book-update': { method: 'POST', path: /^\/api\/maint\/books\/[^/]+$/ },
  'book-delete': { method: 'DELETE', path: /^\/api\/maint\/books\/[^/]+$/ },
  'book-assign': { method: 'POST', path: /^\/api\/maint\/books\/[^/]+\/assign$/ },
  areas: { method: 'POST', path: /^\/api\/maint\/areas$/ },
  'maint-lists': { method: 'POST', path: /^\/api\/maint\/lists$/ },
  statuses: { method: 'POST', path: /^\/api\/maint\/statuses$/ },
  'tool-lists': { method: 'POST', path: /^\/api\/lists$/ },
  'preview-hardware': { method: 'POST', path: /^\/api\/preview\/hardware$/ },
  'hardware-save': { method: 'POST', path: /^\/api\/hardware$/ },
  'hardware-delete': { method: 'DELETE', path: /^\/api\/hardware\/[^/]+$/ },
  'label-preview': { method: 'POST', path: /^\/api\/preview\/pins\/label$/ },
  'label-save': { method: 'POST', path: /^\/api\/pins\/label$/ },
  'label-delete': { method: 'DELETE', path: /^\/api\/pins\/label\/[A-Za-z0-9_]+$/ },
  'label-use': { method: 'POST', path: /^\/api\/pins\/label\/use$/ },
  'hw-pin-check': { method: 'POST', path: /^\/api\/hardware\/pins\/check$/ },
  'device-preview': { method: 'POST', path: /^\/api\/preview\/hardware\/devices$/ },
  'device-save': { method: 'POST', path: /^\/api\/hardware\/devices$/ },
  'device-delete': { method: 'DELETE', path: /^\/api\/hardware\/devices\/[a-z][a-z0-9_]{1,31}$/ },
  'board-preview': { method: 'POST', path: /^\/api\/preview\/hardware\/boards$/ },
  'board-save': { method: 'POST', path: /^\/api\/hardware\/boards$/ },
  'board-delete': { method: 'DELETE', path: /^\/api\/hardware\/boards\/[a-z][a-z0-9_]{1,15}$/ },
  'hooks-preview': { method: 'POST', path: /^\/api\/preview\/hooks$/ },
  'hooks-save': { method: 'POST', path: /^\/api\/hooks$/ },
  'net-hostname': { method: 'POST', path: /^\/api\/net\/hostname$/ },
  'net-ipv4': { method: 'POST', path: /^\/api\/net\/ipv4$/ },
  'net-wifi': { method: 'POST', path: /^\/api\/net\/wifi$/ },
  'net-powersave': { method: 'POST', path: /^\/api\/net\/powersave$/ },
  'net-keep': { method: 'POST', path: /^\/api\/net\/keep$/ },
  'net-undo': { method: 'POST', path: /^\/api\/net\/undo$/ },
  slice: { method: 'POST', path: /^\/api\/slicer\/slice$/ },
  'slice-cancel': { method: 'POST', path: /^\/api\/slicer\/jobs\/[\w-]+\/cancel$/ },
  'engine-check': { method: 'POST', path: /^\/api\/slicer\/engine\/check$/ },
  'engine-update': { method: 'POST', path: /^\/api\/slicer\/engine\/update$/ },
  'engine-rollback': { method: 'POST', path: /^\/api\/slicer\/engine\/rollback$/ },
  'update-upload': { method: 'POST', path: /^\/api\/update\/upload$/ },
  'update-install': { method: 'POST', path: /^\/api\/update\/install$/ },
  'update-github': { method: 'POST', path: /^\/api\/update\/github$/ },
  'engine-auto': { method: 'POST', path: /^\/api\/slicer\/engine\/auto$/ },
  'trust-add': { method: 'POST', path: /^\/api\/moonraker-trust$/ },
  'trust-remove': { method: 'DELETE', path: /^\/api\/moonraker-trust$/ },
  'backup-now': { method: 'POST', path: /^\/api\/backup$/ },
  'backup-upload': { method: 'POST', path: /^\/api\/backup\/upload$/ },
  'restore-plan': { method: 'POST', path: /^\/api\/restore\/plan$/ },
  restore: { method: 'POST', path: /^\/api\/restore$/ },
  'profile-create': { method: 'POST', path: /^\/api\/slice-profiles$/ },
  'profile-save': { method: 'POST', path: /^\/api\/slice-profiles\/p_[a-z0-9]+$/ },
  'profile-delete': { method: 'DELETE', path: /^\/api\/slice-profiles\/p_[a-z0-9]+$/ },
  'profile-revert': { method: 'POST', path: /^\/api\/slice-profiles\/p_[a-z0-9]+\/revert$/ },
  'profile-undelete': { method: 'POST', path: /^\/api\/slice-profiles\/p_[a-z0-9]+\/undelete$/ },
  'profile-import': { method: 'POST', path: /^\/api\/slice-profiles-import$/ },
  'job-save': { method: 'POST', path: /^\/api\/prepare-jobs$/ },
  'job-delete': { method: 'DELETE', path: /^\/api\/prepare-jobs$/ },
}

const ALLOWED = new Set<string>([
  ...PORTAL_WRITES, ...PORTAL_TOOL_CHECKS, ...PORTAL_TOOL_WRITES, ...PORTAL_RESTART,
  ...PORTAL_CARE_WRITES, ...PORTAL_CARE_SETUP, ...PORTAL_TOOL_SETUP, ...PORTAL_HARDWARE, ...PORTAL_HW_WIZARD, ...PORTAL_HOOKS, ...PORTAL_LABELS, ...PORTAL_NETWORK, ...PORTAL_SLICER, ...PORTAL_UPDATE, ...PORTAL_TRUST,
  ...PORTAL_BACKUP, ...PORTAL_PROFILES,
])
const enc = encodeURIComponent

/** GET /api/moonraker-trust (Tool Manager 1.5.4) */
export interface TrustState {
  configured: boolean
  force_logins: boolean
  include: boolean
  entries: string[]
  /** This screen's address as Moonraker sees it, and whether an entry covers it */
  address: string
  covered: boolean
  suggestions: { entry: string; why: string }[]
}

/** One archive in ~/rhino-backups (GET /api/backup, Tool Manager 1.7) */
export interface BackupArchive {
  name: string
  size: number
  time: number
  complete: boolean
  host?: string
  reason?: string
  tool_manager?: string
  files?: number
}
export interface BackupState {
  archives: BackupArchive[]
  keep: number
  folder: string
  items: Record<string, string>
  /** klipper-backup's GitHub copy. Never "ok" unless the last push really worked (INV-B8). */
  github: {
    state: 'not_installed' | 'no_env' | 'never' | 'ok' | 'failed'
    running: boolean
    last: { ok: boolean; code: number | null; time: number; tail: string[] } | null
  }
}
export interface RestorePlan {
  archive: string
  item: string
  made?: number
  host?: string
  this_host: string
  add: string[]
  replace: string[]
  same: string[]
  keep: string[]
  missing_serial?: { file: string; section: string; serial: string }[]
  history_jobs?: number
  backup_version?: string
  installed_version?: string
}
export interface RestoreResult {
  ok: boolean
  item: string
  before: string
  note: string
  restored: string[] | number
  kept?: string[]
}

export class PortalClient {
  /** e.g. '/portal' (dev proxy or nginx on the Pi) or 'http://192.168.1.50:5000' */
  readonly baseUrl: string
  private token: string | null = null
  version: string | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  /** Link to open the full Portal. */
  get homeUrl(): string {
    // The Portal's own pages use root paths (/static/...), so they only work on its own port. Served
    // from the Pi (nginx forwards /portal), link to port 5000 on the same host instead.
    if (this.baseUrl.startsWith('/') && !import.meta.env.DEV && typeof location !== 'undefined')
      return `${location.protocol}//${location.hostname}:5000/`
    return `${this.baseUrl}/`
  }

  /** A Portal path (a tool photo, a built-in drawing) as a URL Studio can load. */
  media(path: string | undefined | null): string | null {
    if (!path) return null
    return /^https?:/.test(path) ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`
  }

  // ---- maintenance ------------------------------------------------------

  async overview(): Promise<MaintOverview> {
    return this.getJson<MaintOverview>('/api/maint')
  }

  async history(asset?: string): Promise<MaintHistory> {
    return this.getJson<MaintHistory>(`/api/maint/history${asset ? `?asset=${enc(asset)}` : ''}`)
  }

  /** Jobs per week for the Dashboard (the Portal reads them from Moonraker's job history). */
  async jobsPerWeek(): Promise<JobsWeeks> {
    return this.getJson<JobsWeeks>('/api/dash/jobs')
  }

  /** Log work on a task. action: 'done', 'skipped' or a custom status id offered by the Portal. */
  async logWork(taskId: string, body: { action: string; date?: string; notes?: string }): Promise<void> {
    await this.write('done', 'POST', `/api/maint/tasks/${enc(taskId)}/done`, body)
  }

  /** Snooze a due task for 1-90 days; 0 cancels a snooze. */
  async snooze(taskId: string, days: number): Promise<void> {
    const d = Math.max(0, Math.min(90, Math.round(days)))
    await this.write('snooze', 'POST', `/api/maint/tasks/${enc(taskId)}/snooze`, { days: d })
  }

  // ---- tools: reads -----------------------------------------------------

  async state(): Promise<PortalState> {
    return this.getJson<PortalState>('/api/state')
  }

  async options(): Promise<ToolOptions> {
    return this.getJson<ToolOptions>('/api/options')
  }

  async sheet(name: string): Promise<ToolSheetData> {
    return this.getJson<ToolSheetData>(`/api/tools/${enc(name)}/sheet`)
  }

  async detail(name: string): Promise<ToolDetail> {
    return (await this.getJson<{ tool: ToolDetail }>(`/api/tools/${enc(name)}`)).tool
  }

  // ---- tools: checks (change nothing) -----------------------------------

  /** Validate a new tool against the config; returns its slot and any warnings. */
  async checkTool(payload: object): Promise<WriteResult> {
    return this.write('tool-check', 'POST', '/api/tools/check', payload)
  }

  /** Validate one control or macro and get the exact Klipper text it becomes. */
  async preview(kind: 'control' | 'macro', body: object): Promise<PreviewResult> {
    return this.write(kind === 'control' ? 'preview-control' : 'preview-macro', 'POST', `/api/preview/${kind}`, body)
  }

  // ---- tools: changes (live after the next Klipper restart) -------------

  async addTool(payload: object): Promise<WriteResult> {
    return this.write('tool-add', 'POST', '/api/tools', payload)
  }

  async editTool(name: string, body: object): Promise<WriteResult> {
    return this.write('tool-edit', 'POST', `/api/tools/${enc(name)}/edit`, body)
  }

  async renameTool(name: string, newName: string): Promise<WriteResult> {
    return this.write('tool-rename', 'POST', `/api/tools/${enc(name)}/rename`, { new_name: newName })
  }

  async deleteTool(name: string): Promise<WriteResult> {
    return this.write('tool-delete', 'DELETE', `/api/tools/${enc(name)}`)
  }

  async addPhoto(name: string, file: Blob, filename = 'photo.jpg'): Promise<WriteResult> {
    const fd = new FormData()
    fd.append('photo', file, filename)
    return this.write('photo-add', 'POST', `/api/tools/${enc(name)}/photos`, fd)
  }

  async deletePhoto(name: string, filename: string): Promise<WriteResult> {
    return this.write('photo-delete', 'DELETE', `/api/tools/${enc(name)}/photos/${enc(filename)}`)
  }

  // ---- restart ----------------------------------------------------------

  /** FIRMWARE_RESTART through the Portal, which refuses while a job runs. */
  async restartKlipper(): Promise<WriteResult> {
    return this.write('restart', 'POST', '/api/restart', {})
  }

  /** Let the Portal restart Klipper by itself when the running job ends. */
  async setAutoRestart(on: boolean): Promise<WriteResult> {
    return this.write('restart-auto', 'POST', '/api/restart/auto', { on })
  }

  // ---- care: tasks, library, books (maintenance records only) -----------

  async taskLibrary(): Promise<TaskLibrary> {
    return this.getJson<TaskLibrary>('/api/maint/tasklib')
  }

  async maintLists(): Promise<MaintLists> {
    return this.getJson<MaintLists>('/api/maint/lists')
  }

  async createTask(def: TaskDef): Promise<WriteResult> {
    return this.write('task-create', 'POST', '/api/maint/tasks', def)
  }

  /** Save a task, or { detach: true } to unlink it from its library task. */
  async updateTask(id: string, body: TaskDef | { detach: true }): Promise<WriteResult> {
    return this.write('task-update', 'POST', `/api/maint/tasks/${enc(id)}`, body)
  }

  async deleteTask(id: string): Promise<WriteResult> {
    return this.write('task-delete', 'DELETE', `/api/maint/tasks/${enc(id)}`)
  }

  /** Set a custom status (status: '' clears it). */
  async setTaskStatus(id: string, body: { status: string; note?: string }): Promise<WriteResult> {
    return this.write('task-status', 'POST', `/api/maint/tasks/${enc(id)}/status`, body)
  }

  async taskToLibrary(id: string): Promise<WriteResult> {
    return this.write('task-to-library', 'POST', `/api/maint/tasks/${enc(id)}/to-library`, {})
  }

  async setMeter(body: { scope: 'machine' | 'tool'; tool?: string | null; meter: string; value: number; note?: string }): Promise<WriteResult> {
    return this.write('meter-set', 'POST', '/api/maint/meters', body)
  }

  async careSettings(body: { boot_reminder?: boolean }): Promise<WriteResult> {
    return this.write('care-settings', 'POST', '/api/maint/settings', body)
  }

  async saveTemplate(id: string | null, def: TaskDef): Promise<WriteResult> {
    return id ? this.write('template-update', 'POST', `/api/maint/templates/${enc(id)}`, def) : this.write('template-create', 'POST', '/api/maint/templates', def)
  }

  async deleteTemplate(id: string): Promise<WriteResult> {
    return this.write('template-delete', 'DELETE', `/api/maint/templates/${enc(id)}`)
  }

  async assignTemplate(id: string, asset: string): Promise<WriteResult> {
    return this.write('template-assign', 'POST', `/api/maint/templates/${enc(id)}/assign`, { asset })
  }

  async saveBook(id: string | null, def: BookDef): Promise<WriteResult> {
    return id ? this.write('book-update', 'POST', `/api/maint/books/${enc(id)}`, def) : this.write('book-create', 'POST', '/api/maint/books', def)
  }

  async deleteBook(id: string): Promise<WriteResult> {
    return this.write('book-delete', 'DELETE', `/api/maint/books/${enc(id)}`)
  }

  /** Put a book on an asset (on: true) or take it off (its tasks there are archived, history kept). */
  async assignBook(id: string, asset: string, on = true): Promise<WriteResult> {
    return this.write('book-assign', 'POST', `/api/maint/books/${enc(id)}/assign`, { asset, on })
  }

  // ---- care setup -----------------------------------------------------------

  async saveAreas(areas: { id: string; label: string }[]): Promise<WriteResult> {
    return this.write('areas', 'POST', '/api/maint/areas', { areas })
  }

  async saveMaintLists(body: { types?: { id: string; label: string }[]; priorities?: Record<string, string> }): Promise<WriteResult> {
    return this.write('maint-lists', 'POST', '/api/maint/lists', body)
  }

  async saveStatuses(body: StatusEdit): Promise<WriteResult> {
    return this.write('statuses', 'POST', '/api/maint/statuses', body)
  }

  // ---- toolhead setup -------------------------------------------------------

  async toolLists(): Promise<ToolLists> {
    return this.getJson<ToolLists>('/api/lists')
  }

  async saveToolLists(body: Record<string, unknown>): Promise<WriteResult> {
    return this.write('tool-lists', 'POST', '/api/lists', body)
  }

  // ---- system hardware ------------------------------------------------------

  async previewHardware(item: object): Promise<PreviewResult> {
    return this.write('preview-hardware', 'POST', '/api/preview/hardware', { item })
  }

  async saveHardware(item: object): Promise<WriteResult> {
    return this.write('hardware-save', 'POST', '/api/hardware', item)
  }

  async deleteHardware(name: string): Promise<WriteResult> {
    return this.write('hardware-delete', 'DELETE', `/api/hardware/${enc(name)}`)
  }

  // ---- Add hardware wizard (Tool Manager 1.9) -----------------------------------

  async hwCatalog(): Promise<HwCatalog> {
    return this.getJson<HwCatalog>('/api/hardware/catalog')
  }
  /** Free pins for `kind`. excludeHw: the device being edited, so its own pins are offered too. */
  async hwPins(kind: string, sensor?: string, excludeHw?: string): Promise<PinChoices> {
    const q = new URLSearchParams({ kind, ...(sensor ? { sensor } : {}), ...(excludeHw ? { exclude_hw: excludeHw } : {}) })
    return this.getJson<PinChoices>(`/api/hardware/pins?${q}`)
  }
  async hwBoards(): Promise<BoardsState> {
    return this.getJson<BoardsState>('/api/hardware/boards')
  }
  async hwDevices(): Promise<{ ok: boolean; devices: (Record<string, unknown> & { name: string; device: string; label: string })[] }> {
    return this.getJson('/api/hardware/devices')
  }
  async checkPin(body: { pin: string; kind: string; sensor?: string; isolated?: boolean }): Promise<PinChoice & { ok: boolean }> {
    return this.write<PinChoice & { ok: boolean }>('hw-pin-check', 'POST', '/api/hardware/pins/check', body)
  }
  async previewDevice(body: Record<string, unknown>): Promise<DevicePreview> {
    return this.write<DevicePreview>('device-preview', 'POST', '/api/preview/hardware/devices', body)
  }
  async saveDevice(body: Record<string, unknown>): Promise<WriteResult> {
    return this.write('device-save', 'POST', '/api/hardware/devices', body)
  }
  async hooksState(): Promise<HooksState> {
    return this.getJson<HooksState>('/api/hooks')
  }
  async previewHooks(body: { rev: number; hooks: Hooks }): Promise<HooksState> {
    return this.write<HooksState>('hooks-preview', 'POST', '/api/preview/hooks', body)
  }
  async saveHooks(body: { rev: number; hooks: Hooks }): Promise<HooksState & WriteResult> {
    return this.write<HooksState & WriteResult>('hooks-save', 'POST', '/api/hooks', body)
  }
  async deleteDevice(name: string): Promise<WriteResult> {
    return this.write('device-delete', 'DELETE', `/api/hardware/devices/${enc(name)}`)
  }
  async previewBoard(body: Record<string, unknown>): Promise<{ ok: boolean; name: string; cfg: string; warnings: string[] }> {
    return this.write<{ ok: boolean; name: string; cfg: string; warnings: string[] }>('board-preview', 'POST', '/api/preview/hardware/boards', body)
  }
  async saveBoard(body: Record<string, unknown>): Promise<WriteResult> {
    return this.write('board-save', 'POST', '/api/hardware/boards', body)
  }
  async deleteBoard(name: string): Promise<WriteResult> {
    return this.write('board-delete', 'DELETE', `/api/hardware/boards/${enc(name)}`)
  }

  // ---- pin labels (Tool Manager 1.5.3+) ----------------------------------------

  async saveLabel(body: { alias: string; pin: string; original?: string }): Promise<WriteResult & { previous?: string; warnings?: string[] }> {
    return this.write('label-save', 'POST', '/api/pins/label', body)
  }
  async deleteLabel(alias: string): Promise<WriteResult> {
    return this.write('label-delete', 'DELETE', `/api/pins/label/${enc(alias)}`)
  }
  async useLabel(body: { file: string; section: string; key: string; alias: string }): Promise<WriteResult & { made_label?: boolean }> {
    return this.write('label-use', 'POST', '/api/pins/label/use', body)
  }

  // ---- the Rhino's network (config 1.4.8+) --------------------------------

  async netState(): Promise<NetState> {
    return this.getJson<NetState & { ok: boolean }>('/api/net')
  }
  async wifiScan(): Promise<WifiNetwork[]> {
    return (await this.getJson<{ ok: boolean; networks: WifiNetwork[] }>('/api/net/wifi')).networks
  }
  setHostname(hostname: string): Promise<WriteResult> {
    return this.write('net-hostname', 'POST', '/api/net/hostname', { hostname })
  }
  setIpv4(body: { iface: string; method: 'auto' | 'manual'; address?: string; prefix?: number; gateway?: string; dns?: string[] }): Promise<WriteResult> {
    return this.write('net-ipv4', 'POST', '/api/net/ipv4', body)
  }
  /** The password goes in the body over the Pi's own network; the Portal never logs or returns it. */
  joinWifi(ssid: string, password: string): Promise<WriteResult> {
    return this.write('net-wifi', 'POST', '/api/net/wifi', { ssid, password })
  }
  setPowersave(on: boolean): Promise<WriteResult> {
    return this.write('net-powersave', 'POST', '/api/net/powersave', { on })
  }
  keepNetChange(): Promise<WriteResult> {
    return this.write('net-keep', 'POST', '/api/net/keep', {})
  }
  undoNetChange(): Promise<WriteResult> {
    return this.write('net-undo', 'POST', '/api/net/undo', {})
  }

  // ---- PrusaSlicer on the Rhino (config 1.5.0+) -------------------------------

  async slicerState(): Promise<SlicerState> {
    return this.getJson<SlicerState & { ok: boolean }>('/api/slicer')
  }
  /** Option names the installed engine accepts (prusa-slicer --help-fff). */
  async slicerKeys(): Promise<string[]> {
    return (await this.getJson<{ ok: boolean; keys: string[] }>('/api/slicer/keys')).keys
  }
  /** Queue a slice: the part as binary STL and the full INI. The Portal answers with a job id. */
  async slice(model: Blob, ini: string, name: string, center: [number, number]): Promise<{ id: string }> {
    const f = new FormData()
    f.append('model', model, 'part.stl')
    f.append('config', new Blob([ini], { type: 'text/plain' }), 'rhino.ini')
    f.append('name', name)
    f.append('center', `${center[0]},${center[1]}`)
    return this.write<{ ok: boolean; id: string }>('slice', 'POST', '/api/slicer/slice', f)
  }
  async sliceJob(id: string): Promise<SliceJobState> {
    return this.getJson<SliceJobState & { ok: boolean }>(`/api/slicer/jobs/${enc(id)}`)
  }
  async sliceGcode(id: string): Promise<string> {
    const r = await fetch(`${this.baseUrl}/api/slicer/jobs/${enc(id)}/gcode`)
    if (!r.ok) throw new Error(`The sliced file couldn't be fetched (HTTP ${r.status})`)
    return r.text()
  }
  cancelSlice(id: string): Promise<WriteResult> {
    return this.write('slice-cancel', 'POST', `/api/slicer/jobs/${enc(id)}/cancel`, {})
  }
  checkEngine(): Promise<WriteResult> {
    return this.write('engine-check', 'POST', '/api/slicer/engine/check', {})
  }
  updateEngine(): Promise<WriteResult> {
    return this.write('engine-update', 'POST', '/api/slicer/engine/update', {})
  }
  /** Put back the PrusaSlicer version from before the last update (Tool Manager 1.5.2+). */
  /** Keep PrusaSlicer up to date by itself while it's being used (Tool Manager 1.5.8). */
  setEngineAuto(on: boolean): Promise<{ ok: boolean; auto: EngineAuto }> {
    return this.write('engine-auto', 'POST', '/api/slicer/engine/auto', { on })
  }
  /** Download GitHub's newest release on the Rhino, check it, and install it (Tool Manager 1.5.8). */
  installFromGitHub(version: string): Promise<{ ok: boolean; zip: string }> {
    return this.write('update-github', 'POST', '/api/update/github', { version })
  }
  rollbackEngine(): Promise<WriteResult> {
    return this.write('engine-rollback', 'POST', '/api/slicer/engine/rollback', {})
  }

  // ---- install a release zip (config 1.5.3+) ----------------------------------

  /** fresh: Check now, so the Portal asks GitHub again instead of its hourly answer (Tool Manager 1.9.4+; older ignore it) */
  async updateState(fresh = false): Promise<UpdateState> {
    return this.getJson<UpdateState & { ok: boolean }>(fresh ? '/api/update?refresh=1' : '/api/update')
  }
  /** Upload a rhino-config-<version>.zip; the Portal checks and keeps it. Nothing is installed yet. */
  uploadUpdate(zip: File): Promise<{ ok: boolean; zip: string; version: string; installed: string }> {
    const f = new FormData()
    f.append('zip', zip, zip.name)
    return this.write('update-upload', 'POST', '/api/update/upload', f)
  }
  /** Ask the root-owned updater to install a kept zip (also how "Go back" works). */
  installUpdate(zip: string): Promise<WriteResult> {
    return this.write('update-install', 'POST', '/api/update/install', { zip })
  }

  /** Moonraker's trusted_clients; null from a Tool Manager before 1.5.4. */
  async trust(): Promise<TrustState | null> {
    try {
      return await this.getJson<TrustState>('/api/moonraker-trust')
    } catch (e) {
      if (/not found/i.test((e as Error).message)) return null
      throw e
    }
  }
  /** Add an address or range; the Portal restarts Moonraker and waits for it. */
  addTrust(entry: string): Promise<TrustState> {
    return this.write('trust-add', 'POST', '/api/moonraker-trust', { entry })
  }
  removeTrust(entry: string): Promise<TrustState> {
    return this.write('trust-remove', 'DELETE', '/api/moonraker-trust', { entry })
  }

  // ---- backups (Tool Manager 1.7) -------------------------------------------

  /** null from a Tool Manager before 1.7 */
  async backups(): Promise<BackupState | null> {
    try {
      return await this.getJson<BackupState>('/api/backup')
    } catch (e) {
      if (/not found/i.test((e as Error).message)) return null
      throw e
    }
  }
  backupNow(): Promise<{ ok: boolean; archive: BackupArchive }> {
    return this.write('backup-now', 'POST', '/api/backup', {})
  }
  /** A link the browser downloads (a GET, so not a write) */
  backupUrl(name: string): string {
    return `${this.baseUrl}/api/backup/file/${enc(name)}`
  }
  uploadBackup(file: File): Promise<{ ok: boolean; archive: BackupArchive }> {
    const f = new FormData()
    f.append('archive', file, file.name)
    return this.write('backup-upload', 'POST', '/api/backup/upload', f)
  }
  /** What a restore would change. Changes nothing. */
  async restorePlan(archive: string, item: string): Promise<RestorePlan> {
    return (await this.write<{ ok: boolean; plan: RestorePlan }>('restore-plan', 'POST', '/api/restore/plan', { archive, item })).plan
  }
  restore(archive: string, item: string, confirm = ''): Promise<RestoreResult> {
    return this.write('restore', 'POST', '/api/restore', { archive, item, confirm })
  }

  // ---- slice profiles and saved Prepare jobs (Tool Manager 1.8) ---------------

  /** null from a Tool Manager before 1.8 */
  async sliceProfiles(full = false): Promise<ProfileList | null> {
    try {
      const r = await fetch(`${this.baseUrl}/api/slice-profiles${full ? '?full=1' : ''}`, { headers: { Accept: 'application/json' } })
      if (r.status === 404) return null
      const d = (await r.json().catch(() => null)) as ProfileList | null
      if (!d) throw new Error(`Portal error (HTTP ${r.status})`)
      return d // ok:false with an error when the file can't be read
    } catch (e) {
      if (/not found/i.test((e as Error).message)) return null
      throw e instanceof TypeError ? new Error("Can't reach the Rhino Portal - is it running?") : e
    }
  }
  async sliceProfile(id: string): Promise<SliceProfile> {
    return (await this.getJson<{ profile: SliceProfile }>(`/api/slice-profiles/${enc(id)}`)).profile
  }
  async profileHistory(id: string): Promise<SliceProfile[]> {
    return (await this.getJson<{ revisions: SliceProfile[] }>(`/api/slice-profiles/${enc(id)}/history`)).revisions
  }
  async createProfile(p: ProfileDraft): Promise<SliceProfile> {
    return (await this.write<{ profile: SliceProfile }>('profile-create', 'POST', '/api/slice-profiles', p)).profile
  }
  /** rev: the revision this edit started from; a newer one on the Rhino is refused */
  async saveProfile(id: string, p: ProfileDraft, rev: number): Promise<SliceProfile> {
    return (await this.write<{ profile: SliceProfile }>('profile-save', 'POST', `/api/slice-profiles/${enc(id)}`, { profile: p, rev })).profile
  }
  deleteProfile(id: string): Promise<WriteResult> {
    return this.write('profile-delete', 'DELETE', `/api/slice-profiles/${enc(id)}`)
  }
  async revertProfile(id: string, to: number): Promise<SliceProfile> {
    return (await this.write<{ profile: SliceProfile }>('profile-revert', 'POST', `/api/slice-profiles/${enc(id)}/revert`, { to })).profile
  }
  async undeleteProfile(id: string): Promise<SliceProfile> {
    return (await this.write<{ profile: SliceProfile }>('profile-undelete', 'POST', `/api/slice-profiles/${enc(id)}/undelete`, {})).profile
  }
  /** A link the browser downloads (a GET, so not a write) */
  profilesExportUrl(id?: string): string {
    return `${this.baseUrl}/api/slice-profiles-export${id ? `?id=${enc(id)}` : ''}`
  }
  async importProfiles(data: object): Promise<{ id: string; name: string }[]> {
    return (await this.write<{ added: { id: string; name: string }[] }>('profile-import', 'POST', '/api/slice-profiles-import', data)).added
  }
  async prepareJobs(): Promise<Record<string, SavedJob>> {
    return (await this.getJson<{ jobs: Record<string, SavedJob> }>('/api/prepare-jobs')).jobs
  }
  async saveJob(file: string, job: SavedJob): Promise<SavedJob> {
    return (await this.write<{ job: SavedJob }>('job-save', 'POST', '/api/prepare-jobs', { file, job })).job
  }
  deleteJob(file: string): Promise<WriteResult> {
    return this.write('job-delete', 'DELETE', '/api/prepare-jobs', { file })
  }

  /** Reads the token and version from the Portal's home page. */
  async refreshToken(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/`, { headers: { Accept: 'text/html' } })
    if (!res.ok) throw new Error(`Portal not reachable (HTTP ${res.status})`)
    const html = await res.text()
    this.token = /<meta\s+name="rhino-token"\s+content="([^"]+)"/i.exec(html)?.[1] ?? null
    this.version = /class="version">\s*v?([\w.+-]+)/i.exec(html)?.[1] ?? null
    if (!this.token) throw new Error("The Portal didn't provide a write token")
  }

  // ---- internals -------------------------------------------------------

  private async getJson<T>(path: string): Promise<T> {
    let res: Response
    try {
      res = await fetch(this.baseUrl + path, { headers: { Accept: 'application/json' } })
    } catch {
      throw new Error("Can't reach the Rhino Portal - is it running?")
    }
    const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null
    if (!res.ok || !data || data.ok === false) throw new Error(data?.error ?? `Portal error (HTTP ${res.status})`)
    return data
  }

  private async write<T = WriteResult>(kind: WriteKind, method: 'POST' | 'DELETE', path: string, body?: object, retried = false): Promise<T> {
    const route = WRITE_ROUTES[kind]
    if (!ALLOWED.has(kind) || !route || route.method !== method || !route.path.test(path)) {
      throw new Error(`Studio doesn't send "${kind}" ${method} ${path} to the Portal`)
    }
    if (!this.token) await this.refreshToken()
    const headers: Record<string, string> = { 'X-Rhino-Token': this.token ?? '' }
    let payload: BodyInit | undefined
    if (body instanceof FormData) payload = body
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    let res: Response
    try {
      res = await fetch(this.baseUrl + path, { method, headers, body: payload })
    } catch {
      throw new Error("Can't reach the Rhino Portal - is it running?")
    }
    const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null
    if (res.ok && data && data.ok !== false) return data
    // The Portal makes a new token each time it starts: fetch it once and retry
    if (!retried && /out of date|restarted/i.test(data?.error ?? '')) {
      this.token = null
      return this.write<T>(kind, method, path, body, true)
    }
    throw new Error(data?.error ?? `Portal error (HTTP ${res.status})`)
  }
}
