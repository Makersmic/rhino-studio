/**
 * Panel colours: a user's own background, text and border colour for one
 * panel, separately for day (light) and night (dark).
 *
 * A panel's look comes from the shared --rs-* tokens, so recolouring a panel
 * is just overriding those tokens on the panel's own element. Everything
 * inside follows: muted text, button fills, dividers, the "live" inverted
 * ink, all derived from the three picked colours with CSS color-mix, so it
 * stays consistent whatever is chosen.
 *
 * Never overridden (they carry a meaning, not a look):
 *   red          stop, cancel, alerts       (--rs-danger*)
 *   orange       choosing a tool to swap to (--rs-swap-menu)
 *   graph lines  temperature and target     (--rs-graph-temp/target)
 */

import { brand } from '@/brand/brand'

export interface PanelColors {
  /** Panel background */
  bg?: string
  /** Main text (muted text and the live/selected ink follow it) */
  text?: string
  /** Panel outline and the dotted dividers */
  border?: string
  /** Filled primary buttons and whatever is selected, and the text on them */
  accent?: string
  onAccent?: string
  /** Everyday buttons: filled in this colour, with this text, instead of outlined */
  button?: string
  onButton?: string
  /** Edges of inputs, step buttons and other controls, separate from the panel's outline */
  control?: string
  /** Panel titles */
  heading?: string
  /** Big readout numbers */
  readout?: string
  /** The page behind the panels (only used on SHELL_ID) */
  page?: string
  /** A picture behind the page: a file the Portal holds (only used on SHELL_ID) */
  image?: string
  /** How much of the page colour lies over the picture, percent */
  imageDim?: number
  /** How much of the picture shows through the panels, percent */
  panelSee?: number
  /** How the picture sits on the page */
  imageFit?: ImageFit
  /** One text colour across the screen, over whatever the theme says (only used on SHELL_ID) */
  font?: string
}

export const IMAGE_FITS = ['cover', 'contain', 'stretch', 'actual', 'tile'] as const
export type ImageFit = (typeof IMAGE_FITS)[number]

/** The colour slots, in the order the picker shows them */
export const COLOR_KEYS = ['bg', 'text', 'border', 'accent', 'onAccent', 'button', 'onButton', 'control', 'heading', 'readout', 'page', 'font'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]
/** A theme's colours for the page, top bar, rail, and any panel it doesn't name */
export const SHELL_ID = 'app.shell'

export type Mode = 'day' | 'night'
export type PanelTheme = Partial<Record<Mode, PanelColors>>
export type ThemeMap = Record<string, PanelTheme>

const HEX = /^#([0-9a-f]{6})$/i

/** The names the Portal gives pictures. Nothing else reaches a CSS url(). */
const IMAGE_NAME = /^[0-9a-f]{16}\.(png|jpe?g|gif|webp)$/
/** The page title and rail need the wash under them: a picture can't go brighter than this */
export const DIM_MIN = 50
export const DIM_MAX = 90
export const DIM_DEFAULT = 60
/** Past this, whatever is in the picture starts to fight the text on a panel */
export const SEE_MAX = 30
const clampDim = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(DIM_MAX, Math.max(DIM_MIN, v))) : DIM_DEFAULT)
const clampSee = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(SEE_MAX, Math.max(0, v))) : 0)

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v)
}

/** Keeps only valid #rrggbb values; drops empty modes and panels. */
export function cleanTheme(input: unknown): ThemeMap {
  const out: ThemeMap = {}
  if (!input || typeof input !== 'object') return out
  for (const [id, theme] of Object.entries(input as Record<string, unknown>)) {
    if (!theme || typeof theme !== 'object') continue
    const t: PanelTheme = {}
    for (const mode of ['day', 'night'] as const) {
      const c = (theme as Record<string, unknown>)[mode]
      if (!c || typeof c !== 'object') continue
      const pc: PanelColors = {}
      for (const k of COLOR_KEYS) {
        const v = (c as Record<string, unknown>)[k]
        if (isHex(v)) pc[k] = v.toLowerCase()
      }
      const { image, imageDim, panelSee, imageFit } = c as Record<string, unknown>
      if (typeof image === 'string' && IMAGE_NAME.test(image)) {
        pc.image = image
        pc.imageDim = clampDim(imageDim)
        pc.panelSee = clampSee(panelSee)
        if ((IMAGE_FITS as readonly unknown[]).includes(imageFit) && imageFit !== 'cover') pc.imageFit = imageFit as ImageFit
      }
      if (Object.keys(pc).length) t[mode] = pc
    }
    if (Object.keys(t).length) out[id] = t
  }
  return out
}

