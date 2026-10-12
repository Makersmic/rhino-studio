/**
 * Machine state as the UI sees it, fed by the Moonraker client.
 *
 * Safety rules:
 * - The mounted toolhead is ONLY ever taken from Klipper's report
 *   (SWAP_TOOL.current_tool). The UI never sets it, never guesses it, and
 *   never remembers it across reloads. Any disconnect or Klipper restart
 *   clears it back to unknown.
 * - Commands reach the machine only as CheckedScripts from the control store
 *   (src/stores/control.ts), never as raw strings.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { MoonrakerClient, type ConnectionState, type KlippyState, type Status } from '@/moonraker/client'
import { deriveToolState, describeToolState, mergedToolMapping, mergedToolTypes } from '@/moonraker/toolState'
import { lookFor, type ToolheadLook } from '@/toolheads/registry'
import { brand } from '@/brand/brand'
import type { CheckedScript } from '@/control/commands'
import { readoutPlan, toolKind as kindOf, type ReadoutPlan, type ToolKind } from '@/toolheads/readouts'
import { plausible } from '@/control/tempHistory'
import { useControlStore } from './control'
import { useWebcamsStore } from './webcams'
import { useTempsStore } from './temps'

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
    lastBase = baseUrl.replace(/\/+$/, '')
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
        onGcodeResponse(line) {
          useControlStore().onResponse(line)
        },
        onGcodeStore(entries) {
          useControlStore().onStore(entries)
        },
        onObjects(objects) {
          useControlStore().onObjects(objects)
        },
        onHelp(help) {
          useControlStore().onHelp(help)
        },
        onTemperatureStore(store) {
          useTempsStore().seed(store)
        },
        onWebcams(list) {
          useWebcamsStore().setFromMoonraker(list)
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
    useWebcamsStore().setFromMoonraker([])
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
  const limits = computed(() => {
    const lo = status.value.toolhead?.axis_minimum
    const hi = status.value.toolhead?.axis_maximum
    return { min: Array.isArray(lo) ? (lo as number[]) : null, max: Array.isArray(hi) ? (hi as number[]) : null }
  })

  const job = computed(() => ({
    state: (status.value.print_stats?.state as string | undefined) ?? null,
    filename: (status.value.print_stats?.filename as string | undefined) || null,
    progress: num(status.value.virtual_sdcard?.progress),
    /** seconds actually spent running (pauses not counted) */
    duration: num(status.value.print_stats?.print_duration),
    message: (status.value.print_stats?.message as string | undefined) || null,
  }))

  /** Position in the job's coordinates (after work zero / G54 offsets). */
  const workPosition = computed(() => {
    const p = status.value.gcode_move?.gcode_position
    return Array.isArray(p) ? (p.slice(0, 3) as number[]) : null
  })
  const hasWorkOffset = computed(() => {
    const o = status.value.gcode_move?.homing_origin
    return Array.isArray(o) && (o as number[]).slice(0, 3).some((v) => Math.abs(v) > 0.001)
  })
  const speedFactor = computed(() => num(status.value.gcode_move?.speed_factor))

  /**
   * What the tool outputs are doing, read from Klipper's pins (read only).
   * null = that output doesn't exist in this config.
   */
  const pin = (name: string) => num(status.value[`output_pin ${name}`]?.value)
  const outputs = computed(() => {
    const rail = pin('LASER_INITIALIZE')
    const laserPwm = pin('SERVO_LASER')
    const relay = pin('Spindle_power')
    const duty = pin('SPINDLE_SPEED')
    const tp = status.value['gcode_macro TOOL_POWER_STATE']
    return {
      fan: num(status.value.fan?.speed),
      laser: rail == null && laserPwm == null ? null : { armed: (rail ?? 0) > 0.01, power: laserPwm ?? 0 },
      // The ESC reads 0.3 as stopped and 1.0 as full throttle
      spindle: relay == null ? null : { on: relay > 0.5, throttle: relay > 0.5 && duty != null ? Math.max(0, Math.min(1, (duty - 0.3) / 0.7)) : 0 },
      toolPower: tp ? { active: Number(tp.active) > 0, level: num(tp.level) ?? 0, suspended: Number(tp.suspended) > 0 } : null,
    }
  })

  /** What kind of tool is mounted, and which readouts apply to it (src/toolheads/readouts.ts). */
  const toolKind = computed<ToolKind>(() => kindOf(toolState.value.kind === 'mounted' ? toolState.value.type : null, toolState.value.kind === 'mounted'))
  const plan = computed<ReadoutPlan>(() =>
    readoutPlan({
      kind: toolKind.value,
      hotend: hotend.value,
      bed: bed.value,
      bodyReading: plausible(hotend.value.temp),
      has: {
        fan: outputs.value.fan != null,
        laser: outputs.value.laser != null,
        spindle: outputs.value.spindle != null,
        toolPower: outputs.value.toolPower != null,
      },
    }),
  )

  /**
   * Klipper is working through commands (idle_timeout reports "Printing"
   * whenever it is executing G-code, job or not: homing, a macro, heating).
   */
  const busy = computed(() => klippyReady.value && status.value.idle_timeout?.state === 'Printing')

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

  // ---- cameras (Moonraker's camera list; never the machine) -----------------

  let lastBase = ''
  function webcamUrl(path: string): string {
    if (client) return client.resolveUrl(path)
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path
    return `${lastBase}${path.startsWith('/') ? '' : '/'}${path}`
  }
  const saveWebcam = (item: Record<string, unknown>) => need().saveWebcam(item)
  const deleteWebcam = (uid: string) => need().deleteWebcam(uid)
  const getStudioSetting = (key: string) => need().getStudioSetting(key)
  const setStudioSetting = (key: string, value: unknown) => need().setStudioSetting(key, value)

  // Actions. Only the control store calls these.
  function need(): MoonrakerClient {
    if (!client || !online.value) throw new Error('Not connected')
    return client
  }
  const runChecked = (s: CheckedScript) => need().runScript(s)
  const startPrint = (path: string) => need().startPrint(path)
  const pausePrint = () => need().pausePrint()
  const resumePrint = () => need().resumePrint()
  const cancelPrint = () => need().cancelPrint()
  const uploadFile = (file: File, onProgress?: (f: number) => void) => need().uploadFile(file, onProgress)

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
    busy,
    workPosition,
    hasWorkOffset,
    speedFactor,
    outputs,
    toolKind,
    plan,
    limits,
    status,
    connect,
    disconnect,
    emergencyStop,
    listFiles,
    fileUrl,
    webcamUrl,
    saveWebcam,
    deleteWebcam,
    getStudioSetting,
    setStudioSetting,
    runChecked,
    startPrint,
    pausePrint,
    resumePrint,
    cancelPrint,
    uploadFile,
  }
})
