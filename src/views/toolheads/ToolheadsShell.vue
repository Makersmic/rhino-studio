<script setup lang="ts">
/**
 * Toolheads, with its own menu: the library (and each tool's page), how the
 * Rhino is wired (the tool connector, the board's pins and outputs, system
 * hardware), then Toolhead setup (what Add a toolhead offers), folded away
 * until you need it. Editing a tool and adding one open full width.
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
    { id: 'main', items: [{ to: '/toolheads', label: 'Library', count: tm.tools.length || '', match: /^\/toolheads\/(?!wiring\/|setup\/)[^/]+$/ }] },
    {
      id: 'wiring',
      label: 'Wiring',
      items: [
        { to: '/toolheads/wiring/connector', label: 'Tool connector', count: warn || '', strong: warn > 0 },
        { to: '/toolheads/wiring/pins', label: 'Board pins and outputs' },
        { to: '/toolheads/wiring/hardware', label: 'System hardware', count: p?.hardware.length || '' },
      ],
    },
    {
      id: 'setup',
      label: 'Toolhead setup',
      items: [
        { to: '/toolheads/setup/kinds', label: 'Kinds of tool' },
        { to: '/toolheads/setup/lists', label: 'Materials, nozzles, categories' },
      ],
    },
  ]
})
</script>

<template>
  <SectionLayout title="Toolheads" :groups="groups" storage-key="toolheads">
    <RouterView />
  </SectionLayout>
</template>
