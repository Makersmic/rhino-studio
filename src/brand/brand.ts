/**
 * Branding lives here and only here.
 *
 * "Rhino Studio" is a working title. To rename the app or swap the logo,
 * edit this file: the window title, favicon, top bar and style guide all
 * read from it. (index.html has a plain <title> as a pre-load fallback.)
 */

export const brand = {
  /** Full product name, shown in the top bar and window title. */
  name: 'Rhino Studio',
  /** Short name for tight spaces (mobile top bar). */
  shortName: 'Studio',
  /** The machine this app drives. */
  machine: 'Rhino Multi Motion System',
  /** Shown in the footer of the style guide and about panel. */
  maker: 'Makersmic',
  repoUrl: 'https://github.com/Makersmic',
  version: '0.3.0',
} as const

/**
 * The logo as SVG markup, drawn on a 32x32 grid with currentColor so it
 * follows the theme. Replace this string to change the mark everywhere,
 * including the favicon.
 *
 * Current mark: a rhino horn rising over a horizon, with a low sun,
 * inside a dial ring.
 */
export const logoSvg = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
  <circle cx="16" cy="16" r="14.5" stroke="currentColor" stroke-width="2"/>
  <circle cx="9.6" cy="10.4" r="2.6" fill="currentColor"/>
  <path d="M8.5 22.6 C 15.2 22 20 17.4 22.4 5.8 C 25.4 12.6 25.1 18.6 21.8 22.6 Z" fill="currentColor"/>
  <path d="M5 25.6 H 27" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`.trim()

/** Favicon version of the logo: fixed colours, since a tab has no theme. */
export function faviconDataUrl(): string {
  const svg = logoSvg
    .replace('aria-hidden="true"', 'style="color:#e8dfcb;background:#0f0f0e;border-radius:50%"')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
