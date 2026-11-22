<script setup lang="ts">
/**
 * A tool output in the status strip: the laser, the spindle, the part fan,
 * an added powered tool. Read only: the readings come from Klipper's pins,
 * and switching a tool on stays with its wizard (or the console, which asks
 * first). The one exception is `editable` (the part fan, Mike Nov 21): click the
 * reading, type 0 to 100 and press Enter, as with a temperature; Esc or clicking
 * away changes nothing. The parent does the setting (`set`).
 */
import { nextTick, ref } from 'vue'

const props = defineProps<{
  label: string
  /** short state word: Off, Armed, Running... */
  state?: string
  /** inverted ink: the output is live right now */
  live?: boolean
  /** big reading, 0-100 %; null = dash */
  percent: number | null
  /** what the percent means */
  sub?: string
  /** the percentage can be typed in */
  editable?: boolean
}>()
const emit = defineEmits<{ set: [percent: number] }>()

const editing = ref(false)
const draft = ref('')
const problem = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)
async function start() {
  if (!props.editable) return
  draft.value = ''
  problem.value = null
  editing.value = true
  await nextTick()
  input.value?.focus()
}
function cancel() {
  editing.value = false
  problem.value = null
}
function commit() {
  const v = Number(draft.value.trim())
  if (draft.value.trim() === '' || !Number.isFinite(v) || v < 0 || v > 100) {
    problem.value = 'Enter 0 to 100 %'
    input.value?.focus()
    return
  }
  editing.value = false
  problem.value = null
  emit('set', Math.round(v))
}
</script>

<template>
  <div class="cell">
    <span class="k">{{ label }}<em v-if="state" :class="{ live }">{{ state }}</em></span>
    <form v-if="editing" class="big edit" @submit.prevent="commit">
      <input ref="input" v-model="draft" class="field rs-num" type="text" inputmode="numeric" maxlength="3" autocomplete="off" :aria-label="`New ${label.toLowerCase()} speed, 0 to 100 percent`" :aria-invalid="!!problem" @keydown.esc.prevent="cancel" @blur="cancel" />
    </form>
    <button v-else-if="editable" type="button" class="big rs-num live" :class="{ empty: percent == null }" :title="`Click to set the ${label.toLowerCase()} speed`" :aria-label="`${label} ${percent == null ? 'no reading' : `${Math.round(percent)} percent`}. Change`" @click="start">{{ percent == null ? '—' : Math.round(percent) }}<small v-if="percent != null">%</small></button>
    <span v-else class="big rs-num" :class="{ empty: percent == null }">{{ percent == null ? '—' : Math.round(percent) }}<small v-if="percent != null">%</small></span>
    <span v-if="editing || problem" class="sub" :class="{ bad: problem }" role="status">{{ problem ?? 'Enter to set · 0 is off' }}</span>
    <span v-else class="sub">{{ sub }}</span>
  </div>
</template>

<style scoped>
.cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; height: 100%; }
.k { font-size: var(--rs-text-xs); line-height: 18px; height: 18px; color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); white-space: nowrap; display: flex; align-items: center; gap: 6px; }
.k em { font-style: normal; color: var(--rs-text-strong); padding: 0 6px; line-height: 16px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); }
.k em.live { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.big { font-size: 2.4rem; line-height: 0.9; margin-top: 18px; white-space: nowrap; } /* top lines up with the temperatures */
.big small { font-family: var(--rs-font-ui); font-size: 0.4em; color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.sub { font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); white-space: nowrap; min-height: 1.3em; margin-top: 2px; } /* same size and line as the set temperature */
button.big { padding: 0; border: 0; background: transparent; color: var(--rs-text-strong); text-align: left; cursor: text; align-self: flex-start; border-radius: var(--rs-radius-md); }
button.big:hover { box-shadow: inset 0 0 0 1px var(--rs-line); }
button.big:focus-visible { outline: none; box-shadow: var(--rs-focus); }
.big.edit { background: var(--rs-edit-fill); border-radius: var(--rs-radius-md); }
.field { width: 100%; height: 2.4rem; padding: 0; border: 0; background: transparent; color: var(--rs-text-strong); font-size: inherit; line-height: 0.9; caret-color: var(--rs-text-strong); outline: none; }
.sub.bad { color: var(--rs-text-strong); }
@media (max-width: 560px) { .big { font-size: 2.1rem; } }
</style>
