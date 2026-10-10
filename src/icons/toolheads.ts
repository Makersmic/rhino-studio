/**
 * Toolhead emblems.
 *
 * Drawn on a 48x48 grid in the style of a technical drawing: thin even
 * strokes, plain geometry, and a dashed "construction" layer (tool axis,
 * motion arcs, planned paths). Strokes don't scale with size
 * (vector-effect), so the same drawing works from 18px chips to 160px tiles;
 * below 32px the construction layer is hidden to keep the glyph clean.
 *
 * Every tool has a different silhouette, so they read in greyscale.
 *
 * Classes used inside the markup:
 *   .k  heavy stroke (printed bead, cut, workpiece)
 *   .f  filled shape
 *   .c  construction layer (dashed, faint, hidden when small)
 *
 * These strings are also exported as standalone .svg files by
 * scripts/export-icons.ts (for the README, videos and the Portal).
 */

export type ToolIconId = 'blockone' | 'switchfly' | 'lightsaber' | 'hotjoe' | 'dragknife' | 'custom' | 'unknown'

export const TOOL_ICONS: Record<ToolIconId, { title: string; body: string }> = {
  blockone: {
    title: 'BlockOne print head',
    body: `
      <path class="c" d="M24 1.5v3M24 36.5v2"/>
      <path d="M24 4v6"/>
      <path d="M16.5 10.5h15M17.5 13.5h13M16.5 16.5h15"/>
      <rect x="13" y="20" width="22" height="11" rx="2.5"/>
      <circle cx="19" cy="25.5" r="1.7"/>
      <path d="M20 31h8l-2.6 5h-2.8z"/>
      <path class="k" d="M10 40.5h28M14 45h20"/>`,
  },
  switchfly: {
    title: 'SwitchFly dual filament head',
    body: `
      <path class="c" d="M16.5 12.5a9 9 0 0 1 15 0"/>
      <path class="c" d="M24 36v2.5"/>
      <path d="M13 2v7c0 4.5 5 6.5 8.6 8.2M35 2v7c0 4.5-5 6.5-8.6 8.2"/>
      <circle cx="24" cy="18.3" r="2.4"/>
      <rect x="15" y="21.5" width="18" height="9.5" rx="2.5"/>
      <path d="M21 31h6l-2 4.6h-2z"/>
      <path class="k" d="M10 40.5h28"/>
      <path class="k" d="M14 45h20" stroke-dasharray="5 3.5"/>`,
  },
  lightsaber: {
    title: 'LightSaber diode laser',
    body: `
      <ellipse class="c" cx="24" cy="40.5" rx="15" ry="4.6"/>
      <path d="M17 3v5M21 3v5M25 3v5M29 3v5M31 3v5"/>
      <rect x="13" y="8" width="22" height="15" rx="2.5"/>
      <rect x="20" y="23" width="8" height="4" rx="1"/>
      <path d="M21 27l3 13.5 3-13.5"/>
      <ellipse cx="24" cy="40.5" rx="8" ry="2.4"/>
      <circle class="f" cx="24" cy="40.5" r="1.5"/>`,
  },
  hotjoe: {
    title: 'HotJoe CNC spindle',
    body: `
      <path class="c" d="M16.5 22.5a7.5 2.6 0 0 0 15 0"/>
      <path class="c" d="M31.5 22.5l-2.2-1.4M31.5 22.5l-.4 2.4"/>
      <rect x="14" y="2.5" width="20" height="14" rx="3.5"/>
      <path d="M19 6.5v6M24 6.5v6M29 6.5v6"/>
      <path d="M17 16.5h14l-2.5 4h-9z"/>
      <path d="M24 20.5v4"/>
      <path d="M21.5 24.5v9l2.5 2.4 2.5-2.4v-9z"/>
      <path d="M21.5 26.5l5 3M21.5 30l5 3"/>
      <path class="k" d="M5 40l19-4.2L43 40l-19 4.2z"/>
      <path d="M5 40v3l19 4.2L43 43v-3"/>`,
  },
  dragknife: {
    title: 'DragKnife cutter',
    body: `
      <path class="c" d="M24 1.5v39"/>
      <circle class="c" cx="21.6" cy="36" r="2.4"/>
      <rect x="19" y="3" width="10" height="17" rx="2.5"/>
      <path d="M19 8h10M19 11h10"/>
      <circle cx="24" cy="23.5" r="3.2"/>
      <path class="f" d="M24 26.7l-2.4 9.3 6-3.6z"/>
      <path class="k" d="M4 43.5c7 0 10.5-4.5 15.4-6.7"/>
      <path class="c" d="M24 36c6-1.8 10.5 2.6 20 2.6"/>`,
  },
  custom: {
    title: 'User-added toolhead',
    body: `
      <path class="c" d="M8 32l16-9.2 16 9.2"/>
      <path d="M24 5.5l16 9.2-16 9.2-16-9.2z"/>
      <path d="M8 14.7v18.4L24 42.3l16-9.2V14.7M24 23.9v18.4"/>
      <path class="k" d="M41.5 2v9M37 6.5h9"/>`,
  },
  unknown: {
    title: 'Toolhead not verified',
    body: `
      <circle cx="24" cy="24" r="18" stroke-dasharray="3.5 4.5"/>
      <path d="M19 19.2a5.2 5.2 0 1 1 7.8 4.5c-1.7 1-2.8 2.1-2.8 4.1"/>
      <circle class="f" cx="24" cy="33.2" r="1.7"/>`,
  },
}
