/**
 * Connection settings, stored per browser.
 *
 * moonrakerUrl '' means "the same site as this app": that's right when the
 * app is served from the Pi, and in development (the dev server forwards to
 * the Pi). Set an address like http://192.168.1.50 only when the app is
 * hosted somewhere else; that also needs the app's address in cors_domains
 * in moonraker.conf.
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const KEY = 'rs.connection'

interface Saved {
  moonrakerUrl: string
  autoConnect: boolean
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null
    if (v) return { moonrakerUrl: typeof v.moonrakerUrl === 'string' ? v.moonrakerUrl : '', autoConnect: v.autoConnect !== false }
  } catch {
    /* storage blocked or bad JSON */
  }
  return { moonrakerUrl: '', autoConnect: true }
}

/** Accepts "192.168.1.50", "mainsailos.local", "http://host:7125". Returns '' for blank. */
export function normalizeAddress(input: string): string {
  const t = input.trim().replace(/\/+$/, '')
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `http://${t}`
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = load()
  const moonrakerUrl = ref(saved.moonrakerUrl)
  const autoConnect = ref(saved.autoConnect)

  watch([moonrakerUrl, autoConnect], () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ moonrakerUrl: moonrakerUrl.value, autoConnect: autoConnect.value }))
    } catch {
      /* ignore */
    }
  })

  return { moonrakerUrl, autoConnect }
})
