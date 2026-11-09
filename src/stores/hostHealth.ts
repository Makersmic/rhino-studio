/**
 * Settings › Host health. Core load comes from Moonraker's once-a-second proc stats and is kept for ten minutes
 * from the moment Studio connects (a few numbers a second, nothing stored on disk), so the page opens with history.
 * The Portal's host stats and Klipper's board stats are read every 2 s only while the page is open.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { useMachineStore } from './machine'
import { useMaintenanceStore } from './maintenance'
import { useNetworkStore } from './network'
import { findings, mcuStats, procSample, pushSample, type HostStats, type McuStats, type ProcSample } from '@/system/hostHealth'

const POLL_MS = 2000

export const useHostHealthStore = defineStore('hostHealth', () => {
  const samples = shallowRef<ProcSample[]>([])
  const stats = shallowRef<HostStats | null>(null)
  const statsError = ref<string | null>(null)
  const klipper = shallowRef<Record<string, number> | null>(null)
  const mcus = shallowRef<McuStats[]>([])
  const mcuBase = ref<Record<string, number>>({})

  function onProcStats(st: unknown) {
    const s = procSample(st, Date.now())
    if (s) samples.value = pushSample(samples.value, s)
  }

  async function readPortal() {
    const p = useMaintenanceStore().portal()
    if (!p) return void (statsError.value = 'The Rhino Portal isn’t connected, so temperatures, disks and programs can’t be read.')
    try {
      stats.value = await p.hostStats()
      statsError.value = null
    } catch (e) {
      const t = (e as Error).message
      statsError.value = /404|HTTP 404/.test(t) ? 'This needs Tool Manager 1.9.19 or later on the Rhino.' : t
    }
  }

  async function readKlipper() {
    const m = useMachineStore()
    if (!m.online || !m.klippyReady) return void ((klipper.value = null), (mcus.value = []))
    const names = [...m.objects].filter((o) => o === 'mcu' || o.startsWith('mcu ')).sort()
    try {
      const r = await m.hostObjects(names)
      klipper.value = r.system
      mcus.value = names.filter((n) => r.mcus[n]).map((n) => mcuStats(n, r.mcus[n]))
      for (const b of mcus.value) if (mcuBase.value[b.name] == null) mcuBase.value[b.name] = b.retransmit
    } catch {
      /* next time */
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let watchers = 0
  /** The page asks for readings while it's open; the first open sets the resend baseline. */
  function watch(on: boolean) {
    watchers = Math.max(0, watchers + (on ? 1 : -1))
    if (watchers && !timer) {
      mcuBase.value = {}
      const tick = () => void Promise.all([readPortal(), readKlipper()])
      tick()
      void useNetworkStore().loadSystemInfo()
      timer = setInterval(tick, POLL_MS)
    } else if (!watchers && timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const services = computed(() => {
    const si = useNetworkStore().systemInfo as { service_state?: Record<string, { active_state?: string; sub_state?: string }> } | null
    return si?.service_state ?? null
  })
  const found = computed(() => findings({ samples: samples.value, stats: stats.value, mcus: mcus.value, mcuBase: mcuBase.value, services: services.value }))

  return { samples, stats, statsError, klipper, mcus, mcuBase, services, found, onProcStats, watch }
})
