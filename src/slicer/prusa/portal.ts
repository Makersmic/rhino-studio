/**
 * Slicing on the Rhino with PrusaSlicer, through the Rhino Portal (config 1.5.0+).
 *
 * The Portal runs one slice at a time, at the lowest CPU and disk priority, with
 * a thread and memory cap so Klipper always comes first. On a small host (under
 * 2 GB of memory, e.g. a Pi 3B) it refuses to slice while a job runs. Studio
 * sends the part (binary STL, already turned and scaled) and the full INI, then
 * polls for progress; nothing here touches Moonraker.
 */
import type { PortalClient } from '@/portal/client'
import type { Phase } from '../engine'
import { prusaStats, toStl } from './config'
/** PrusaSlicer keeps itself up to date while it's used (Tool Manager 1.5.8) */
export interface EngineAuto {
  on: boolean
  last_used: number | null
  /** sliced with it within used_days */
  in_use: boolean
  used_days: number
  /** the last automatic update */
  last?: { from: string | null; to: string | null; at: number; ok: boolean; error?: string | null } | null
}

export interface SlicerState {
  engine: {
    name: string
    /** installed version, or null */
    installed: string | null
    latest: string | null
    update_available: boolean
    /** an install or update is running */
    installing: boolean
    install_error: string | null
    /** what an install or update is doing now ("Downloading from Flathub…"); Tool Manager 1.5.2+ */
    install_phase?: string | null
    /** Install/Update can run on this host */
    can_install: boolean
    /** why it can't (no flatpak yet, under 2 GB of memory, no build for the processor); 1.5.2+ */
    blocked?: string | null
    /** the version before the last update, to go back to; 1.5.2+ */
    previous?: string | null
    /** where the engine comes from ("Flathub" from 1.5.2) */
    source?: string
    arch: string
  }
  /** automatic updates while it's being used (Tool Manager 1.5.8+) */
  auto?: EngineAuto
  host: { mem_total_mb: number; cpus: number; small: boolean }
  /** the job slicing now, if any */
  busy: string | null
  /** why slicing would be refused right now, or null */
  refuse: string | null
}

export interface SliceJobState {
  id: string
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  phase: string
  /** 0..1 when the engine reports it */
  progress: number | null
  error: string | null
  seconds: number
  /** served from the cache: same part and settings as an earlier slice */
  cached?: boolean
}


/**
 * Slice on the Rhino and wait for the G-code. `stillWanted` is asked between
 * polls: when it says no (the settings changed), the Portal job is cancelled.
 */
export async function runPrusa(
  portal: PortalClient,
  vertices: Float32Array,
  ini: string,
  name: string,
  center: [number, number],
  onPhase: (p: Phase, fraction?: number) => void,
  stillWanted: () => boolean,
  timeoutMs = 20 * 60_000,
): Promise<{ gcode: string; seconds: number | null; filamentMm: number | null; cached: boolean }> {
  onPhase('Sending to the Rhino')
  const { id } = await portal.slice(toStl(vertices), ini, name, center)
  const started = Date.now()
  let wait = 300
  for (;;) {
    if (!stillWanted()) {
      await portal.cancelSlice(id).catch(() => {})
      throw new Error('Cancelled: the settings changed')
    }
    if (Date.now() - started > timeoutMs) {
      await portal.cancelSlice(id).catch(() => {})
      throw new Error(`Slicing took longer than ${Math.round(timeoutMs / 60000)} minutes`)
    }
    const s = await portal.sliceJob(id)
    if (s.state === 'done') {
      onPhase('Fetching the file')
      const gcode = await portal.sliceGcode(id)
      if (!gcode.trim()) throw new Error('PrusaSlicer made an empty file.')
      return { gcode, ...prusaStats(gcode), cached: !!s.cached }
    }
    if (s.state === 'failed') throw new Error(s.error ?? 'PrusaSlicer stopped with an error')
    if (s.state === 'cancelled') throw new Error('The slice was cancelled on the Rhino')
    onPhase(s.state === 'queued' ? 'Waiting for the slicer' : 'Slicing on the Rhino', s.progress ?? undefined)
    await new Promise((r) => setTimeout(r, wait))
    wait = Math.min(1000, wait + 100) // quick at first, then once a second
  }
}
