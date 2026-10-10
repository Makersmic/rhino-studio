<script setup lang="ts">
import { computed } from 'vue'
import BrandMark from '@/brand/BrandMark.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import StatusChip from './StatusChip.vue'
import EStopButton from './EStopButton.vue'
import { useMachineStore } from '@/stores/machine'

const machine = useMachineStore()

const connection = computed(() => {
  switch (machine.connection) {
    case 'online': return { tone: 'ok' as const, text: 'Connected' }
    case 'connecting': return { tone: 'warn' as const, text: 'Connecting' }
    case 'error': return { tone: 'danger' as const, text: 'Connection lost' }
    default: return { tone: 'neutral' as const, text: 'Not connected' }
  }
})
</script>

<template>
  <header class="topbar" :class="{ unverified: !machine.mountedVerified }">
    <RouterLink to="/" class="home" aria-label="Home">
      <BrandMark />
    </RouterLink>

    <div class="mounted" aria-live="polite">
      <ToolheadBadge
        :look="machine.mountedLook"
        :slot="machine.mountedSlot"
        :verified="machine.mountedVerified"
        size="sm"
      />
      <span class="caption">{{ machine.mountedVerified ? 'mounted' : 'not verified' }}</span>
    </div>

    <div class="right">
      <StatusChip :tone="connection.tone">{{ connection.text }}</StatusChip>
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
  gap: var(--rs-space-5);
  padding: 0 var(--rs-space-4) 0 var(--rs-space-5);
  background: var(--rs-bg);
  /* The mounted toolhead's accent runs along the bottom of the whole app. */
  border-bottom: 4px solid var(--rs-active);
}
.topbar.unverified {
  border-bottom-color: transparent;
  border-image: repeating-linear-gradient(135deg, var(--rs-line-strong) 0 6px, transparent 6px 12px) 4;
}
.home { text-decoration: none; display: inline-flex; border-radius: var(--rs-radius-pill); }
.mounted {
  display: flex;
  align-items: center;
  gap: var(--rs-space-2);
  height: 44px;
  padding: 0 14px 0 6px;
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line);
  min-width: 0;
}
.caption { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.right { margin-left: auto; display: flex; align-items: center; gap: var(--rs-space-3); }
@media (max-width: 720px) {
  .topbar { gap: var(--rs-space-3); padding-left: var(--rs-space-3); }
  .caption { display: none; }
  .right :deep(.chip) { display: none; }
}
</style>
