/**
 * One timed padlock (audit 2026-11, S5): the same rules for motion, tuning, hardware and the lead screws.
 * Unlocked for UNLOCK_MS; a use (`touch`) keeps it unlocked; it relocks when its block appears, when any of
 * `relockOn` changes (the mounted tool), when the page is hidden (phone in a pocket), and when told to.
 * `now` is the store's shared one-second clock, so a hundred panels don't each start a timer.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

export const UNLOCK_MS = 60_000

export interface TimedLock {
  unlocked: ComputedRef<boolean>
  secondsLeft: ComputedRef<number>
  /** false when the block stands */
  unlock(): boolean
  lock(): void
  /** a use while unlocked: start the minute again */
  touch(): void
}

export function timedLock(block: ComputedRef<string | null> | Ref<string | null>, now: Ref<number>, relockOn: Array<() => unknown> = []): TimedLock {
  const until = ref(0)
  const unlocked = computed(() => until.value > now.value)
  const secondsLeft = computed(() => Math.max(0, Math.ceil((until.value - now.value) / 1000)))
  const lock = () => {
    until.value = 0
  }
  const unlock = () => {
    if (block.value) return false
    now.value = Date.now()
    until.value = now.value + UNLOCK_MS
    return true
  }
  const touch = () => {
    if (unlocked.value) until.value = now.value + UNLOCK_MS // the shared clock, at most a second stale
  }
  watch(block, (b) => b && lock())
  for (const src of relockOn) watch(src, lock)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.hidden && lock())
  return { unlocked, secondsLeft, lock, unlock, touch }
}
