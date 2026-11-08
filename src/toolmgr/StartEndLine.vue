<script setup lang="ts">
/** Job setup: which start and end G-code this toolhead's jobs run (set on the tool's page; read-only here). */
import { onMounted, ref, watch } from 'vue'
import type { HooksState } from '@/hardware/hooks'
import { useToolMgrStore } from '@/stores/toolmgr'

const props = defineProps<{ tool: string }>()
const tm = useToolMgrStore()
const state = ref<HooksState | null>(null)
async function load() {
  try {
    state.value = await tm.client().hooksState()
  } catch {
    state.value = null // an older Tool Manager, or the Portal not reachable: say nothing
  }
}
onMounted(load)
watch(() => props.tool, load)
const what = (slot: 'after_start' | 'before_end') => {
  const lines = state.value?.hooks[`tool:${props.tool}`]?.[slot] ?? []
  if (!lines.length) return 'none'
  return state.value?.sources?.[`tool:${props.tool}`]?.[slot]?.name ?? `${lines.length} line${lines.length === 1 ? '' : 's'} from Job hooks`
}
</script>

<template>
  <p v-if="state" class="se-line">
    Start G-code: <strong>{{ what('after_start') }}</strong> · End G-code: <strong>{{ what('before_end') }}</strong> ·
    <RouterLink :to="`/assets/toolheads/${encodeURIComponent(tool)}`">change on {{ tool }}’s page</RouterLink>
  </p>
</template>

<style scoped>
.se-line { margin: var(--rs-space-2) 0 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.se-line strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
</style>
