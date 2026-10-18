/**
 * Settings / Network.
 *
 * - This screen: how it reconnects and how cameras behave on a slow link
 *   (kept in this browser).
 * - Live link readouts: round trip to Moonraker, traffic and connected
 *   screens (Moonraker's once-a-second proc stats), interfaces.
 * - The Rhino's network, through the Rhino Portal (config 1.4.8+). Every
 *   change asks first and switches back on its own unless it's kept.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { RECONNECT, wantsSnapshots, type CameraLink, type NetState, type ReconnectProfile, type WifiNetwork, type Ipv4Form, dnsList, secondsLeft } from '@/system/network'
import { useMachineStore } from './machine'
import { useControlStore } from './control'
import { useMaintenanceStore } from './maintenance'

const KEY = 'rs.network'
interface Prefs { reconnect: ReconnectProfile; cameraLink: CameraLink; snapshotFps: number }
function load(): Prefs {
  const d: Prefs = { reconnect: 'normal', cameraLink: 'auto', snapshotFps: 2 }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null
    if (v) {
      if (v.reconnect && v.reconnect in RECONNECT) d.reconnect = v.reconnect
      if (v.cameraLink === 'live' || v.cameraLink === 'auto' || v.cameraLink === 'snapshot') d.cameraLink = v.cameraLink
      if (typeof v.snapshotFps === 'number' && v.snapshotFps >= 0.5 && v.snapshotFps <= 10) d.snapshotFps = v.snapshotFps
    }
  } catch {
    /* storage blocked */
  }
  return d
}

interface NetCounters { bandwidth: number; rx: number; tx: number }

