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
  /** Rhino Portal (maintenance engine). '' = /portal on this app's address. */
  portalUrl: string
  /** How tool changes are read: 'auto' or an adapter id (src/tools/adapters) */
  toolAdapter: string
  /** On machines that change tools themselves: confirm swaps started from Studio's Swap list */
  confirmSwaps: boolean
  /** Job setup's 3D view: how see-through the build plate is when you look from below, 0 (solid) to 100 % (Mike, Nov 7) */
  plateSeeThrough: number
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null
    if (v)
      return {
        moonrakerUrl: typeof v.moonrakerUrl === 'string' ? v.moonrakerUrl : '',
        autoConnect: v.autoConnect !== false,
        portalUrl: typeof v.portalUrl === 'string' ? v.portalUrl : '',
        toolAdapter: typeof v.toolAdapter === 'string' ? v.toolAdapter : 'auto',
        confirmSwaps: v.confirmSwaps !== false,
        plateSeeThrough: typeof v.plateSeeThrough === 'number' && v.plateSeeThrough >= 0 && v.plateSeeThrough <= 100 ? v.plateSeeThrough : 75,
      }
  } catch {
    /* storage blocked or bad JSON */
  }
  return { moonrakerUrl: '', autoConnect: true, portalUrl: '', toolAdapter: 'auto', confirmSwaps: true, plateSeeThrough: 75 }
}

/** Where to reach the Portal: the setting, or /portal on this app's address. */
export function portalBase(portalUrl: string): string {
  return normalizeAddress(portalUrl) || '/portal'
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
  const portalUrl = ref(saved.portalUrl)
  const toolAdapter = ref(saved.toolAdapter)
  const confirmSwaps = ref(saved.confirmSwaps)
  const plateSeeThrough = ref(saved.plateSeeThrough)

  watch([moonrakerUrl, autoConnect, portalUrl, toolAdapter, confirmSwaps, plateSeeThrough], () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ moonrakerUrl: moonrakerUrl.value, autoConnect: autoConnect.value, portalUrl: portalUrl.value, toolAdapter: toolAdapter.value, confirmSwaps: confirmSwaps.value, plateSeeThrough: plateSeeThrough.value }))
    } catch {
      /* ignore */
    }
  })

  return { moonrakerUrl, autoConnect, portalUrl, toolAdapter, confirmSwaps, plateSeeThrough }
})
