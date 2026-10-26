<script setup lang="ts">
/**
 * The tool library: every toolhead, built in and added, as the signature
 * tiles. Each opens the tool's own page. The list comes from the Rhino Portal
 * (the tool registry); without it, Klipper's tool_mapping (or the shipped
 * defaults) so the screen still says what's there.
 */
import { computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import ToolTile from '@/toolheads/ToolTile.vue'
import SectionRule from '@/components/SectionRule.vue'
import RsButton from '@/components/RsButton.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import { BUILT_IN_TOOLHEADS, lookFor } from '@/toolheads/registry'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useToolMgrStore } from '@/stores/toolmgr'

const machine = useMachineStore()
const care = useMaintenanceStore()
const tm = useToolMgrStore()
const router = useRouter()
onBeforeUnmount(tm.use())

interface Row { slot: number; name: string; type: string | null; caption: string; builtin: boolean }

const fromPortal = computed(() => tm.tools.length > 0)
const rows = computed<Row[]>(() => {
  if (fromPortal.value)
    return tm.tools.map((t) => ({
      slot: t.slot,
      name: t.name,
      type: t.type,
      builtin: t.builtin,
      caption: [t.kind, `${t.materials.length} material${t.materials.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
    }))
  const builtInNames = new Set(BUILT_IN_TOOLHEADS.map((t) => t.name))
  if (machine.knownTools.length)
    return machine.knownTools.map((t) => ({ slot: t.slot, name: t.name, type: t.type ?? null, builtin: builtInNames.has(t.name), caption: `Klipper type ${t.type ?? 'unknown'}` }))
  return BUILT_IN_TOOLHEADS.map((t) => ({ slot: t.defaultSlot!, name: t.name, type: t.type, builtin: true, caption: t.summary }))
})
const builtIn = computed(() => rows.value.filter((r) => r.builtin))
const added = computed(() => rows.value.filter((r) => !r.builtin))
const look = (r: Row) => lookFor(r.name, (r.type ?? undefined) as never)
const source = computed(() =>
  fromPortal.value
    ? 'From the tool registry in the Rhino Portal.'
    : tm.error
      ? `The Rhino Portal isn't answering (${tm.error}), so this is Klipper's list and nothing can be added or edited.`
      : 'Loading the tool registry…',
)
</script>

<template>
  <div class="view">
    <div class="view-head row">
      <div>
        <h1>Toolheads</h1>
        <p>{{ source }} Select a tool for its connector, materials, macros and care.</p>
      </div>
      <RsButton v-if="fromPortal" variant="primary" @click="router.push('/assets/toolheads/new')">Add a toolhead</RsButton>
    </div>

    <RestartBanner />

    <SectionRule label="Built in" />
    <div class="tiles">
      <ToolTile
        v-for="t in builtIn"
        :key="t.name"
        :look="look(t)"
        :slot="t.slot"
        :caption="t.caption"
        :mounted="machine.mountedName === t.name"
        :care="care.forTool(t.name)"
        :to="`/assets/toolheads/${encodeURIComponent(t.name)}`"
      />
    </div>

    <SectionRule label="Your toolheads" />
    <div class="tiles">
      <ToolTile
        v-for="t in added"
        :key="t.name"
        :look="look(t)"
        :slot="t.slot"
        :caption="t.caption"
        :mounted="machine.mountedName === t.name"
        :care="care.forTool(t.name)"
        :to="`/assets/toolheads/${encodeURIComponent(t.name)}`"
      />
      <RouterLink v-if="fromPortal" to="/assets/toolheads/new" class="add">
        <span class="plus" aria-hidden="true">+</span>
        <strong>Add a toolhead</strong>
        <span>Slot {{ tm.options?.next_slot ?? (added.length ? Math.max(...added.map((a) => a.slot)) + 1 : 6) }} and up: a print-head clone, a powered tool (hot wire, needle, dispenser) or a passive one (pen, probe)</span>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.view-head.row { display: flex; flex-direction: row; align-items: flex-end; justify-content: space-between; gap: var(--rs-space-4); flex-wrap: wrap; }
.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.add {
  display: flex; flex-direction: column; justify-content: center; gap: var(--rs-space-2); min-height: 260px;
  padding: var(--rs-space-5); border-radius: var(--rs-radius-lg); border: 1.5px dashed var(--rs-line-strong);
  color: var(--rs-text-muted); text-decoration: none; font-size: var(--rs-text-xs); line-height: 1.4;
  background: var(--rs-dither-faint);
}
.add strong { color: var(--rs-text-strong); font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); }
.add .plus { font-size: 2.4rem; line-height: 1; color: var(--rs-text-strong); }
.add:hover { border-color: var(--rs-ink); }
.add:hover strong { text-decoration: underline; text-underline-offset: 4px; }
</style>
