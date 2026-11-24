<script setup lang="ts">
/**
 * Wizards, with its own menu like Care and Settings: Overview, then the wizards in their groups. The list is src/wizards/wizards.ts.
 * Each page gets its title and one line about it from the route.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SectionLayout, { type SectionGroup } from '@/components/SectionLayout.vue'
import { GROUPS, WIZARDS } from '@/wizards/wizards'

const route = useRoute()
const groups = computed<SectionGroup[]>(() => [
  { id: 'main', items: [{ to: '/wizards', label: 'Overview' }] },
  ...GROUPS.map((g) => ({ id: g.id, label: g.label, items: WIZARDS.filter((w) => w.group === g.id).map((w) => ({ to: w.path, label: w.title })) })),
])
const title = computed(() => (route.meta.heading as string | undefined) ?? (route.meta.title as string | undefined) ?? 'Wizards')
const lead = computed(() => route.meta.lead as string | undefined)
</script>

<template>
  <SectionLayout title="Wizards" :groups="groups" storage-key="wizards">
    <div class="view">
      <div class="view-head">
        <h1>{{ title }}</h1>
        <p v-if="lead">{{ lead }}</p>
      </div>
      <RouterView />
    </div>
  </SectionLayout>
</template>
