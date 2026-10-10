/**
 * Writes every icon to design/icons/ as a standalone .svg file, for the
 * README, YouTube graphics, the Portal, or anywhere outside the app.
 *
 *   npm run icons
 *
 * Each toolhead gets two files: <id>.svg (black lines, any background) and
 * <id>-tile.svg (lines on its accent colour, rounded square). The source of
 * truth stays in src/icons/*.ts; don't edit the exported files by hand.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { TOOL_ICONS } from '../src/icons/toolheads.ts'
import { NAV_ICONS } from '../src/icons/nav.ts'

const out = new URL('../design/icons/', import.meta.url)
mkdirSync(out, { recursive: true })

// Pull accent hex values from tokens.css so the tiles match the app exactly
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const accent = (name: string) => tokens.match(new RegExp(`--th-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '#cccccc'
const ink = accent('ink')

const style = (sw: number) => `<style>
  *{vector-effect:non-scaling-stroke;stroke-width:${sw}px}
  .k{stroke-width:${sw * 2}px}
  .f{fill:currentColor;stroke:none}
  .c{stroke-dasharray:2 3;opacity:.55}
</style>`

function svg(viewBox: string, body: string, title: string, sw: number, color = '#141413') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${viewBox.split(' ')[2]}" height="${viewBox.split(' ')[3]}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">
<title>${title}</title>
${style(sw)}
${body.trim()}
</svg>
`
}

for (const [id, def] of Object.entries(TOOL_ICONS)) {
  writeFileSync(new URL(`${id}.svg`, out), svg('0 0 48 48', def.body, def.title, 1.5))
  // Tile version: accent rounded square, emblem centred at 75% size
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="color:${ink}">
<title>${def.title}</title>
${style(2.5)}
<rect width="64" height="64" rx="16" fill="${accent(id)}" stroke="none"/>
<g transform="translate(8 8)">${def.body.trim()}</g>
</svg>
`
  writeFileSync(new URL(`${id}-tile.svg`, out), tile)
}

for (const [id, def] of Object.entries(NAV_ICONS)) {
  writeFileSync(new URL(`nav-${id}.svg`, out), svg('0 0 24 24', def.body, def.title, 1.6))
}

console.log(`Exported ${Object.keys(TOOL_ICONS).length * 2 + Object.keys(NAV_ICONS).length} icons to design/icons/`)
