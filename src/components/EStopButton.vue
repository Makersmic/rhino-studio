<script setup lang="ts">
/**
 * Software emergency stop.
 *
 * Phase 1: disabled, because there is no machine connection to send it on.
 * Phase 2 wires it to Moonraker's printer.emergency_stop (Klipper M112),
 * with no confirmation dialog: an E-stop must act on the first press.
 *
 * This button is a convenience, not a safety device. It depends on the
 * browser, Wi-Fi, the Pi and Moonraker all working. Keep a physical E-stop
 * or power switch within reach of the machine.
 */
import { computed } from 'vue'
import { useMachineStore } from '@/stores/machine'

const machine = useMachineStore()
const ready = computed(() => machine.connection === 'online')
</script>

<template>
  <button
    type="button"
    class="estop"
    :disabled="!ready"
    :title="ready ? 'Emergency stop (Klipper M112)' : 'Emergency stop needs a machine connection'"
  >
    <span class="cap" aria-hidden="true" />
    <span class="label">Stop</span>
  </button>
</template>

<style scoped>
.estop {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 var(--rs-space-5) 0 6px;
  border-radius: var(--rs-radius-pill);
  border: 0;
  background: var(--rs-danger);
  color: var(--rs-on-danger);
  font-weight: var(--rs-weight-bold);
  font-stretch: 112%;
  cursor: pointer;
}
.estop:hover:not(:disabled) { background: var(--rs-danger-strong); }
/* Mushroom-head stop button: a ring around a solid cap */
.cap {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2.5px solid currentColor;
  background: radial-gradient(circle, currentColor 0 7px, transparent 7.5px);
}
.estop:disabled {
  cursor: not-allowed;
  background: transparent;
  color: var(--rs-text-muted);
  box-shadow: inset 0 0 0 1.5px var(--rs-line-strong);
}
@media (max-width: 560px) { .label { display: none; } .estop { padding: 0 6px; } }
</style>
