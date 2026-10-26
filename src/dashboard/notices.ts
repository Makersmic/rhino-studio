/**
 * What the Dashboard tells you, like a phone's lock screen: a short stack of
 * notices about the mounted tool and what it's doing. Alerts (red) first.
 *
 * Pure function of the machine's state so it can be tested, and so the
 * Dashboard never invents anything Klipper didn't report.
 */
import type { ToolState } from '@/moonraker/toolState'

export interface Notice {
  id: string
  /** alert = needs you (red); info = what's going on (white) */
  tone: 'alert' | 'info'
  title: string
  detail?: string
  /** where to go for the details */
  to: string
}

export interface NoticeInput {
  online: boolean
  klippy: string
  klippyMessage: string | null
  toolState: ToolState
  /** The machine changes tools itself (a toolchanger): changes during a job are routine */
  autoTools?: boolean
  /** Klipper is executing G-code (idle_timeout "Printing") */
  busy: boolean
  /** a command Studio sent that hasn't finished */
  running: string | null
  /** title of a question a Klipper wizard is asking */
  promptTitle: string | null
  job: { state: string | null; filename: string | null; progress: number | null; duration: number | null; message: string | null }
  hotend: { temp: number | null; target: number | null }
  bed: { temp: number | null; target: number | null }
  care: { overdue: number; dueSoon: number; text: string } | null
  /** fans Klipper drives whose speed signal reads nothing (src/hardware/fans.ts) */
  stalledFans?: { name: string; label: string; speed: number }[]
}

/** What a job is called for each kind of tool. */
export function operationName(type: string | null | undefined): string {
  switch (type) {
    case 'DEPOSITION': return 'Print'
    case 'LASER': return 'Laser job'
    case 'CNC': return 'Spindle job'
    case 'DRAG_KNIFE': return 'Cut'
    default: return 'Job'
  }
}

/** A tool with a hotend (print heads). Other tools get "Body" temperature. */
export const isPrintTool = (type: string | null | undefined) => type === 'DEPOSITION'

/** The safety line for a running job, specific to the tool. */
export function runningDetail(type: string | null | undefined): string {
  switch (type) {
    case 'LASER': return 'Laser can fire: enclosure closed, eye protection on, stay within reach of Stop.'
    case 'CNC': return 'Spindle running: keep hands clear, eyes and ears protected.'
    case 'DRAG_KNIFE': return 'Blade down: keep hands off the bed.'
    case 'DEPOSITION': return 'Nozzle and bed are hot.'
    default: return 'Stay within reach of Stop.'
  }
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  const s = Math.round(sec)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')} min`
}

/**
 * Rough time left from progress through the file. Unreliable at the very
 * start, so nothing is shown until 2 % is done.
 */
export function remainingSeconds(progress: number | null, duration: number | null): number | null {
  if (progress == null || duration == null || progress < 0.02 || progress >= 1) return null
  return (duration * (1 - progress)) / progress
}

const deg = (n: number | null) => (n == null ? '—' : `${Math.round(n)}°`)