/** CSS custom properties to put on the panel's element. */
export function panelVars(c: PanelColors | undefined): Record<string, string> {
  const v: Record<string, string> = {}
  if (!c) return v
  if (c.bg) {
    v['--rs-surface'] = c.bg
    v['--rs-surface-2'] = 'color-mix(in srgb, var(--rs-surface) 91%, var(--rs-text-strong))'
    v['--rs-edit-fill'] = 'color-mix(in srgb, var(--rs-surface) 90%, var(--rs-text-strong))'
    v['--rs-key-fill'] = 'color-mix(in srgb, var(--rs-surface) 84%, var(--rs-text-strong))'
    v['background-color'] = c.bg
  }
  if (c.text) {
    v['--rs-text-strong'] = c.text
    v['--rs-text'] = 'color-mix(in srgb, var(--rs-text-strong) 88%, var(--rs-surface))'
    v['--rs-text-muted'] = 'color-mix(in srgb, var(--rs-text-strong) 58%, var(--rs-surface))'
    v['--rs-ink'] = c.text
    v['--rs-focus-ring'] = c.text
    v['--rs-dot'] = 'color-mix(in srgb, var(--rs-text-strong) 58%, transparent)'
    v['color'] = 'var(--rs-text)'
  }
  // inverted "live / selected" ink reads text-on-background reversed
  if (c.bg || c.text) v['--rs-on-ink'] = 'var(--rs-surface)'
  if (c.border) {
    v['--rs-line'] = `color-mix(in srgb, ${c.border} 45%, transparent)`
    v['--rs-line-strong'] = c.border
    v['--rs-dot-faint'] = `color-mix(in srgb, ${c.border} 70%, transparent)`
    v['border-color'] = c.border
  }
  if (c.control) {
    v['--rs-line-strong'] = c.control
    v['--rs-line'] = `color-mix(in srgb, ${c.control} 45%, transparent)`
  }
  if (c.accent) {
    v['--rs-ink'] = c.accent
    v['--rs-ink-hover'] = `color-mix(in srgb, ${c.accent} 84%, ${c.onAccent ?? 'var(--rs-surface)'})`
    v['--rs-btn-quiet'] = c.text ?? 'var(--rs-text)'
  }
  if (c.onAccent) v['--rs-on-ink'] = c.onAccent
  if (c.button) {
    v['--rs-btn-fill'] = c.button
    v['--rs-btn-edge'] = c.button
    v['--rs-btn-hover'] = `color-mix(in srgb, ${c.button} 84%, ${c.onButton ?? 'var(--rs-surface)'})`
    v['--rs-key-fill'] = `color-mix(in srgb, ${c.button} 22%, var(--rs-surface))`
  }
  if (c.onButton) v['--rs-btn-text'] = c.onButton
  if (c.heading) v['--rs-heading'] = c.heading
  if (c.readout) v['--rs-readout'] = c.readout
  return v
}

/**
 * The same, for the whole page: the top bar, rail, page titles, and anything a theme doesn't name.
 * Menus follow it too. --rs-danger and the live red are never touched, so Stop looks the same in every theme.
 */
