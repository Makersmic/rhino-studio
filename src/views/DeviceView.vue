<script setup lang="ts">
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import Readout from '@/components/Readout.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { useMachineStore } from '@/stores/machine'

const machine = useMachineStore()
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Device</h1>
      <p>Live machine status and control through Moonraker.</p>
    </div>

    <div class="readouts">
      <Readout label="Hotend" unit="°" detail="Waiting for Moonraker" />
      <Readout label="Bed" unit="°" detail="Waiting for Moonraker" />
      <Readout label="Position" detail="X · Y · Z" />
      <Readout label="Job" detail="No job loaded" />
    </div>

    <div class="grid">
      <RsPanel title="Connection" index="01">
        <div class="stack">
          <StatusChip tone="neutral">Not connected</StatusChip>
          <p class="muted">Connecting to Moonraker on the Pi arrives in Phase 2. Until then, no part of this app can move the machine or switch on a tool.</p>
          <RsButton disabled>Connect</RsButton>
        </div>
      </RsPanel>

      <RsPanel title="Mounted toolhead" index="02">
        <div class="stack">
          <ToolheadBadge :look="machine.mountedLook" :slot="machine.mountedSlot" :verified="machine.mountedVerified" size="lg" show-summary />
          <p class="muted">Read from Klipper's SWAP_TOOL state once connected. The app never assumes a tool, and goes back to "Unknown" whenever the connection drops.</p>
        </div>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.readouts { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.grid { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-4); }
</style>