export function notices(i: NoticeInput): Notice[] {
  const out: Notice[] = []
  const add = (n: Notice) => out.push(n)
  const tool = i.toolState.kind === 'mounted' ? i.toolState : null
  const op = operationName(tool?.type)
  const file = i.job.filename ?? 'file'

  // --- connection and Klipper -------------------------------------------
  if (!i.online) {
    add({ id: 'offline', tone: 'alert', title: 'Not connected to the Rhino', detail: 'Trying again. Nothing shown here is live.', to: '/settings/connection' })
    return out
  }
  if (i.klippy === 'shutdown' || i.klippy === 'error') {
    add({ id: 'klippy', tone: 'alert', title: 'Klipper has stopped', detail: i.klippyMessage ?? 'Restart it from Control once the machine is safe.', to: '/control' })
  } else if (i.klippy !== 'ready') {
    add({ id: 'klippy', tone: 'info', title: 'Klipper is starting', detail: i.klippyMessage ?? undefined, to: '/control' })
  }

  // --- questions and toolhead ---------------------------------------------
  if (i.promptTitle) add({ id: 'prompt', tone: 'alert', title: `Klipper is asking: ${i.promptTitle}`, detail: 'Answer it on Control.', to: '/control' })

  switch (i.toolState.kind) {
    case 'none-confirmed':
      add({
        id: 'tool',
        tone: 'alert',
        title: 'Toolhead not confirmed',
        detail: i.toolState.lastSavedName ? `Last known: ${i.toolState.lastSavedName}. Confirm it from the top bar.` : 'Confirm it from the top bar.',
        to: '/control',
      })
      break
    case 'unmapped':
      add({ id: 'tool', tone: 'alert', title: `Slot ${i.toolState.slot} isn't in the tool list`, to: '/toolheads' })
      break
    case 'swapping':
      if (i.autoTools && (i.job.state === 'printing' || i.job.state === 'paused')) break
      add({ id: 'tool', tone: 'info', title: `Swapping toolhead${i.toolState.toName ? ` to ${i.toolState.toName}` : ''}`, detail: 'Follow the steps on Control.', to: '/control' })
      break
    case 'mismatch':
      add({ id: 'tool', tone: 'alert', title: 'Tool sensor disagrees: stop and check', detail: `Selected: ${i.toolState.expectedName ?? 'none'}. Sensor sees: ${i.toolState.detectedName ?? 'no tool'}.`, to: '/control' })
      break
  }

  // --- the job --------------------------------------------------------------
  const pct = i.job.progress != null ? `${Math.round(i.job.progress * 100)} %` : null
  switch (i.job.state) {
    case 'printing': {
      const left = remainingSeconds(i.job.progress, i.job.duration)
      add({
        id: 'job',
        tone: 'info',
        title: `${op} running: ${file}`,
        detail: [pct, left != null ? `about ${formatDuration(left)} left` : null].filter(Boolean).join(' · ') + `. ${runningDetail(tool?.type)}`,
        to: '/control',
      })
      break
    }
    case 'paused':
      add({ id: 'job', tone: 'alert', title: `${op} paused: ${file}`, detail: i.job.message ?? 'Resume or cancel it on Control.', to: '/control' })
      break
    case 'error':
      add({ id: 'job', tone: 'alert', title: `${op} stopped with an error`, detail: i.job.message ?? file, to: '/control' })
      break
    case 'complete':
      add({ id: 'job', tone: 'info', title: `${op} finished: ${file}`, detail: i.job.duration ? `Took ${formatDuration(i.job.duration)}.` : undefined, to: '/files' })
      break
    case 'cancelled':
      add({ id: 'job', tone: 'info', title: `${op} cancelled: ${file}`, to: '/files' })
      break
  }

  // --- busy without a job (homing, a macro, a wizard step) ------------------
  const jobActive = i.job.state === 'printing' || i.job.state === 'paused'
  if (!jobActive && (i.busy || i.running)) {
    add({ id: 'busy', tone: 'info', title: 'Machine busy', detail: i.running ? `Running: ${i.running}` : 'Klipper is working through commands.', to: '/control' })
  }

  // --- heat -------------------------------------------------------------------
  const heater = (id: string, label: string, h: { temp: number | null; target: number | null }, hot: number) => {
    if (h.temp == null) return
    if (h.target && h.target > 0) {
      if (h.temp < h.target - 3) add({ id, tone: 'info', title: `Heating ${label} to ${deg(h.target)}`, detail: `Now ${deg(h.temp)}`, to: '/control' })
    } else if (h.temp >= hot) {
      add({ id, tone: 'info', title: `${label[0]!.toUpperCase()}${label.slice(1)} still hot: ${deg(h.temp)}`, detail: 'Heater off, cooling down.', to: '/control' })
    }
  }
  if (!tool || isPrintTool(tool.type)) heater('hotend', 'hotend', i.hotend, 50)
  else if ((i.hotend.target ?? 0) > 0)
    // The hotend heater output is still wired to the tool connector
    add({ id: 'hotend', tone: 'alert', title: `Hotend heater on with ${tool.name} mounted`, detail: 'Switch it off on Control.', to: '/control' })
  heater('bed', 'bed', i.bed, 45)

  // --- fans -------------------------------------------------------------------
  for (const f of i.stalledFans ?? []) {
    add({ id: `fan-${f.name}`, tone: 'alert', title: `${f.label} isn't turning`, detail: `It's set to ${Math.round(f.speed * 100)} % but its speed signal reads nothing. Check it before the next job.`, to: '/toolheads/wiring/hardware' })
  }

  // --- care -------------------------------------------------------------------
  if (i.care && tool) {
    if (i.care.overdue) add({ id: 'care', tone: 'alert', title: `${tool.name}: care overdue`, detail: i.care.text, to: '/care' })
    else if (i.care.dueSoon) add({ id: 'care', tone: 'info', title: `${tool.name}: care due soon`, detail: i.care.text, to: '/care' })
  }

  // --- nothing to report ------------------------------------------------------
  if (!out.length) add({ id: 'ready', tone: 'info', title: 'Ready', detail: tool ? `${tool.name} mounted, idle.` : 'Idle.', to: '/control' })

  // alerts first, otherwise in the order above
  return [...out.filter((n) => n.tone === 'alert'), ...out.filter((n) => n.tone === 'info')]
}
