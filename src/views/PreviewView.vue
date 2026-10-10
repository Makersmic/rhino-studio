<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/icons/Icon.vue'
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Preview</h1>
      <p>Step through every layer and move before anything reaches the machine.</p>
    </div>
    <EmptyState title="Nothing to preview yet" phase="Phase 6">
      <template #art><Icon nav="preview" :size="64" /></template>
      Prepare a job first. The preview will show print layers, laser passes, knife cuts and spindle toolpaths in one viewer, coloured by toolhead.
    </EmptyState>
  </div>
</template>
