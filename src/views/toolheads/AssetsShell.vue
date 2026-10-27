<script setup lang="ts">
/**
 * Assets, with its own menu (Mike, Oct 26):
 *   Toolheads  Library (and each tool's page), Tool connector, Kinds of tool
 *   Hardware   System hardware, Board pins and outputs, Job hooks
 *   Parts      Materials, Nozzles, Categories
 * Adding or editing a tool and Add hardware open full width. Old /toolheads/... addresses redirect here (router.ts).
 */
import { computed, onBeforeUnmount } from 'vue'
import SectionLayout, { type SectionGroup } from '@/components/SectionLayout.vue'
import { useToolMgrStore } from '@/stores/toolmgr'

const tm = useToolMgrStore()
onBeforeUnmount(tm.use())

const groups = computed<SectionGroup[]>(() => {
  const p = tm.pins
  const warn = (p?.contacts ?? []).filter((c) => c.warning).length + (p?.missing_includes.length ?? 0)
  return [
    {
      id: 'toolheads',
      label: 'Toolheads',
      items: [
        { to: '/assets/toolheads', label: 'Library', count: tm.tools.length || '', match: /^\/assets\/toolheads\/[^/]+$/ },
        { to: '/assets/connector', label: 'Tool connector', count: warn || '', strong: warn > 0 },
        { to: '/assets/kinds', label: 'Kinds of tool' },
      ],
    },
    {
      id: 'hardware',
      label: 'Hardware',
      items: [
        { to: '/assets/hardware', label: 'System hardware', count: p?.hardware.length || '' },
        { to: '/assets/pins', label: 'Board pins and outputs' },
        { to: '/assets/hooks', label: 'Job hooks' },
      ],
    },
    {
      id: 'parts',
      label: 'Parts',
      items: [
        { to: '/assets/materials', label: 'Materials' },
        { to: '/assets/nozzles', label: 'Nozzles' },
        { to: '/assets/categories', label: 'Categories' },
      ],
    },
  ]
})
</script>

<template>
  <SectionLayout title="Assets" :groups="groups" storage-key="assets">
    <RouterView />
  </SectionLayout>
</template>
