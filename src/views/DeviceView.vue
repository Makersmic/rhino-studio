<script setup lang="ts">
import { computed } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import Readout from '@/components/Readout.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { useMachineStore } from '@/stores/machine'
import { useSettingsStore } from '@/stores/settings'
import { useMaintenanceStore } from '@/stores/maintenance'
import CareTaskCard from '@/maintenance/CareTaskCard.vue'
import { careText } from '@/maintenance/summary'

const machine = useMachineStore()
const settings = useSettingsStore()
const care = useMaintenanceStore()

/** The mounted tool's due tasks, then the machine's: what to look at before the next job. */
const careNow = computed(() => {
  const tool = machine.mountedName ? `tool:${machine.mountedName}` : null
  return care.due.filter((t) => t.asset === tool || t.asset.startsWith('machine:')).slice(0, 4)
})

const f0 = (n: number | null) => (n == null ? null : n.toFixed(0))
const f1 = (n: number | undefined) => (n == null ? '—' : n.toFixed(1))
const heaterDetail = (t: number | null) => (t == null ? 'Waiting for Klipper' : t > 0 ? `Target ${t.toFixed(0)}°` : 'Off')

const pos = computed(() => machine.position.xyz)
const posNote = computed(() => (pos.value ? `X ${f1(pos.value[0])}  Y ${f1(pos.value[1])}` : undefined))
const posDetail = computed(() => {
  if (!pos.value) return 'Waiting for Klipper'
  return machine.position.homed ? `Homed ${machine.position.homed.toUpperCase()}` : 'Not homed'
})

const jobValue = computed(() => {
  const j = machine.job
  if (!j.state) return null
  if ((j.state === 'printing' || j.state === 'paused') && j.progress != null) return `${Math.round(j.progress * 100)}`
  return null
})
const jobDetail = computed(() => {
  const j = machine.job
  if (!j.state) return 'Waiting for Klipper'
  const label: Record<string, string> = { standby: 'Idle', printing: 'Running', paused: 'Paused', complete: 'Finished', cancelled: 'Cancelled', error: 'Error' }
  return [label[j.state] ?? j.state, j.filename].filter(Boolean).join(' · ')
})

const where = computed(() => settings.moonrakerUrl || 'Same address as this app')
const chip = computed(() => {
  if (machine.connection === 'online') return machine.klippy === 'ready' ? { tone: 'ok' as const, text: 'Connected, Klipper ready' } : { tone: 'warn' as const, text: `Connected, Klipper ${machine.klippy}` }
  if (machine.connection === 'connecting') return { tone: 'warn' as const, text: 'Connecting' }
  if (machine.connection === 'error') return { tone: 'danger' as const, text: "Can't reach the machine, retrying" }
  return { tone: 'neutral' as const, text: 'Not connected' }
})
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Device</h1>
      <p>Live status from Klipper through Moonraker. This version only reads; the one thing it can send is the emergency stop.</p>
    </div>

    <div class="readouts">
      <Readout label="Hotend" :value="f0(machine.hotend.temp)" unit="°" :detail="heaterDetail(machine.hotend.target)" />
      <Readout label="Bed" :value="f0(machine.bed.temp)" unit="°" :detail="heaterDetail(machine.bed.target)" />
      <Readout label="Z" :value="pos ? f1(pos[2]) : null" unit="mm" :note="posNote" :detail="posDetail" />
      <Readout label="Job" :value="jobValue" unit="%" :detail="jobDetail" />
    </div>

    <div class="grid">
      <RsPanel title="Mounted toolhead" index="01">
        <div class="stack">
          <ToolheadBadge :look="machine.mountedLook" :slot="machine.mountedSlot" :verified="machine.mountedVerified" size="lg" />
          <p class="muted">{{ machine.toolStateText }}</p>
          <p class="muted small">Read from Klipper's SWAP_TOOL. The app never assumes a tool, and goes back to unknown whenever the connection drops or Klipper restarts.</p>
        </div>
      </RsPanel>

      <RsPanel title="Care before the next job" index="02">
        <div class="stack">
          <p v-if="care.source === 'unavailable'" class="muted">Maintenance isn't available: the Rhino Portal can't be reached.</p>
          <template v-else>
            <p class="muted">
              <template v-if="care.mountedCare">{{ machine.mountedName }}: {{ careText(care.mountedCare) }}.</template>
              Machine: {{ care.areas.filter((a) => a.level !== 'ok').length ? `${care.areas.filter((a) => a.level !== 'ok').length} areas need care` : 'up to date' }}.
            </p>
            <div v-if="careNow.length" class="care-list">
              <CareTaskCard v-for="t in careNow" :key="t.id" :task="t" compact />
            </div>
            <RouterLink to="/care" class="link">Open Care</RouterLink>
          </template>
        </div>
      </RsPanel>

      <RsPanel title="Connection" index="03">
        <div class="stack">
          <StatusChip :tone="chip.tone">{{ chip.text }}</StatusChip>
          <dl class="facts">
            <dt>Moonraker</dt><dd>{{ where }}</dd>
            <dt v-if="machine.connectionDetail">Detail</dt><dd v-if="machine.connectionDetail">{{ machine.connectionDetail }}</dd>
          </dl>
          <div class="row">
            <RsButton v-if="machine.connection === 'offline'" @click="machine.connect(settings.moonrakerUrl)">Connect</RsButton>
            <RsButton v-else variant="quiet" @click="machine.disconnect()">Disconnect</RsButton>
            <RouterLink to="/settings" class="link">Change address</RouterLink>
          </div>
        </div>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.readouts { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(min(230px, 45%), 1fr)); }
.grid { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-4); }
.small { font-size: var(--rs-text-sm); }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 4px var(--rs-space-4); margin: 0; font-size: var(--rs-text-sm); }
.facts dt { color: var(--rs-text-muted); }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.row { display: flex; align-items: center; gap: var(--rs-space-4); }
.link { font-size: var(--rs-text-sm); color: var(--rs-text); }
.care-list { display: flex; flex-direction: column; gap: var(--rs-space-2); align-self: stretch; }
</style>
