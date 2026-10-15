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
import type { HistoryRecord, JobsWeeks, MaintLists, MaintOverview, TaskLibrary } from '@/maintenance/types'
import { useMachineStore } from './machine'

export type CareSource = 'idle' | 'loading' | 'ready' | 'unavailable'

export const useMaintenanceStore = defineStore('maintenance', () => {
  const machine = useMachineStore()
  const overview = shallowRef<MaintOverview | null>(null)
  const history = shallowRef<HistoryRecord[]>([])
  /** Jobs per week for the Dashboard; null if the Portal couldn't say */
  const jobWeeks = shallowRef<JobsWeeks | null>(null)
  /** The Task Library and the Care setup lists: read when a screen needs them, kept fresh after changes. */
  const library = shallowRef<TaskLibrary | null>(null)
  const lists = shallowRef<MaintLists | null>(null)
  const source = ref<CareSource>('idle')
  const error = ref<string | null>(null)
  const updatedAt = ref<number | null>(null)
  let client: PortalClient | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  function start(baseUrl: string) {
    client = new PortalClient(baseUrl)
    overview.value = null
    history.value = []
    jobWeeks.value = null
    library.value = null
    lists.value = null
    void refresh()
    if (timer) clearInterval(timer)
    timer = setInterval(() => void refresh(), 120_000)
  }

  async function refresh() {
    if (!client) return
    if (source.value !== 'ready') source.value = 'loading'
    try {
      const [ov, h, jw] = await Promise.all([client.overview(), client.history(), client.jobsPerWeek().catch(() => null)])
      overview.value = ov
      history.value = h.records ?? []
      jobWeeks.value = jw
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

  function api(): PortalClient {
    if (!client) throw new Error('The Rhino Portal is not set up (Settings → Portal)')
    return client
  }

  async function loadLibrary(): Promise<TaskLibrary> {
    library.value = await api().taskLibrary()
    return library.value
  }

  async function loadLists(): Promise<MaintLists> {
    lists.value = await api().maintLists()
    return lists.value
  }

  /**
   * Make one change through the Portal, then read back everything it can
   * touch: the overview (tasks, statuses), and the library and lists if a
   * screen has them open. The Portal's own message is thrown on refusal.
   */
  async function write<T>(fn: (c: PortalClient) => Promise<T>): Promise<T> {
    const r = await fn(api())
    await Promise.all([refresh(), library.value && loadLibrary().catch(() => null), lists.value && loadLists().catch(() => null)])
    return r
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

  /** The shared Portal client (one token for maintenance and tools). */
  const portal = () => client

  const portalVersion = computed(() => client?.version ?? null)
  const portalHome = computed(() => client?.homeUrl ?? null)
  const statusOptions = computed(() =>
    (overview.value?.statuses ?? []).filter((s) => !s.builtin && s.log_option).map((s) => ({ id: s.id, label: s.label })),
  )

  return {
    overview,
    history,
    library,
    lists,
    jobWeeks,
    source,
    error,
    updatedAt,
    counts,
    due,
    upcoming,
    held,
    areas,
    mountedCare,
    portal,
    portalVersion,
    portalHome,
    statusOptions,
    forTool,
    start,
    refresh,
    logWork,
    snooze,
    loadLibrary,
    loadLists,
    write,
  }
})
