<script setup lang="ts">
/**
 * Live tuning on Control, print heads only: speed factor, Z offset
 * baby-steps, velocity and acceleration limits. A panel like the others (fold
 * and ⋮ menu, 2026-10-25); the red padlock sits in its header and also
 * covers Flow and pressure advance: locked, nothing works; unlocked, everything does, without
 * asking (src/control/tuning.ts has the safety notes). It locks again when
 * you leave Control. Flow and pressure advance stay in the extruder block.
 */
import RsPanel from '@/components/RsPanel.vue'
import PadLock from '@/components/PadLock.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import StepInput from './StepInput.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { ACCEL, SPEED, VELOCITY, Z_STEPS } from './tuning'

const control = useControlStore()
const machine = useMachineStore()
onBeforeUnmount(() => control.lockTuning())

const live = computed(() => control.tuneUnlocked && !control.tuningBlock)
const off = computed(() => !live.value)

// speed
const dragging = ref<number | null>(null)
const speed = computed(() => (machine.speedFactor == null ? null : Math.round(machine.speedFactor * 100)))
const shownSpeed = computed(() => dragging.value ?? speed.value)
const speedPct = computed(() => (((shownSpeed.value ?? 100) - SPEED.min) / (SPEED.max - SPEED.min)) * 100)
async function commitSpeed(v: number) {
  dragging.value = v
  await control.setSpeed(v)
  dragging.value = null
}
const nudgeSpeed = (d: number) => commitSpeed(Math.min(SPEED.max, Math.max(SPEED.min, (speed.value ?? 100) + d)))

// Z
const zStep = ref<number>(0.01)
const z = computed(() => machine.zOffset)
const zText = computed(() => (z.value == null ? '—' : `${z.value >= 0 ? '+' : '−'}${Math.abs(z.value).toFixed(3)}`))
const zHomed = computed(() => machine.position.homed.toLowerCase().includes('z'))

function toggle() {
  if (control.tuneUnlocked) control.lockTuning()
  else control.unlockTuning()
}
const lockLabel = computed(() =>
  control.tuneUnlocked
    ? 'Unlocked: speed, flow, Z offset and limits apply at once, job or not. Tap to lock'
    : control.tuningBlock
      ? `Locked: ${control.tuningBlock}`
      : 'Locked. Tap to tune; each change then goes straight to the machine. Locks again when you leave Control',
)
</script>

<template>
  <RsPanel title="Speed" panel-id="control.speed" flush collapsible :live="control.tuneUnlocked" @collapse="control.lockTuning()">
    <template #actions>
      <PadLock :open="control.tuneUnlocked" :disabled="!control.tuneUnlocked && !!control.tuningBlock" :label="lockLabel" @toggle="toggle" />
    </template>
  <section class="tune" :class="{ live }" aria-label="Live tuning">
    <!-- Speed -->
    <div class="col">
      <span class="big rs-num first" :class="{ empty: shownSpeed == null }">{{ shownSpeed ?? '—' }}<small v-if="shownSpeed != null">%</small></span>
      <div class="slider" :class="{ off }">
        <button type="button" class="pm" aria-label="Speed down 5%" :disabled="off" @click="nudgeSpeed(-5)">−</button>
        <input
          type="range"
          :min="SPEED.min"
          :max="SPEED.max"
          :step="SPEED.step"
          :value="shownSpeed ?? 100"
          :style="{ '--fill': `${speedPct}%` }"
          :disabled="off"
          aria-label="Speed"
          @input="dragging = Number(($event.target as HTMLInputElement).value)"
          @change="commitSpeed(Number(($event.target as HTMLInputElement).value))"
        />
        <button type="button" class="pm" aria-label="Speed up 5%" :disabled="off" @click="nudgeSpeed(5)">+</button>
      </div>
    </div>

    <!-- Z offset -->
    <div class="col">
      <span class="k">Z offset <span v-if="!zHomed" class="sub">· home Z first</span></span>
      <span class="zval mono">{{ zText }}<small> mm</small></span>
      <div class="zrow" :class="{ off: off || !zHomed }">
        <button type="button" class="zbtn" :disabled="off || !zHomed" :aria-label="`Nozzle down ${zStep} mm`" @click="control.zStep(-zStep)">↓ Closer</button>
        <span class="chips" role="radiogroup" aria-label="Step">
          <button v-for="s in Z_STEPS" :key="s" type="button" :class="{ on: zStep === s }" :aria-checked="zStep === s" role="radio" :disabled="off" @click="zStep = s">{{ s }}</button>
        </span>
        <button type="button" class="zbtn" :disabled="off || !zHomed" :aria-label="`Nozzle up ${zStep} mm`" @click="control.zStep(zStep)">↑ Farther</button>
        <button type="button" class="reset" :disabled="off || !zHomed || !z" @click="control.zReset()">Reset</button>
      </div>
    </div>

    <!-- Limits -->
    <div class="col">
      <span class="k">Limits <span class="sub">· until Klipper restarts</span></span>
      <div class="rows">
        <div class="row">
          <span class="rl">Velocity</span>
          <StepInput :model-value="machine.motionLimits.velocity" v-bind="VELOCITY" unit="mm/s" label="Velocity limit" :disabled="off" @commit="(v) => control.setLimits(v, null)" />
        </div>
        <div class="row">
          <span class="rl">Accel</span>
          <StepInput :model-value="machine.motionLimits.accel" v-bind="ACCEL" unit="mm/s²" label="Acceleration limit" :disabled="off" @commit="(v) => control.setLimits(null, v)" />
        </div>
      </div>
    </div>

  </section>
  </RsPanel>
