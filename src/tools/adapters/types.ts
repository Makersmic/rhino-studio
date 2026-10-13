/**
 * Tool-change adapters: how Studio reads and changes the mounted tool on
 * different kinds of Klipper machine.
 *
 * Every adapter answers the same questions, so the rest of the app (status
 * box, swap list, safety gates, jobs) never needs to know which kind of
 * machine it's talking to:
 *
 *   detect   is this my kind of machine? (from Klipper's object list)
 *   watch    which Klipper objects hold the tool state
 *   state    what's mounted right now
 *   tools    which tools exist (for the swap list)
 *   swap     the command that changes to tool N (always confirmed first)
 *   picker   the machine's own tool picker, when it has one
 *   confirm  how the user confirms the tool after a restart / before use
 *
 * Safety rules every adapter keeps:
 *   - Studio only READS the tool state; it never sets it.
 *   - Anything uncertain (changing, uninitialised, error, sensor mismatch)
 *     is not 'mounted', so motion and tool power stay locked.
 *   - Swaps and confirmations go through the normal confirmation gate; the
 *     commands that change tools on ANY family are classified in
 *     control/commands.ts, whichever adapter is active.
 */
import type { ToolState } from '@/moonraker/toolState'

export type AdapterId = 'rhino' | 'klipper-toolchanger'

/** Klipper status, as Moonraker sends it: object name -> fields. */
export type StatusMap = Record<string, Record<string, unknown> | undefined>

export interface AdapterTool {
  /** The number used to select it (Rhino slot, toolchanger tool number) */
  slot: number
  name: string
  /** Rhino tool type (DEPOSITION, LASER, CNC, DRAG_KNIFE, POWERED, PASSIVE) or null if unknown */
  type: string | null
}

export interface ToolAdapter {
  id: AdapterId
  /** Short name for Settings, e.g. "Rhino tool macros" */
  label: string
  /** One line about what it reads */
  about: string
  /**
   * Who changes tools.
   *   manual     a person swaps the head (the Rhino): a job needs the right
   *              tool confirmed before it starts, and every swap is confirmed
   *   automatic  the machine changes tools itself, from the job file (a
   *              toolchanger): a job may start with no tool and use several;
   *              swaps started from Studio can skip the confirmation (Settings)
   */
  style: 'manual' | 'automatic'
  /** What the selector is called on this machine ("Slot" or "Tool") */
  slotWord: string
  detect(objects: ReadonlySet<string>): boolean
  /** Fields to subscribe to, for every object this adapter reads that Klipper has */
  watch(objects: readonly string[]): Record<string, string[] | null>
  state(status: StatusMap | null, opts: { online: boolean; klippyReady: boolean }): ToolState
  tools(status: StatusMap | null): AdapterTool[]
  /** True when this machine can swap from Studio (e.g. the swap macro exists) */
  canSwap(objects: ReadonlySet<string>): boolean
  swapScript(slot: number): string
  /** What will happen, for the confirmation */
  swapNote(name: string): string
  /** The machine's own picker (a wizard), when it has one */
  pickerScript: string | null
  /** Confirm or initialise the tool after a restart; shown in the top bar when state is 'none-confirmed' */
  confirm: { script: string; label: string; button: string; /** Klipper object that must exist for it */ requires: string } | null
}

export function toInt(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null
}
