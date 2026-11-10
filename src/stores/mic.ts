/**
 * The camera's microphone (src/webcams/mic.ts). Whether the sound is offered is shared by every screen (Moonraker's
 * database); listening and the volume are this screen's own. Sound starts only from a tap (browsers require it) and
 * stops when the page is left or hidden, so the Rhino's microphone service runs only while someone listens.
 */
import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { useMachineStore } from './machine'
import { MIC_KEY, MIC_PATH, listen, micSettingOf, volumeOf, type Listening } from '@/webcams/mic'

const VOL_KEY = 'rs.mic.volume'
function loadVolume(): number {
  try {
    return volumeOf(JSON.parse(localStorage.getItem(VOL_KEY) ?? 'null'))
  } catch {
    return 60
  }
}

export const useMicStore = defineStore('mic', () => {
  const offered = ref(false)
  const loaded = ref(false)
  const volume = ref(loadVolume())
  const state = ref<'off' | 'connecting' | 'on' | 'error'>('off')
  const error = ref<string | null>(null)
  const stream = shallowRef<MediaStream | null>(null)
  let live: Listening | null = null
  let tries = 0

  watch(volume, (v) => {
    try {
      localStorage.setItem(VOL_KEY, JSON.stringify(v))
    } catch {
      /* private window */
    }
  })

  async function load() {
    const m = useMachineStore()
    if (!m.online) return
    try {
      offered.value = micSettingOf(await m.getStudioSetting(MIC_KEY)).on
    } catch {
      offered.value = false
    }
    loaded.value = true
  }
  async function setOffered(on: boolean) {
    await useMachineStore().setStudioSetting(MIC_KEY, { on })
    offered.value = on
    if (!on) stop()
  }

  async function start() {
    stop()
    const mine = ++tries
    state.value = 'connecting'
    error.value = null
    try {
      const l = await listen(useMachineStore().webcamUrl(MIC_PATH))
      if (mine !== tries) return l.close()
      live = l
      stream.value = l.stream
      state.value = 'on'
    } catch (e) {
      if (mine !== tries) return
      error.value = (e as Error).message
      state.value = 'error'
    }
  }
  function stop() {
    tries++
    live?.close()
    live = null
    stream.value = null
    if (state.value !== 'error') state.value = 'off'
  }
  function clearError() {
    error.value = null
    if (state.value === 'error') state.value = 'off'
  }

  return { offered, loaded, volume, state, error, stream, load, setOffered, start, stop, clearError }
})
