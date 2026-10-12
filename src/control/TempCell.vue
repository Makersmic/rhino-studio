<script setup lang="ts">
/**
 * One temperature in the Control status strip, editable in place.
 *
 *   ┌──────────────┐
 *   │210°          │ ┌──┐ ⋯     set temperature small in the top-left corner,
 *   │   205°       │ │/\│       reading big, history graph to the right,
 *   └──────────────┘ └──┘       the dots widen the graph 3x (and back)
 *
 * Click the reading: the box fills light grey, the reading hides, the cursor
 * sits in the field. Type a temperature and press Enter to set it (0 turns
 * the heater off); Esc or clicking away changes nothing. Setting goes
 * through the control store, which checks the range and that the hotend has
 * a print head behind it.
 *
 * A tool without a hotend shows its body temperature (its thermistor shares
 * the T0 input) and can't be edited: there's nothing to heat.
 */
import { computed, nextTick, ref } from 'vue'
import TempGraph from './TempGraph.vue'
import { plausible, type HeaterId } from './tempHistory'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'

const props = defineProps<{
  heater: HeaterId
  label: string
  temp: number | null
  target: number | null
  /** false: read only (body temperature, or the hotend without a print head) */
  editable: boolean
  /** why it can't be edited, for the tooltip */
  lockedReason?: string
  /** can only be switched off here (a heater that's on or warm under a tool that doesn't use it) */
  offOnly?: boolean
  /** needs attention: label in inverted ink */
  alert?: boolean
}>()

const control = useControlStore()
const machine = useMachineStore()
const max = props.heater === 'extruder' ? 300 : 130

const reading = computed(() => (plausible(props.temp) ? props.temp : null))
const setText = computed(() => {
  if (!props.editable) return props.lockedReason ? 'Read only' : ''
  if (props.target == null) return ''
  return props.target > 0 ? `${props.target.toFixed(0)}°` : 'Off'
})
/** What sits under the reading: "Set 215°", "Off", or why it can't be set. */
const underText = computed(() => {
  if (!props.editable) return props.lockedReason ?? ''
  if (props.target == null) return ''
  return props.target > 0 ? `${props.target.toFixed(0)}°` : 'Off'
})
const canEdit = computed(() => props.editable && machine.klippyReady)

// ---- editing ---------------------------------------------------------------
const editing = ref(false)
const draft = ref('')
const problem = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)
let committing = false

async function start() {
  if (!canEdit.value) return
  draft.value = ''
  problem.value = null
  editing.value = true
  await nextTick()
  input.value?.focus()
}
function cancel() {
  if (committing) return
  editing.value = false
  problem.value = null
}
async function commit() {
  const v = Number(draft.value.trim())
  if (props.offOnly && v !== 0) {
    problem.value = 'Only 0 (off) here: this tool doesn\'t use it'
    input.value?.focus()
    return
  }
  if (draft.value.trim() === '' || !Number.isFinite(v) || v < 0 || v > max) {
    problem.value = `Enter 0 to ${max}°`
    input.value?.focus()
    return
  }
  committing = true
  editing.value = false
  problem.value = null
  try {
    await control.setHeater(props.heater, Math.round(v))
  } finally {
    committing = false
  }
}

// ---- graph size --------------------------------------------------------------
const KEY = `rs.graph.${props.heater}`
const expanded = ref(readExpanded())
function readExpanded() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
function toggle() {
  expanded.value = !expanded.value
  try {
    localStorage.setItem(KEY, expanded.value ? '1' : '0')
  } catch {
    /* storage blocked */
  }
}
</script>

