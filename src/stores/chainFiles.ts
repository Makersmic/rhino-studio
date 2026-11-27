/**
 * The job files the chain screen just built, kept in memory for the Run a chain wizard to send (it never starts them). Not stored
 * anywhere: a reload empties it, and the wizard then asks for the files to be built again if they are not on the Rhino.
 */
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const useChainFilesStore = defineStore('chainFiles', () => {
  /** chain id -> file name -> the file */
  const byChain = shallowRef<Record<string, Record<string, File>>>({})
  function keep(chainId: string, files: File[]) {
    byChain.value = { ...byChain.value, [chainId]: Object.fromEntries(files.map((f) => [f.name, f])) }
  }
  const forChain = (chainId: string): Record<string, File> => byChain.value[chainId] ?? {}
  return { keep, forChain }
})