export function shellVars(c: PanelColors | undefined): Record<string, string> {
  if (!c) return {}
  const v = panelVars(c)
  delete v['background-color']
  delete v.color
  delete v['border-color']
  if (c.page) {
    v['--rs-bg'] = c.page
    // quieter labels on the page itself (the rail) are measured against the page, not the panels
    if (c.text) v['--rs-text-muted'] = `color-mix(in srgb, ${c.text} 74%, ${c.page})`
  }
  if (c.bg) v['--rs-menu-bg'] = c.bg
  if (c.text) v['--rs-menu-text'] = c.text
  return v
}

/** The picture behind the page, washed with the page colour. Empty without a picture or a way to reach it. */
export function pageImageStyle(c: PanelColors | undefined, url: (path: string) => string | null): Record<string, string> {
  const u = c?.image && IMAGE_NAME.test(c.image) ? url(`/theme-media/${c.image}`) : null
  if (!u) return {}
  const wash = `color-mix(in srgb, var(--rs-bg) ${clampDim(c?.imageDim)}%, transparent)`
  // the wash always covers the page; only the picture's own layer follows the choice
  const look: Record<ImageFit, [string, string]> = {
    cover: ['cover', 'no-repeat'],
    contain: ['contain', 'no-repeat'],
    stretch: ['100% 100%', 'no-repeat'],
    actual: ['auto', 'no-repeat'],
    tile: ['auto', 'repeat'],
  }
  const [size, repeat] = look[c?.imageFit ?? 'cover'] ?? look.cover
  return {
    backgroundImage: `linear-gradient(${wash}, ${wash}), url("${u}")`,
    backgroundSize: `100% 100%, ${size}`,
    backgroundRepeat: `no-repeat, ${repeat}`,
    backgroundPosition: 'center, center',
    backgroundColor: 'var(--rs-bg)',
  }
}

/** A panel's colours with the screen's own text colour on top. Text on filled buttons keeps its contrast pair. */
export function withFont(c: PanelColors | undefined, font: string | undefined): PanelColors | undefined {
  return font ? { ...c, text: font, heading: font, readout: font } : c
}

/** How a text colour reads on the hardest background showing in this look: every themed panel, and the default paper */
export function worstContrast(font: string, theme: ThemeMap, mode: Mode): number {
  const bgs = new Set<string>()
  for (const t of Object.values(theme)) {
    const bg = t[mode]?.bg
    if (bg) bgs.add(bg)
  }
  if (!bgs.size) bgs.add(DEFAULTS[mode].bg)
  return Math.min(...[...bgs].map((b) => contrast(font, b)))
}

/** A panel's background once some of the picture shows through it */
export function seeThrough(vars: Record<string, string>, see: number | undefined): Record<string, string> {
  const s = clampSee(see)
  const bg = vars['background-color']
  return s && bg ? { ...vars, 'background-color': `color-mix(in srgb, ${bg} ${100 - s}%, transparent)` } : vars
}

// ---- contrast and reserved colours -------------------------------------------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG relative luminance */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

/** Converts rgb()/rgba()/#rgb/#rrggbb (as browsers report them) to #rrggbb, or null. */
export function toHex(css: string): string | null {
  const s = css.trim().toLowerCase()
  if (HEX.test(s)) return s
  const short = /^#([0-9a-f]{3})$/.exec(s)
  if (short) return '#' + [...short[1]!].map((c) => c + c).join('')
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s)
  if (!m) return null
  return '#' + [m[1], m[2], m[3]].map((c) => Math.round(Number(c)).toString(16).padStart(2, '0')).join('')
}

/** Hue (0-360) and saturation (0-1) */
function hueSat(hex: string): [number, number] {
  const [r, g, b] = rgb(hex).map((c) => c / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return [0, 0]
  const l = (max + min) / 2
  const sat = d / (1 - Math.abs(2 * l - 1))
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h < 0 ? h + 360 : h, sat]
}

/**
 * Strong reds and oranges are reserved (stop, cancel, swap). A panel painted
 * in them makes those signals harder to spot, so the picker warns.
 */
export function reservedHue(hex: string): 'red' | 'orange' | null {
  const [h, s] = hueSat(hex)
  const [r, g, b] = rgb(hex)
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 510
  // greys, near-blacks and pale creams don't read as "stop" or "swap"
  if (s < 0.45 || luminance(hex) < 0.03 || lightness > 0.85) return null
  if (h >= 345 || h < 15) return 'red'
  if (h >= 15 && h < 45) return 'orange'
  return null
}

