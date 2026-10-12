<script setup lang="ts">
/** Machine conditions that need attention, shown under the top bar on every screen. */
import { computed } from 'vue'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'

const machine = useMachineStore()
const care = useMaintenanceStore()

const alerts = computed(() => {
  const out: { tone: 'danger' | 'warn'; title: string; body: string }[] = []
  if (machine.online && (machine.klippy === 'shutdown' || machine.klippy === 'error')) {
    out.push({
      tone: 'danger',
      title: machine.klippy === 'shutdown' ? 'Klipper is shut down' : 'Klipper reported an error',
      body: [machine.klippyMessage?.replace(/\.?\s*$/, '.'), 'Fix the cause, then restart Klipper from Mainsail (FIRMWARE_RESTART).'].filter(Boolean).join(' '),
    })
  }
  const t = machine.toolState
  if (t.kind === 'swapping') {
    out.push({ tone: 'warn', title: 'Toolhead swap in progress', body: machine.toolStateText })
  } else if (t.kind === 'none-confirmed' && t.lastSavedSlot) {
    out.push({
      tone: 'warn',
      title: 'Toolhead not confirmed since restart',
      body: `Last saved: ${t.lastSavedName ?? `slot ${t.lastSavedSlot}`}. Answer the RESTORE_TOOL question in Mainsail; until then jobs and tool colours stay locked out.`,
    })
  } else if (t.kind === 'unmapped') {
    out.push({ tone: 'warn', title: 'Unknown slot', body: machine.toolStateText })
  }
  // Overdue care on the mounted tool: say so where you'll see it. Nothing is blocked.
  const mc = care.mountedCare
  if (mc?.overdue && mc.next) {
    out.push({
      tone: 'warn',
      title: `${machine.mountedName} care overdue`,
      body: `${mc.next.title}${mc.overdue > 1 ? ` and ${mc.overdue - 1} more` : ''}. See Care to log it or snooze.`,
    })
  }
  return out
})
</script>

<template>
  <div v-if="alerts.length" class="alerts" role="status" aria-live="polite">
    <div v-for="a in alerts" :key="a.title" class="alert" :class="a.tone">
      <span class="mark" aria-hidden="true" />
      <strong>{{ a.title }}.</strong>
      <span>{{ a.body }}</span>
    </div>
  </div>
</template>

<style scoped>
.alerts { display: flex; flex-direction: column; gap: 6px; padding: var(--rs-space-3) var(--rs-space-4) 0; }
.alert {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 10px var(--rs-space-4);
  border-radius: var(--rs-radius-md);
  font-size: var(--rs-text-sm);
}
.alert.danger { background: var(--rs-danger); color: var(--rs-on-danger); }
.alert.warn { background: var(--rs-paper); color: var(--rs-paper-ink); }
.mark { width: 9px; height: 9px; flex: none; align-self: center; background: currentColor; }
.warn .mark { transform: rotate(45deg); }
</style>