</template>

<style scoped>
.tune {
  position: relative;
  display: grid;
  grid-template-columns: minmax(170px, 0.9fr) minmax(300px, 1.6fr) minmax(220px, 1fr);
  min-height: 100px;
}
.col { position: relative; display: flex; flex-direction: column; gap: 6px; padding: var(--rs-space-3) var(--rs-space-5); min-width: 0; }
.col + .col::before {
  content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 2px;
  background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 50% 0 / 2px 5px repeat-y;
}
.k { font-size: var(--rs-text-xs); line-height: 18px; height: 18px; color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); white-space: nowrap; }
.sub { font-size: 11px; color: var(--rs-text-muted); font-weight: 400; }

.big { font-size: 2.4rem; line-height: 0.9; margin-top: 12px; white-space: nowrap; }
.big.first { margin-top: 4px; }
.big small { font-family: var(--rs-font-ui); font-size: 0.4em; color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.big.empty { color: var(--rs-text-muted); }
.slider { display: flex; align-items: center; gap: 6px; margin-top: auto; }
.off { opacity: 0.45; }
.pm { width: 22px; height: 22px; padding: 0; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm); background: transparent; color: var(--rs-text-strong); font-size: 14px; line-height: 1; cursor: pointer; }
.pm:hover:not(:disabled) { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.pm:disabled, button:disabled { cursor: not-allowed; }
input[type='range'] { flex: 1; min-width: 0; height: 18px; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer; }
input[type='range']::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-moz-range-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }
input[type='range']::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }

/* Z: position in mono, never seven-segment */
.zval { font-family: var(--rs-font-code); font-size: 1.3rem; color: var(--rs-text-strong); margin-top: 8px; }
.zval small { font-family: var(--rs-font-ui); font-size: 11px; color: var(--rs-text-muted); }
.zrow { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: auto; }
.zbtn, .reset { height: 26px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); background: transparent; color: var(--rs-text-strong); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.zbtn:hover:not(:disabled) { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.reset { border-color: transparent; text-decoration: underline; text-underline-offset: 3px; }
.chips { display: inline-flex; gap: 3px; }
.chips button { min-width: 38px; height: 22px; padding: 0 4px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); background: transparent; color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: 11px; cursor: pointer; }
.chips button.on { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }

.rows { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
.row { display: flex; align-items: center; gap: 8px; height: 28px; }
.rl { flex: none; width: 56px; font-size: 11px; color: var(--rs-text-muted); }

/* locked: the controls fade back; the padlock (in the header) stays bright */
.tune:not(.live) .col { opacity: 0.5; }
.tune:not(.live) .off { opacity: 1; }

@media (max-width: 900px) {
  .tune { grid-template-columns: 1fr; }
  .col + .col::before { left: 14px; right: 14px; top: 0; bottom: auto; width: auto; height: 2px; background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 50% / 5px 2px repeat-x; }
  .col { padding-top: var(--rs-space-4); }
}
</style>
