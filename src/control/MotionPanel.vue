<script setup lang="ts">
/**
 * Jogging and homing.
 *
 * Locked by default. Unlock arms the jog keys for 60 s; every jog restarts
 * the clock. It relocks when time runs out, when you leave this screen, on
 * disconnect or Klipper restart, when a job starts, during a tool swap, or
 * when the mounted tool changes. Home and Motors off always ask.
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
const busy = computed(() => !machine.klippyReady || control.jobActive)

onBeforeUnmount(() => control.lockMotion())
</script>

<template>
  <RsPanel title="Motion">
    <template #actions>
      <!-- one toggle: Unlock, or the time left with Lock -->
      <RsButton v-if="armed" size="sm" :aria-label="`Unlocked, locks in ${control.unlockSecondsLeft} seconds. Lock now`" @click="control.lockMotion()">
        <span class="live-dot" aria-hidden="true" />Unlocked · {{ control.unlockSecondsLeft }} s · Lock
      </RsButton>
      <RsButton v-else size="sm" variant="primary" :disabled="!!control.motionBlock" @click="control.unlockMotion()">Unlock</RsButton>
    </template>


    <div class="layout">
      <div class="pad" :class="{ armed }">
        <div class="xy" role="group" aria-label="Jog X and Y">
          <button type="button" class="key up" :disabled="!canJog('Y')" :aria-label="`Y plus ${xyStep} mm`" @click="control.jog('Y', xyStep)"><i />Y</button>
          <button type="button" class="key left" :disabled="!canJog('X')" :aria-label="`X minus ${xyStep} mm`" @click="control.jog('X', -xyStep)"><i />X</button>
          <span class="center" aria-hidden="true"><span class="rs-num">{{ xyStep }}</span><small>mm</small></span>
          <button type="button" class="key right" :disabled="!canJog('X')" :aria-label="`X plus ${xyStep} mm`" @click="control.jog('X', xyStep)"><i />X</button>
          <button type="button" class="key down" :disabled="!canJog('Y')" :aria-label="`Y minus ${xyStep} mm`" @click="control.jog('Y', -xyStep)"><i />Y</button>
        </div>
        <div class="z" role="group" aria-label="Jog Z">
          <button type="button" class="key up" :disabled="!canJog('Z')" :aria-label="`Z plus ${zStep} mm`" @click="control.jog('Z', zStep)"><i />Z</button>
          <span class="center" aria-hidden="true"><span class="rs-num">{{ zStep }}</span><small>mm</small></span>
          <button type="button" class="key down" :disabled="!canJog('Z')" :aria-label="`Z minus ${zStep} mm`" @click="control.jog('Z', -zStep)"><i />Z</button>
        </div>
      </div>

      <div class="side">
        <fieldset class="seg">
          <legend>X/Y step</legend>
          <label v-for="s in XY_STEPS" :key="s"><input v-model="xyStep" type="radio" :value="s" name="xy" /><span>{{ s }}</span></label>
        </fieldset>
        <fieldset class="seg">
          <legend>Z step</legend>
          <label v-for="s in Z_STEPS" :key="s"><input v-model="zStep" type="radio" :value="s" name="z" /><span>{{ s }}</span></label>
        </fieldset>
        <p class="hint">
          <template v-if="control.motionBlock">{{ control.motionBlock }}.</template>
          <template v-else-if="!armed">Unlock to jog. It locks again 60 s after your last move.</template>
          <template v-else>Z+ opens the gap between tool and bed.</template>
        </p>
        <div class="homes">
          <RsButton size="sm" :disabled="busy" @click="control.home('all')">Home all</RsButton>
          <RsButton size="sm" :disabled="busy" @click="control.home('xy')">Home XY</RsButton>
          <RsButton size="sm" variant="quiet" :disabled="busy" @click="control.motorsOff()">Motors off</RsButton>
        </div>
      </div>
    </div>
  </RsPanel>
</template>

<style scoped>
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: blink 1.2s ease-in-out infinite; }
@keyframes blink { 50% { opacity: 0.2; } }
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }

.layout { display: grid; grid-template-columns: auto 1fr; gap: var(--rs-space-5); align-items: start; }
.pad { display: flex; gap: var(--rs-space-3); }
.xy { display: grid; grid-template-columns: repeat(3, 62px); grid-template-rows: repeat(3, 62px); gap: 6px; }
.xy .up { grid-area: 1 / 2; } .xy .left { grid-area: 2 / 1; } .xy .center { grid-area: 2 / 2; } .xy .right { grid-area: 2 / 3; } .xy .down { grid-area: 3 / 2; }
.z { display: grid; grid-template-rows: repeat(3, 62px); grid-template-columns: 62px; gap: 6px; }

.key {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong);
  background: var(--rs-surface);
  color: var(--rs-text-strong);
  font-size: var(--rs-text-xs);
  font-weight: var(--rs-weight-bold);
  cursor: pointer;
}
/* arrow: a small chevron drawn with borders */
.key i { width: 9px; height: 9px; border: solid currentColor; border-width: 2px 2px 0 0; }
.up i { transform: rotate(-45deg) translate(-1px, 2px); }
.down i { transform: rotate(135deg) translate(-1px, 2px); order: 2; }
.left { flex-direction: row; } .left i { transform: rotate(-135deg); }
.right { flex-direction: row-reverse; } .right i { transform: rotate(45deg); }
.key:hover:not(:disabled) { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.key:active:not(:disabled) { transform: translateY(1px); }
/* dead keys: solid light grey, same as the pendant */
.key:disabled { cursor: not-allowed; background: var(--rs-key-fill); border-color: transparent; color: var(--rs-text-muted); }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 50%; }
.center .rs-num { font-size: 1.25rem; }
.center small { font-size: 10px; color: var(--rs-text-muted); }

.side { display: flex; flex-direction: column; gap: var(--rs-space-4); min-width: 0; }
.seg { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0; }
legend { font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin-bottom: 6px; padding: 0; }
.seg label { flex: 1; min-width: 52px; }
.seg label span {
  display: flex; align-items: center; justify-content: center;
  height: 34px; border: 1px solid var(--rs-line-strong); margin-left: -1px;
  font-family: var(--rs-font-code); font-size: var(--rs-text-sm); cursor: pointer; color: var(--rs-text-strong);
}
.seg label:first-of-type span { border-radius: var(--rs-radius-md) 0 0 var(--rs-radius-md); margin-left: 0; }
.seg label:last-of-type span { border-radius: 0 var(--rs-radius-md) var(--rs-radius-md) 0; }
.seg input { position: absolute; opacity: 0; width: 0; height: 0; }
.seg input:checked + span { background: var(--rs-ink); color: var(--rs-on-ink); }
.seg input:focus-visible + span { box-shadow: var(--rs-focus); position: relative; }
.hint { font-size: var(--rs-text-xs); color: var(--rs-text-muted); min-height: 2.6em; }
.homes { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: auto; }
@media (max-width: 1100px) and (min-width: 721px) { .layout { grid-template-columns: auto 1fr; } }
@media (max-width: 720px) {
  /* phone: keys on top, step sizes and buttons full width below */
  .layout { grid-template-columns: 1fr; }
  .pad { justify-content: center; }
}
@media (max-width: 560px) {
  .xy { grid-template-columns: repeat(3, 54px); grid-template-rows: repeat(3, 54px); }
  .z { grid-template-rows: repeat(3, 54px); grid-template-columns: 54px; }
}
</style>
