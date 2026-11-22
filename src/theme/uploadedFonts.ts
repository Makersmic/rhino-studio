/**
 * Makes the uploaded fonts a theme uses available to the page. Each is loaded once, from the Rhino's Portal, with the browser's
 * FontFace API. A font that can't be fetched just leaves the text in Archivo (the fallback in its stack).
 */
import { uploadedFamily, uploadedFile } from './typefaces'
import type { PanelColors } from './panelColors'

const LEVELS = ['faceTitle', 'faceSub', 'faceBody'] as const

/** The Portal files a look uses, each once */
export function fontsUsed(c: PanelColors | undefined): string[] {
  const out = new Set<string>()
  for (const k of LEVELS) {
    const f = uploadedFile(c?.[k])
    if (f) out.add(f)
  }
  return [...out]
}

const loaded = new Map<string, Promise<void>>()

/** Loads any font in `files` that isn't loaded yet. `url` turns a Portal path into an address (null: no Portal yet). */
export function ensureFonts(files: string[], url: (path: string) => string | null): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return
  for (const file of files) {
    const href = url(`/theme-font/${file}`)
    if (!href || loaded.has(file)) continue
    const face = new FontFace(uploadedFamily(file), `url("${href}")`, { display: 'swap' })
    loaded.set(
      file,
      face.load().then(
        () => void document.fonts.add(face),
        () => void loaded.delete(file), // try again on the next look
      ),
    )
  }
}

/** Forget a font that was deleted, so uploading again can't find a stale copy */
export function forgetFont(file: string): void {
  loaded.delete(file)
}
