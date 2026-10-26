/**
 * Settings / Software: Moonraker's update manager, plus the Rhino pieces it
 * doesn't manage: the Rhino Tool Manager (config, macros, the Portal, and the
 * Rhino Studio served from the Rhino, all in one release zip: Update installs
 * GitHub's newest release on the Rhino, Install from zip takes a downloaded
 * one), the PrusaSlicer engine (it can keep itself up to date while it's
 * used), and Rhino Studio only while it runs from a PC.
 *
 * Updating goes through src/system/updates.ts (order, what restarts, when
 * it's refused) and asks first. Moonraker restarting mid-run is expected:
 * the run waits for the connection to come back, then carries on.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { legacyUpgrade, newer, readPackages, restartsOf, updateBlock, updatePlan, type Package } from '@/system/updates'
import { useMachineStore } from './machine'
import { useControlStore } from './control'
import { useMaintenanceStore } from './maintenance'
import { brand } from '@/brand/brand'
import type { SlicerState } from '@/slicer/prusa/portal'
import type { UpdateState } from '@/portal/client'

export interface ExtraRow {
  name: 'rhino-tool-manager' | 'rhino-studio-pc' | 'prusaslicer'
  label: string
  note: string
  installed: string | null
  latest: string | null
  needsUpdate: boolean
  how: string
  /** Studio can run it (through the Portal): the button acts instead of showing `how` */
  action?: 'engine' | 'github'
  actionLabel?: string
  busy?: boolean
  /** what a running install is doing */
  busyNote?: string | null
  /** a version Studio can go back to */
  back?: string | null
  /** Studio can't install or update it on this host (`how` says why) */
  blocked?: boolean
  error?: string | null
  /** PrusaSlicer: keeps itself up to date while it's used (1.5.8) */
  auto?: { on: boolean; note: string } | null
}

/** Public raw files: the latest released version of each Rhino repo. */
const LATEST_URLS = {
  toolManager: 'https://raw.githubusercontent.com/Makersmic/Toolhead_Manager/main/VERSION',
  studio: 'https://raw.githubusercontent.com/Makersmic/rhino-studio/main/package.json',
}

