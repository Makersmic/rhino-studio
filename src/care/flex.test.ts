import { describe, expect, it } from 'vitest'
import { DEBOUNCE_S, FlexWatch, SPIKE_C, type FlexSample } from './flex'

const s = (t: number, temp: number | null, toolOk = true): FlexSample => ({ t, temp, toolOk })

describe('the flex watch', () => {
  it('sees nothing in a steady cable', () => {
    const w = new FlexWatch()
    for (let i = 0; i < 240; i++) w.push(s(i * 0.25, 23.1 + (i % 3) * 0.1))
    expect(w.count).toBe(0)
    expect(w.summary()).toBe('No drop-outs.')
  })
  it('counts a lost reading as a drop-out', () => {
    const w = new FlexWatch()
    w.push(s(0, 23))
    expect(w.push(s(0.25, null))!.kind).toBe('dropout')
    expect(w.push(s(0.5, Number.NaN))).toBeNull() // the same bad moment, inside the debounce
    expect(w.count).toBe(1)
  })
  it('counts a jump that is not a real temperature change', () => {
    const w = new FlexWatch()
    w.push(s(0, 23))
    const e = w.push(s(0.25, 23 + SPIKE_C + 1))
    expect(e).toMatchObject({ kind: 'spike' })
    expect(e!.detail).toBe('23° to 32° in a moment')
  })
  it('a slow real change is not a spike', () => {
    const w = new FlexWatch()
    for (let i = 0; i < 40; i++) w.push(s(i * 0.25, 23 + i * 0.5))
    expect(w.count).toBe(0)
  })
  it('counts the tool sensor losing the tool', () => {
    const w = new FlexWatch()
    w.push(s(0, 23, true))
    expect(w.push(s(0.25, 23, false))!.kind).toBe('toolsensor')
  })
  it('separate bad moments are separate events, and the summary says when the first was', () => {
    const w = new FlexWatch()
    w.push(s(0, 23))
    w.push(s(5, null))
    w.push(s(5.25, 23))
    w.push(s(5.5 + DEBOUNCE_S, null))
    expect(w.count).toBe(2)
    expect(w.summary()).toBe('2 drop-outs (first at 5 s: no thermistor reading).')
  })
})
