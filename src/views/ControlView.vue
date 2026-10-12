<script setup lang="ts">
/**
 * Control: live status and everything that drives the machine.
 * Every command here goes through the control store's safety check.
 */
import { computed } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import Readout from '@/components/Readout.vue'
import Icon from '@/icons/Icon.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import MotionPanel from '@/control/MotionPanel.vue'
import HeatPanel from '@/control/HeatPanel.vue'
import JobPanel from '@/control/JobPanel.vue'
import ConsolePanel from '@/control/ConsolePanel.vue'
import MacroPanel from '@/control/MacroPanel.vue'
import CareTaskCard from '@/maintenance/CareTaskCard.vue'
import { careText } from '@/maintenance/summary'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'

const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()

const f0 = (n: number | null) => (n == null ? null : n.toFixed(0))
const f1 = (n: number | undefined) => (n == null ? '—' : n.toFixed(1))
const heaterDetail = (t: number | null) => (t == null ? 'Waiting for Klipper' : t > 0 ? `Target ${t.toFixed(0)}°` : 'Off')
const pos = computed(() => machine.position.xyz)
const posNote = computed(() => (pos.value ? `X ${f1(pos.value[0])}  Y ${f1(pos.value[1])}` : undefined))
const posDetail = computed(() => (!pos.value ? 'Waiting for Klipper' : machine.position.homed ? `Homed ${machine.position.homed.toUpperCase()}` : 'Not homed'))
const jobValue = computed(() => {
  const j = machine.job
  return (j.state === 'printing' || j.state === 'paused') && j.progress != null ? `${Math.round(j.progress * 100)}` : null
})
const jobDetail = computed(() => {
  const j = machine.job
  if (!j.state) return 'Waiting for Klipper'
  const label: Record<string, string> = { standby: 'Idle', printing: 'Running', paused: 'Paused', complete: 'Finished', cancelled: 'Cancelled', error: 'Error' }
  return label[j.state] ?? j.state
})

const careNow = computed(() => {
  const tool = machine.mountedName ? `tool:${machine.mountedName}` : null
  return care.due.filter((t) => t.asset === tool).slice(0, 2)
})
</script>

<template>
  <div class="view">
    <div class="view-head head">
      <div>
        <h1>Control</h1>
        <p>Drive the Rhino: move, heat, run macros and jobs. Anything that moves the machine or powers a tool asks first.</p>
      </div>
      <RouterLink to="/pendant" class="pendant-link"><Icon nav="pendant" :size="20" />Pendant mode</RouterLink>
    </div>

    <div class="readouts">
      <Readout label="Hotend" :value="f0(machine.hotend.temp)" unit="°" :detail="heaterDetail(machine.hotend.target)" />
      <Readout label="Bed" :value="f0(machine.bed.temp)" unit="°" :detail="heaterDetail(machine.bed.target)" />
      <Readout label="Z" :value="pos ? f1(pos[2]) : null" unit="mm" :note="posNote" :detail="posDetail" />
      <Readout label="Job" :value="jobValue" unit="%" :detail="jobDetail" />
    </div>

    <div class="layout">
      <div class="col">
        <MotionPanel />
        <HeatPanel />
      </div>
      <div class="col">
        <JobPanel />
        <RsPanel title="Toolhead" index="04">
          <div class="stack">
            <ToolheadBadge :look="machine.mountedLook" :slot="machine.mountedSlot" :verified="machine.mountedVerified" size="lg" />
            <p class="muted">{{ machine.toolStateText }}</p>
            <div class="row">
              <RsButton
                v-if="control.macros.has('SWAP_TOOL')"
                :disabled="!machine.klippyReady || control.jobActive"
                @click="control.send('SWAP_TOOL', { label: 'Swap toolhead' })"
              >Swap toolhead</RsButton>
              <RsButton
                v-if="machine.toolState.kind === 'none-confirmed' && control.macros.has('RESTORE_TOOL')"
                variant="primary"
                @click="control.send('RESTORE_TOOL', { label: 'Confirm mounted tool' })"
              >Confirm mounted tool</RsButton>
            </div>
            <template v-if="care.mountedCare">
              <p class="care">Care: {{ careText(care.mountedCare) }}</p>
              <CareTaskCard v-for="t in careNow" :key="t.id" :task="t" compact />
            </template>
          </div>
        </RsPanel>
        <MacroPanel />
      </div>
    </div>

    <ConsolePanel />
  </div>
</template>

<style scoped>
.head { flex-direction: row; justify-content: space-between; align-items: flex-end; gap: var(--rs-space-4); flex-wrap: wrap; }
.head > div { display: flex; flex-direction: column; gap: var(--rs-space-2); }
.pendant-link { display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 18px 0 14px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); color: var(--rs-text-strong); text-decoration: none; font-weight: var(--rs-weight-medium); }
.pendant-link:hover { border-color: var(--rs-text-strong); }
.readouts { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(min(230px, 45%), 1fr)); }
.layout { display: grid; gap: var(--rs-gap); grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); align-items: start; }
.col { display: flex; flex-direction: column; gap: var(--rs-gap); min-width: 0; }
.stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-3); }
.row { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); }
.care { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.stack :deep(.card.compact) { align-self: stretch; }
@media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
</style>
