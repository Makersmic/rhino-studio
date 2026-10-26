<script setup lang="ts">
/**
 * Settings, with its own menu like Care:
 *   Appearance
 *   Machine   Connection, Trusted addresses, Tool changing, Cameras, Slice profiles
 *   System    Software (with the number of updates ready), Network, Host, Logs
 *   About
 * Each page gets its title and one line about it from the route.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SectionLayout, { type SectionGroup } from '@/components/SectionLayout.vue'
import { useUpdatesStore } from '@/stores/updates'
import { useNetworkStore } from '@/stores/network'

const route = useRoute()
const updates = useUpdatesStore()
const net = useNetworkStore()

const groups = computed<SectionGroup[]>(() => [
  { id: 'main', items: [{ to: '/settings', label: 'Appearance' }] },
  {
    id: 'machine',
    label: 'Machine',
    items: [
      { to: '/settings/connection', label: 'Connection' },
      { to: '/settings/trust', label: 'Trusted addresses' },
      { to: '/settings/tools', label: 'Tool changing' },
      { to: '/settings/cameras', label: 'Cameras' },
      { to: '/settings/profiles', label: 'Slice profiles' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { to: '/settings/software', label: 'Software', count: updates.readyCount, strong: updates.readyCount > 0 },
      { to: '/settings/network', label: 'Network', count: net.pending ? '!' : '', strong: !!net.pending },
      { to: '/settings/host', label: 'Host' },
      { to: '/settings/logs', label: 'Logs' },
    ],
  },
  { id: 'about', items: [{ to: '/settings/about', label: 'About' }] },
])
const title = computed(() => (route.meta.heading as string | undefined) ?? (route.meta.title as string | undefined) ?? 'Settings')
const lead = computed(() => route.meta.lead as string | undefined)
</script>

<template>
  <SectionLayout title="Settings" :groups="groups" storage-key="settings">
    <div class="view">
      <div class="view-head">
        <h1>{{ title }}</h1>
        <p v-if="lead">{{ lead }}</p>
      </div>
      <RouterView />
    </div>
  </SectionLayout>
</template>
