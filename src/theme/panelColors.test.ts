import { describe, expect, it } from 'vitest'
import { brand } from '@/brand/brand'
import { cleanTheme, contrast, panelVars, reservedHue, shellVars, toHex, SWATCHES } from './panelColors'

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

  it('gives a theme its own buttons, selected colour, control edges, titles and numbers', () => {
    const v = panelVars({ bg: '#123f42', text: '#eef0b8', border: '#b7bd47', accent: '#f7d6e0', onAccent: '#2c0a14', button: '#b7bd47', onButton: '#2c0a14', control: '#397367', heading: '#b7bd47', readout: '#f7d6e0' })
    expect(v['--rs-ink']).toBe('#f7d6e0')
    expect(v['--rs-on-ink']).toBe('#2c0a14')
    expect(v['--rs-btn-fill']).toBe('#b7bd47')
    expect(v['--rs-btn-text']).toBe('#2c0a14')
    expect(v['--rs-line-strong']).toBe('#397367')
    expect(v['border-color']).toBe('#b7bd47')
    expect(v['--rs-heading']).toBe('#b7bd47')
    expect(v['--rs-readout']).toBe('#f7d6e0')
  })

  it('keeps the new colours in a theme, and a theme without them looks as it did', () => {
    expect(cleanTheme({ 'app.shell': { night: { page: '#010203', button: '#112233', onButton: 'nope' } } })).toEqual({ 'app.shell': { night: { page: '#010203', button: '#112233' } } })
    const old = panelVars({ bg: '#121314', text: '#ecebe6', border: '#9b9a96' })
    expect(old['--rs-btn-fill']).toBeUndefined()
    expect(old['--rs-ink']).toBe('#ecebe6')
    expect(old['--rs-line-strong']).toBe('#9b9a96')
  })

  it('themes the page but never Stop', () => {
    const v = shellVars({ bg: '#123f42', text: '#eef0b8', page: '#0b2c2e', button: '#b7bd47', accent: '#f7d6e0' })
    expect(v['--rs-bg']).toBe('#0b2c2e')
    expect(v['--rs-menu-bg']).toBe('#123f42')
    expect(v['background-color']).toBeUndefined()
    expect(Object.keys(v).filter((k) => /danger|live/.test(k))).toEqual([])
    expect(shellVars(undefined)).toEqual({})
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

import { cleanLibrary, cleanName, readThemeFile, themeFile, uniqueName } from './panelColors'

describe('saved themes and theme files', () => {
  const panels = { 'control.console': { day: { bg: '#1b2430', text: '#ffffff' } } }

  it('round-trips a theme file', () => {
    const back = readThemeFile(themeFile('Shop night', panels))
    expect(back).toEqual({ name: 'Shop night', panels })
  })

  it('refuses files that are not themes, in plain words', () => {
    expect(() => readThemeFile('not json')).toThrow(/isn't a theme file/)
    expect(() => readThemeFile('{"panels":{}}')).toThrow(new RegExp(`isn't a ${brand.name} theme`))
  })

  it('drops bad colours from a loaded file', () => {
    const t = readThemeFile(JSON.stringify({ format: 'rhino-studio-theme', name: 'X', panels: { a: { day: { bg: 'url(evil)', text: '#000000' } } } }))
    expect(t.panels).toEqual({ a: { day: { text: '#000000' } } })
  })

  it('keeps theme names short and sensible', () => {
    expect(cleanName('  Shop   night ')).toBe('Shop night')
    expect(cleanName('Default')).toBeNull()
    expect(cleanName('')).toBeNull()
    expect(cleanName('<script>')).toBeNull()
    expect(cleanName('x'.repeat(60))).toHaveLength(40)
  })

  it('never overwrites a saved theme on load', () => {
    const lib = cleanLibrary({ Shop: { panels, savedAt: 1 }, 'Shop 2': { panels, savedAt: 2 } })
    expect(uniqueName('Shop', lib)).toBe('Shop 3')
    expect(uniqueName('Garage', lib)).toBe('Garage')
  })
})
