/** Theme preference: system, dark or light. Stored per browser. */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemePref = 'system' | 'dark' | 'light'
const KEY = 'rs.theme'

function load(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    /* storage blocked: fall back to system */
  }
  return 'system'
}

export const useThemeStore = defineStore('theme', () => {
  const pref = ref<ThemePref>(load())

  function apply(p: ThemePref) {
    const root = document.documentElement
    if (p === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', p)
  }

  apply(pref.value)
  watch(pref, (p) => {
    apply(p)
    try {
      localStorage.setItem(KEY, p)
    } catch {
      /* ignore */
    }
  })

  return { pref }
})
