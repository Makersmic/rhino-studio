import { describe, expect, it } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { timedLock, UNLOCK_MS } from './padlock'

describe('timed padlock (one rule for motion, tuning, hardware and the lead screws)', () => {
  it('unlocks for a minute, a use starts the minute again, and it locks itself', async () => {
    const now = ref(1_000_000)
    const block = ref<string | null>(null)
    const l = timedLock(block, now)
    expect(l.unlocked.value).toBe(false)
    expect(l.unlock()).toBe(true)
    expect(l.unlocked.value).toBe(true)
    expect(l.secondsLeft.value).toBeGreaterThan(55)
    now.value += UNLOCK_MS + 1
    expect(l.unlocked.value).toBe(false)
    l.unlock()
    now.value += UNLOCK_MS - 5000
    l.touch() // a jog, a tuning tap, a hardware switch
    now.value += 10_000
    expect(l.unlocked.value).toBe(true)
    l.lock()
    expect(l.unlocked.value).toBe(false)
    await nextTick()
  })

  it('refuses to unlock while blocked, and relocks the moment a block appears or the tool changes', async () => {
    const now = ref(5_000_000)
    const block = ref<string | null>('Klipper is not ready')
    const tool = ref<string | null>('BlockOne')
    const l = timedLock(block, now, [() => tool.value])
    expect(l.unlock()).toBe(false)
    expect(l.unlocked.value).toBe(false)
    block.value = null
    expect(l.unlock()).toBe(true)
    block.value = 'A job is running'
    await nextTick()
    expect(l.unlocked.value).toBe(false)
    block.value = null
    l.unlock()
    tool.value = 'HotJoe'
    await nextTick()
    expect(l.unlocked.value).toBe(false)
  })

  it('a touch while locked does nothing', () => {
    const now = ref(1)
    const l = timedLock(computed(() => null), now)
    l.touch()
    expect(l.unlocked.value).toBe(false)
  })
})
