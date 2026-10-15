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
 *
 * Nothing here moves the machine or switches a tool on.
 *
 * Writes need the Portal's per-process token (X-Rhino-Token). The Portal puts
 * it in a <meta name="rhino-token"> tag on its home page, so we read it from
 * there, and read it again if the Portal was restarted.
 */
import type { JobsWeeks, MaintHistory, MaintOverview } from '@/maintenance/types'
import type { PortalState, PreviewResult, ToolDetail, ToolOptions, ToolSheetData, WriteResult } from '@/toolmgr/types'

export const PORTAL_WRITES = ['done', 'snooze'] as const
export const PORTAL_TOOL_CHECKS = ['tool-check', 'preview-control', 'preview-macro'] as const
export const PORTAL_TOOL_WRITES = ['tool-add', 'tool-edit', 'tool-rename', 'tool-delete', 'photo-add', 'photo-delete'] as const
export const PORTAL_RESTART = ['restart', 'restart-auto'] as const

export type WriteKind =
  | (typeof PORTAL_WRITES)[number]
  | (typeof PORTAL_TOOL_CHECKS)[number]
  | (typeof PORTAL_TOOL_WRITES)[number]
  | (typeof PORTAL_RESTART)[number]

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
}

const ALLOWED = new Set<string>([...PORTAL_WRITES, ...PORTAL_TOOL_CHECKS, ...PORTAL_TOOL_WRITES, ...PORTAL_RESTART])
const enc = encodeURIComponent

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
