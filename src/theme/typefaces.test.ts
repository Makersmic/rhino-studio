import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanTheme, shellVars } from './panelColors'
import { TYPEFACES, typefaceOf } from './typefaces'

const css = readFileSync(new URL('../styles/fonts.css', import.meta.url), 'utf8')
const base = readFileSync(new URL('../styles/base.css', import.meta.url), 'utf8')

describe('typefaces', () => {
  it('every choice is a font that ships inside Studio', () => {
    for (const f of TYPEFACES) {
      const family = /^'([^']+)'/.exec(f.stack)![1]!
      if (family === 'JetBrains Mono') continue // loaded in main.ts for the console
      expect(css, f.id).toContain(`font-family: '${family}'`)
    }
    expect(css).not.toMatch(/https?:/)
    expect(new Set(TYPEFACES.map((f) => f.id)).size).toBe(TYPEFACES.length)
  })

  it('keeps poster type off regular text, and ignores what it does not know', () => {
    expect(typefaceOf('anton', 'title')?.id).toBe('anton')
    expect(typefaceOf('anton', 'body')).toBeNull()
    expect(typefaceOf('inter', 'body')?.id).toBe('inter')
    expect(typefaceOf('url(evil)', 'title')).toBeNull()
    expect(cleanTheme({ s: { day: { faceTitle: 'anton', faceBody: 'anton', faceSub: 'evil' } } }).s?.day).toEqual({ faceTitle: 'anton' })
  })

  it('sets each level on its own, and no size', () => {
    const v = shellVars({ faceTitle: 'anton', faceSub: 'bitter', faceBody: 'inter' })
    expect(v['--rs-font-title']).toContain('Anton')
    expect(v['--rs-font-sub']).toContain('Bitter')
    expect(v['--rs-font-ui']).toContain('Inter')
    expect(Object.keys(v).filter((k) => /size|text-(xs|sm|md|lg|xl)|weight/.test(k))).toEqual([])
    expect(shellVars({})).toEqual({})
  })

  it('leaves readout numbers, code and Stop out of it', () => {
    expect(base).toMatch(/\.rs-num \{\s*font-family: var\(--rs-font-display\)/)
    expect(Object.keys(shellVars({ faceBody: 'inter' }))).not.toContain('--rs-font-fixed')
    expect(Object.keys(shellVars({ faceBody: 'inter' }))).not.toContain('--rs-font-code')
    const estop = readFileSync(new URL('../components/EStopButton.vue', import.meta.url), 'utf8')
    expect(estop).toContain('font-family: var(--rs-font-fixed)')
  })
})
