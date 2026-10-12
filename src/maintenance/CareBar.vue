<script setup lang="ts">
/**
 * How far a task is through its interval. Due soon fills mustard; overdue is
 * full and hatched, so the state reads without relying on colour. Red stays
 * reserved for stopping the machine.
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ fraction: number; level?: 'overdue' | 'due_soon' | 'ok' | 'held' | 'none' | string; label?: string }>(), {
  level: 'ok',
  label: undefined,
})
const pct = computed(() => Math.round(Math.min(1, Math.max(0, props.fraction)) * 100))
</script>

<template>
  <span
    class="bar"
    :class="level"
    role="meter"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="pct"
    :aria-label="label ?? 'Interval used'"
  >
    <span class="fill" :style="{ width: `${level === 'overdue' ? 100 : pct}%` }" />
  </span>
</template>

<style scoped>
.bar {
  display: block;
  position: relative;
  height: 8px;
  border-radius: 2px;
  background: var(--rs-dither-faint);
  box-shadow: inset 0 0 0 1px var(--rs-line);
  overflow: hidden;
}
.fill { position: absolute; inset: 0 auto 0 0; background: var(--rs-dither); }
.due_soon .fill { background: var(--rs-dither-dense); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.overdue .fill { background: var(--rs-ink); }
.held .fill { background: var(--rs-dither-faint); }
</style>
