<script setup lang="ts">
/** Top bar indicator: what's due, one tap from the Care screen. */
import { computed } from 'vue'
import Icon from '@/icons/Icon.vue'
import { useMaintenanceStore } from '@/stores/maintenance'

const care = useMaintenanceStore()
const text = computed(() => {
  const c = care.counts
  if (c.overdue) return `${c.overdue} overdue`
  if (c.due_soon) return `${c.due_soon} due`
  return ''
})
const title = computed(() => {
  if (care.source === 'unavailable') return `Maintenance unavailable: ${care.error ?? ''}`
  const c = care.counts
  return `Maintenance: ${c.overdue} overdue, ${c.due_soon} due soon`
})
</script>

<template>
  <RouterLink
    v-if="care.source === 'ready' && text"
    to="/care"
    class="care-chip"
    :class="{ overdue: care.counts.overdue > 0 }"
    :title="title"
  >
    <Icon nav="care" :size="18" />
    <span>{{ text }}</span>
  </RouterLink>
</template>

<style scoped>
.care-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px 0 8px;
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong);
  background: var(--rs-surface);
  color: var(--rs-text-strong);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  text-decoration: none;
  white-space: nowrap;
}
/* overdue: a stronger outline and a solid mark, not a solid block (Stop stays the loudest thing up here) */
.care-chip.overdue { border-width: 1.5px; border-color: var(--rs-ink); }
.care-chip.overdue::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--rs-ink); order: -1; }
</style>
