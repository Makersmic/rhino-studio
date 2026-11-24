import { describe, expect, it } from 'vitest'
import { COMING, GROUPS, WIZARDS } from './wizards'

describe('wizards list', () => {
  it('ids and paths are unique and live under /wizards', () => {
    expect(new Set(WIZARDS.map((w) => w.id)).size).toBe(WIZARDS.length)
    for (const w of WIZARDS) expect(w.path).toBe(`/wizards/${w.id}`)
  })
  it('every wizard is in a known group, with a sentence and a when', () => {
    const g = new Set(GROUPS.map((x) => x.id))
    for (const w of WIZARDS) {
      expect(g.has(w.group)).toBe(true)
      expect(w.what.length).toBeGreaterThan(10)
      expect(w.when.length).toBeGreaterThan(5)
    }
    expect(Array.isArray(COMING)).toBe(true)
  })
})
