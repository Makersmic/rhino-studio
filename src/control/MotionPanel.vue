<script setup lang="ts">
/**
 * Jogging and homing.
 *
 * Locked by default. Unlock motion arms the jog buttons for 60 s; every jog
 * restarts the clock. It relocks when time runs out, when you leave this
 * screen, on disconnect or Klipper restart, when a job starts, during a tool
 * swap, or when the mounted tool changes. Home and Motors off always ask.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import type { Axis } from './commands'

const control = useControlStore()
const machine = useMachineStore()

const XY_STEPS = [0.1, 1, 10, 50]
const Z_STEPS = [0.05, 0.1, 1, 10]
const xyStep = ref(10)
const zStep = ref(1)

const homed = computed(() => machine.position.homed.toLowerCase())
const armed = computed(() => control.motionUnlocked && !control.motionBlock)
const canJog = (a: Axis) => armed.value && homed.value.includes(a.toLowerCase())

onBeforeUnmount(() => control.lockMotion())

const fmt = (n: number | undefined) => (n == null ? '—' : n.toFixed(2))
</script>

<template>
  <RsPanel title="Motion" index="01">
    <template #actions>
      <span v-if="armed" class="timer" aria-live="polite">Locks in {{ control.unlockSecondsLeft }} s</span>
      <RsButton v-if="armed" variant="quiet" @click="control.lockMotion()">Lock</RsButton>
    </template>

    <div class="pos" aria-label="Machine position">
      <span v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" :class="{ unhomed: !homed.includes(a.toLowerCase()) }">
        <b>{{ a }}</b> {{ fmt(machine.position.xyz?.[i]) }}
      </span>
    </div>

    <div class="pads" :class="{ locked: !armed }">
      <div class="xy" role="group" aria-label="Jog X and Y">
        <button type="button" class="arrow up" :disabled="!canJog('Y')" :aria-label="`Y plus ${xyStep} mm`" @click="control.jog('Y', xyStep)"><span>Y+</span></button>
        <button type="button" class="arrow left" :disabled="!canJog('X')" :aria-label="`X minus ${xyStep} mm`" @click="control.jog('X', -xyStep)"><span>X−</span></button>
        <span class="hub" aria-hidden="true">{{ xyStep }}</span>
        <button type="button" class="arrow right" :disabled="!canJog('X')" :aria-label="`X plus ${xyStep} mm`" @click="control.jog('X', xyStep)"><span>X+</span></button>
        <button type="button" class="arrow down" :disabled="!canJog('Y')" :aria-label="`Y minus ${xyStep} mm`" @click="control.jog('Y', -xyStep)"><span>Y−</span></button>
      </div>
      <div class="z" role="group" aria-label="Jog Z">
        <button type="button" class="arrow up" :disabled="!canJog('Z')" :aria-label="`Z plus ${zStep} mm`" @click="control.jog('Z', zStep)"><span>Z+</span></button>
        <span class="hub" aria-hidden="true">{{ zStep }}</span>
        <button type="button" class="arrow down" :disabled="!canJog('Z')" :aria-label="`Z minus ${zStep} mm`" @click="control.jog('Z', -zStep)"><span>Z−</span></button>
      </div>

      <div v-if="!armed" class="lock">
        <template v-if="control.motionBlock">
          <strong>Motion locked</strong>
          <span>{{ control.motionBlock }}</span>
        </template>
        <template v-else>
          <RsButton variant="primary" @click="control.unlockMotion()">Unlock motion</RsButton>
          <span>Jog buttons stay live for 60 s after your last move.</span>
        </template>
      </div>
    </div>

    <div class="steps">
      <fieldset>
        <legend>X/Y step, mm</legend>
        <label v-for="s in XY_STEPS" :key="s"><input v-model="xyStep" type="radio" :value="s" name="xy" /><span>{{ s }}</span></label>
      </fieldset>
      <fieldset>
        <legend>Z step, mm</legend>
        <label v-for="s in Z_STEPS" :key="s"><input v-model="zStep" type="radio" :value="s" name="z" /><span>{{ s }}</span></label>
      </fieldset>
    </div>
    <p class="hint">Z+ opens the gap between the tool and the bed.</p>

    <footer class="row">
      <RsButton :disabled="!machine.klippyReady || control.jobActive" @click="control.home('all')">Home all</RsButton>
      <RsButton :disabled="!machine.klippyReady || control.jobActive" @click="control.home('xy')">Home X Y</RsButton>
      <RsButton variant="quiet" :disabled="!machine.klippyReady || control.jobActive" @click="control.motorsOff()">Motors off</RsButton>
    </footer>
  </RsPanel>
</template>

<style scoped>
.timer { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-warn); white-space: nowrap; }
.pos { display: flex; gap: var(--rs-space-5); font-family: var(--rs-font-code); font-size: var(--rs-text-sm); margin-bottom: var(--rs-space-4); color: var(--rs-text-strong); }
.pos b { color: var(--rs-text-muted); font-weight: 400; margin-right: 4px; }
.pos .unhomed { color: var(--rs-text-muted); text-decoration: line-through; text-decoration-color: var(--rs-warn); }

.pads { position: relative; display: flex; gap: var(--rs-space-5); align-items: center; padding: var(--rs-space-4); border-radius: var(--rs-radius-xl); background: var(--rs-paper); color: var(--rs-paper-ink); }
.xy { display: grid; grid-template-columns: repeat(3, 64px); grid-template-rows: repeat(3, 64px); gap: 6px; }
.xy .up { grid-area: 1 / 2; } .xy .left { grid-area: 2 / 1; } .xy .hub { grid-area: 2 / 2; } .xy .right { grid-area: 2 / 3; } .xy .down { grid-area: 3 / 2; }
.z { display: grid; grid-template-rows: repeat(3, 64px); grid-template-columns: 64px; gap: 6px; margin-left: auto; margin-right: var(--rs-space-4); }
.hub { display: grid; place-items: center; border-radius: 50%; border: 1.5px dashed var(--rs-paper-line); font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-paper-muted); }
.arrow {
  position: relative;
  border: 0;
  border-radius: 16px;
  background: var(--rs-paper-ink);
  color: var(--rs-paper);
  font-weight: var(--rs-weight-bold);
  cursor: pointer;
}
.arrow::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  border: solid currentColor;
  border-width: 2.5px 2.5px 0 0;
  left: 50%;
  top: 50%;
}
.arrow span { position: absolute; font-size: 11px; opacity: 0.8; }
.up::before { transform: translate(-50%, -20%) rotate(-45deg); } .up span { left: 0; right: 0; bottom: 8px; }
.down::before { transform: translate(-50%, -80%) rotate(135deg); } .down span { left: 0; right: 0; top: 8px; }
.left::before { transform: translate(-20%, -50%) rotate(-135deg); } .left span { right: 8px; top: 8px; }
.right::before { transform: translate(-80%, -50%) rotate(45deg); } .right span { left: 8px; top: 8px; }
.arrow:hover:not(:disabled) { background: color-mix(in srgb, var(--rs-paper-ink) 80%, var(--rs-active)); }
.arrow:active:not(:disabled) { transform: translateY(1px); }
.arrow:disabled { opacity: 0.25; cursor: not-allowed; }

.lock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--rs-space-2);
  padding: var(--rs-space-4);
  text-align: center;
  border-radius: inherit;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--rs-paper) 82%, transparent) 0 10px, color-mix(in srgb, var(--rs-paper) 92%, transparent) 10px 20px);
  font-size: var(--rs-text-sm);
}
.lock strong { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); }
.locked .lock :deep(.btn.primary) { background: var(--rs-paper-ink); color: var(--rs-paper); }

.steps { display: flex; flex-wrap: wrap; gap: var(--rs-space-4) var(--rs-space-6); margin-top: var(--rs-space-4); }
fieldset { border: 0; margin: 0; padding: 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
legend { float: left; font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin-right: var(--rs-space-2); }
fieldset label span { display: inline-flex; align-items: center; justify-content: center; min-width: 46px; height: 34px; padding: 0 10px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); font-family: var(--rs-font-code); font-size: var(--rs-text-sm); cursor: pointer; }
fieldset input { position: absolute; opacity: 0; width: 0; height: 0; }
fieldset input:checked + span { background: var(--rs-text-strong); color: var(--rs-bg); border-color: transparent; }
fieldset input:focus-visible + span { box-shadow: var(--rs-focus); }
.hint { font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin-top: var(--rs-space-2); }
.row { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-4); }
@media (max-width: 560px) {
  .xy { grid-template-columns: repeat(3, 56px); grid-template-rows: repeat(3, 56px); }
  .z { grid-template-rows: repeat(3, 56px); grid-template-columns: 56px; margin-right: 0; }
  .pads { gap: var(--rs-space-3); padding: var(--rs-space-3); }
}
</style>
