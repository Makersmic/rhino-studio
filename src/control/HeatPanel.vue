<script setup lang="ts">
/** Heater targets, as a small table. The hotend row only works with a print head mounted. */
import { computed, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'

const control = useControlStore()
const machine = useMachineStore()
const targets = ref<Record<string, number | null>>({ extruder: null, heater_bed: null })

const printHead = computed(() => machine.toolState.kind === 'mounted' && machine.toolState.type === 'DEPOSITION')
const rows = computed(() => [
  { id: 'extruder' as const, name: 'Hotend', now: machine.hotend.temp, target: machine.hotend.target, max: 300, enabled: printHead.value },
  { id: 'heater_bed' as const, name: 'Bed', now: machine.bed.temp, target: machine.bed.target, max: 130, enabled: true },
])
const t = (n: number | null) => (n == null ? '—' : n.toFixed(0))
const anyOn = computed(() => (machine.hotend.target ?? 0) > 0 || (machine.bed.target ?? 0) > 0)

function set(id: 'extruder' | 'heater_bed') {
  const v = targets.value[id]
  if (v != null) void control.setHeater(id, v)
}
</script>

<template>
  <RsPanel title="Temperatures" :status="anyOn ? 'Heating' : 'Off'">
    <table class="heat">
      <thead>
        <tr><th scope="col">Heater</th><th scope="col">Now</th><th scope="col">Target</th><th scope="col"><span class="visually-hidden">Set</span></th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :class="{ off: !r.enabled }">
          <th scope="row">{{ r.name }}</th>
          <td class="rs-num now" :class="{ empty: r.now == null }">{{ t(r.now) }}<small v-if="r.now != null">°</small></td>
          <td class="target">{{ r.target ? `${t(r.target)}°` : 'off' }}</td>
          <td>
            <form v-if="r.enabled" class="set" @submit.prevent="set(r.id)">
              <input v-model.number="targets[r.id]" type="number" min="0" :max="r.max" step="5" inputmode="numeric" placeholder="°C" :aria-label="`${r.name} target`" />
              <RsButton size="sm" type="submit" :disabled="!machine.klippyReady || targets[r.id] == null">Set</RsButton>
              <RsButton size="sm" variant="quiet" :disabled="!machine.klippyReady || !r.target" @click="control.setHeater(r.id, 0)">Off</RsButton>
            </form>
            <span v-else class="why">Print head only</span>
          </td>
        </tr>
      </tbody>
    </table>
  </RsPanel>
</template>

<style scoped>
.heat { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 0; vertical-align: middle; }
thead th { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding-top: 0; }
tbody tr + tr th, tbody tr + tr td { background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 0 / 5px 2px repeat-x; }
tbody th { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); width: 26%; }
.now { font-size: 1.9rem; width: 22%; }
.now small { font-family: var(--rs-font-ui); font-weight: var(--rs-weight-medium); font-size: 0.5em; color: var(--rs-text-muted); vertical-align: top; margin-left: 2px; }
.target { color: var(--rs-text-muted); font-size: var(--rs-text-sm); width: 16%; }
.set { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
input { width: 72px; height: 32px; padding: 0 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface-2); color: var(--rs-text-strong); font-family: var(--rs-font-code); }
.off .now, .off th { color: var(--rs-text-muted); }
.why { display: block; text-align: right; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
</style>