export const useNetworkStore = defineStore('network', () => {
  const prefs = load()
  const reconnect = ref<ReconnectProfile>(prefs.reconnect)
  const cameraLink = ref<CameraLink>(prefs.cameraLink)
  const snapshotFps = ref(prefs.snapshotFps)
  watch([reconnect, cameraLink, snapshotFps], () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ reconnect: reconnect.value, cameraLink: cameraLink.value, snapshotFps: snapshotFps.value }))
    } catch {
      /* ignore */
    }
  })
  const reconnectDelays = computed(() => RECONNECT[reconnect.value].delays)
  watch(reconnectDelays, (d) => useMachineStore().setReconnectDelays(d))

  // ---- live readouts ------------------------------------------------------
  const rttMs = ref<number | null>(null)
  const net = shallowRef<Record<string, NetCounters>>({})
  const connections = ref<number | null>(null)
  const cpuTemp = ref<number | null>(null)
  const systemInfo = shallowRef<Record<string, unknown> | null>(null)

  function onProcStats(st: unknown) {
    const s = st as { network?: Record<string, { bandwidth?: number; rx_bytes?: number; tx_bytes?: number }>; websocket_connections?: number; cpu_temp?: number } | null
    if (!s) return
    if (s.network) {
      const out: Record<string, NetCounters> = {}
      for (const [k, v] of Object.entries(s.network)) out[k] = { bandwidth: Number(v.bandwidth ?? 0), rx: Number(v.rx_bytes ?? 0), tx: Number(v.tx_bytes ?? 0) }
      net.value = out
    }
    if (typeof s.websocket_connections === 'number') connections.value = s.websocket_connections
    if (typeof s.cpu_temp === 'number') cpuTemp.value = s.cpu_temp
  }

  /** Traffic on the busiest real interface (not loopback). */
  const traffic = computed(() => {
    const rows = Object.entries(net.value).filter(([k]) => k !== 'lo')
    rows.sort((a, b) => b[1].bandwidth - a[1].bandwidth)
    return rows[0] ? { iface: rows[0][0], bps: rows[0][1].bandwidth } : null
  })

  let pingTimer: ReturnType<typeof setInterval> | null = null
  let fast = 0
  async function pingOnce() {
    const m = useMachineStore()
    if (!m.online) return (rttMs.value = null)
    try {
      const t = await m.ping()
      // Smooth a little so one slow answer doesn't flip cameras to snapshots
      rttMs.value = rttMs.value == null ? t : rttMs.value * 0.6 + t * 0.4
    } catch {
      /* next time */
    }
  }
  function startPing() {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => void pingOnce(), fast > 0 ? 3000 : 10000)
    void pingOnce()
  }
  /** The Network page asks for quicker readings while it's open. */
  function watchClosely(on: boolean) {
    fast = Math.max(0, fast + (on ? 1 : -1))
    startPing()
    if (on) void loadSystemInfo()
  }
  startPing()

  async function loadSystemInfo() {
    const m = useMachineStore()
    if (!m.online) return
    try {
      const r = (await m.systemInfo()) as { system_info?: Record<string, unknown> }
      systemInfo.value = r?.system_info ?? null
    } catch {
      systemInfo.value = null
    }
  }

  /** Interfaces Moonraker knows, with their addresses (from machine.system_info). */
  const interfaces = computed(() => {
    const n = (systemInfo.value?.network ?? {}) as Record<string, { mac_address?: string; ip_addresses?: { family?: string; address?: string; is_link_local?: boolean }[] }>
    return Object.entries(n)
      .filter(([k]) => k !== 'lo')
      .map(([name, v]) => ({
        name,
        mac: v.mac_address ?? null,
        ipv4: (v.ip_addresses ?? []).find((a) => a.family === 'ipv4' && !a.is_link_local)?.address ?? null,
      }))
  })

  // ---- cameras on a slow link -----------------------------------------------
  const phone = ref(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches)
  if (typeof window !== 'undefined') window.matchMedia?.('(max-width: 720px)').addEventListener?.('change', (e) => (phone.value = e.matches))
  const saveData = typeof navigator !== 'undefined' && !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData
  const camerasAsSnapshots = computed(() => wantsSnapshots(cameraLink.value, { phone: !!phone.value, rttMs: rttMs.value, saveData }))

  // ---- the Rhino's network (Portal) ---------------------------------------
  const pi = shallowRef<NetState | null>(null)
  const piError = ref<string | null>(null)
  const piLoading = ref(false)
  const wifi = shallowRef<WifiNetwork[]>([])
  const scanning = ref(false)
  const applying = ref(false)
  const now = ref(Date.now())
  setInterval(() => (now.value = Date.now()), 1000)
  const pending = computed(() => pi.value?.pending ?? null)
  const pendingSeconds = computed(() => secondsLeft(pending.value, now.value))

  const portal = () => useMaintenanceStore().portal()

  async function loadPi() {
    const c = portal()
    if (!c) return (piError.value = 'Rhino Portal not set up')
    piLoading.value = true
    try {
      pi.value = await c.netState()
      piError.value = null
    } catch (e) {
      const m = (e as Error).message
      piError.value = /404|not found/i.test(m) ? 'The Rhino’s network settings need Rhino Tool Manager 1.4.8 or later.' : m
    } finally {
      piLoading.value = false
    }
  }
  // While a change is waiting, keep its countdown and the state fresh
  let pendingTimer: ReturnType<typeof setInterval> | null = null
  watch(pending, (p) => {
    if (p && !pendingTimer) pendingTimer = setInterval(() => void loadPi(), 3000)
    if (!p && pendingTimer) {
      clearInterval(pendingTimer)
      pendingTimer = null
    }
  })

  async function scanWifi() {
    const c = portal()
    if (!c) return
    scanning.value = true
    try {
      wifi.value = await c.wifiScan()
    } catch (e) {
      piError.value = (e as Error).message
    } finally {
      scanning.value = false
    }
  }

  const jobActive = computed(() => {
    const s = useMachineStore().job.state
    return s === 'printing' || s === 'paused'
  })
  /** Why the Rhino's network can't be changed now, or null. */
  const changeBlock = computed(() => {
    if (!pi.value) return 'Not loaded yet'
    if (!pi.value.supported) return pi.value.reason ?? 'This Pi’s network can’t be changed from here'
    if (pending.value) return 'Keep or undo the waiting change first'
    if (jobActive.value) return 'Not while a job is running: the link could drop mid-job'
    return null
  })

  const REVERT_NOTE = () =>
    `If this screen can’t reach the Rhino afterwards, it switches back by itself after ${Math.round((pi.value?.revert_seconds ?? 120) / 60)} minutes. Otherwise press Keep.`

  async function apply(title: string, body: string, feature: string, fn: () => Promise<unknown>) {
    if (changeBlock.value) return false
    const ok = await useControlStore().confirm({ title, body: `${body} ${REVERT_NOTE()}`, feature, confirmLabel: 'Change it', tone: 'motion' })
    if (!ok) return false
    applying.value = true
    try {
      await fn()
      await loadPi()
      return true
    } catch (e) {
      piError.value = (e as Error).message
      return false
    } finally {
      applying.value = false
    }
  }

  const setHostname = (h: string) =>
    apply(`Rename the Rhino to ${h}?`, `Its local name becomes ${h}.local; a screen that opens it as ${pi.value?.hostname}.local needs the new name.`, `${h}.local`, () => portal()!.setHostname(h))

  function setIpv4(iface: string, f: Ipv4Form) {
    const fixed = f.method === 'manual'
    return apply(
      fixed ? `Give ${iface} a fixed address?` : `Let ${iface} get its address automatically?`,
      fixed
        ? `The Rhino moves to ${f.address}. To keep it, open the Portal at that address within the time shown.`
        : 'Your router picks the address (DHCP); it may change. Check your router for the new one.',
      fixed ? `${f.address}/${f.prefix} via ${f.gateway}` : 'Automatic (DHCP)',
      () => portal()!.setIpv4({ iface, method: f.method, address: f.address.trim(), prefix: f.prefix, gateway: f.gateway.trim(), dns: dnsList(f.dns) }),
    )
  }

  const joinWifi = (ssid: string, password: string) =>
    apply(
      `Join ${ssid}?`,
      'The Rhino leaves its current Wi-Fi. If this screen is on a different network, it loses the Rhino until it switches back.',
      ssid,
      () => portal()!.joinWifi(ssid, password),
    )

  const setPowersave = (on: boolean) =>
    apply(
      on ? 'Turn Wi-Fi power saving on?' : 'Turn Wi-Fi power saving off?',
      on ? 'Saves a little power; the Pi 3B may answer slowly or drop out now and then.' : 'Keeps the Wi-Fi awake: steadier camera and controls.',
      on ? 'Power saving on' : 'Power saving off',
      () => portal()!.setPowersave(on),
    )

  async function keep() {
    try {
      await portal()!.keepNetChange()
    } catch (e) {
      piError.value = (e as Error).message
    }
    await loadPi()
  }
  async function undo() {
    try {
      await portal()!.undoNetChange()
    } catch (e) {
      piError.value = (e as Error).message
    }
    await loadPi()
  }

  return {
    reconnect, cameraLink, snapshotFps, reconnectDelays,
    rttMs, traffic, connections, cpuTemp, interfaces, systemInfo, onProcStats, watchClosely, loadSystemInfo,
    camerasAsSnapshots,
    pi, piError, piLoading, wifi, scanning, applying, pending, pendingSeconds, changeBlock,
    loadPi, scanWifi, setHostname, setIpv4, joinWifi, setPowersave, keep, undo,
  }
})
