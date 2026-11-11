import { describe, expect, it } from 'vitest'
import { bitText, bitsProblem, newBit } from './bits'

describe('bits', () => {
  it('accepts a sound list, and an empty one', () => {
    expect(bitsProblem([])).toBeNull()
    expect(bitsProblem([newBit(1), { ...newBit(2), type: 'ballmill', diameter: 6, flutes: 3 }])).toBeNull()
  })
  it('refuses what the Portal refuses', () => {
    expect(bitsProblem([{ ...newBit(1), name: 'flat 3' }])).toMatch(/no spaces/)
    expect(bitsProblem([newBit(1), newBit(1)])).toMatch(/Two bits/)
    expect(bitsProblem([{ ...newBit(1), diameter: 40 }])).toMatch(/diameter/)
    expect(bitsProblem([{ ...newBit(1), flutes: 2.5 }])).toMatch(/whole number/)
    expect(bitsProblem([{ ...newBit(1), length: 0 }])).toMatch(/cutting length/)
  })
  it('says what a bit is', () => {
    expect(bitText(newBit(1))).toBe('3.175 mm end mill, 2 flutes, 12 mm cutting')
  })
})
