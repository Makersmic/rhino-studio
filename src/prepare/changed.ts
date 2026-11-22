/**
 * Which settings differ from the profile in use (Mike, Nov 21): the Settings panel provides the set, and each field asks
 * whether its own key is in it, to draw the red border. Without a provider (tests, other screens) nothing is marked.
 */
import { inject, type ComputedRef, type InjectionKey } from 'vue'

export const CHANGED_KEYS: InjectionKey<{ readonly value: ReadonlySet<string> }> = Symbol('changedKeys')

/** Whether the support drop-down differs from the profile */
export const SUPPORT_CHANGED: InjectionKey<ComputedRef<boolean>> = Symbol('supportChanged')

/** A function: is this setting (or any of these) changed from the profile? */
export function useChanged(): (...keys: (string | undefined)[]) => boolean {
  const set = inject(CHANGED_KEYS, null)
  return (...keys) => !!set && keys.some((k) => !!k && set.value.has(k))
}

/** The keys the support drop-down changes, in either slicer's shape */
export const SUPPORT_KEYS = ['supports', 'support_material', 'support_material_auto'] as const
