/**
 * Slice profiles and saved Prepare jobs, kept on the Rhino (Tool Manager 1.8).
 * The browser holds nothing durable: this store only mirrors the Portal and
 * sends changes back. Before 1.8 (no route) `available` is false and Prepare
 * works as before, for this session only.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useMaintenanceStore } from './maintenance'
import type { PrepareJob } from '@/slicer/types'
import {
  IMPORT_DONE_KEY, OLD_JOBS_KEY, planImport, type AnySettings, type ProfileDraft, type ProfileList, type SavedJob, type SliceProfile,
} from '@/slicer/sliceProfiles'

type Listed = ProfileList['profiles'][number]

export const useSliceProfilesStore = defineStore('sliceProfiles', () => {
  const portal = () => useMaintenanceStore().portal()

  /** null: not asked yet or no Portal; false: the Portal is older than 1.8 */
  const available = ref<boolean | null>(null)
  const profiles = ref<Listed[]>([])
  const deleted = ref<NonNullable<ProfileList['deleted']>>([])
  const jobs = ref<Record<string, SavedJob>>({})
  const error = ref<string | null>(null)
  const loading = ref(false)
  const online = computed(() => available.value === true && !error.value)

  async function load() {
    const c = portal()
    if (!c) return void (available.value = null)
    loading.value = true
    try {
      const l = await c.sliceProfiles(true)
      if (!l) return void (available.value = false)
      available.value = true
      profiles.value = l.profiles
      deleted.value = l.deleted ?? []
      error.value = l.ok ? null : l.error ?? 'The profiles file can’t be read'
      if (l.ok) jobs.value = await c.prepareJobs()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  const byId = (id: string | null | undefined) => profiles.value.find((p) => p.id === id) ?? null

  function upsert(p: SliceProfile) {
    const i = profiles.value.findIndex((x) => x.id === p.id)
    if (i >= 0) profiles.value.splice(i, 1, p)
    else profiles.value.push(p)
  }

  async function create(d: ProfileDraft): Promise<SliceProfile> {
    const p = await portal()!.createProfile(d)
    upsert(p)
    return p
  }
  /** Refused by the Portal if someone saved a newer revision meanwhile; reload then */
  async function save(id: string, d: ProfileDraft, rev: number): Promise<SliceProfile> {
    try {
      const p = await portal()!.saveProfile(id, d, rev)
      upsert(p)
      return p
    } catch (e) {
      if (/another device/.test((e as Error).message)) void load()
      throw e
    }
  }
  async function remove(id: string) {
    await portal()!.deleteProfile(id)
    await load()
  }
  async function undelete(id: string) {
    upsert(await portal()!.undeleteProfile(id))
    await load()
  }
  async function revert(id: string, to: number) {
    upsert(await portal()!.revertProfile(id, to))
  }
  const history = (id: string) => portal()!.profileHistory(id)
  const exportUrl = (id?: string) => portal()?.profilesExportUrl(id) ?? null
  async function importFile(data: object) {
    const added = await portal()!.importProfiles(data)
    await load()
    return added
  }

  // ---- saved jobs (debounced writes, one per key)
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  function saveJobSoon(key: string, job: SavedJob) {
    if (!online.value) return
    const prev = jobs.value[key]
    if (prev && JSON.stringify({ ...prev, saved: 0 }) === JSON.stringify({ ...job, saved: 0 })) return
    jobs.value[key] = job
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        portal()?.saveJob(key, job).catch((e: Error) => (error.value = `Couldn’t save the job on the Rhino: ${e.message}`))
      }, 1200),
    )
  }

  // ---- the one-time import of the browser's saved settings (rs.prepare.jobs)
  function oldJobs(): Record<string, PrepareJob> | null {
    try {
      if (localStorage.getItem(IMPORT_DONE_KEY)) return null
      const v = JSON.parse(localStorage.getItem(OLD_JOBS_KEY) ?? 'null') as Record<string, PrepareJob> | null
      return v && typeof v === 'object' && Object.keys(v).length ? v : null
    } catch {
      return null
    }
  }
  const importOffer = ref(oldJobs())
  function dismissImport() {
    try {
      localStorage.setItem(IMPORT_DONE_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
    importOffer.value = null
  }
  /** Profiles first, then jobs pointing at them; the browser's copy is removed only once the Rhino has it all */
  async function runImport(): Promise<number> {
    const old = importOffer.value
    const c = portal()
    if (!old || !c || !online.value) return 0
    const plan = planImport(old, new Date())
    const ids = new Map<string, SliceProfile>()
    for (const d of plan.profiles) {
      const { key, ...draft } = d
      ids.set(key, await create(draft))
    }
    for (const j of plan.jobs) {
      const p = ids.get(j.profileKey)!
      const job: SavedJob = { ...j.job, profileId: p.id, profileRev: p.rev }
      // the old jobs were kept per toolhead: they become that toolhead's last-used settings
      const key = `tool/${j.file}`
      jobs.value[key] = await c.saveJob(key, job)
    }
    try {
      localStorage.removeItem(OLD_JOBS_KEY)
    } catch {
      /* ignore */
    }
    dismissImport()
    return plan.profiles.length
  }

  return {
    available, online, profiles, deleted, jobs, error, loading, importOffer,
    load, byId, create, save, remove, undelete, revert, history, exportUrl, importFile, saveJobSoon, dismissImport, runImport,
  }
})

export type { AnySettings }
