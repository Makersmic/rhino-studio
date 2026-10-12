import { describe, expect, it } from 'vitest'
import { cleanTheme, contrast, panelVars, reservedHue, toHex, SWATCHES } from './panelColors'

describe('panel colours', () => {
  it('keeps only valid colours and drops empty entries', () => {
    const t = cleanTheme({
      'control.motion': { day: { bg: '#FFFFFF', text: 'red', border: '#123' }, night: {} },
      'control.console': { night: { text: '#ecebe6' } },
      junk: 'nope',
      empty: { day: { bg: 42 } },
    })
    expect(t).toEqual({ 'control.motion': { day: { bg: '#ffffff' } }, 'control.console': { night: { text: '#ecebe6' } } })
  })

  it('turns picked colours into the tokens the panel uses', () => {
    const v = panelVars({ bg: '#1b2430', text: '#ffffff', border: '#8a8f94' })
    expect(v['--rs-surface']).toBe('#1b2430')
    expect(v['--rs-text-strong']).toBe('#ffffff')
    expect(v['--rs-ink']).toBe('#ffffff') // live / selected ink follows the text
    expect(v['--rs-on-ink']).toBe('var(--rs-surface)')
    expect(v['--rs-line-strong']).toBe('#8a8f94')
  })

  it('never touches the reserved colours', () => {
    const v = panelVars({ bg: '#000000', text: '#ffffff', border: '#ffffff' })
    for (const k of Object.keys(v)) expect(k).not.toMatch(/danger|swap|graph/)
  })

  it('sets nothing when nothing is picked', () => {
    expect(panelVars(undefined)).toEqual({})
    expect(panelVars({})).toEqual({})
  })

  it('measures contrast like WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5)
    expect(contrast('#111214', '#edebe5')).toBeGreaterThan(4.5)
  })

  it('flags strong reds and oranges, not greys or dark browns', () => {
    expect(reservedHue('#d22a1e')).toBe('red')
    expect(reservedHue('#f0892a')).toBe('orange')
    expect(reservedHue('#8a8f94')).toBeNull()
    expect(reservedHue('#2f5d8a')).toBeNull()
    expect(reservedHue('#120806')).toBeNull()
  })

  it('offers no reserved colours as swatches', () => {
    expect(SWATCHES.filter((c) => reservedHue(c))).toEqual([])
  })

  it('reads colours the way browsers report them', () => {
    expect(toHex('rgb(18, 19, 20)')).toBe('#121314')
    expect(toHex('#AbC')).toBe('#aabbcc')
    expect(toHex('transparent')).toBeNull()
  })
})
