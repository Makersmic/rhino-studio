<script setup lang="ts">
/** Heater targets. The hotend shows only when a print head is mounted. */
import { computed, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'

const control = useControlStore()
const machine = useMachineStore()
const hotendTarget = ref<number | null>(null)
const bedTarget = ref<number | null>(null)

const printHead = computed(() => machine.toolState.kind === 'mounted' && machine.toolState.type === 'DEPOSITION')
const t = (n: number | null) => (n == null ? '—' : `${n.toFixed(0)}°`)
const busy = computed(() => !machine.klippyReady)
</script>

<template>
  <RsPanel title="Heat" index="03">
    <div class="rows">
      <form v-if="printHead" class="heater" @submit.prevent="hotendTarget != null && control.setHeater('extruder', hotendTarget)">
        <span class="name">Hotend</span>
        <span class="now">{{ t(machine.hotend.temp) }} <small>→ {{ machine.hotend.target ? t(machine.hotend.target) : 'off' }}</small></span>
        <input v-model.number="hotendTarget" type="number" min="0" max="300" step="5" inputmode="numeric" placeholder="°C" aria-label="Hotend target" />
        <RsButton type="submit" :disabled="busy || hotendTarget == null">Set</RsButton>
        <RsButton variant="quiet" :disabled="busy || !machine.hotend.target" @click="control.setHeater('extruder', 0)">Off</RsButton>
      </form>
      <p v-else class="muted small">Hotend controls show when a print head is mounted and confirmed.</p>

      <form class="heater" @submit.prevent="bedTarget != null && control.setHeater('heater_bed', bedTarget)">
        <span class="name">Bed</span>
        <span class="now">{{ t(machine.bed.temp) }} <small>→ {{ machine.bed.target ? t(machine.bed.target) : 'off' }}</small></span>
        <input v-model.number="bedTarget" type="number" min="0" max="130" step="5" inputmode="numeric" placeholder="°C" aria-label="Bed target" />
        <RsButton type="submit" :disabled="busy || bedTarget == null">Set</RsButton>
        <RsButton variant="quiet" :disabled="busy || !machine.bed.target" @click="control.setHeater('heater_bed', 0)">Off</RsButton>
      </form>
    </div>
    <p v-if="printHead && control.macros.has('PREHEAT')" class="muted small">For a job, use Preheat in the macro buttons: it follows your material rules.</p>
  </RsPanel>
</template>

<style scoped>
.rows { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.heater { display: grid; grid-template-columns: 70px 1fr 90px auto auto; align-items: center; gap: var(--rs-space-2); }
.name { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.now { font-size: var(--rs-text-lg); color: var(--rs-text-strong); font-weight: var(--rs-weight-light); }
.now small { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
input { height: 42px; width: 100%; padding: 0 var(--rs-space-3); border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); background: var(--rs-bg); color: var(--rs-text-strong); }
.small { font-size: var(--rs-text-sm); margin-top: var(--rs-space-3); }
@media (max-width: 560px) { .heater { grid-template-columns: 1fr auto auto; } .heater .now { grid-column: 2 / -1; text-align: right; } }
</style>
