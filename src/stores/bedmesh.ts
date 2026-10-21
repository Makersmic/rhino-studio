/**
 * Bed mesh: Klipper's meshes, the Rhino's records of them, and the actions.
 *
 * Every action goes through the control store's send(), so it is checked
 * (src/control/commands.ts) and confirmed like any other command. Nothing
 * here is offered during a job: a print loads its own mesh at the start
 * (myrhino/bed_mesh.cfg), and changing it mid-print would move Z under the
 * nozzle.
 *
 * When a mesh was made: the Rhino records the time when Studio starts the
 * mesh (RHINO_MESH_CALIBRATE WHEN=). Meshes made at a print start, from the
 * console or in Mainsail have no time; for those Studio keeps the first time
 * it saw that exact mesh in Moonraker's database (key mesh_seen), shown as
 * "first seen".
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useMachineStore } from './machine'
import { useControlStore } from './control'
import { defaultName, fingerprint, meshForPrint, otherPending, profileNameProblem, readBedMesh, type Profile } from '@/bedmesh/mesh'

const SEEN_KEY = 'mesh_seen'
const MAX_SEEN = 200

export interface CalibrateOptions {
  name: string
  /** °C; 0 = cold bed */
  bed: number
  soakMin: number
  levelFirst: boolean
}

