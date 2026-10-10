<script setup lang="ts">
import WorkflowSteps from '@/components/WorkflowSteps.vue'
import EmptyState from '@/components/EmptyState.vue'
import SectionRule from '@/components/SectionRule.vue'
import Icon from '@/icons/Icon.vue'
import ToolTile from '@/toolheads/ToolTile.vue'
import { BUILT_IN_TOOLHEADS } from '@/toolheads/registry'

const processLabel = { fdm: 'Kiri:Moto FDM', laser: 'Kiri:Moto Laser', cnc: 'Kiri:Moto CAM', dragknife: 'Kiri:Moto Drag knife', other: 'Not set' } as const
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Prepare a job</h1>
      <p>Bring in a model or drawing, pick the toolhead, and turn it into G-code that runs through your Rhino macros.</p>
    </div>

    <WorkflowSteps />

    <EmptyState title="Drop a file here to start" phase="Phase 3">
      <template #art><Icon nav="prepare" :size="64" /></template>
      Import, slicing and toolpaths come from the Kiri:Moto engine, running in this browser so the Pi stays free for Klipper.
    </EmptyState>

    <SectionRule label="Toolheads" />
    <div class="tiles">
      <ToolTile
        v-for="t in BUILT_IN_TOOLHEADS"
        :key="t.name"
        :look="t"
        :slot="t.defaultSlot"
        :caption="processLabel[t.process]"
      />
    </div>
  </div>
</template>

<style scoped>
.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
</style>
