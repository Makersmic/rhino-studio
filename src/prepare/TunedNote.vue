<script setup lang="ts">
/**
 * Under a laser or drag knife job's settings: what's tuned for this tool and material (cutTests.ts tunedFor), a way
 * back to those values after editing, or where to tune when nothing is.
 */
import { computed } from 'vue'
import { usePrepareStore } from '@/stores/prepare'
import { tunedText } from '@/tuning/cutTests'

const prep = usePrepareStore()
const j = computed(() => prep.job)
const matName = computed(() => prep.materials.list.find((m) => m.key === j.value?.material)?.name ?? j.value?.material ?? '')
const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const tuneLink = computed(() => `#/assets/toolheads/${encodeURIComponent(j.value?.toolhead ?? '')}/tune`)
</script>

<template>
  <p v-if="j && prep.tuned" class="tuned wide">
    <span>Tuned for {{ matName }} on {{ date(prep.tuned.time) }}: {{ tunedText(j.process, prep.tuned) }}.</span>
    <button v-if="prep.tunedOff.length" type="button" class="link" @click="prep.useTuned()">Use tuned values</button>
    <span v-else class="muted">In use.</span>
  </p>
  <p v-else-if="j" class="tuned wide muted">
    Not tuned for {{ matName }} yet. <a :href="tuneLink">Tune {{ j.toolhead }}</a> to start from tested values.
  </p>
</template>

<style scoped>
.tuned { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; font-size: var(--rs-text-xs); color: var(--rs-text); }
.muted { color: var(--rs-text-muted); }
.link { padding: 0; border: 0; background: none; color: var(--rs-text-strong); font: inherit; text-decoration: underline; cursor: pointer; }
a { color: var(--rs-text-strong); }
.wide { grid-column: 1 / -1; }
</style>
