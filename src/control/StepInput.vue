<script setup lang="ts">
/**
 * A boxed number with up/down arrows (pressure advance, smooth time, feed
 * speed). Type a value and press Enter, or tap an arrow. Arrows commit after
 * a short pause so a run of taps sends one command.
 */
import { ref, watch } from 'vue'
import { clampStep } from './extruder'

const props = defineProps<{
  modelValue: number | null
  min: number
  max: number
  step: number
  unit: string
  label: string
  disabled?: boolean
  /** fixed decimals to show */
  decimals?: number
}>()
const emit = defineEmits<{ (e: 'commit', v: number): void }>()

const fmt = (v: number | null) => (v == null ? '—' : props.decimals != null ? v.toFixed(props.decimals) : String(v))
const text = ref(fmt(props.modelValue))
const editing = ref(false)
watch(() => props.modelValue, (v) => { if (!editing.value && !pending) text.value = fmt(v) })

let pending: ReturnType<typeof setTimeout> | null = null
function commit(v: number) {
  const c = clampStep(v, props)
  text.value = fmt(c)
  emit('commit', c)
}
function nudge(dir: 1 | -1) {
  if (props.disabled) return
  const base = Number(text.value)
  const c = clampStep((Number.isFinite(base) ? base : props.min) + dir * props.step, props)
  text.value = fmt(c)
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => { pending = null; emit('commit', c) }, 450)
}
function onEnter() {
  editing.value = false
  const v = Number(text.value)
  if (text.value.trim() === '' || !Number.isFinite(v)) { text.value = fmt(props.modelValue); return }
  commit(v)
}
function onEsc(e: KeyboardEvent) {
  editing.value = false
  text.value = fmt(props.modelValue)
  ;(e.target as HTMLInputElement).blur()
}
</script>

<template>
  <span class="step" :class="{ disabled }">
    <input
      v-model="text"
      :aria-label="label"
      :disabled="disabled"
      inputmode="decimal"
      @focus="editing = true"
      @blur="onEnter"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      @keydown.esc.prevent="onEsc"
      @keydown.up.prevent="nudge(1)"
      @keydown.down.prevent="nudge(-1)"
    />
    <i>{{ unit }}</i>
    <span class="arrows">
      <button type="button" :disabled="disabled" :aria-label="`${label} up`" @click="nudge(1)">▴</button>
      <button type="button" :disabled="disabled" :aria-label="`${label} down`" @click="nudge(-1)">▾</button>
    </span>
  </span>
</template>

<style scoped>
.step {
  display: inline-flex; align-items: stretch; height: 26px;
  border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm);
  background: var(--rs-surface-2); overflow: hidden;
}
.step:focus-within { box-shadow: 0 0 0 2px var(--rs-focus-ring); }
input {
  width: 58px; padding: 0 4px 0 8px; border: 0; background: transparent; outline: none;
  font-family: var(--rs-font-code); font-size: 13px; font-weight: 500; color: var(--rs-text-strong);
  text-align: right; font-variant-numeric: tabular-nums;
}
input:focus { background: var(--rs-edit-fill); }
i { font-style: normal; font-size: 10px; color: var(--rs-text-muted); align-self: center; padding: 0 7px 0 3px; white-space: nowrap; }
.arrows { display: flex; flex-direction: column; border-left: 1px solid var(--rs-line); }
.arrows button {
  flex: 1; width: 20px; padding: 0; border: 0; background: transparent; cursor: pointer;
  font-size: 9px; line-height: 1; color: var(--rs-text-muted);
}
.arrows button + button { border-top: 1px solid var(--rs-line); }
.arrows button:hover:not(:disabled) { background: var(--rs-ink); color: var(--rs-on-ink); }
.disabled { opacity: 0.45; }
.disabled button, .disabled input { cursor: not-allowed; }
</style>
