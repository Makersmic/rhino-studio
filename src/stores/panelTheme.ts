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
import { cleanTheme, panelVars, type Mode, type PanelColors, type ThemeMap } from '@/theme/panelColors'

const KEY = 'panel_theme'
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
    return themes.value[id]?.[mode.value]
  }
  const styleFor = (id: string | undefined) => (id ? panelVars(colorsFor(id)) : {})
  const isCustom = (id: string) => !!themes.value[id]

  // ---- saving ----
  async function persist(next: ThemeMap) {
    themes.value = next
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

  // ---- loading from the machine ----
  async function load() {
    try {
      const v = await machine.getStudioSetting(KEY)
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
    startEdit, switchDraftMode, cancelEdit, saveEdit, reset, resetAll, styleFor, colorsFor, isCustom, load,
  }
})