/** Swatches offered in the picker: paper, slate and ink tones, no reds or oranges. */
export const SWATCHES: string[] = [
  '#ffffff', '#edebe5', '#f3ead6', '#e1e8df', '#dde5ee', '#ebe1ee',
  '#c9ccc9', '#8a8f94', '#4a5058',
  '#2b2f35', '#1b2430', '#1f2a22', '#2a2130', '#121314', '#000000',
  '#2f5d8a', '#2e6b4f', '#6a4f8a',
]

/** The app's own panel colours in each mode (tokens.css), for previews and contrast checks. */
export const DEFAULTS: Record<Mode, Required<Pick<PanelColors, 'bg' | 'text' | 'border'>>> = {
  night: { bg: '#121314', text: '#ecebe6', border: '#9b9a96' },
  day: { bg: '#edebe5', text: '#111214', border: '#3a3b3d' },
}

/** Base tokens for a preview drawn outside any panel, in a given mode. */
export function baseVars(mode: Mode): Record<string, string> {
  const d = DEFAULTS[mode]
  return {
    '--rs-surface': d.bg,
    '--rs-surface-2': 'color-mix(in srgb, var(--rs-surface) 91%, var(--rs-text-strong))',
    '--rs-text-strong': d.text,
    '--rs-text': 'color-mix(in srgb, var(--rs-text-strong) 88%, var(--rs-surface))',
    '--rs-text-muted': 'color-mix(in srgb, var(--rs-text-strong) 58%, var(--rs-surface))',
    '--rs-ink': d.text,
    '--rs-on-ink': d.bg,
    '--rs-line': `color-mix(in srgb, ${d.border} 30%, transparent)`,
    '--rs-line-strong': d.border,
    '--rs-dot-faint': `color-mix(in srgb, ${d.border} 45%, transparent)`,
  }
}

// ---- named themes and theme files --------------------------------------------

/** A saved theme: every panel's colours, day and night. */
export interface SavedTheme {
  panels: ThemeMap
  savedAt: number
}
export type ThemeLibrary = Record<string, SavedTheme>

export const THEME_FILE_FORMAT = 'rhino-studio-theme'

/** Theme names: short, printable, no leading/trailing spaces. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = name.replace(/\s+/g, ' ').trim().slice(0, 40)
  return n && !/[<>]/.test(n) && n.toLowerCase() !== 'default' ? n : null
}

export function cleanLibrary(input: unknown): ThemeLibrary {
  const out: ThemeLibrary = {}
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const name = cleanName(k)
    if (!name || !v || typeof v !== 'object') continue
    const savedAt = Number((v as { savedAt?: unknown }).savedAt)
    out[name] = { panels: cleanTheme((v as { panels?: unknown }).panels), savedAt: Number.isFinite(savedAt) ? savedAt : 0 }
  }
  return out
}

/** The JSON written to a theme file. */
export function themeFile(name: string, panels: ThemeMap): string {
  return JSON.stringify({ format: THEME_FILE_FORMAT, version: 1, name, panels }, null, 2)
}

/** Reads a theme file; throws a plain-language error if it isn't one. */
export function readThemeFile(text: string): { name: string | null; panels: ThemeMap } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't a theme file (it isn't JSON).")
  }
  const d = data as { format?: unknown; name?: unknown; panels?: unknown }
  if (!d || d.format !== THEME_FILE_FORMAT) throw new Error(`That file isn't a ${brand.name} theme.`)
  return { name: cleanName(d.name), panels: cleanTheme(d.panels) }
}

/** A name not already in the library: "Shop", "Shop 2", "Shop 3"... */
export function uniqueName(base: string, library: ThemeLibrary): string {
  if (!library[base]) return base
  for (let i = 2; ; i++) if (!library[`${base} ${i}`]) return `${base} ${i}`
}
