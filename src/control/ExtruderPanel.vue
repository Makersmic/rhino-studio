<script setup lang="ts">
/**
 * Extruder block, under the status box while a print head is mounted.
 * Same height, paper and dividers as the status box; four columns:
 *
 *   Flow (M221)  | Pressure advance | Feed filament: path, length, speed | Extrude / Retract
 *
 * Path is SwitchFly's filament path (T0 / T1); with BlockOne it stays in
 * place, greyed out. Rules live in src/control/extruder.ts; commands go
 * through the control store.
 */
import { computed, ref, watch } from 'vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import StepInput from './StepInput.vue'
import { ADVANCE, FEED_LENGTHS, FEED_SPEED, FLOW, SMOOTH, volumetric } from './extruder'

const machine = useMachineStore()
const control = useControlStore()
const ex = computed(() => machine.extruder)

// ---- flow -----------------------------------------------------------------
const machineFlow = computed(() => (ex.value.factor == null ? null : Math.round(ex.value.factor * 100)))
const dragging = ref<number | null>(null)
const shownFlow = computed(() => dragging.value ?? machineFlow.value)
let flowTimer: ReturnType<typeof setTimeout> | null = null
function commitFlow(v: number) {
  dragging.value = v
  if (flowTimer) clearTimeout(flowTimer)
  flowTimer = setTimeout(async () => {
    flowTimer = null
    await control.setFlow(v)
    dragging.value = null
  }, 350)
}
function nudgeFlow(d: number) {
  const base = shownFlow.value ?? 100
  commitFlow(Math.min(FLOW.max, Math.max(FLOW.min, base + d)))
}
const flowPct = computed(() => (((shownFlow.value ?? 100) - FLOW.min) / (FLOW.max - FLOW.min)) * 100)

// ---- pressure advance -----------------------------------------------------
const setAdvance = (v: number) => control.setPressureAdvance(v, ex.value.smooth ?? 0.04)
const setSmooth = (v: number) => control.setPressureAdvance(ex.value.advance ?? 0, v)

// ---- feed -----------------------------------------------------------------
const length = ref<number>(25)
const speed = ref<number>(5)
const isSwitchFly = computed(() => machine.mountedName === 'SwitchFly')
const rate = computed(() => volumetric(speed.value))
const status = computed(() => {
  const b = control.feedBlocked
  if (b) return b
  return ex.value.temp != null ? `${Math.round(ex.value.temp)}° ready` : 'Ready'
})
const statusSub = computed(() => {
  if (control.feedBlocked === 'Hotend cold') return 'Heat to 170° to feed'
  if (control.feedBlocked) return ''
  return `≈ ${rate.value.toFixed(1)} mm³/s`
})
const pathMaterial = (p: 0 | 1) => ex.value.pathMaterial[p]
const shownMaterial = computed(() => {
  if (!isSwitchFly.value) return 'SwitchFly only'
  const p = ex.value.path
  return p == null ? 'Pick a path' : pathMaterial(p) ?? 'Material not set'
})
const busyFeed = ref(false)
async function feed(dir: 'extrude' | 'retract') {
  if (busyFeed.value) return
  busyFeed.value = true
  try {
    await control.feed(dir, length.value, speed.value)
  } finally {
    busyFeed.value = false
  }
}
// A new tool starts with the default length
watch(() => machine.mountedName, () => (length.value = 25))
</script>

<template>
  <section class="ext" aria-label="Extruder">
    <!-- Flow -->
    <div class="col flow">
      <span class="k">Flow</span>
      <span class="big rs-num" :class="{ empty: shownFlow == null }">{{ shownFlow ?? '—' }}<small v-if="shownFlow != null">%</small></span>
      <div class="slider" :class="{ off: !!control.tuneBlocked }">
        <button type="button" class="pm" aria-label="Flow down 1%" :disabled="!!control.tuneBlocked" @click="nudgeFlow(-1)">−</button>
        <input
          type="range"
          :min="FLOW.min"
          :max="FLOW.max"
          :step="FLOW.step"
          :value="shownFlow ?? 100"
          :style="{ '--fill': `${flowPct}%` }"
          :disabled="!!control.tuneBlocked"
          aria-label="Flow"
          @input="dragging = Number(($event.target as HTMLInputElement).value)"
          @change="commitFlow(Number(($event.target as HTMLInputElement).value))"
        />
        <button type="button" class="pm" aria-label="Flow up 1%" :disabled="!!control.tuneBlocked" @click="nudgeFlow(1)">+</button>
      </div>
    </div>

    <!-- Pressure advance -->
    <div class="col">
      <span class="k">Pressure advance</span>
      <div class="rows">
        <label class="row">
          <span class="rl">Advance</span>
          <StepInput :model-value="ex.advance" v-bind="ADVANCE" :decimals="3" unit="s" label="Pressure advance" :disabled="!!control.tuneBlocked" @commit="setAdvance" />
        </label>
        <label class="row">
          <span class="rl">Smooth</span>
          <StepInput :model-value="ex.smooth" v-bind="SMOOTH" :decimals="3" unit="s" label="Smooth time" :disabled="!!control.tuneBlocked" @commit="setSmooth" />
        </label>
      </div>
    </div>

    <!-- Feed settings -->
    <div class="col feedset">
      <span class="k">Feed filament</span>
      <div class="rows">
        <div class="row" :class="{ greyed: !isSwitchFly }" :title="isSwitchFly ? (control.pathBlocked ?? '') : 'SwitchFly only'">
          <span class="rl">Path</span>
          <span class="seg" role="radiogroup" aria-label="Filament path">
            <button
              v-for="p in [0, 1] as const"
              :key="p"
              type="button"
              role="radio"
              :aria-checked="isSwitchFly && ex.path === p"
              :class="{ on: isSwitchFly && ex.path === p }"
              :disabled="!!control.pathBlocked"
              @click="control.switchPath(p)"
            >T{{ p }}</button>
          </span>
          <span class="mat">{{ shownMaterial }}</span>
        </div>
        <div class="row">
          <span class="rl">Length</span>
          <span class="chips" role="radiogroup" aria-label="Feed length">
            <button v-for="n in FEED_LENGTHS" :key="n" type="button" role="radio" :aria-checked="length === n" :class="{ on: length === n }" @click="length = n">{{ n }}</button>
          </span>
          <span class="unit">mm</span>
        </div>
        <label class="row">
          <span class="rl">Speed</span>
          <StepInput :model-value="speed" v-bind="FEED_SPEED" unit="mm/s" label="Feed speed" @commit="(v) => (speed = v)" />
        </label>
      </div>
    </div>

    <!-- Feed actions -->
    <div class="col acts">
      <span class="k" :class="{ warn: !!control.feedBlocked }">{{ status }}</span>
      <button type="button" class="key" :disabled="!!control.feedBlocked || busyFeed" @click="feed('extrude')">
        <span aria-hidden="true">↓</span>Extrude
      </button>
      <button type="button" class="key" :disabled="!!control.feedBlocked || busyFeed" @click="feed('retract')">
        <span aria-hidden="true">↑</span>Retract
      </button>
      <span class="sub">{{ statusSub }}</span>
    </div>
  </section>