export const useUpdatesStore = defineStore('updates', () => {
  const machine = useMachineStore()

  const packages = shallowRef<Package[]>([])
  const busy = ref(false) // Moonraker says an update is running
  const loading = ref(false)
  const checkedAt = ref<number | null>(null)
  const error = ref<string | null>(null)
  const running = ref<string | null>(null) // our run: the package being updated
  const runPlan = ref<string[]>([])
  const doneSteps = ref<string[]>([])
  const progress = ref<string[]>([])
  const runError = ref<string | null>(null)
  const latestTm = ref<string | null>(null)
  const latestStudio = ref<string | null>(null)
  const tmVersion = ref<string | null>(null)
  /** PrusaSlicer on the Rhino (Portal 1.5.0+); null = this Portal doesn't have it */
  const engine = shallowRef<SlicerState | null>(null)
  const engineError = ref<string | null>(null)
  async function loadEngine() {
    const c = useMaintenanceStore().portal()
    if (!c) return
    try {
      engine.value = await c.slicerState()
      engineError.value = null
    } catch (e) {
      engine.value = null
      engineError.value = /404|not found/i.test((e as Error).message) ? null : (e as Error).message
    }
  }
  const hasStudioOnPi = computed(() => packages.value.some((p) => p.name === 'rhino-studio'))

  function onStatus(st: unknown) {
    const s = st as { version_info?: Record<string, Record<string, unknown>>; busy?: boolean } | null
    if (!s || typeof s !== 'object') return
    packages.value = readPackages(s.version_info)
    busy.value = !!s.busy
    checkedAt.value = Date.now()
  }

  function onProgress(r: { application?: string; message?: string; complete?: boolean }) {
    if (r.message) {
      progress.value = [...progress.value.slice(-199), `${r.application ? `${r.application}: ` : ''}${r.message}`]
    }
  }

  async function load() {
    if (!machine.online) return
    loading.value = true
    error.value = null
    try {
      onStatus(await machine.updateStatus())
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
    void loadLatest()
  }

  async function loadTm(fresh = false) {
    const c = useMaintenanceStore().portal()
    if (!c) return
    try {
      if (!c.version) await c.refreshToken()
    } catch {
      /* Portal not reachable: shown as ? */
    }
    tmVersion.value = c.version
    try {
      tmUpdate.value = await c.updateState(fresh)
      if (tmUpdate.value.installed) tmVersion.value = tmUpdate.value.installed
    } catch {
      tmUpdate.value = null // before 1.5.3: no /api/update
    }
  }
  /** GET /api/update: installed, the updater, GitHub's newest release */
  const tmUpdate = shallowRef<UpdateState | null>(null)

  async function loadLatest(fresh = false) {
    const tmRead = loadTm(fresh)
    void loadEngine()
    const get = async (url: string) => {
      try {
        const r = await fetch(url, { cache: 'no-store' })
        return r.ok ? await r.text() : null
      } catch {
        return null // offline, or a private repo
      }
    }
    const [tm, st] = await Promise.all([get(LATEST_URLS.toolManager), get(LATEST_URLS.studio), tmRead])
    latestTm.value = tmUpdate.value?.latest?.version ?? (tm?.trim().split(/\s/)[0] || null)
    try {
      latestStudio.value = st ? ((JSON.parse(st) as { version?: string }).version ?? null) : null
    } catch {
      latestStudio.value = null
    }
  }

  /** Ask Moonraker to check every package's remote now. */
  async function refresh() {
    if (!machine.online) return
    loading.value = true
    error.value = null
    try {
      await machine.runUpdate('machine.update.refresh')
      onStatus(await machine.updateStatus())
    } catch (e) {
      error.value = /503|busy|print/i.test((e as Error).message) ? 'Moonraker can’t check right now (busy or a job is running).' : (e as Error).message
    } finally {
      loading.value = false
    }
    void loadLatest(true) // Check now: every row, the Tool Manager's GitHub release too
  }

  const extras = computed<ExtraRow[]>(() => {
    const rows: ExtraRow[] = []
    const tmv = tmVersion.value
    const rel = tmUpdate.value?.latest ?? null
    const canGitHub = !!tmUpdate.value?.helper && !!rel?.version && newer(tmv, rel.version)
    const servedHere = !import.meta.env.DEV
    rows.push({
      name: 'rhino-tool-manager',
      label: 'Rhino Tool Manager',
      // Studio served by the Rhino comes in the same zip, so it isn't a row of its own
      note: servedHere ? `Config, macros, the Portal and Rhino Studio ${brand.version}` : 'Config, macros and the Portal',
      installed: tmv,
      latest: latestTm.value,
      needsUpdate: newer(tmv, latestTm.value),
      action: canGitHub ? 'github' : undefined,
      actionLabel: 'Update',
      busy: tmBusy.value,
      error: tmError.value ?? (rel?.error && rel.error !== 'No releases on GitHub yet.' ? rel.error : null),
      how: !tmUpdate.value
        ? `This Rhino's Tool Manager is older than 1.5.3: install rhino-config-${latestTm.value ?? '<version>'}.zip once with rhino.sh option 3 (upload it in Mainsail, Machine), then FIRMWARE_RESTART.`
        : !tmUpdate.value.helper
          ? 'The updater isn’t set up on this Rhino yet: install the zip once by hand (rhino.sh option 3); after that Update works from here.'
          : !rel?.version || !newer(tmv, rel.version)
            ? // main says a newer version, but GitHub has no release of it to download (yet)
              `Tool Manager ${latestTm.value ?? ''} is on GitHub, but its release isn’t published yet. It’s published by itself a few minutes after a new version is pushed (Tool Manager 1.6.2+); check again then, or drop a downloaded zip on Install from zip, below.`
            : `Download rhino-config-${latestTm.value ?? '<version>'}.zip and drop it on Install from zip, below.`,
    })
    const e = engine.value?.engine
    rows.push({
      name: 'prusaslicer',
      label: 'PrusaSlicer engine',
      note: e ? `Slicing on the Rhino · ${engine.value!.host.cpus} cores, ${Math.round(engine.value!.host.mem_total_mb / 1024)} GB` : 'Slicing on the Rhino',
      installed: e?.installed ?? null,
      latest: e?.latest ?? null,
      needsUpdate: !!e?.update_available,
      how: e ? (e.blocked ?? '') : 'Needs Rhino Tool Manager 1.5.0 or later on the Rhino; install that first (row above).',
      action: e && (e.can_install || e.installing) ? 'engine' : undefined,
      actionLabel: e?.installed ? 'Update' : 'Install',
      busy: !!e?.installing,
      busyNote: e?.installing ? e.install_phase ?? null : null,
      back: e && e.can_install && !e.installing ? e.previous ?? null : null,
      blocked: !!e?.blocked && !e.installing,
      error: e?.install_error ?? engineError.value,
      auto: e?.installed && engine.value?.auto ? { on: engine.value.auto.on, note: autoNote(engine.value.auto) } : null,
    })
    // Studio has a row only while it runs from a PC; served by the Rhino it comes with the Tool Manager (row above)
    if (import.meta.env.DEV && !hasStudioOnPi.value)
      rows.push({
        name: 'rhino-studio-pc',
        label: 'Rhino Studio',
        note: 'This app, running from your PC',
        installed: brand.version,
        latest: latestStudio.value,
        needsUpdate: newer(brand.version, latestStudio.value),
        how: 'Studio is running from your PC. In its folder: git pull, then npm ci, then start it again with npm run dev.',
      })
    return rows
  })

  /** Updates Studio can run (Moonraker); the rest are installed by hand */
  const runnableCount = computed(() => packages.value.filter((p) => p.needsUpdate).length)
  const byHandCount = computed(() => extras.value.filter((r) => r.needsUpdate && !r.action).length)
  const engineCount = computed(() => extras.value.filter((r) => r.needsUpdate && r.action).length)
  const readyCount = computed(() => packages.value.filter((p) => p.needsUpdate).length + extras.value.filter((r) => r.needsUpdate).length)
  const jobActive = computed(() => machine.job.state === 'printing' || machine.job.state === 'paused')
  const block = computed(() => updateBlock({ online: machine.online, jobActive: jobActive.value, busy: busy.value, running: !!running.value }))

  // ---- updating ---------------------------------------------------------

  const waitOnline = (ms: number) =>
    new Promise<boolean>((resolve) => {
      if (machine.online) return resolve(true)
      const stop = watch(
        () => machine.online,
        (on) => {
          if (on) {
            stop()
            clearTimeout(t)
            resolve(true)
          }
        },
      )
      const t = setTimeout(() => {
        stop()
        resolve(false)
      }, ms)
    })

  /** Wait for the connection to drop (up to dropMs) and then come back (up to backMs). */
  async function waitRestart(dropMs: number, backMs: number) {
    if (machine.online) {
      await new Promise<void>((resolve) => {
        const stop = watch(() => machine.online, (on) => !on && (stop(), clearTimeout(t), resolve()))
        const t = setTimeout(() => (stop(), resolve()), dropMs)
      })
    }
    return waitOnline(backMs)
  }

  async function upgradeOne(p: Package) {
    try {
      await machine.runUpdate('machine.update.upgrade', { name: p.name })
    } catch (e) {
      const m = (e as Error).message
      // Moonraker before API 1.5 has no machine.update.upgrade
      if (/method not found|not registered|-32601/i.test(m)) {
        const l = legacyUpgrade(p)
        await machine.runUpdate(l.method, l.params)
      } else throw e
    }
  }

  /** Update everything ready (or just `only`), in dependency order. */
  async function run(only?: string) {
    if (block.value) return
    const plan = updatePlan(packages.value, only)
    if (!plan.length) return
    const ok = await useControlStore().confirm({
      title: plan.length === 1 ? `Update ${plan[0]!.label}?` : `Update ${plan.length} packages?`,
      body:
        'Runs in this order, one after the other. ' +
        (plan.some((p) => p.kind === 'klipper') ? 'Klipper restarts once at the end, which switches every heater and tool output off. ' : '') +
        'Don’t start a job until it finishes.',
      lines: plan.map((p, i) => ({ text: `${i + 1}. ${p.label}${p.latest ? ` → ${p.latest}` : p.packageCount ? ` (${p.packageCount})` : ''}`, reason: restartsOf(p) })),
      confirmLabel: plan.length === 1 ? 'Update' : 'Update all',
      tone: 'normal',
    })
    if (!ok) return
    runPlan.value = plan.map((p) => p.name)
    doneSteps.value = []
    runError.value = null
    progress.value = []
    try {
      for (const p of plan) {
        // Stop if something changed underneath (a job started from another screen)
        if (jobActive.value) throw new Error('A job started; the rest was not updated')
        running.value = p.name
        const dropped = /closed|disconnected|not connected/i
        for (let attempt = 0; ; attempt++) {
          try {
            await upgradeOne(p)
            break
          } catch (e) {
            const msg = (e as Error).message
            // Moonraker restarting drops the socket: expected for its own update, and a
            // step sent just as it restarts is tried again once it's back
            if (p.kind === 'moonraker' && dropped.test(msg)) break
            if (attempt === 0 && dropped.test(msg)) {
              if (!(await waitOnline(180_000))) throw new Error(`Lost the machine while updating ${p.label}; check it, then press Check now`)
              continue
            }
            throw e
          }
        }
        // After Moonraker's own update, wait for its restart to drop the link and come back
        if (p.kind === 'moonraker') await waitRestart(20_000, 180_000)
        if (!(await waitOnline(180_000))) throw new Error(`Lost the machine after updating ${p.label}; check it, then press Check now`)
        doneSteps.value = [...doneSteps.value, p.name]
      }
    } catch (e) {
      runError.value = (e as Error).message
    } finally {
      running.value = null
      await load()
    }
  }

  /** Install or update PrusaSlicer on the Rhino: the Portal installs it from Flathub, test-slices it, and goes back if that fails. */
  async function runEngine() {
    const c = useMaintenanceStore().portal()
    const e = engine.value?.engine
    if (!c || !e) return
    if (jobActive.value) return (engineError.value = 'Not while a job is running')
    const ok = await useControlStore().confirm({
      title: `${e.installed ? 'Update' : 'Install'} PrusaSlicer ${e.latest ?? ''} on the Rhino?`,
      body:
        'The Portal installs Prusa’s official Linux build from Flathub at the lowest priority' +
        (e.installed ? ', ' : ' (the first time it also brings the runtime it needs, a few hundred MB), ') +
        'then slices a test cube with it. ' +
        (e.installed ? `If the new version can’t slice, ${e.installed} is put back. ` : '') +
        'Klipper and Moonraker aren’t restarted.',
      confirmLabel: e.installed ? 'Update' : 'Install',
      tone: 'normal',
    })
    if (!ok) return
    try {
      await c.updateEngine()
    } catch (err) {
      engineError.value = (err as Error).message
      return
    }
    await waitEngine()
  }

  async function waitEngine() {
    await loadEngine()
    for (let i = 0; i < 1800 && engine.value?.engine.installing; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      await loadEngine()
    }
  }

  /** Put back the PrusaSlicer from before the last update (it's test-sliced too). */
  async function rollBackEngine() {
    const c = useMaintenanceStore().portal()
    const e = engine.value?.engine
    if (!c || !e?.previous) return
    if (jobActive.value) return (engineError.value = 'Not while a job is running')
    const ok = await useControlStore().confirm({
      title: `Go back to PrusaSlicer ${e.previous}?`,
      body: `The Portal asks Flathub for ${e.previous} again, then slices a test cube with it. ${e.installed} can be put back the same way. Klipper and Moonraker aren’t restarted.`,
      confirmLabel: 'Go back',
      tone: 'normal',
    })
    if (!ok) return
    try {
      await c.rollbackEngine()
    } catch (err) {
      engineError.value = (err as Error).message
      return
    }
    await waitEngine()
  }

  // ---- Rhino Tool Manager from GitHub (1.5.8) ------------------------------
  const tmBusy = ref(false)
  const tmError = ref<string | null>(null)
  /** Download GitHub's newest release on the Rhino and install it, like a dropped zip. */
  async function runGitHub() {
    const c = useMaintenanceStore().portal()
    const rel = tmUpdate.value?.latest
    if (!c || !rel?.version) return
    if (jobActive.value) return (tmError.value = 'Not while a job is running')
    const ok = await useControlStore().confirm({
      title: `Update the Rhino Tool Manager to ${rel.version}?`,
      body:
        `The Rhino downloads rhino-config-${rel.version}.zip from GitHub, checks it against the release's SHA256, then installs it ` +
        'the same way as Install from zip: your config folder is backed up first (rhino.sh option 4 undoes it), the Portal and Klipper ' +
        'restart (heaters off, axes need homing), and Studio reloads itself with the version inside the zip.',
      confirmLabel: 'Update',
      tone: 'normal',
    })
    if (!ok) return
    tmBusy.value = true
    tmError.value = null
    try {
      await c.installFromGitHub(rel.version)
      // The install keeps going after the download (Portal and Klipper restart), so the button keeps
      // saying Updating… until Studio reloads itself, or Install from zip reports that the run stopped.
      window.addEventListener('rhino:update-ended', endTmRun, { once: true })
      tmTimer = setTimeout(endTmRun, 20 * 60_000) // never stuck on Updating… for good
      window.dispatchEvent(new CustomEvent('rhino:update-started')) // Install from zip follows the run
    } catch (err) {
      tmError.value = (err as Error).message
      tmBusy.value = false
    }
  }
  let tmTimer: ReturnType<typeof setTimeout> | null = null
  function endTmRun() {
    if (tmTimer) clearTimeout(tmTimer)
    tmTimer = null
    window.removeEventListener('rhino:update-ended', endTmRun)
    tmBusy.value = false
  }

  // ---- PrusaSlicer keeps itself up to date (1.5.8) ---------------------------
  function autoNote(a: NonNullable<SlicerState['auto']>): string {
    const when = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const last = a.last
      ? a.last.ok
        ? ` Last: ${a.last.from ?? '?'} → ${a.last.to ?? '?'} on ${when(a.last.at)}.`
        : ` Last try on ${when(a.last.at)} didn't work, so it stayed on ${a.last.from ?? 'the old version'}.`
      : ''
    if (!a.on) return 'Off: updates only when you press Update.'
    return (a.in_use
      ? 'Updates itself when Flathub has a new version, never during a job or a slice; Go back stays available.'
      : `On, but resting: it only updates while you use it (a slice in the last ${a.used_days} days).`) + last
  }
  async function setEngineAuto(on: boolean) {
    const c = useMaintenanceStore().portal()
    if (!c) return
    try {
      await c.setEngineAuto(on)
      await loadEngine()
    } catch (err) {
      engineError.value = (err as Error).message
    }
  }

  // Fresh numbers whenever the connection comes back
  watch(
    () => machine.online,
    (on) => on && !running.value && void load(),
  )

  return {
    packages, extras, busy, loading, checkedAt, error, running, runPlan, doneSteps, progress, runError,
    readyCount, runnableCount, byHandCount, engineCount, engine, runEngine, rollBackEngine, runGitHub, setEngineAuto, tmUpdate, block, hasStudioOnPi, load, refresh, run, onStatus, onProgress,
  }
})
