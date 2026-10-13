/**
 * Can this file be started now, and how?
 *
 * Print heads start the file directly: its START_JOB line checks the tool
 * again on the machine, homes and runs the start sequence.
 * Every other tool starts through its Rhino setup wizard with FILE=, because
 * the wizard does the safety checks, sets the work zero, test-fires and (for
 * the laser, from config 1.4.1) powers the tool's rail before the file runs.
 * Starting those files directly would skip all of that.
 */
import type { ToolState } from '@/moonraker/toolState'
import { safeFileParam } from './commands'

export type StartMethod = { kind: 'print' } | { kind: 'wizard'; macro: string }

export interface StartCheck {
  ok: boolean
  /** Why it can't start (shown instead of the Start button) */
  block: string | null
  /** Things to know, shown in the confirmation */
  warnings: string[]
  method: StartMethod | null
  /** Slot to swap to, when the file needs a different tool */
  swapTo: number | null
}

export const WIZARD_BY_TYPE: Record<string, string> = {
  LASER: 'LASER_JOB_SETUP',
  CNC: 'CNC_JOB_SETUP',
  DRAG_KNIFE: 'DRAGKNIFE_JOB_SETUP',
}

export function startMethodFor(type: string | null, macros: ReadonlySet<string>): StartMethod | { error: string } {
  if (type === 'DEPOSITION') return { kind: 'print' }
  const macro = (type && WIZARD_BY_TYPE[type]) ?? 'TOOL_JOB_SETUP'
  if (!macros.has(macro)) return { error: `This config has no ${macro} macro to start the job with. Update the Rhino config, or start it from Mainsail.` }
  return { kind: 'wizard', macro }
}

export function checkStart(opts: {
  path: string
  /** Toolhead the file asks for: undefined = still reading, null = not declared */
  fileTool: string | null | undefined
  toolState: ToolState
  jobState: string | null
  klippyReady: boolean
  toolTypes: ReadonlyMap<string, string>
  toolSlots: ReadonlyMap<string, number>
  macros: ReadonlySet<string>
}): StartCheck {
  const no = (block: string, swapTo: number | null = null): StartCheck => ({ ok: false, block, warnings: [], method: null, swapTo })
  if (!opts.klippyReady) return no('Klipper is not ready')
  if (opts.jobState === 'printing' || opts.jobState === 'paused') return no('A job is already running')
  if (opts.fileTool === undefined) return no('Still reading the file')

  const t = opts.toolState
  if (t.kind === 'swapping') return no('Finish the tool swap first')
  if (t.kind !== 'mounted') return no(t.kind === 'mismatch' ? 'The tool sensor disagrees with the selected tool' : 'Confirm the mounted toolhead first')

  const warnings: string[] = []
  if (opts.fileTool && opts.fileTool !== t.name) {
    return no(`Needs ${opts.fileTool}; ${t.name} is mounted`, opts.toolSlots.get(opts.fileTool) ?? null)
  }
  if (!opts.fileTool) {
    warnings.push(`The file doesn't say which toolhead it's for, so neither Studio nor START_JOB can check it. Only start it if it was made for ${t.name}.`)
  }

  const m = startMethodFor(t.type ?? opts.toolTypes.get(t.name) ?? null, opts.macros)
  if ('error' in m) return no(m.error)
  if (m.kind === 'wizard' && !safeFileParam(opts.path))
    return no('Rename the file without spaces or special characters; the setup wizard takes it as FILE=')
  return { ok: true, block: null, warnings, method: m, swapTo: null }
}
