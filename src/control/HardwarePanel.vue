<script setup lang="ts">
/**
 * Control › Hardware: each piece of system hardware with the control that suits it (src/control/hardware.ts).
 * Fans, levels and lights: a slider and a % field. Switches: On / Off. Servos: an angle. Heaters: a target,
 * behind the padlock with the other live items (spindles, laser-style power). Read-only items (fans Klipper runs,
 * interlocks, sensors, temperatures) show their state. Nothing here is a macro button: each control sends its
 * one command, and only that command (control.sendHardware).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import PadLock from '@/components/PadLock.vue'
import { hardwareBlock, hardwareItems, hardwareState, isControl, type HwItem, type WizardDevice } from './hardware'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { useToolMgrStore } from '@/stores/toolmgr'

const control = useControlStore()
const machine = useMachineStore()
const tm = useToolMgrStore()
onBeforeUnmount(tm.use())
onBeforeUnmount(control.lockHardware)

const devices = ref<WizardDevice[]>([])
async function loadDevices() {
  try {
    devices.value = (await tm.client().hwDevices()).devices as unknown as WizardDevice[]
  } catch {
    devices.value = [] // an older Tool Manager: system hardware only
  }
}
onMounted(loadDevices)
watch(() => tm.state, loadDevices)

const items = computed(() => hardwareItems(tm.pins?.hardware ?? [], devices.value))
const controls = computed(() => items.value.filter(isControl))
const watching = computed(() => items.value.filter((i) => !isControl(i)))
const hasLive = computed(() => controls.value.some((i) => i.live))
const state = (i: HwItem) => hardwareState(i, machine.status)
const block = (i: HwItem) => hardwareBlock(i, { ready: machine.klippyReady, mountedSlot: machine.mountedSlot, unlocked: control.hwUnlocked })
const scaled = (i: HwItem) => i.kind === 'fan' || i.kind === 'level' || i.kind === 'light'

// what the slider / field shows while you're moving it or typing (per item), before it's sent
const drag = reactive<Record<string, number | null>>({})
const typed = reactive<Record<string, string>>({})
function shown(i: HwItem): number {
  if (drag[i.name] != null) return drag[i.name]!
  const v = state(i).value
  if (scaled(i)) return Math.round((v ?? 0) * 100)
  return v ?? 0
}
function fieldText(i: HwItem): string {
  return typed[i.name] ?? String(shown(i))
}
async function set(i: HwItem, display: number) {
  const value = scaled(i) ? display / 100 : display
  const ok = await control.sendHardware(i, value, items.value)
  drag[i.name] = null
  delete typed[i.name]
  if (!ok) return
}
function commitField(i: HwItem) {
  const raw = (typed[i.name] ?? '').trim().replace(/%|°/g, '')
  if (!raw) return void delete typed[i.name]
  const n = Number(raw)
  const top = scaled(i) ? 100 : i.max
  if (!Number.isFinite(n) || n < 0 || n > top) {
    control.log('error', `${i.label}: 0 to ${top}${scaled(i) ? ' %' : '°'}`)
    return void delete typed[i.name]
  }
  void set(i, n)
}
const top = (i: HwItem) => (scaled(i) ? 100 : i.max)
const unit = (i: HwItem) => (scaled(i) ? '%' : '°')
const fill = (i: HwItem) => `${Math.round((shown(i) / (top(i) || 1)) * 100)}%`
const lockLabel = computed(() => (control.hwUnlocked ? 'Lock the live hardware' : 'Unlock the live hardware (spindle, heater, laser-style power)'))
const toggleLock = () => (control.hwUnlocked ? control.lockHardware() : control.unlockHardware())
</script>

<template>
  <RsPanel v-if="items.length" title="Hardware" panel-id="control.hardware" collapsible :live="control.hwUnlocked && hasLive">
    <template v-if="hasLive" #actions>
      <PadLock :open="control.hwUnlocked" :disabled="!machine.klippyReady" :label="lockLabel" @toggle="toggleLock" />
    </template>
    <div class="hw">
      <div v-for="i in controls" :key="i.name" class="row" :class="{ off: !!block(i), live: i.live }">
        <div class="who">
          <span class="name">{{ i.label }}<span v-if="i.live" class="tag">live</span></span>
          <span class="sub">{{ block(i) && block(i) !== 'Unlock to use' ? block(i) : i.purpose }}</span>
        </div>

        <!-- fan, level, light, servo: slider + field -->
        <div v-if="scaled(i) || i.kind === 'servo'" class="set">
          <input
            type="range"
            min="0"
            :max="top(i)"
            step="1"
            :value="shown(i)"
            :style="{ '--fill': fill(i) }"
            :disabled="!!block(i)"
            :aria-label="`${i.label} ${scaled(i) ? 'level' : 'angle'}`"
            @input="drag[i.name] = Number(($event.target as HTMLInputElement).value)"
            @change="set(i, Number(($event.target as HTMLInputElement).value))"
          />
          <span class="field">
            <input
              class="num"
              inputmode="decimal"
              :value="fieldText(i)"
              :disabled="!!block(i)"
              :aria-label="`${i.label} in ${unit(i)}`"
              @input="typed[i.name] = ($event.target as HTMLInputElement).value"
              @keydown.enter="commitField(i)"
              @blur="commitField(i)"
              @keydown.esc="delete typed[i.name]"
            /><small>{{ unit(i) }}</small>
          </span>
          <button v-if="scaled(i)" type="button" class="off-btn" :disabled="!!block(i) || shown(i) === 0" @click="set(i, 0)">Off</button>
        </div>

        <!-- switch -->
        <div v-else-if="i.kind === 'switch'" class="seg" role="group" :aria-label="i.label">
          <button type="button" :class="{ on: state(i).value === 0 }" :disabled="!!block(i)" :aria-pressed="state(i).value === 0" @click="set(i, 0)">Off</button>
          <button type="button" :class="{ on: (state(i).value ?? 0) > 0 }" :disabled="!!block(i)" :aria-pressed="(state(i).value ?? 0) > 0" @click="set(i, 1)">On</button>
        </div>

        <!-- heater -->
        <div v-else-if="i.kind === 'heater'" class="set heat">
          <span class="reading rs-num">{{ state(i).text }}</span>
          <span class="field">
            <input
              class="num"
              inputmode="numeric"
              :value="typed[i.name] ?? String(state(i).value ?? 0)"
              :disabled="!!block(i)"
              :aria-label="`${i.label} target in °C, 0 to ${i.max}`"
              @input="typed[i.name] = ($event.target as HTMLInputElement).value"
              @keydown.enter="commitField(i)"
              @keydown.esc="delete typed[i.name]"
            /><small>°</small>
          </span>
          <span class="hint">set · max {{ i.max }}°</span>
          <button type="button" class="off-btn" :disabled="!machine.klippyReady || !(state(i).value ?? 0)" @click="control.sendHardware(i, 0, items)">Off</button>
        </div>
      </div>

      <div v-if="watching.length" class="watch">
        <span v-for="i in watching" :key="i.name" class="chip" :class="{ alert: state(i).alert }">
          <span class="k">{{ i.label }}</span>
          <span class="v">{{ state(i).text }}{{ state(i).rpm != null ? ` · ${Math.round(state(i).rpm!)} rpm` : '' }}</span>
        </span>
      </div>
    </div>
  </RsPanel>
</template>

<style scoped>
.hw { display: flex; flex-direction: column; container-type: inline-size; }
.row { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(0, 2fr); align-items: center; gap: var(--rs-space-4); padding: 10px 0; border-bottom: 1px dotted var(--rs-line); }
.row:last-of-type { border-bottom: 0; }
.who { display: flex; flex-direction: column; min-width: 0; }
.name { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.sub { font-size: 11px; color: var(--rs-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { margin-left: 6px; padding: 0 5px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-pill); color: var(--rs-text-muted); font-size: 10px; font-weight: normal; vertical-align: 1px; }
.off .set, .off .seg { opacity: 0.45; }
.set { display: flex; align-items: center; gap: 10px; min-width: 0; }
.field { display: inline-flex; align-items: baseline; gap: 2px; }
.num { width: 58px; height: 30px; padding: 0 8px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-family: var(--rs-font-code); text-align: right; }
.num:focus { outline: 2px solid var(--rs-ink); outline-offset: 1px; }
.field small { font-size: 11px; color: var(--rs-text-muted); }
.off-btn { height: 30px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: transparent; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); cursor: pointer; }
.off-btn:hover:not(:disabled) { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
button:disabled { cursor: not-allowed; opacity: 0.5; }
.seg { display: inline-flex; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; justify-self: start; }
.seg button { height: 30px; min-width: 56px; padding: 0 12px; border: 0; background: transparent; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); cursor: pointer; }
.seg button + button { border-left: 1px solid var(--rs-line-strong); }
.seg button.on { background: var(--rs-ink); color: var(--rs-on-ink); }
.heat .reading { font-size: 1.5rem; color: var(--rs-text-strong); min-width: 64px; }
.hint { font-size: 11px; color: var(--rs-text-muted); }
input[type='range'] { flex: 1; min-width: 60px; height: 18px; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer; }
input[type='range']::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-moz-range-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5.5px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }
input[type='range']::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }
input[type='range']:disabled { cursor: not-allowed; }
.watch { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 10px; }
.chip { display: inline-flex; flex-direction: column; padding: 6px 10px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); min-width: 110px; }
.chip .k { font-size: 11px; color: var(--rs-text-muted); }
.chip .v { font-size: var(--rs-text-sm); color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.chip.alert { border-color: var(--rs-ink); background: var(--rs-dither-faint), var(--rs-surface); }
@container (max-width: 520px) {
  .row { grid-template-columns: 1fr; gap: 6px; }
}
</style>
