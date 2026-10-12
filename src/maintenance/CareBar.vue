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
  height: 6px;
  border-radius: var(--rs-radius-pill);
  background: color-mix(in srgb, currentColor 16%, transparent);
  overflow: hidden;
}
.fill { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: currentColor; opacity: 0.55; }
.due_soon .fill { background: var(--rs-warn-fill); opacity: 1; }
.overdue .fill {
  background: repeating-linear-gradient(135deg, var(--rs-warn-fill) 0 5px, color-mix(in srgb, var(--rs-warn-fill) 45%, transparent) 5px 9px);
  opacity: 1;
}
.held .fill { opacity: 0.3; }
</style>
