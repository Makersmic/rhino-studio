import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILTIN_NAMES, HERO_PANELS, builtinPanels, isBuiltin } from './builtinThemes'
import { SHELL_ID, cleanName, cleanTheme, contrast, panelVars, shellVars, type PanelColors } from './panelColors'

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
const [nightRed, dayRed] = [...css.matchAll(/--rs-danger:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1]!.toLowerCase())
const RED = { night: nightRed!, day: dayRed! }
const MODES = ['night', 'day'] as const

function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  if (d === 0) return [0, 0, l]
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h < 0 ? h + 360 : h, d / (1 - Math.abs(2 * l - 1)), l]
}
/** Saturated red, at a lightness where it could be taken for Stop */
function looksLikeStop(hex: string): boolean {
  const [h, s, l] = hsl(hex)
  return s >= 0.45 && l > 0.3 && ((l < 0.62 && h >= 345) || (l < 0.68 && (h >= 350 || h < 15)))
}
function isOrange(hex: string): boolean {
  const [h, s, l] = hsl(hex)
  return s >= 0.45 && l < 0.75 && h >= 15 && h < 45
}

describe('built-in themes', () => {
  it('has all 23, with names the theme list accepts', () => {
    expect(BUILTIN_NAMES).toHaveLength(23)
    for (const n of BUILTIN_NAMES) expect(cleanName(n)).toBe(n)
    expect(isBuiltin('Cold Cache')).toBe(true)
    expect(isBuiltin('constructor')).toBe(false)
    expect(builtinPanels('No such theme')).toBeNull()
  })

  for (const name of BUILTIN_NAMES) {
    const panels = builtinPanels(name)!
    it(`${name}: everything reads, and nothing looks like Stop`, () => {
      expect(Object.keys(panels).length).toBeGreaterThan(60)
      for (const [id, theme] of Object.entries(panels)) {
        for (const mode of MODES) {
          const c = theme[mode] as Required<PanelColors>
          const where = `${id} ${mode}`
          expect(contrast(c.text, c.bg), `${where} text`).toBeGreaterThanOrEqual(6.9)
          expect(contrast(c.onButton, c.button), `${where} button text`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(c.onAccent, c.accent), `${where} selected text`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(c.heading, c.bg), `${where} title`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(c.readout, c.bg), `${where} numbers`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(RED[mode], c.bg), `${where} red on this panel`).toBeGreaterThanOrEqual(3)
          for (const k of ['button', 'accent', 'heading', 'readout', 'border'] as const) expect(looksLikeStop(c[k]), `${where} ${k} ${c[k]}`).toBe(false)
        }
      }
    })
    it(`${name}: no orange beside Pause and Cancel, and the page holds up`, () => {
      for (const id of HERO_PANELS) {
        for (const mode of MODES) {
          const c = panels[id]![mode]!
          expect(isOrange(c.button!), `${id} ${mode} button`).toBe(false)
          expect(isOrange(c.accent!), `${id} ${mode} selected`).toBe(false)
        }
      }
      for (const mode of MODES) {
        const s = panels[SHELL_ID]![mode]!
        expect(contrast(s.text!, s.page!), `${mode} page text`).toBeGreaterThanOrEqual(6)
        expect(contrast(RED[mode], s.page!), `${mode} Stop on the page`).toBeGreaterThanOrEqual(1.8)
      }
    })
    it(`${name}: survives being saved, and never recolours red`, () => {
      expect(cleanTheme(JSON.parse(JSON.stringify(panels)))).toEqual(panels)
      for (const [id, theme] of Object.entries(panels)) {
        for (const mode of MODES) {
          const vars = id === SHELL_ID ? shellVars(theme[mode]) : panelVars(theme[mode])
          expect(Object.keys(vars).filter((k) => /danger|live/.test(k))).toEqual([])
        }
      }
    })
  }
})