</template>

<style scoped>
.ext {
  display: grid;
  grid-template-columns: minmax(150px, 0.9fr) minmax(178px, 1fr) minmax(300px, 1.7fr) minmax(150px, 0.8fr);
  border: 1px solid var(--rs-line);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  min-height: 135px;
  overflow: hidden;
}
.col { position: relative; display: flex; flex-direction: column; gap: 6px; padding: var(--rs-space-3) var(--rs-space-5); min-width: 0; }
/* dotted divider, as in the status box */
.col + .col::before {
  content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 2px;
  background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 50% 0 / 2px 5px repeat-y;
}
.k { font-size: var(--rs-text-xs); line-height: 18px; height: 18px; color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k.warn { color: var(--rs-text-strong); }
.sub { font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); white-space: nowrap; }

/* flow */
.big { font-size: 2.4rem; line-height: 0.9; margin-top: 12px; white-space: nowrap; }
.big small { font-family: var(--rs-font-ui); font-size: 0.4em; color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.big.empty { color: var(--rs-text-muted); }
.slider { display: flex; align-items: center; gap: 6px; margin-top: auto; }
.slider.off { opacity: 0.45; }
.pm { width: 22px; height: 22px; padding: 0; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm); background: transparent; color: var(--rs-text-strong); font-size: 14px; line-height: 1; cursor: pointer; }
.pm:hover:not(:disabled) { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.pm:disabled { cursor: not-allowed; }
input[type='range'] { flex: 1; min-width: 0; height: 18px; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer; }
input[type='range']::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-moz-range-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }
input[type='range']::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }
input[type='range']:disabled { cursor: not-allowed; }

/* labelled rows on one grid: label column, then the control */
.rows { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
.row { display: flex; align-items: center; gap: 8px; height: 26px; }
.rl { flex: none; width: 52px; font-size: 11px; color: var(--rs-text-muted); }
.unit, .mat { font-size: 11px; color: var(--rs-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mat { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }

/* T0 / T1 */
.seg { display: inline-flex; border: 1px solid var(--rs-text-strong); border-radius: var(--rs-radius-sm); overflow: hidden; }
.seg button { height: 22px; padding: 0 12px; border: 0; background: transparent; color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: 11px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--rs-text-strong); }
.seg button.on { background: var(--rs-ink); color: var(--rs-on-ink); }
.seg button:hover:not(:disabled):not(.on) { background: var(--rs-surface-2); }
.seg button:disabled { cursor: not-allowed; }
/* BlockOne: the path row stays, greyed out */
.greyed .rl, .greyed .mat { color: var(--rs-text-muted); opacity: 0.6; font-weight: 400; }
.greyed .seg { border-color: var(--rs-line); background: var(--rs-key-fill); }
.greyed .seg button { color: var(--rs-text-muted); }
.greyed .seg button + button { border-left-color: var(--rs-line); }

/* length chips */
.chips { display: inline-flex; gap: 3px; }
.chips button { width: 30px; height: 22px; padding: 0; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); background: transparent; color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: 11px; cursor: pointer; }
.chips button.on { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.chips button:hover:not(.on) { background: var(--rs-surface-2); }

/* actions: outlined, dead keys solid light grey */
.acts { gap: 7px; }
.key {
  display: flex; align-items: center; justify-content: center; gap: 6px; height: 30px; width: 100%;
  border: 1px solid var(--rs-text-strong); border-radius: var(--rs-radius-md); background: transparent;
  color: var(--rs-text-strong); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); cursor: pointer;
}
.key:hover:not(:disabled) { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.key:disabled { background: var(--rs-key-fill); border-color: var(--rs-line); color: var(--rs-text-muted); cursor: not-allowed; }

@media (max-width: 1180px) {
  .ext { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .col + .col::before { display: none; }
  .col:nth-child(n + 3) { border-top: 1px solid var(--rs-line); }
}
@media (max-width: 560px) {
  .ext { grid-template-columns: 1fr; }
  .col + .col { border-top: 1px solid var(--rs-line); }
  .acts { display: grid; grid-template-columns: 1fr 1fr; }
  .acts .k, .acts .sub { grid-column: 1 / -1; }
  .big { font-size: 2.1rem; }
}
</style>
