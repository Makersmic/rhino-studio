import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { sameIfEqual } from './stable'

describe('keeping a computed object when nothing changed', () => {
  it('returns the old object for equal values, and the new one otherwise', () => {
    const a = { x: 1, keepOut: [{ x0: 1 }] }
    expect(sameIfEqual(a, { x: 1, keepOut: [{ x0: 1 }] })).toBe(a)
    const b = { x: 2, keepOut: [{ x0: 1 }] }
    expect(sameIfEqual(a, b)).toBe(b)
    expect(sameIfEqual(undefined, b)).toBe(b)
  })

  it('a status update with nothing relevant doesn\'t re-run what reads it, as checking a whole file would', () => {
    const status = ref({ temp: 20, limit: 550 })
    const info = computed<{ limit: number }>((previous) => sameIfEqual(previous, { limit: status.value.limit }))
    let checks = 0
    const checked = computed(() => {
      checks++
      return info.value.limit
    })
    expect(checked.value).toBe(550)
    for (let t = 21; t < 40; t++) {
      status.value = { temp: t, limit: 550 }
      expect(checked.value).toBe(550)
    }
    expect(checks).toBe(1)
    status.value = { temp: 40, limit: 300 }
    expect(checked.value).toBe(300)
    expect(checks).toBe(2)
  })
})