export const useBedMeshStore = defineStore('bedmesh', () => {
  const machine = useMachineStore()
  const control = useControlStore()

  const state = computed(() => readBedMesh(machine.status as never))
  const configured = computed(() => state.value.configured)
  const rhino = computed(() => state.value.rhino ?? { matchC: 5, coldC: 40, soakMin: 5 })
  const loadedProfile = computed<Profile | null>(() => state.value.profiles.find((p) => p.name === state.value.loaded) ?? null)

  // ---- first-seen times (Moonraker database) -----------------------------------
  const seen = ref<Record<string, number>>({})
  let seenLoaded = false
  async function loadSeen() {
    try {
      const v = await machine.getStudioSetting(SEEN_KEY)
      seen.value = v && typeof v === 'object' ? (v as Record<string, number>) : {}
      seenLoaded = true
    } catch {
      /* not connected yet: try again when meshes arrive */
    }
  }
  watch(
    () => [machine.online, state.value.profiles] as const,
    async ([online, profiles]) => {
      if (!online || !profiles.length) return
      if (!seenLoaded) await loadSeen()
      if (!seenLoaded) return
      const now = Math.floor(Date.now() / 1000)
      const next = { ...seen.value }
      let changed = false
      for (const p of profiles) {
        if (p.meta?.when) continue
        const fp = fingerprint(p.points)
        if (!(fp in next)) {
          next[fp] = now
          changed = true
        }
      }
      if (!changed) return
      const trimmed = Object.fromEntries(Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, MAX_SEEN))
      seen.value = trimmed
      machine.setStudioSetting(SEEN_KEY, trimmed).catch(() => {})
    },
    { immediate: true },
  )

  /** When a mesh was made (exact) or first seen by Studio. */
  function madeAt(p: Profile): { when: number; exact: boolean } | null {
    if (p.meta?.when) return { when: p.meta.when, exact: true }
    const t = seen.value[fingerprint(p.points)]
    return t ? { when: t, exact: false } : null
  }

  // ---- what can be done now ------------------------------------------------------
  const jobActive = computed(() => machine.job.state === 'printing' || machine.job.state === 'paused')
  const printHead = computed(() => machine.toolState.kind === 'mounted' && machine.toolState.type === 'DEPOSITION')
  const hasRhinoMacros = computed(() => machine.objects.has('gcode_macro RHINO_MESH_CALIBRATE'))

  /** Why nothing on the page can change the mesh right now (null = it can). */
  const changeBlock = computed<string | null>(() => {
    if (!machine.klippyReady) return 'Klipper is not ready'
    if (!configured.value) return 'Bed mesh is not set up'
    if (jobActive.value) return 'A job is running: a print loads its own mesh when it starts'
    if (machine.busy) return 'Klipper is busy'
    return null
  })
  /** Why a new mesh can't be made right now. */
  const calibrateBlock = computed<string | null>(() => {
    if (changeBlock.value) return changeBlock.value
    if (!hasRhinoMacros.value) return 'Needs Rhino Tool Manager 1.6.0 (RHINO_MESH_CALIBRATE)'
    if (machine.toolState.kind !== 'mounted') return 'Confirm which toolhead is mounted first'
    if (!printHead.value) return `The probe is on the print heads, and ${machine.mountedName ?? 'another tool'} is mounted. Swap to BlockOne or SwitchFly.`
    return null
  })

  /** Suggested bed temperature: the material's, else the bed's current target, else 60. */
  const suggestedBed = computed(() => {
    const sv = machine.status.save_variables?.variables as Record<string, unknown> | undefined
    const m = Number(sv?.set_material_bed_temp)
    if (Number.isFinite(m) && m >= 0) return Math.round(m)
    const t = machine.bed.target
    return t != null && t > 0 ? Math.round(t) : 60
  })

  /** The mesh a print at this bed temperature would load (the Rhino's rule). */
  const forPrint = (bed: number) => meshForPrint(state.value.profiles, bed, rhino.value.matchC, rhino.value.coldC)

  // ---- actions -----------------------------------------------------------------
  async function calibrate(o: CalibrateOptions): Promise<boolean> {
    const problem = profileNameProblem(o.name)
    if (problem) throw new Error(problem)
    if (calibrateBlock.value) throw new Error(calibrateBlock.value)
    const bed = Math.max(0, Math.min(130, Math.round(o.bed)))
    const soak = Math.max(0, Math.min(60, Math.round(o.soakMin)))
    const when = Math.floor(Date.now() / 1000)
    const exists = state.value.profiles.some((p) => p.name === o.name)
    const homed = machine.position.homed === 'xyz'
    const steps = [
      homed ? null : 'home all axes',
      bed > 0 ? `heat the bed to ${bed}°C${soak ? ` and let it soak ${soak} min` : ''}` : 'switch the bed off (cold mesh)',
      o.levelFirst ? 'level the gantry (Z_TILT_ADJUST)' : null,
      `probe the bed with ${machine.mountedName ?? 'the print head'}`,
    ].filter(Boolean)
    return control.send(`RHINO_MESH_CALIBRATE PROFILE=${o.name} BED=${bed} SOAK=${soak} TILT=${o.levelFirst ? 1 : 0} WHEN=${when}`, {
      label: `Make bed mesh ${o.name}`,
      confirmTitle: 'Make a bed mesh',
      confirmBody:
        `The Rhino will ${steps.join(', then ')}. The bed and head move and the bed heats. Clear the bed and keep a hand near Stop.` +
        (exists ? ` This replaces the mesh called ${o.name}.` : ''),
      confirmLabel: 'Make the mesh',
    })
  }

  async function load(name: string): Promise<boolean> {
    if (changeBlock.value) throw new Error(changeBlock.value)
    const spindle = machine.toolState.kind === 'mounted' && machine.toolState.type === 'CNC'
    return control.send(`BED_MESH_PROFILE LOAD=${name}`, {
      label: `Load bed mesh ${name}`,
      confirmTitle: `Use bed mesh ${name}`,
      confirmBody: spindle
        ? `The spindle is mounted: its Z zero is set on the material, so a bed mesh would change the cut depth. A spindle job won't start with a mesh loaded until SET_Z_ZERO is run again.`
        : 'Nothing moves now. From the next move, Z follows this mesh.',
      confirmLabel: 'Use it',
    })
  }

  async function clear(): Promise<boolean> {
    if (changeBlock.value) throw new Error(changeBlock.value)
    return control.send('BED_MESH_CLEAR', {
      label: 'Switch the bed mesh off',
      confirmTitle: 'Switch the bed mesh off',
      confirmBody: 'Nothing moves now. From the next move, Z no longer follows the bed. Saved meshes stay saved.',
      confirmLabel: 'Switch off',
    })
  }

  async function remove(name: string): Promise<boolean> {
    if (changeBlock.value) throw new Error(changeBlock.value)
    const ok = await control.confirm({
      title: `Remove bed mesh ${name}?`,
      body: hasRhinoMacros.value
        ? 'Klipper forgets it now, and Save takes it out of printer.cfg. Until you save, a restart brings it back.'
        : 'Klipper forgets it now, and Save takes it out of printer.cfg.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return false
    // RHINO_MESH_REMOVE also drops the Rhino's record of it; plain Klipper has only BED_MESH_PROFILE REMOVE
    return control.send(hasRhinoMacros.value ? `RHINO_MESH_REMOVE PROFILE=${name}` : `BED_MESH_PROFILE REMOVE=${name}`, { label: `Remove bed mesh ${name}` })
  }

  const unsavedMeshes = computed(() =>
    state.value.pendingSections.filter((s) => /^bed_mesh /.test(s)).map((s) => s.slice('bed_mesh '.length)),
  )
  const otherUnsaved = computed(() => otherPending(state.value.pendingSections))

  async function save(): Promise<boolean> {
    if (changeBlock.value) throw new Error(changeBlock.value)
    const others = otherUnsaved.value
    return control.send('SAVE_CONFIG', {
      label: 'Save to printer.cfg',
      confirmTitle: 'Save to printer.cfg and restart Klipper',
      confirmBody:
        'Klipper writes the meshes into printer.cfg (keeping a dated copy of the old file) and restarts. ' +
        'After the restart, confirm which toolhead is mounted.' +
        (others.length
          ? ` It also saves changes that are not bed meshes: ${others.join(', ')}. On the Rhino a probe z_offset shifts every print head at once: if you didn't mean to change it, don't save.`
          : ''),
      confirmLabel: 'Save and restart',
    })
  }

  return {
    state,
    configured,
    rhino,
    loadedProfile,
    madeAt,
    jobActive,
    printHead,
    hasRhinoMacros,
    changeBlock,
    calibrateBlock,
    suggestedBed,
    forPrint,
    unsavedMeshes,
    otherUnsaved,
    defaultName: (bed: number) => defaultName(bed, rhino.value.coldC),
    calibrate,
    load,
    clear,
    remove,
    save,
  }
})
