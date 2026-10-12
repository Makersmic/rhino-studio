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

export interface PanelColors {
  /** Panel background */
  bg?: string
  /** Main text (muted text and the live/selected ink follow it) */
  text?: string
  /** Panel outline and the dotted dividers */
  border?: string
}

export type Mode = 'day' | 'night'
export type PanelTheme = Partial<Record<Mode, PanelColors>>
export type ThemeMap = Record<string, PanelTheme>

const HEX = /^#([0-9a-f]{6})$/i

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
      for (const k of ['bg', 'text', 'border'] as const) {
        const v = (c as Record<string, unknown>)[k]
        if (isHex(v)) pc[k] = v.toLowerCase()
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
  return v
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
export const DEFAULTS: Record<Mode, Required<PanelColors>> = {
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
