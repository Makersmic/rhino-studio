/**
 * The fonts the person uploaded, kept on the Rhino by the Portal (like background pictures) so every screen has them.
 * The Text page lists them; the typeface pickers offer them; the loader makes them available to the page.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useMaintenanceStore } from './maintenance'
import { ensureFonts, forgetFont } from '@/theme/uploadedFonts'
import { FONT_TYPES, MAX_FONT_BYTES, uploadedFamily, uploadedId } from '@/theme/typefaces'
import type { ThemeFonts } from '@/portal/client'

/** A plain-language reason this file can't be used, or null */
export function fontRefusal(file: { name: string; size: number }): string | null {
  const ext = /\.[^.]+$/.exec(file.name)?.[0].toLowerCase() ?? ''
  if (!FONT_TYPES.includes(ext)) return 'Pick a WOFF2, WOFF, TTF or OTF font file.'
  if (file.size > MAX_FONT_BYTES) return `That font is over ${MAX_FONT_BYTES / 1024 / 1024} MB. Pick a smaller file (a WOFF2 is usually the smallest).`
  return null
}

export const useFontsStore = defineStore('fonts', () => {
  const maintenance = useMaintenanceStore()
  const list = ref<ThemeFonts['fonts']>([])
  const max = ref(12)
  const busy = ref(false)
  const problem = ref<string | null>(null)

  const portal = () => maintenance.portal()
  const url = (path: string) => portal()?.media(path) ?? null
  const labelOf = (id: string) => list.value.find((f) => uploadedId(f.name) === id)?.label ?? null
  const full = computed(() => list.value.length >= max.value)

  async function refresh() {
    const p = portal()
    if (!p) {
      problem.value = 'Fonts are kept on the Rhino. Set the Rhino Portal’s address in Settings > Connection.'
      return
    }
    try {
      const r = await p.themeFonts()
      list.value = r.fonts
      max.value = r.max ?? 12
      ensureFonts(r.fonts.map((f) => f.name), url)
      problem.value = null
    } catch (e) {
      problem.value = (e as Error).message
    }
  }

  async function run<T>(job: () => Promise<T>): Promise<T | undefined> {
    busy.value = true
    problem.value = null
    try {
      return await job()
    } catch (e) {
      problem.value = (e as Error).message
    } finally {
      busy.value = false
    }
  }

  /** Checks the browser can read the file, then hands it to the Portal. Returns the new font's theme id. */
  function add(file: File): Promise<string | undefined> {
    return run(async () => {
      const p = portal()
      if (!p) throw new Error('Fonts are kept on the Rhino. Set the Rhino Portal’s address in Settings > Connection.')
      const why = fontRefusal(file)
      if (why) throw new Error(why)
      try {
        await new FontFace('rs-check', await file.arrayBuffer()).load()
      } catch {
        throw new Error(`This browser couldn't read ${file.name} as a font. It may be damaged, or a font collection (.ttc).`)
      }
      const r = await p.addThemeFont(file, file.name)
      list.value = r.fonts
      ensureFonts([r.name], url)
      return uploadedId(r.name)
    })
  }

  /** Deletes a font from the Rhino. Themes that used it fall back to Archivo. */
  async function remove(name: string) {
    const p = portal()
    if (!p) return
    await run(async () => {
      list.value = (await p.deleteThemeFont(name)).fonts
      forgetFont(name)
    })
  }

  return { list, max, busy, problem, full, labelOf, refresh, add, remove, url, uploadedFamily }
})
