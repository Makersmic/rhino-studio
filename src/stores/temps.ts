/**
 * Heater history for the temperature graphs.
 *
 * Seeded from Moonraker's temperature store when Klipper becomes ready, then
 * one reading per second from the live status. Only read by the graphs:
 * nothing here can change a heater.
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { HEATERS, push, seedFromStore, type HeaterId, type Sample } from '@/control/tempHistory'
import { useMachineStore } from './machine'

export const useTempsStore = defineStore('temps', () => {
  const machine = useMachineStore()
  const history = ref<Record<HeaterId, Sample[]>>({ extruder: [], heater_bed: [] })
  /** ticks every second, so graphs scroll even when readings hold still */
  const now = ref(Date.now())

  function seed(store: unknown) {
    history.value = seedFromStore(store, Date.now())
  }

  function sample() {
    now.value = Date.now()
    if (!machine.klippyReady) return
    const next = { ...history.value }
    for (const id of HEATERS) {
      const h = id === 'extruder' ? machine.hotend : machine.bed
      if (h.temp == null) continue
      next[id] = push(next[id], { t: now.value, temp: h.temp, target: h.target ?? 0 })
    }
    history.value = next
  }

  setInterval(sample, 1000)

  // Klipper restarted or the connection dropped: old history no longer lines up
  watch(
    () => machine.klippyReady,
    (ready) => {
      if (!ready) history.value = { extruder: [], heater_bed: [] }
    },
  )

  return { history, now, seed }
})
