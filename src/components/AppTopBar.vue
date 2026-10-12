<script setup lang="ts">
import { computed } from 'vue'
import BrandMark from '@/brand/BrandMark.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import StatusChip from './StatusChip.vue'
import EStopButton from './EStopButton.vue'
import CareChip from '@/maintenance/CareChip.vue'
import SwapMenu from './SwapMenu.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useRoute } from 'vue-router'

const machine = useMachineStore()
const control = useControlStore()
const route = useRoute()
// The Dashboard is look-only (wizard questions don't open there), so Swap isn't offered on it
const canOfferSwap = computed(() => !route.meta.lookOnly)

const connection = computed(() => {
  switch (machine.connection) {
    case 'online':
      return machine.klippy === 'ready'
        ? { tone: 'ok' as const, text: 'Connected' }
        : { tone: machine.klippy === 'shutdown' || machine.klippy === 'error' ? ('danger' as const) : ('warn' as const), text: `Klipper ${machine.klippy}` }
    case 'connecting': return { tone: 'warn' as const, text: 'Connecting' }
    case 'error': return { tone: 'danger' as const, text: "Can't reach machine" }
    default: return { tone: 'neutral' as const, text: 'Not connected' }
  }
})

const caption = computed(() => {
  switch (machine.toolState.kind) {
    case 'mounted': return 'mounted'
    case 'swapping': return 'swapping'
    case 'none-confirmed': return 'not confirmed'
    default: return 'not verified'
  }
})
</script>

<template>
  <header class="topbar" :class="{ unverified: !machine.mountedVerified }">
    <RouterLink to="/" class="home" aria-label="Home">
      <BrandMark />
    </RouterLink>

    <RouterLink to="/control" class="mounted" aria-live="polite" :title="machine.toolStateText">
      <ToolheadBadge
        :look="machine.mountedLook"
        :slot="machine.mountedSlot"
        :verified="machine.mountedVerified"
        size="sm"
      />
      <span class="caption">{{ caption }}</span>
    </RouterLink>
    <template v-if="canOfferSwap">
      <button
        v-if="machine.toolState.kind === 'none-confirmed' && control.macros.has('RESTORE_TOOL')"
        type="button"
        class="tool-btn primary"
        @click="control.send('RESTORE_TOOL', { label: 'Confirm mounted tool' })"
      >Confirm tool</button>
      <SwapMenu v-else-if="control.macros.has('SWAP_TOOL')" />
    </template>

    <div class="right">
      <CareChip />
      <StatusChip :tone="connection.tone" :title="machine.connectionDetail ?? undefined">{{ connection.text }}</StatusChip>
      <EStopButton />
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--rs-topbar-h);
  display: flex;
  align-items: center;
  gap: var(--rs-space-4);
  padding: 0 var(--rs-space-4) 0 var(--rs-space-5);
  background: var(--rs-bg);
  /* The mounted tool's tab colour runs under the bar: the only tool colour on screen */
  box-shadow: inset 0 -3px 0 var(--rs-tool);
}
.topbar.unverified {
  box-shadow: none;
  background:
    radial-gradient(var(--rs-dot) 0.9px, transparent 1.15px) 0 100% / 4px 3px repeat-x,
    var(--rs-bg);
}
.home { text-decoration: none; display: inline-flex; border-radius: var(--rs-radius-md); }
.mounted {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--rs-space-2);
  height: 40px;
  padding: 0 12px 0 4px;
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line);
  background: var(--rs-surface);
  min-width: 0;
  text-decoration: none;
}
.mounted:hover { border-color: var(--rs-line-strong); }
.caption { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.tool-btn {
  height: 32px; padding: 0 12px; margin-left: calc(-1 * var(--rs-space-2));
  border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: transparent;
  color: var(--rs-text-strong); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); cursor: pointer;
}
.tool-btn:hover:not(:disabled) { background: var(--rs-surface-2); }
.tool-btn.primary { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.right { margin-left: auto; display: flex; align-items: center; gap: var(--rs-space-2); }
@media (max-width: 720px) {
  .topbar { gap: var(--rs-space-3); padding-left: var(--rs-space-3); }
  .caption { display: none; }
  .right :deep(.chip) { display: none; }
  .tool-btn { margin-left: 0; padding: 0 10px; }
}
@media (max-width: 560px) {
  /* phone: the logo alone, so the tool, Swap, care and Stop all fit */
  .home :deep(.name) { display: none; }
  .mounted { padding-right: 4px; }
  .mounted :deep(.text) { display: none; }
}
</style>
