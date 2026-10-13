/**
 * Picks the tool-change adapter for the connected machine.
 * Automatic: the first adapter whose objects Klipper has, Rhino first (its
 * SWAP_TOOL macro is unmistakable). A manual choice in Settings wins.
 */
import { klipperToolchangerAdapter } from './klipperToolchanger'
import { rhinoAdapter } from './rhino'
import type { AdapterId, ToolAdapter } from './types'

export type { AdapterId, AdapterTool, StatusMap, ToolAdapter } from './types'

export const ADAPTERS: readonly ToolAdapter[] = [rhinoAdapter, klipperToolchangerAdapter]
export type AdapterChoice = 'auto' | AdapterId

export function adapterById(id: string): ToolAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id)
}

/** The adapter to use, and whether it was detected (true) or chosen by hand. */
export function pickAdapter(objects: ReadonlySet<string>, choice: AdapterChoice): { adapter: ToolAdapter; detected: boolean; matched: boolean } {
  if (choice !== 'auto') {
    const a = adapterById(choice)
    if (a) return { adapter: a, detected: false, matched: a.detect(objects) }
  }
  const found = ADAPTERS.find((a) => a.detect(objects))
  // Nothing recognised: Rhino is the default (it reports "no SWAP_TOOL macro", which keeps everything locked)
  return { adapter: found ?? rhinoAdapter, detected: true, matched: !!found }
}

/** Everything any adapter wants watched, for the objects Klipper has. */
export function watchedForAll(objects: readonly string[]): Record<string, string[] | null> {
  return Object.assign({}, ...ADAPTERS.map((a) => a.watch(objects)))
}