<template>
  <div class="cell">
    <span class="k" :class="{ alert }">{{ label }}</span>
    <div class="row">
      <form v-if="editing" class="box editing" @submit.prevent="commit">
        <input
          ref="input"
          v-model="draft"
          class="field rs-num"
          type="text"
          inputmode="numeric"
          maxlength="3"
          autocomplete="off"
          :aria-label="`New ${label.toLowerCase()} temperature, 0 to ${max}`"
          :aria-invalid="!!problem"
          @keydown.esc.prevent="cancel"
          @blur="cancel"
        />
      </form>
      <button
        v-else
        type="button"
        class="box"
        :class="{ live: canEdit }"
        :disabled="!canEdit"
        :title="canEdit ? 'Click to set the temperature' : lockedReason"
        :aria-label="`${label} ${reading == null ? 'no reading' : `${reading.toFixed(0)} degrees`}${setText ? `, set ${setText}` : ''}${canEdit ? '. Change' : ''}`"
        @click="start"
      >
        <span class="now rs-num" :class="{ empty: reading == null }">{{ reading == null ? '—' : reading.toFixed(0) }}<small v-if="reading != null">°</small></span>
      </button>

      <div class="gwrap">
        <button type="button" class="dots" :aria-expanded="expanded" :aria-label="expanded ? 'Shorter history' : 'Longer history'" :title="expanded ? 'Show the last 5 minutes' : 'Show the last 20 minutes'" @click="toggle">
          <svg viewBox="0 0 20 6" aria-hidden="true"><circle cx="3" cy="3" r="1.6" /><circle cx="10" cy="3" r="1.6" /><circle cx="17" cy="3" r="1.6" /></svg>
        </button>
        <TempGraph :heater="heater" :expanded="expanded" :label="label" />
      </div>
    </div>
    <!-- under the reading: the set temperature, or what to type while editing -->
    <span v-if="problem || editing" class="hint" :class="{ bad: problem }" role="status">{{ problem ?? (offOnly ? 'Type 0, Enter to switch off' : 'Enter to set · 0 is off') }}</span>
    <span v-else class="hint setline">{{ underText }}</span>
  </div>
</template>

<style scoped>
.cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; --g: 2.4rem; }
.k { font-size: var(--rs-text-xs); line-height: 18px; height: 18px; color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); white-space: nowrap; align-self: flex-start; }
.k.alert { background: var(--rs-ink); color: var(--rs-on-ink); padding: 0 6px; border-radius: var(--rs-radius-sm); }
.row { display: flex; align-items: flex-end; gap: 10px; }

/* the "imaginary rectangle" around the reading */
.box {
  position: relative;
  display: flex;
  align-items: flex-end;
  /* room for three seven-segment digits and the degree sign */
  width: calc(var(--g) * 2.95);
  height: calc(var(--g) + 8px);
  padding: 4px 8px 4px 6px;
  margin: 0 0 0 -6px;
  border: 0;
  border-radius: var(--rs-radius-md);
  background: transparent;
  color: var(--rs-text-strong);
  font: inherit;
  text-align: left;
  cursor: default;
}
.box.live { cursor: text; }
.box.live:hover { box-shadow: inset 0 0 0 1px var(--rs-line); }
.box:focus-visible { outline: none; box-shadow: var(--rs-focus); }
.box.editing { background: var(--rs-edit-fill); }
.set {
  position: absolute;
  left: 6px;
  top: 3px;
  font-size: 11px;
  line-height: 1;
  font-weight: var(--rs-weight-medium);
  color: var(--rs-text-muted);
  white-space: nowrap;
}
.now { font-size: var(--g); line-height: 0.9; white-space: nowrap; }
.now small { font-family: var(--rs-font-ui); font-size: 0.4em; color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.field {
  width: 100%;
  height: var(--g);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--rs-text-strong);
  font-size: var(--g);
  line-height: 0.9;
  caret-color: var(--rs-text-strong);
  outline: none;
}
.field:focus-visible { box-shadow: none; outline: none; }
.gwrap { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.dots {
  width: 24px;
  height: 16px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--rs-radius-sm);
  background: transparent;
  color: var(--rs-text-muted);
  cursor: pointer;
}
.dots svg { width: 18px; height: 6px; fill: currentColor; }
.dots:hover { color: var(--rs-on-ink); background: var(--rs-ink); }
.dots[aria-expanded='true'] { color: var(--rs-text-strong); }
.dots:focus-visible { outline: none; box-shadow: var(--rs-focus); }
.hint { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; min-height: 1.3em; overflow: hidden; text-overflow: ellipsis; }
.hint.setline { font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); } /* same as the old corner label */
.hint.bad { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
@media (max-width: 560px) {
  .cell { --g: 2.1rem; }
}
</style>
