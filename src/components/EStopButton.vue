<script setup lang="ts">
/**
 * Software emergency stop: Klipper M112 through Moonraker.
 *
 * - Acts on the first press. No confirmation: an E-stop must never ask.
 * - Enabled whenever the app is trying to reach a machine. If the websocket
 *   is down it falls back to Moonraker's HTTP endpoint.
 * - After an E-stop Klipper is shut down. The alert under the top bar offers
 *   Restart Klipper (FIRMWARE_RESTART, with a confirmation).
 *
 * This button is a convenience, not a safety device. It depends on the
 * browser, Wi-Fi, the Pi and Moonraker all working. Keep a physical E-stop
 * or power switch within reach of the machine.
 */
import { computed, ref } from 'vue'
import { useMachineStore } from '@/stores/machine'

const machine = useMachineStore()
const ready = computed(() => machine.connection !== 'offline')
const result = ref<'idle' | 'sent' | 'failed'>('idle')
const error = ref('')

async function stop() {
  try {
    await machine.emergencyStop()
    result.value = 'sent'
  } catch (e) {
    result.value = 'failed'
    error.value = (e as Error).message
  }
  setTimeout(() => (result.value = 'idle'), 6000)
}
</script>

<template>
  <div class="wrap">
    <button
      type="button"
      class="estop"
      :disabled="!ready"
      :title="ready ? 'Emergency stop (Klipper M112). Acts immediately.' : 'Emergency stop needs a machine connection'"
      @click="stop"
    >
      <span class="cap" aria-hidden="true" />
      <span class="label">Stop</span>
    </button>
    <span v-if="result !== 'idle'" class="result" :class="result" role="status">
      {{ result === 'sent' ? 'Stop sent' : `Stop failed: ${error}. Use the machine's switch.` }}
    </span>
  </div>
</template>

<style scoped>
.wrap { position: relative; }
.estop {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 var(--rs-space-5) 0 6px;
  border-radius: var(--rs-radius-md);
  border: 0;
  background: var(--rs-danger);
  color: var(--rs-on-danger);
  font-weight: var(--rs-weight-bold);
  font-stretch: 112%;
  cursor: pointer;
}
.estop:hover:not(:disabled) { background: var(--rs-danger-strong); }
.estop:active:not(:disabled) { transform: translateY(1px); }
/* Mushroom-head stop button: a ring around a solid cap */
.cap {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid currentColor;
  background: radial-gradient(circle, currentColor 0 6px, transparent 6.5px);
}
.estop:disabled {
  cursor: not-allowed;
  background: transparent;
  color: var(--rs-text-muted);
  box-shadow: inset 0 0 0 1.5px var(--rs-line-strong);
}
.result {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  white-space: nowrap;
  padding: 6px 12px;
  border-radius: var(--rs-radius-md);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
}
.result.sent { background: var(--rs-ink); color: var(--rs-on-ink); }
.result.failed { background: var(--rs-danger); color: var(--rs-on-danger); }
@media (max-width: 560px) { .label { display: none; } .estop { padding: 0 6px; } }
</style>
