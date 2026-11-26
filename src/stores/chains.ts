/**
 * Process chains (Tool Manager 1.9.52): the saved chains from the Portal. The model is in src/chain/chain.ts; this store only
 * lists, saves (with the revision an edit started from) and deletes. Nothing here reaches Klipper.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Chain, SavedChain } from '@/chain/chain'
import { useToolMgrStore } from './toolmgr'

export const useChainsStore = defineStore('chains', () => {
  const tm = useToolMgrStore()
  const list = ref<SavedChain[]>([])
  const error = ref<string | null>(null)
  /** false on a Tool Manager before 1.9.52 */
  const supported = ref(true)
  const loaded = ref(false)

  async function load() {
    try {
      const r = await tm.client().chains()
      if (!r) {
        supported.value = false
        list.value = []
      } else {
        supported.value = true
        list.value = r.chains
        error.value = r.ok ? null : (r.error ?? 'The chains file can’t be read')
      }
    } catch (e) {
      error.value = (e as Error).message
    }
    loaded.value = true
  }

  /** id null = a new chain; otherwise rev is the revision the edit started from */
  async function save(id: string | null, draft: Chain, rev: number): Promise<SavedChain> {
    const saved = id ? await tm.client().saveChain(id, draft, rev) : await tm.client().createChain(draft)
    await load()
    return saved
  }
  async function remove(id: string) {
    await tm.client().deleteChain(id)
    await load()
  }

  return { list, error, supported, loaded, load, save, remove }
})
