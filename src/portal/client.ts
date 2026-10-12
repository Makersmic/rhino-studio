/**
 * Rhino Portal client: the maintenance engine that already runs on the Pi
 * (Flask, port 5000, rhino/maint/ in Toolhead_Manager).
 *
 * Studio is the new face for it; the Portal keeps the data and the rules
 * (schedules, meters, Task Books, work log, the Mainsail boot reminder), so
 * there is exactly one maintenance engine.
 *
 * What this client may do:
 *   read  GET /api/maint, GET /api/maint/history
 *   write POST /api/maint/tasks/<id>/done    (log work: done / skipped / a status)
 *         POST /api/maint/tasks/<id>/snooze  (0-90 days)
 * Those writes only change the Portal's maintenance records. Nothing here
 * talks to Klipper or can move the machine. Creating and editing tasks,
 * Task Books and meters stays in the Portal until Phase 5.
 *
 * Writes need the Portal's per-process token (X-Rhino-Token). The Portal puts
 * it in a <meta name="rhino-token"> tag on its home page, so we read it from
 * there, and read it again if the Portal was restarted.
 */
import type { MaintHistory, MaintOverview } from '@/maintenance/types'

export const PORTAL_WRITES = ['done', 'snooze'] as const

export class PortalClient {
  /** e.g. '/portal' (dev proxy or nginx on the Pi) or 'http://192.168.1.50:5000' */
  readonly baseUrl: string
  private token: string | null = null
  version: string | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  /** Link to open the full Portal (for editing tasks until Phase 5). */
  get homeUrl(): string {
    return `${this.baseUrl}/`
  }

  async overview(): Promise<MaintOverview> {
    return this.getJson<MaintOverview>('/api/maint')
  }

  async history(asset?: string): Promise<MaintHistory> {
    return this.getJson<MaintHistory>(`/api/maint/history${asset ? `?asset=${encodeURIComponent(asset)}` : ''}`)
  }

  /** Log work on a task. action: 'done', 'skipped' or a custom status id offered by the Portal. */
  async logWork(taskId: string, body: { action: string; date?: string; notes?: string }): Promise<void> {
    await this.post(`/api/maint/tasks/${encodeURIComponent(taskId)}/done`, body)
  }

  /** Snooze a due task for 1-90 days; 0 cancels a snooze. */
  async snooze(taskId: string, days: number): Promise<void> {
    const d = Math.max(0, Math.min(90, Math.round(days)))
    await this.post(`/api/maint/tasks/${encodeURIComponent(taskId)}/snooze`, { days: d })
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
    const res = await fetch(this.baseUrl + path, { headers: { Accept: 'application/json' } })
    const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null
    if (!res.ok || !data || data.ok === false) throw new Error(data?.error ?? `Portal error (HTTP ${res.status})`)
    return data
  }

  private async post(path: string, body: object, retried = false): Promise<void> {
    if (!this.token) await this.refreshToken()
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rhino-Token': this.token ?? '' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (res.ok && data?.ok !== false) return
    // The Portal makes a new token each time it starts: fetch it once and retry
    if (!retried && /out of date|restarted/i.test(data?.error ?? '')) {
      this.token = null
      return this.post(path, body, true)
    }
    throw new Error(data?.error ?? `Portal error (HTTP ${res.status})`)
  }
}
