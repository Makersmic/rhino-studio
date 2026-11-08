<script setup lang="ts">
/** The fields for one macro step (Settings › Macros). Edits the step in place; checks are in userMacros.ts. */
import { computed, reactive, useId } from 'vue'
import type { MacroStep } from './userMacros'

const props = defineProps<{ step: MacroStep; macros: string[]; materials: string[] }>()
const id = useId()
const s = computed(() => props.step as Record<string, unknown> & MacroStep)
/** a number field that may be left blank (= stay where it is) */
function setNum(key: string, v: string, blank = false) {
  const t = v.trim()
  ;(props.step as unknown as Record<string, unknown>)[key] = t === '' && blank ? null : Number(t)
}
// What's being typed in each number field while it has focus. The editor redraws whenever the machine's status changes
// (its G-code preview follows the machine), and Vue writes :value back on every redraw, so without this the field
// jumped back to the old value mid-typing (Mike, Nov 7; the same fix as PrusaOption).
const typing = reactive<Record<string, string>>({})
const val = (key: string) => {
  if (key in typing) return typing[key]!
  const v = (props.step as unknown as Record<string, unknown>)[key]
  return v == null ? '' : String(v)
}
function focus(key: string) {
  typing[key] = val(key)
}
function input(key: string, e: Event) {
  typing[key] = (e.target as HTMLInputElement).value
}
function done(key: string, blank = false) {
  if (key in typing) setNum(key, typing[key]!, blank)
  delete typing[key]
}
</script>

<template>
  <div class="fields">
    <template v-if="s.kind === 'home'">
      <label :for="`${id}-a`">Axes</label>
      <select :id="`${id}-a`" v-model="(step as Extract<MacroStep, { kind: 'home' }>).axes">
        <option value="all">All</option><option value="xy">X and Y</option><option value="z">Z</option>
      </select>
      <label class="check"><input v-model="(step as Extract<MacroStep, { kind: 'home' }>).onlyIfNeeded" type="checkbox" /> Only if they aren’t homed</label>
    </template>

    <template v-else-if="s.kind === 'moveTo' || s.kind === 'moveBy'">
      <template v-for="k in (s.kind === 'moveTo' ? ['x', 'y', 'z'] : ['dx', 'dy', 'dz'])" :key="k">
        <label :for="`${id}-${k}`">{{ k.replace('d', '').toUpperCase() }}{{ s.kind === 'moveBy' ? ' by' : '' }} (mm)</label>
        <input :id="`${id}-${k}`" :value="val(k)" inputmode="decimal" placeholder="stay" class="mono" @focus="focus(k)" @input="input(k, $event)" @change="done(k, true)" @blur="done(k, true)" />
      </template>
      <label :for="`${id}-s`">Speed (mm/s)</label>
      <input :id="`${id}-s`" :value="val('speed')" inputmode="decimal" class="mono" @focus="focus('speed')" @input="input('speed', $event)" @change="done('speed')" @blur="done('speed')" />
    </template>

    <template v-else-if="s.kind === 'temp'">
      <label :for="`${id}-h`">Heater</label>
      <select :id="`${id}-h`" v-model="(step as Extract<MacroStep, { kind: 'temp' }>).heater"><option value="hotend">Hotend</option><option value="bed">Bed</option></select>
      <label :for="`${id}-t`">Temperature (°, 0 = off)</label>
      <input :id="`${id}-t`" :value="val('target')" inputmode="numeric" class="mono" @focus="focus('target')" @input="input('target', $event)" @change="done('target')" @blur="done('target')" />
      <label class="check"><input v-model="(step as Extract<MacroStep, { kind: 'temp' }>).wait" type="checkbox" /> Wait until it’s there</label>
    </template>

    <template v-else-if="s.kind === 'heatMaterial'">
      <label :for="`${id}-m`">Material</label>
      <input :id="`${id}-m`" v-model.trim="(step as Extract<MacroStep, { kind: 'heatMaterial' }>).material" :list="`${id}-ml`" placeholder="PLA" />
      <datalist :id="`${id}-ml`"><option v-for="m in materials" :key="m" :value="m" /></datalist>
      <label class="check"><input v-model="(step as Extract<MacroStep, { kind: 'heatMaterial' }>).wait" type="checkbox" /> Wait until both are there</label>
      <p class="hint">Hotend and bed come from the mounted toolhead’s material table when it runs.</p>
    </template>

    <template v-else-if="s.kind === 'fan'">
      <label :for="`${id}-f`">Part fan (%)</label>
      <input :id="`${id}-f`" :value="val('percent')" inputmode="numeric" class="mono" @focus="focus('percent')" @input="input('percent', $event)" @change="done('percent')" @blur="done('percent')" />
    </template>

    <template v-else-if="s.kind === 'wait'">
      <label :for="`${id}-w`">Seconds</label>
      <input :id="`${id}-w`" :value="val('seconds')" inputmode="decimal" class="mono" @focus="focus('seconds')" @input="input('seconds', $event)" @change="done('seconds')" @blur="done('seconds')" />
    </template>

    <template v-else-if="s.kind === 'macro'">
      <label :for="`${id}-k`">Klipper macro</label>
      <select :id="`${id}-k`" v-model="(step as Extract<MacroStep, { kind: 'macro' }>).name">
        <option value="" disabled>Pick one</option>
        <option v-for="m in macros" :key="m" :value="m">{{ m }}</option>
      </select>
    </template>

    <template v-else-if="s.kind === 'message'">
      <label :for="`${id}-x`">Message</label>
      <input :id="`${id}-x`" v-model="(step as Extract<MacroStep, { kind: 'message' }>).text" maxlength="120" />
    </template>

    <template v-else-if="s.kind === 'gcode'">
      <label :for="`${id}-g`">G-code line</label>
      <input :id="`${id}-g`" v-model="(step as Extract<MacroStep, { kind: 'gcode' }>).line" maxlength="200" class="mono" spellcheck="false" autocomplete="off" />
      <p class="hint">Checked like the console when it runs: moves and power ask first.</p>
    </template>
  </div>
</template>

<style scoped>
.fields { display: grid; grid-template-columns: minmax(110px, auto) minmax(0, 1fr); gap: var(--rs-space-2) var(--rs-space-3); align-items: center; padding: var(--rs-space-2) 0; }
label { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
input:not([type='checkbox']), select { width: 100%; min-width: 0; padding: 6px 8px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.check { grid-column: 1 / -1; display: flex; gap: var(--rs-space-2); align-items: center; color: var(--rs-text); }
.hint { grid-column: 1 / -1; margin: 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-code); }
@media (max-width: 480px) { .fields { grid-template-columns: 1fr; } }
</style>
