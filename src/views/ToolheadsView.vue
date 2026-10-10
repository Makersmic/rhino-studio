<script setup lang="ts">
import ToolTile from '@/toolheads/ToolTile.vue'
import SectionRule from '@/components/SectionRule.vue'
import { BUILT_IN_TOOLHEADS, lookFor } from '@/toolheads/registry'

const addLook = { ...lookFor('Add a toolhead', 'CUSTOM'), summary: 'Slot 6 and up, from the add-tool flow' }
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Toolheads</h1>
      <p>Everything the Rhino Portal does today (swap, add a tool, maintenance) moves here in Phase 5.</p>
    </div>

    <SectionRule label="Built in" />
    <div class="tiles">
      <ToolTile v-for="t in BUILT_IN_TOOLHEADS" :key="t.name" :look="t" :slot="t.defaultSlot" :caption="`Klipper type ${t.type}`" />
    </div>

    <SectionRule label="Your toolheads" />
    <div class="tiles">
      <ToolTile :look="addLook" caption="Arrives in Phase 5" />
    </div>
    <p class="muted note">Slots shown are the shipped defaults. Once connected, slots and user-added tools come from Klipper's tool_mapping.</p>
  </div>
</template>

<style scoped>
.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.note { font-size: var(--rs-text-sm); padding: 0 var(--rs-space-1); }
</style>
