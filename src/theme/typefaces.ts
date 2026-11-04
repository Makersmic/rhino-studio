/**
 * The typefaces a theme can choose, for category titles, subcategories and regular text. Only the family changes: sizes and
 * line heights stay Studio's, so screens keep their spacing. Readout numbers, positions and the console keep their
 * instrument fonts, and Stop keeps its own (--rs-font-fixed). The files are in styles/fonts.css.
 *
 * Fonts marked titleOnly are poster faces: fine for a short title, hard work in a paragraph or on a small button.
 */
export interface Typeface {
  id: string
  label: string
  /** CSS font-family; Archivo catches any letter the font's Latin file doesn't hold */
  stack: string
  titleOnly?: boolean
}

const sans = (family: string) => `'${family}', 'Archivo Variable', system-ui, sans-serif`
const serif = (family: string) => `'${family}', 'Archivo Variable', Georgia, serif`

export const TYPEFACES: Typeface[] = [
  { id: 'atkinson', label: 'Atkinson Hyperlegible: made to be easy to read', stack: sans('Atkinson Hyperlegible') },
  { id: 'bitter', label: 'Bitter: sturdy slab serif', stack: serif('Bitter Variable') },
  { id: 'comfortaa', label: 'Comfortaa: soft and round', stack: sans('Comfortaa Variable') },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans: engineered and neutral', stack: sans('IBM Plex Sans Variable') },
  { id: 'inter', label: 'Inter: clean screen sans', stack: sans('Inter Variable') },
  { id: 'jetbrains', label: 'JetBrains Mono: terminal', stack: `'JetBrains Mono', 'Archivo Variable', ui-monospace, monospace` },
  { id: 'lexend', label: 'Lexend: open and wide', stack: sans('Lexend Variable') },
  { id: 'source-serif', label: 'Source Serif 4: bookish serif', stack: serif('Source Serif 4 Variable') },
  { id: 'space-grotesk', label: 'Space Grotesk: quirky retro-tech', stack: sans('Space Grotesk Variable') },
  { id: 'abril', label: 'Abril Fatface: heavy poster serif', stack: serif('Abril Fatface'), titleOnly: true },
  { id: 'anton', label: 'Anton: tall poster type', stack: sans('Anton'), titleOnly: true },
  { id: 'bebas', label: 'Bebas Neue: all capitals', stack: sans('Bebas Neue'), titleOnly: true },
  { id: 'fraunces', label: 'Fraunces: old-style 70s serif', stack: serif('Fraunces Variable'), titleOnly: true },
  { id: 'orbitron', label: 'Orbitron: sci-fi', stack: sans('Orbitron Variable'), titleOnly: true },
  { id: 'oswald', label: 'Oswald: narrow and strong', stack: sans('Oswald Variable'), titleOnly: true },
  { id: 'righteous', label: 'Righteous: groovy deco', stack: sans('Righteous'), titleOnly: true },
]

/** The typeface for this id at this level, or null: unknown ids, and poster faces as regular text, are ignored */
export function typefaceOf(id: unknown, level: 'title' | 'body'): Typeface | null {
  const t = TYPEFACES.find((f) => f.id === id)
  return t && (level === 'title' || !t.titleOnly) ? t : null
}
