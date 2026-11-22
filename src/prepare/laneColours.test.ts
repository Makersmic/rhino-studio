import { describe, expect, it } from 'vitest'
import { cleanColours, hexOf } from './laneColours'

describe('lane colours', () => {
  it('keeps valid #rrggbb colours (lower case) and drops the rest, always eight entries', () => {
    const r = cleanColours(['#3B6FB6', 'blue', '#12345', null, 7, '#ABCDEF'])
    expect(r).toHaveLength(8)
    expect(r.slice(0, 6)).toEqual(['#3b6fb6', null, null, null, null, '#abcdef'])
    expect(r.slice(6)).toEqual([null, null])
  })
  it('has no colours for nothing or rubbish', () => {
    expect(cleanColours(undefined)).toEqual(Array(8).fill(null))
    expect(cleanColours('x')).toEqual(Array(8).fill(null))
    expect(cleanColours({})).toEqual(Array(8).fill(null))
  })
  it('writes sRGB numbers as hex', () => {
    expect(hexOf({ r: 1, g: 0, b: 0.5 })).toBe('#ff0080')
    expect(hexOf({ r: -1, g: 2, b: 0 })).toBe('#00ff00')
  })
})
