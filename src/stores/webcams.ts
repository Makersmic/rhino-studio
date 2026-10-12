/**
 * The camera list and which camera is showing.
 *
 * Fed by the Moonraker client (through the machine store). The chosen camera
 * is remembered per browser and shared by Control and the Dashboard, so
 * picking a camera on Control is what the Dashboard shows.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { normalizeWebcams, step, toPostItem, type Webcam, type WebcamForm } from '@/webcams/webcams'
import { useMachineStore } from './machine'

const KEY = 'rs.camera'

function loadChoice(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const useWebcamsStore = defineStore('webcams', () => {
  const all = ref<Webcam[]>([])
  /** false until Moonraker has answered once, so the UI can say "loading" vs "none". */
  const loaded = ref(false)
  const chosenUid = ref<string | null>(loadChoice())

  watch(chosenUid, (uid) => {
    try {
      if (uid) localStorage.setItem(KEY, uid)
    } catch {
      /* storage blocked */
    }
  })

  function setFromMoonraker(raw: unknown[]) {
    all.value = normalizeWebcams(raw)
    loaded.value = raw.length > 0 || useMachineStore().online
  }

  /** Cameras switched on, in Moonraker's order. */
  const cameras = computed(() => all.value.filter((c) => c.enabled))

  const index = computed(() => {
    const i = cameras.value.findIndex((c) => c.uid === chosenUid.value)
    return i < 0 ? 0 : i
  })
  const current = computed<Webcam | null>(() => cameras.value[index.value] ?? null)

  function show(dir: 1 | -1) {
    const next = cameras.value[step(index.value, cameras.value.length, dir)]
    if (next) chosenUid.value = next.uid
  }
  function choose(uid: string) {
    chosenUid.value = uid
  }

  /** Address the browser loads for a camera's stream or snapshot. */
  function url(path: string): string {
    return useMachineStore().webcamUrl(path)
  }

  // Edits change Moonraker's camera list (shared with Mainsail), never the machine.
  async function save(form: WebcamForm) {
    await useMachineStore().saveWebcam(toPostItem(form))
  }
  async function remove(uid: string) {
    await useMachineStore().deleteWebcam(uid)
  }

  return { all, cameras, loaded, index, current, show, choose, url, save, remove, setFromMoonraker }
})
