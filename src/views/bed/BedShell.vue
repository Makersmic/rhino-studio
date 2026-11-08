<script setup lang="ts">
/** Bed (was Bed mesh; Mike, Nov 8 2026): Bed mesh, and Configuration (the Z lead screws). */
import SectionLayout, { type SectionGroup } from '@/components/SectionLayout.vue'

const groups: SectionGroup[] = [
  {
    id: 'main',
    items: [
      { to: '/bed/mesh', label: 'Bed mesh' },
      { to: '/bed/config', label: 'Configuration' },
    ],
  },
]
</script>

<template>
  <SectionLayout title="Bed" :groups="groups" storage-key="bed">
    <RouterView />
  </SectionLayout>
</template>
