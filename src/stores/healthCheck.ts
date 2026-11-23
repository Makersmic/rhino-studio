/**
 * Settings › Health check. Asks the Portal to run the Rhino's health check and waits for it (it takes a few seconds and
 * runs on the host as its own program). The last result is kept by the Portal, so the page opens with it.
 */
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { useMaintenanceStore } from './maintenance'
import type { HealthState } from '@/system/healthCheck'

const POLL_MS = 1500
const GIVE_UP_MS = 120_000

export const useHealthCheckStore = defineStore('healthCheck', () => {
  const state = shallowRef<HealthState | null>(null)
  const error = ref<string | null>(null)
  const busy = ref(false)
  let alive = true

  async function load() {
    const p = useMaintenanceStore().portal()
    if (!p) return void (error.value = 'The Rhino Portal isn’t connected, so the health check can’t run from here.')
    try {
      state.value = await p.healthState()
      error.value = null
    } catch (e) {
      const t = (e as Error).message
      error.value = /404/.test(t) ? 'This needs Tool Manager 1.9.45 or later on the Rhino.' : t
    }
  }

  async function run() {
    const p = useMaintenanceStore().portal()
    if (!p) return void (error.value = 'The Rhino Portal isn’t connected, so the health check can’t run from here.')
    busy.value = true
    alive = true
    error.value = null
    try {
      state.value = await p.runHealth()
      const t0 = Date.now()
      while (alive && state.value?.running && Date.now() - t0 < GIVE_UP_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        state.value = await p.healthState()
      }
      if (state.value?.running) error.value = 'The check is taking longer than expected. Open this page again in a minute.'
      else if (state.value?.error) error.value = state.value.error
    } catch (e) {
      const t = (e as Error).message
      error.value = /404/.test(t) ? 'This needs Tool Manager 1.9.45 or later on the Rhino.' : t
    } finally {
      busy.value = false
    }
  }

  /** Leaving the page stops waiting; the check itself carries on and its result is there next time. */
  function leave() {
    alive = false
  }

  return { state, error, busy, load, run, leave }
})
