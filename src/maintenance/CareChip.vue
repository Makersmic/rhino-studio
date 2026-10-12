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
  padding: 0 12px 0 9px;
  border-radius: var(--rs-radius-pill);
  background: var(--rs-paper);
  color: var(--rs-paper-ink);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  text-decoration: none;
  white-space: nowrap;
}
.care-chip.overdue {
  background: var(--rs-warn-fill);
  color: var(--th-ink);
  font-weight: var(--rs-weight-bold);
  box-shadow: 0 0 0 2px var(--rs-bg), 0 0 0 3.5px var(--rs-warn-fill);
}
</style>
