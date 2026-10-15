/**
 * Tool management, from the Rhino Portal on the Pi: the tool library, each
 * tool's page, adding, editing and removing added tools, and the restart that
 * makes those changes live.
 *
 * The Portal stays the store of record (myrhino/custom_tools.json, the
 * generated custom_tools.cfg) and the judge of what's valid; Studio shows it
 * and sends the changes. Changes wait for a Klipper restart, which the
 * Portal refuses while a job runs.
 *
 * The Portal's state is read while a Toolheads screen is open (every 10 s),
 * and straight after any change made here.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { PortalClient } from '@/portal/client'
import type { PortalState, ToolLists, ToolOptions } from '@/toolmgr/types'
import { useMaintenanceStore } from './maintenance'
import { useMachineStore } from './machine'

export const useToolMgrStore = defineStore('toolmgr', () => {
  const care = useMaintenanceStore()
  const machine = useMachineStore()
  const state = shallowRef<PortalState | null>(null)
  const options = shallowRef<ToolOptions | null>(null)
  /** Toolhead setup: what Add a toolhead offers (kinds, material names, nozzles, hardware categories). */
  const lists = shallowRef<ToolLists | null>(null)
  const error = ref<string | null>(null)
  const restarting = ref(false)
  let optionsAt = 0
  let users = 0
  let timer: ReturnType<typeof setInterval> | null = null

  function client(): PortalClient {
    const c = care.portal()
    if (!c) throw new Error('The Rhino Portal is not set up (Settings → Portal)')
    return c
  }

  async function refresh() {
    try {
      state.value = await client().state()
      error.value = null
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  /** Screens that show tools call this while open; the Portal is polled only then. */
  function use(): () => void {
    users++
    void refresh()
    if (!timer) timer = setInterval(() => void refresh(), 10_000)
    return () => {
      users = Math.max(0, users - 1)
      if (!users && timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }

  /** The add/edit forms' choices; re-read after a change (free pins, next slot move). */
  async function loadOptions(force = false): Promise<ToolOptions> {
    if (!options.value || force || Date.now() - optionsAt > 30_000) {
      options.value = await client().options()
      optionsAt = Date.now()
    }
    return options.value
  }

  /** After a change: the library, the forms' choices and the maintenance tasks (they follow renames and removals). */
  async function changed() {
    optionsAt = 0
    await Promise.all([refresh(), care.refresh()])
  }

  async function loadLists(): Promise<ToolLists> {
    lists.value = await client().toolLists()
    return lists.value
  }

  /** Save one of the setup lists; the forms' choices follow straight away. */
  async function saveLists(body: Record<string, unknown>) {
    await client().saveToolLists(body)
    optionsAt = 0
    await Promise.all([loadLists(), refresh()])
  }

  const pins = computed(() => state.value?.pins ?? null)
  const tools = computed(() => [...(state.value?.tools ?? [])].sort((a, b) => a.slot - b.slot))
  const pending = computed(() => (state.value?.restart_pending ? (state.value.pending ?? {}) : null))
  const printer = computed(() => state.value?.printer ?? null)
  const restartBlocked = computed(() => !!printer.value?.restart_blocked)

  /** FIRMWARE_RESTART via the Portal (it refuses during a job), then wait for Klipper to come back. */
  async function restart(): Promise<void> {
    restarting.value = true
    try {
      await client().restartKlipper()
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        if (i > 1 && machine.klippy === 'ready') break
      }
      await changed()
    } finally {
      restarting.value = false
    }
  }

  async function setAutoRestart(on: boolean) {
    await client().setAutoRestart(on)
    await refresh()
  }

  return { state, options, lists, pins, error, restarting, tools, pending, printer, restartBlocked, client, refresh, use, loadOptions, loadLists, saveLists, changed, restart, setAutoRestart }
})
