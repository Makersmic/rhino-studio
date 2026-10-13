/**
 * Panel colours (the user's theme), kept on the machine so every screen shows
 * the same look and it's backed up with the config. A copy is cached in the
 * browser so panels paint in their colours before the machine answers.
 *
 * Each panel has an id ("control.motion"); its colours are stored per mode
 * (day, night). Editing works on a draft that previews live on the panel and
 * only reaches the machine when saved.
 */
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useMachineStore } from './machine'
import { useThemeStore } from './theme'
import {
  cleanLibrary, cleanName, cleanTheme, panelVars, readThemeFile, themeFile, uniqueName,
  type Mode, type PanelColors, type ThemeLibrary, type ThemeMap,
} from '@/theme/panelColors'

const KEY = 'panel_theme'
const NAME_KEY = 'panel_theme_name'
const LIBRARY_KEY = 'saved_themes'
const CACHE = 'rs.panelTheme'

function loadCache(): ThemeMap {
  try {
    return cleanTheme(JSON.parse(localStorage.getItem(CACHE) ?? '{}'))
  } catch {
    return {}
  }
}

export const usePanelThemeStore = defineStore('panelTheme', () => {
  const machine = useMachineStore()
  const theme = useThemeStore()

  const themes = ref<ThemeMap>(loadCache())
  const saving = ref(false)
  const error = ref<string | null>(null)

  /** Saved themes on the machine, by name */
  const library = ref<ThemeLibrary>({})
  /** Name of the theme in use; null = your own unsaved colours or the default */
  const activeName = ref<string | null>(null)
  /**
   * A theme being looked at before Apply (Appearance). Panels show it;
   * nothing is saved until apply(). null = no preview.
   */
  const preview = ref<{ name: string | null; panels: ThemeMap } | null>(null)
  const shown = computed<ThemeMap>(() => preview.value?.panels ?? themes.value)

  // ---- which mode is showing ----
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null
  const prefersLight = ref(mq?.matches ?? false)
  const onMq = (e: MediaQueryListEvent) => (prefersLight.value = e.matches)
  mq?.addEventListener?.('change', onMq)
  onScopeDispose(() => mq?.removeEventListener?.('change', onMq))
  /** Night is the default look; day when chosen, or when the system prefers light */
  const mode = computed<Mode>(() =>
    theme.pref === 'light' ? 'day' : theme.pref === 'dark' ? 'night' : prefersLight.value ? 'day' : 'night',
  )

  // ---- editing ----
  const editing = ref<{ id: string; title: string } | null>(null)
  const draftMode = ref<Mode>('night')
  const draft = ref<PanelColors>({})

  function startEdit(id: string, title: string) {
    editing.value = { id, title }
    draftMode.value = mode.value
    draft.value = { ...(themes.value[id]?.[draftMode.value] ?? {}) }
  }
  function switchDraftMode(m: Mode) {
    if (!editing.value) return
    draftMode.value = m
    draft.value = { ...(themes.value[editing.value.id]?.[m] ?? {}) }
  }
  function cancelEdit() {
    editing.value = null
    draft.value = {}
  }

  /** The colours a panel shows right now (the draft while it's being edited). */
  function colorsFor(id: string): PanelColors | undefined {
    if (editing.value?.id === id && draftMode.value === mode.value) return draft.value
    return shown.value[id]?.[mode.value]
  }
  const styleFor = (id: string | undefined) => (id ? panelVars(colorsFor(id)) : {})
  const isCustom = (id: string) => !!themes.value[id]

  // ---- saving ----
  async function persist(next: ThemeMap, name: string | null = null) {
    themes.value = next
    activeName.value = name
    try {
      localStorage.setItem(CACHE, JSON.stringify(next))
    } catch {
      /* storage blocked: the machine copy still counts */
    }
    if (!machine.online) {
      error.value = 'Saved on this screen only: not connected to the machine.'
      return
    }
    saving.value = true
    try {
      await machine.setStudioSetting(KEY, next)
      await machine.setStudioSetting(NAME_KEY, name)
      error.value = null
    } catch (e) {
      error.value = `Saved on this screen only: ${(e as Error).message}`
    } finally {
      saving.value = false
    }
  }

  async function saveEdit() {
    if (!editing.value) return
    const { id } = editing.value
    const next: ThemeMap = { ...themes.value }
    const entry = { ...(next[id] ?? {}) }
    const clean = cleanTheme({ x: { [draftMode.value]: draft.value } }).x?.[draftMode.value]
    if (clean) entry[draftMode.value] = clean
    else delete entry[draftMode.value]
    if (Object.keys(entry).length) next[id] = entry
    else delete next[id]
    cancelEdit()
    await persist(next)
  }

  /** Back to the default look: one mode, or both when no mode is given. */
  async function reset(id: string, m?: Mode) {
    const next: ThemeMap = { ...themes.value }
    if (m && next[id]) {
      const entry = { ...next[id] }
      delete entry[m]
      if (Object.keys(entry).length) next[id] = entry
      else delete next[id]
    } else delete next[id]
    if (editing.value?.id === id) cancelEdit()
    await persist(next)
  }
  const resetAll = () => persist({})
  const customCount = computed(() => Object.keys(themes.value).length)

  // ---- named themes: preview, apply, save, delete, files ----
  /** Look at a saved theme (or the default, name null) without applying it. */
  function previewTheme(name: string | null) {
    if (name === null) preview.value = { name: null, panels: {} }
    else if (library.value[name]) preview.value = { name, panels: library.value[name]!.panels }
  }
  const cancelPreview = () => (preview.value = null)
  /** Make the previewed theme the one every screen uses. */
  async function applyPreview() {
    if (!preview.value) return
    const { name, panels } = preview.value
    preview.value = null
    await persist(panels, name)
  }

  async function saveLibrary(next: ThemeLibrary) {
    library.value = next
    if (!machine.online) throw new Error('Not connected to the machine, so the theme was not saved.')
    await machine.setStudioSetting(LIBRARY_KEY, next)
  }
  /** Save the colours in use as a named theme (replaces one of the same name). */
  async function saveAs(rawName: string) {
    const name = cleanName(rawName)
    if (!name) throw new Error('Give the theme a name (up to 40 letters; not "Default").')
    await saveLibrary({ ...library.value, [name]: { panels: themes.value, savedAt: Date.now() } })
    activeName.value = name
    if (machine.online) await machine.setStudioSetting(NAME_KEY, name)
    return name
  }
  async function deleteSaved(name: string) {
    const next = { ...library.value }
    delete next[name]
    if (preview.value?.name === name) preview.value = null
    await saveLibrary(next)
    if (activeName.value === name) {
      activeName.value = null
      if (machine.online) await machine.setStudioSetting(NAME_KEY, null)
    }
  }
  /** The colours in use as a theme file, to keep or share. */
  function exportFile(): { filename: string; text: string } {
    const name = activeName.value ?? 'My theme'
    return { filename: `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'theme'}.rhino-theme.json`, text: themeFile(name, themes.value) }
  }
  /** Adds a theme file to the saved themes and previews it (Apply makes it current). */
  async function importFile(text: string, fallbackName: string) {
    const { name, panels } = readThemeFile(text)
    const unique = uniqueName(name ?? cleanName(fallbackName.replace(/\.rhino-theme\.json$|\.json$/i, '')) ?? 'Imported theme', library.value)
    await saveLibrary({ ...library.value, [unique]: { panels, savedAt: Date.now() } })
    previewTheme(unique)
    return unique
  }
  const savedNames = computed(() => Object.keys(library.value).sort((a, b) => a.localeCompare(b)))

  // ---- loading from the machine ----
  async function load() {
    try {
      const [v, n, lib] = await Promise.all([
        machine.getStudioSetting(KEY),
        machine.getStudioSetting(NAME_KEY),
        machine.getStudioSetting(LIBRARY_KEY),
      ])
      library.value = cleanLibrary(lib)
      activeName.value = typeof n === 'string' && library.value[n] ? n : null
      if (v != null) {
        themes.value = cleanTheme(v)
        try {
          localStorage.setItem(CACHE, JSON.stringify(themes.value))
        } catch {
          /* ignore */
        }
      }
      error.value = null
    } catch {
      /* keep the cached copy */
    }
  }
  watch(
    () => machine.online,
    (on) => {
      if (on) void load()
    },
    { immediate: true },
  )

  return {
    themes, mode, editing, draft, draftMode, saving, error, customCount,
    library, savedNames, activeName, preview,
    startEdit, switchDraftMode, cancelEdit, saveEdit, reset, resetAll, styleFor, colorsFor, isCustom, load,
    previewTheme, cancelPreview, applyPreview, saveAs, deleteSaved, exportFile, importFile,
  }
})
