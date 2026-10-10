<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/icons/Icon.vue'
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Files</h1>
      <p>G-code on the Pi, grouped by the toolhead each job needs.</p>
    </div>
    <EmptyState title="Connect to see files on the Pi" phase="Phase 2">
      <template #art><Icon nav="files" :size="64" /></template>
      The list comes from Moonraker's gcodes folder. Each file will show the toolhead from its header, so you can see at a glance what needs to be mounted.
    </EmptyState>
  </div>
</template>
