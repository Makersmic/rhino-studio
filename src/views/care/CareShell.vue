<script setup lang="ts">
/**
 * Care, with its own menu: what needs doing (Overview), every task, the Task
 * Library, the work log and the meters, then Care setup (status codes and the
 * lists tasks choose from), folded away until you need it.
 */
import { computed } from 'vue'
import SectionLayout, { type SectionGroup } from '@/components/SectionLayout.vue'
import { useMaintenanceStore } from '@/stores/maintenance'

const care = useMaintenanceStore()
const groups = computed<SectionGroup[]>(() => {
  const c = care.counts
  const live = (care.overview?.tasks ?? []).filter((t) => !t.archived).length
  return [
    {
      id: 'main',
      items: [
        { to: '/care', label: 'Overview', count: c.overdue || c.due_soon, strong: c.overdue > 0 },
        { to: '/care/tasks', label: 'Tasks', count: live, match: /^\/care\/tasks\// },
        { to: '/care/library', label: 'Task Library', count: care.library?.books.length ?? '', match: /^\/care\/library\// },
        { to: '/care/log', label: 'Work log' },
        { to: '/care/meters', label: 'Usage meters' },
      ],
    },
    {
      id: 'setup',
      label: 'Care setup',
      items: [
        { to: '/care/setup/statuses', label: 'Status codes' },
        { to: '/care/setup/lists', label: 'Areas, kinds and priorities' },
      ],
    },
  ]
})
</script>

<template>
  <SectionLayout title="Care" :groups="groups" storage-key="care">
    <RouterView />
  </SectionLayout>
</template>
