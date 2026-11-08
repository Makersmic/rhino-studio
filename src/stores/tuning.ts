/**
 * Print head tuning results from the Portal (Tool Manager 1.9.16). The sums are in src/tuning/tuning.ts; Job setup
 * reads what a job should use when it makes a file, and the tuning wizards save here.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TuningState, TuningTest } from '@/tuning/tuning'
import { useToolMgrStore } from './toolmgr'

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
    return state.value
  }
  async function clear(body: { tool: string; test: TuningTest; nozzle?: number; material?: string }) {
    const cur = state.value ?? (await load())
    state.value = { ...(await tm.client().clearTuning({ rev: cur?.rev ?? 0, ...body })), ok: true }
  }
  return { state, supported, error, load, save, clear }
})
