<script setup lang="ts">
import { computed } from 'vue'
import ToolTile from '@/toolheads/ToolTile.vue'
import SectionRule from '@/components/SectionRule.vue'
import { BUILT_IN_TOOLHEADS, lookFor } from '@/toolheads/registry'
import { useMachineStore } from '@/stores/machine'

const machine = useMachineStore()
const live = computed(() => machine.knownTools.length > 0)
const builtInNames = new Set(BUILT_IN_TOOLHEADS.map((t) => t.name))
const builtIn = computed(() =>
  live.value
    ? machine.knownTools.filter((t) => builtInNames.has(t.name))
    : BUILT_IN_TOOLHEADS.map((t) => ({ slot: t.defaultSlot!, name: t.name, type: t.type, look: t })),
)
const custom = computed(() => machine.knownTools.filter((t) => !builtInNames.has(t.name)))
const addLook = { ...lookFor('Add a toolhead', 'CUSTOM'), summary: 'Slot 6 and up, from the add-tool flow' }
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Toolheads</h1>
      <p>
        {{ live ? "Read from Klipper's tool_mapping." : 'Shipped defaults shown; connect to read the real list from Klipper.' }}
        Swapping, adding tools and maintenance move here from the Rhino Portal in Phase 5.
      </p>
    </div>

    <SectionRule label="Built in" />
    <div class="tiles">
      <ToolTile
        v-for="t in builtIn"
        :key="t.name"
        :look="t.look"
        :slot="t.slot"
        :caption="`Klipper type ${t.type ?? 'unknown'}`"
        :mounted="machine.mountedName === t.name"
      />
    </div>

    <SectionRule label="Your toolheads" />
    <div class="tiles">
      <ToolTile
        v-for="t in custom"
        :key="t.name"
        :look="t.look"
        :slot="t.slot"
        :caption="`Klipper type ${t.type ?? 'unknown'}`"
        :mounted="machine.mountedName === t.name"
      />
      <ToolTile :look="addLook" caption="Arrives in Phase 5" />
    </div>
  </div>
</template>

<style scoped>
.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
</style>
