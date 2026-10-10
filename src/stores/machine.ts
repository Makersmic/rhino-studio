/**
 * Machine state as the UI sees it, fed by the Moonraker client.
 *
 * Safety rules:
 * - The mounted toolhead is ONLY ever taken from Klipper's report
 *   (SWAP_TOOL.current_tool). The UI never sets it, never guesses it, and
 *   never remembers it across reloads. Any disconnect or Klipper restart
 *   clears it back to unknown.
 * - Phase 2a sends nothing that changes the machine except the emergency stop.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { MoonrakerClient, type ConnectionState, type KlippyState, type Status } from '@/moonraker/client'
import { deriveToolState, describeToolState, mergedToolMapping, mergedToolTypes } from '@/moonraker/toolState'
import { lookFor, type ToolheadLook } from '@/toolheads/registry'
import { brand } from '@/brand/brand'

export type { ConnectionState, KlippyState }

export interface KnownTool {
  slot: number
  name: string
  type: string | null
  look: ToolheadLook
}

export const useMachineStore = defineStore('machine', () => {
  const connection = ref<ConnectionState>('offline')
  const connectionDetail = ref<string | null>(null)
  const klippy = ref<KlippyState>('unknown')
  const status = shallowRef<Status>({})
  let client: MoonrakerClient | null = null

  // ---- connection -------------------------------------------------------

  function connect(baseUrl: string) {
    client?.disconnect()
    client = new MoonrakerClient(
      baseUrl,
      {
        onState(s, detail) {
          connection.value = s
          connectionDetail.value = detail ?? null
        },
        onKlippy(s) {
          klippy.value = s
        },
        onStatus(st, replace) {
          if (replace) {
            status.value = { ...st }
            return
          }
          const cur = status.value
          for (const [obj, fields] of Object.entries(st)) cur[obj] = { ...(cur[obj] ?? {}), ...fields }
          triggerRef(status)
        },
      },
      { version: brand.version },
    )
    client.connect()
  }

  function disconnect() {
    client?.disconnect()
    client = null
    status.value = {}
    klippy.value = 'unknown'
  }

  const online = computed(() => connection.value === 'online')
  const klippyReady = computed(() => online.value && klippy.value === 'ready')

  /** Klipper's own shutdown/error message, if it has one. */
  const klippyMessage = computed(() => {
    const m = status.value.webhooks?.state_message
    return typeof m === 'string' && klippy.value !== 'ready' ? m : null
  })

  // ---- toolheads --------------------------------------------------------

  const toolState = computed(() => deriveToolState(status.value, { online: online.value, klippyReady: klippyReady.value }))
  const toolStateText = computed(() => describeToolState(toolState.value))

  const mountedVerified = computed(() => toolState.value.kind === 'mounted')
  const mountedSlot = computed<number | null>(() => (toolState.value.kind === 'mounted' ? toolState.value.slot : null))
  const mountedName = computed<string | null>(() => (toolState.value.kind === 'mounted' ? toolState.value.name : null))
  const mountedLook = computed<ToolheadLook>(() => {
    const s = toolState.value
    return s.kind === 'mounted' ? lookFor(s.name, s.type ?? undefined) : lookFor(null)
  })

  /** All toolheads Klipper knows about (built-in + custom), by slot. Empty until connected. */
  const knownTools = computed<KnownTool[]>(() => {
    if (!klippyReady.value) return []
    const types = mergedToolTypes(status.value)
    return [...mergedToolMapping(status.value).entries()]
      .sort(([a], [b]) => a - b)
      .map(([slot, name]) => {
        const type = types.get(name) ?? null
        return { slot, name, type, look: lookFor(name, type ?? undefined) }
      })
  })

  // ---- readouts ---------------------------------------------------------

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  const hotend = computed(() => ({
    temp: num(status.value.extruder?.temperature),
    target: num(status.value.extruder?.target),
  }))
  const bed = computed(() => ({
    temp: num(status.value.heater_bed?.temperature),
    target: num(status.value.heater_bed?.target),
  }))
  const position = computed(() => {
    const p = status.value.toolhead?.position
    const homed = status.value.toolhead?.homed_axes
    return {
      xyz: Array.isArray(p) ? (p.slice(0, 3) as number[]) : null,
      homed: typeof homed === 'string' ? homed : '',
    }
  })
  const job = computed(() => ({
    state: (status.value.print_stats?.state as string | undefined) ?? null,
    filename: (status.value.print_stats?.filename as string | undefined) || null,
    progress: num(status.value.virtual_sdcard?.progress),
  }))

  // ---- actions ----------------------------------------------------------

  async function emergencyStop() {
    if (!client) throw new Error('Not connected')
    await client.emergencyStop()
  }

  function listFiles() {
    if (!client) return Promise.reject(new Error('Not connected'))
    return client.listFiles()
  }

  function fileUrl(path: string) {
    return client?.fileUrl(path) ?? null
  }

  return {
    connection,
    connectionDetail,
    klippy,
    klippyReady,
    klippyMessage,
    online,
    toolState,
    toolStateText,
    mountedVerified,
    mountedSlot,
    mountedName,
    mountedLook,
    knownTools,
    hotend,
    bed,
    position,
    job,
    connect,
    disconnect,
    emergencyStop,
    listFiles,
    fileUrl,
  }
})
