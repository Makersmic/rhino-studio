import { describe, expect, it } from 'vitest'
import { cleanTheme, panelVars, pageImageStyle, seeThrough, shellVars, withFont, worstContrast } from './panelColors'
import { fitted, refusal } from './pageImage'

const NAME = '0123456789abcdef.jpg'
const url = (p: string) => `/portal${p}`

describe('background pictures', () => {
  it('shrinks a big picture and leaves a small one', () => {
    expect(fitted(4000, 3000)).toEqual({ w: 1920, h: 1440 })
    expect(fitted(1000, 4000)).toEqual({ w: 480, h: 1920 })
    expect(fitted(800, 600)).toEqual({ w: 800, h: 600 })
  })

  it('refuses what is not a picture', () => {
    expect(refusal({ type: 'image/svg+xml', size: 10 })).toMatch(/JPG/)
    expect(refusal({ type: 'text/html', size: 10 })).toMatch(/JPG/)
    expect(refusal({ type: 'image/jpeg', size: 41 * 1024 * 1024 })).toMatch(/40 MB/)
    expect(refusal({ type: 'image/png', size: 1000 })).toBeNull()
  })

  it('keeps a picture name only if the Portal could have made it, and keeps the settings in range', () => {
    const t = cleanTheme({ 'app.shell': { night: { image: NAME, imageDim: 5, panelSee: 99 }, day: { image: 'x"); background: url("//evil', imageDim: 50 } } })
    expect(t['app.shell']?.night).toEqual({ image: NAME, imageDim: 50, panelSee: 30 })
    expect(t['app.shell']?.day).toBeUndefined()
  })

  it('never builds a url from a name that got in some other way', () => {
    expect(pageImageStyle({ image: 'x"); background: url("//evil' }, url)).toEqual({})
    expect(pageImageStyle(undefined, url)).toEqual({})
  })

  it('washes the picture with the page colour', () => {
    const s = pageImageStyle({ image: NAME, imageDim: 70 }, url)
    expect(s.backgroundImage).toContain('var(--rs-bg) 70%')
    expect(s.backgroundImage).toContain(`url("/portal/theme-media/${NAME}")`)
  })

  it('sets how the picture sits, keeping the wash over the whole page', () => {
    const at = (imageFit: 'cover' | 'contain' | 'stretch' | 'actual' | 'tile' | undefined) => pageImageStyle({ image: NAME, imageFit }, url)
    expect(at(undefined).backgroundSize).toBe('100% 100%, cover')
    expect(at('contain').backgroundSize).toBe('100% 100%, contain')
    expect(at('stretch').backgroundSize).toBe('100% 100%, 100% 100%')
    expect(at('actual').backgroundSize).toBe('100% 100%, auto')
    expect(at('actual').backgroundRepeat).toBe('no-repeat, no-repeat')
    expect(at('tile').backgroundRepeat).toBe('no-repeat, repeat')
  })

  it('keeps only the fits it knows, and leaves the default out of the theme', () => {
    const fit = (imageFit: unknown) => cleanTheme({ s: { night: { image: NAME, imageFit } } }).s?.night?.imageFit
    expect(fit('tile')).toBe('tile')
    expect(fit('cover')).toBeUndefined()
    expect(fit('url(evil)')).toBeUndefined()
  })

  it('one text colour goes over text, titles and numbers, and leaves button text and Stop alone', () => {
    const c = withFont({ bg: '#123456', text: '#eeeeee', heading: '#ff0000', readout: '#00ff00', button: '#ffcc00', onButton: '#101010' }, '#abcdef')
    expect(c).toMatchObject({ text: '#abcdef', heading: '#abcdef', readout: '#abcdef', onButton: '#101010', button: '#ffcc00' })
    expect(withFont({ bg: '#123456' }, undefined)).toEqual({ bg: '#123456' })
    const v = shellVars(withFont({ font: '#abcdef' }, '#abcdef'))
    expect(v['--rs-text-strong']).toBe('#abcdef')
    expect(Object.keys(v).filter((k) => /danger|live|btn-text/.test(k))).toEqual([])
    expect(panelVars(withFont(undefined, '#abcdef'))['--rs-heading']).toBe('#abcdef')
    expect(cleanTheme({ s: { day: { font: '#ABCDEF' } } }).s?.day?.font).toBe('#abcdef')
    expect(cleanTheme({ s: { day: { font: 'red' } } }).s).toBeUndefined()
  })

  it('judges a text colour on the hardest background showing', () => {
    const theme = { a: { night: { bg: '#000000' } }, b: { night: { bg: '#777777' } }, c: { day: { bg: '#ffffff' } } }
    expect(worstContrast('#ffffff', theme, 'night')).toBeCloseTo(4.48, 1)
    expect(worstContrast('#ffffff', {}, 'night')).toBeGreaterThan(15)
  })

  it('shows nothing when the Portal can not be reached', () => {
    expect(pageImageStyle({ image: NAME }, () => null)).toEqual({})
  })

  it('lets some of the picture through a panel only when asked, and only so far', () => {
    const v = { 'background-color': '#123456', '--rs-surface': '#123456' }
    expect(seeThrough(v, 0)).toBe(v)
    expect(seeThrough(v, undefined)).toBe(v)
    expect(seeThrough(v, 20)['background-color']).toBe('color-mix(in srgb, #123456 80%, transparent)')
    expect(seeThrough(v, 80)['background-color']).toBe('color-mix(in srgb, #123456 70%, transparent)')
    expect(seeThrough(v, 20)['--rs-surface']).toBe('#123456')
    expect(seeThrough({}, 20)).toEqual({})
  })
})
