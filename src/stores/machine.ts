/**
 * Machine state as the UI sees it.
 *
 * Phase 1: nothing is connected, so everything is "unknown" and the UI shows
 * that honestly. Phase 2 fills this from Moonraker's websocket.
 *
 * Safety rule: the mounted toolhead is ONLY ever set from Klipper's own
 * report (SWAP_TOOL.current_tool). The UI never sets it, never guesses it,
 * and never remembers it across reloads. If we lose the connection it goes
 * back to unknown. That keeps toolhead state authoritative in Klipper.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { lookFor, type ToolheadLook } from '@/toolheads/registry'

export type ConnectionState = 'offline' | 'connecting' | 'online' | 'error'

export interface KlipperToolReport {
  /** printer["gcode_macro SWAP_TOOL"].current_tool; 0 means no tool. */
  currentSlot: number
  /** Merged VARIABLES.tool_mapping + CUSTOM_TOOLS.tool_mapping */
  toolMapping: Record<number, string>
  /** Merged toolheads tables, for types */
  toolTypes: Record<string, string>
}

export const useMachineStore = defineStore('machine', () => {
  const connection = ref<ConnectionState>('offline')
  const report = ref<KlipperToolReport | null>(null)

  /** Mounted slot as reported by Klipper, or null if we don't know. */
  const mountedSlot = computed<number | null>(() => {
    if (connection.value !== 'online' || !report.value) return null
    return report.value.currentSlot
  })

  const mountedName = computed<string | null>(() => {
    const slot = mountedSlot.value
    if (slot == null || slot === 0) return null
    return report.value?.toolMapping[slot] ?? null
  })

  /** True only when Klipper has told us which tool is on. */
  const mountedVerified = computed(() => mountedSlot.value != null && mountedSlot.value > 0 && mountedName.value != null)

  const mountedLook = computed<ToolheadLook>(() =>
    lookFor(mountedName.value, mountedName.value ? report.value?.toolTypes[mountedName.value] : undefined),
  )

  /** Called by the Moonraker client (Phase 2). Not for UI components. */
  function applyKlipperToolReport(r: KlipperToolReport) {
    report.value = r
  }

  /** Called by the Moonraker client (Phase 2) on connect/disconnect. */
  function setConnection(state: ConnectionState) {
    connection.value = state
    if (state !== 'online') report.value = null
  }

  return {
    connection,
    mountedSlot,
    mountedName,
    mountedVerified,
    mountedLook,
    applyKlipperToolReport,
    setConnection,
  }
})
