<script setup lang="ts">
/** Machine conditions that need attention, shown under the top bar on every screen. */
import { computed } from 'vue'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useControlStore } from '@/stores/control'

const machine = useMachineStore()
const care = useMaintenanceStore()
const control = useControlStore()

function restart() {
  void control.send('FIRMWARE_RESTART', {
    label: 'Restart Klipper',
    confirmBody: 'Check the machine first: whatever caused the shutdown should be fixed. Klipper and the boards restart; you will need to confirm the mounted toolhead again.',
  })
}

const alerts = computed(() => {
  const out: { tone: 'danger' | 'warn'; title: string; body: string; restart?: boolean }[] = []
  if (machine.online && (machine.klippy === 'shutdown' || machine.klippy === 'error')) {
    out.push({
      tone: 'danger',
      title: machine.klippy === 'shutdown' ? 'Klipper is shut down' : 'Klipper reported an error',
      body: [machine.klippyMessage?.replace(/\.?\s*$/, '.'), 'Fix the cause, then restart Klipper.'].filter(Boolean).join(' '),
      restart: true,
    })
  }
  const t = machine.toolState
  if (t.kind === 'swapping') {
    out.push({ tone: 'warn', title: 'Toolhead swap in progress', body: machine.toolStateText })
  } else if (t.kind === 'mismatch') {
    out.push({ tone: 'danger', title: 'Tool sensor disagrees: stop and check', body: `${machine.toolStateText} Jobs, jogging and tool power stay locked until they agree.` })
  } else if (t.kind === 'none-confirmed' && t.lastSavedSlot != null) {
    const c = machine.confirmAction
    out.push({
      tone: 'warn',
      title: 'Toolhead not confirmed',
      body: `Last known: ${t.lastSavedName ?? `${machine.adapter.slotWord.toLowerCase()} ${t.lastSavedSlot}`}.${c ? ` Use ${c.button} in the top bar (${c.script}).` : ''} Until then jobs, jogging and tool colours stay locked.`,
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
      <button v-if="a.restart" type="button" class="act" @click="restart">Restart Klipper</button>
    </div>
  </div>
</template>

<style scoped>
.alerts { display: flex; flex-direction: column; gap: 6px; padding: var(--rs-space-3) var(--rs-space-5) 0; }
.alert {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-height: 44px;
  padding: 8px var(--rs-space-4);
  border-radius: var(--rs-radius-md);
  font-size: var(--rs-text-sm);
  border: 1px solid var(--rs-line-strong);
  background: var(--rs-surface);
  color: var(--rs-text);
}
.alert strong { color: var(--rs-text-strong); }
.alert.danger { background: var(--rs-danger); border-color: var(--rs-danger); color: var(--rs-on-danger); }
.alert.danger strong { color: inherit; }
.act { margin-left: auto; height: 30px; padding: 0 12px; border-radius: var(--rs-radius-md); border: 1px solid currentColor; background: transparent; color: inherit; font-weight: var(--rs-weight-medium); cursor: pointer; }
.mark { width: 10px; height: 10px; flex: none; background: var(--rs-dither-dense); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.danger .mark { background: currentColor; box-shadow: none; }
</style>
