/**
 * Print head tuning results from the Portal (Tool Manager 1.9.16). The sums are in src/tuning/tuning.ts; Job setup
 * reads what a job should use when it makes a file, and the tuning wizards save here.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { storeScript, unstoreScript, type TuningState, type TuningTest } from '@/tuning/tuning'
import { useToolMgrStore } from './toolmgr'
import { useControlStore } from './control'

export const useTuningStore = defineStore('tuning', () => {
  const tm = useToolMgrStore()
  const state = ref<TuningState | null>(null)
  /** false on a Tool Manager before 1.9.16 */
  const supported = ref(true)
  const error = ref<string | null>(null)

  async function load(): Promise<TuningState | null> {
    try {
      const s = await tm.client().tuningState()
      supported.value = !!s
      state.value = s
      error.value = s && !s.ok ? (s.error ?? 'The tuning file can’t be read') : null
    } catch (e) {
      error.value = (e as Error).message
    }
    return state.value
  }
  async function save(body: { tool: string; test: TuningTest; value: number; nozzle?: number; material?: string }): Promise<TuningState> {
    const cur = state.value ?? (await load())
    const s = await tm.client().saveTuning({ rev: cur?.rev ?? 0, ...body })
    state.value = { ...s, ok: true }
    // then what Klipper applies at job start (Tool Manager 1.9.17): one SAVE_VARIABLE, plain (it doesn't ask)
    const line = storeScript(body.test, body.tool, body.value, body.nozzle, body.material)
    if (line && !(await useControlStore().send(line, { label: `Store ${body.test.replace(/_/g, ' ')} for ${body.tool} on the Rhino` })))
      throw new Error('Saved in Studio, but Klipper didn’t store it, so jobs won’t use it yet. Use “Store on the Rhino” on the Tune page.')
    return state.value
  }
  async function clear(body: { tool: string; test: TuningTest; nozzle?: number; material?: string }) {
    const cur = state.value ?? (await load())
    state.value = { ...(await tm.client().clearTuning({ rev: cur?.rev ?? 0, ...body })), ok: true }
    const line = unstoreScript(body.test, body.tool, body.nozzle, body.material)
    if (line) await useControlStore().send(line, { label: `Forget ${body.test.replace(/_/g, ' ')} for ${body.tool}` })
  }
  return { state, supported, error, load, save, clear }
})
