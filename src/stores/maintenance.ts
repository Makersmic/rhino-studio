/**
 * Preventive maintenance, from the Rhino Portal on the Pi.
 *
 * Studio shows it everywhere it matters (top bar, toolhead tiles, the
 * mounted tool, files, the Care screen) and can log work and snooze. The
 * Portal stays the engine and the store of record.
 *
 * Refreshes: on start, every 2 minutes, when the window regains focus, when
 * a job ends (meters move), and after any change made here. Nothing here
 * blocks a job: maintenance informs, it never refuses.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { PortalClient } from '@/portal/client'
import { assetCare, dueList, heldList, machineAreas, toolAsset, upcomingList } from '@/maintenance/summary'
import type { HistoryRecord, MaintOverview } from '@/maintenance/types'
import { useMachineStore } from './machine'

export type CareSource = 'idle' | 'loading' | 'ready' | 'unavailable'

export const useMaintenanceStore = defineStore('maintenance', () => {
  const machine = useMachineStore()
  const overview = shallowRef<MaintOverview | null>(null)
  const history = shallowRef<HistoryRecord[]>([])
  const source = ref<CareSource>('idle')
  const error = ref<string | null>(null)
  const updatedAt = ref<number | null>(null)
  let client: PortalClient | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  function start(baseUrl: string) {
    client = new PortalClient(baseUrl)
    overview.value = null
    history.value = []
    void refresh()
    if (timer) clearInterval(timer)
    timer = setInterval(() => void refresh(), 120_000)
  }

  async function refresh() {
    if (!client) return
    if (source.value !== 'ready') source.value = 'loading'
    try {
      const [ov, h] = await Promise.all([client.overview(), client.history()])
      overview.value = ov
      history.value = h.records ?? []
      source.value = 'ready'
      error.value = null
      updatedAt.value = Date.now()
    } catch (e) {
      source.value = 'unavailable'
      error.value = (e as Error).message
    }
  }

  async function logWork(taskId: string, body: { action: string; date?: string; notes?: string }) {
    if (!client) throw new Error('Portal not connected')
    await client.logWork(taskId, body)
    await refresh()
  }

  async function snooze(taskId: string, days: number) {
    if (!client) throw new Error('Portal not connected')
    await client.snooze(taskId, days)
    await refresh()
  }

  // Meters move when a job finishes or a tool is swapped: look again then
  // (after a short wait, so the Portal's monitor has counted it)
  const later = () => setTimeout(() => void refresh(), 5000)
  watch(() => machine.job.state, (state, prev) => {
    if (prev === 'printing' && state !== 'printing') later()
  })
  watch(() => machine.mountedName, (name, prev) => {
    if (name && prev && name !== prev) later()
  })
  if (typeof window !== 'undefined') window.addEventListener('focus', () => void refresh())

  const counts = computed(() => overview.value?.counts ?? { overdue: 0, due_soon: 0, snoozed: 0, held: 0 })
  const due = computed(() => dueList(overview.value))
  const upcoming = computed(() => upcomingList(overview.value, 8))
  const held = computed(() => heldList(overview.value))
  const areas = computed(() => machineAreas(overview.value))

  /** Care summary for a toolhead by its Klipper name. */
  const forTool = (name: string | null | undefined) => (name ? assetCare(overview.value, toolAsset(name), name) : null)
  const mountedCare = computed(() => (machine.mountedVerified ? forTool(machine.mountedName) : null))

  const portalVersion = computed(() => client?.version ?? null)
  const portalHome = computed(() => client?.homeUrl ?? null)
  const statusOptions = computed(() =>
    (overview.value?.statuses ?? []).filter((s) => !s.builtin && s.log_option).map((s) => ({ id: s.id, label: s.label })),
  )

  return {
    overview,
    history,
    source,
    error,
    updatedAt,
    counts,
    due,
    upcoming,
    held,
    areas,
    mountedCare,
    portalVersion,
    portalHome,
    statusOptions,
    forTool,
    start,
    refresh,
    logWork,
    snooze,
  }
})
