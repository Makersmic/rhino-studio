<script setup lang="ts">
/**
 * Job setup › CNC: the bit, from the Rhino's list (Assets › Parts › Bits, Tool Manager 1.9.26). Picking one fills the
 * tool type, diameter and cutting length, then what's tuned for that bit on this material (prepare store pickBit).
 * "Typed below" keeps the fields as they are, for a bit that isn't in the list.
 */
import { computed, onMounted } from 'vue'
import { usePrepareStore } from '@/stores/prepare'
import { useToolMgrStore } from '@/stores/toolmgr'

const prep = usePrepareStore()
const tm = useToolMgrStore()
onMounted(() => { if (!tm.lists) void tm.loadLists().catch(() => {}) })
const bits = computed(() => tm.lists?.bits ?? [])
const value = computed(() => prep.job?.cnc.bit ?? '')
</script>

<template>
  <div v-if="prep.job" class="field">
    <label for="prep-bit">Bit</label>
    <select id="prep-bit" :value="value" @change="prep.pickBit(($event.target as HTMLSelectElement).value, bits)">
      <option value="">Typed below</option>
      <option v-for="b in bits" :key="b.name" :value="b.name">{{ b.name }} · {{ b.diameter }} mm</option>
    </select>
  </div>
</template>

<style scoped>
/* the same as Job setup's own fields (PrepareView.vue), which don't reach into this component */
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
select { height: 38px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
</style>
