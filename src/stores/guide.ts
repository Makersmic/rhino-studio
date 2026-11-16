/**
 * Care guide progress (Mike, Nov 15): where you are in each guide, kept in memory for this browser session so you can
 * leave to type a command in Control's console (or look something up) and come back to the same step. It is lost
 * when the page is reloaded; nothing is saved to the machine or to browser storage. Machine state stays Klipper's:
 * the guides re-read every gate from Klipper on every screen.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface GuideProgress {
  phase: 'before' | 'steps' | 'log' | 'done'
  at: number
  answers: Record<string, string>
  ran: string[]
  tried: string[]
  notes: string
  /** when a wait ends (epoch ms), 0 when none, so a countdown keeps running while you are away */
  waitUntil: number
  waitLabel: string
}

export const useGuideStore = defineStore('careGuide', () => {
  const byTask = ref<Record<string, GuideProgress>>({})
  const get = (id: string): GuideProgress | null => byTask.value[id] ?? null
  function set(id: string, p: GuideProgress) {
    byTask.value = { ...byTask.value, [id]: p }
  }
  function clear(id: string) {
    const { [id]: _gone, ...rest } = byTask.value
    byTask.value = rest
  }
  return { byTask, get, set, clear }
})
