<script setup lang="ts">
/**
 * One labelled number, with its unit. Shows what you type; the model only
 * takes the value once it's a number inside min..max, so a half-typed "0."
 * never reaches the slicer.
 */
import { ref, watch, useId } from 'vue'

const props = withDefaults(
  defineProps<{ label: string; unit?: string; min?: number; max?: number; step?: number; hint?: string; percent?: boolean }>(),
  { unit: undefined, min: -Infinity, max: Infinity, step: 1, hint: undefined, percent: false },
)
const model = defineModel<number>({ required: true })
const id = useId()

const show = (v: number) => String(props.percent ? Math.round(v * 1000) / 10 : v)
const text = ref(show(model.value))
watch(model, (v) => {
  if (Number(text.value) !== (props.percent ? Math.round(v * 1000) / 10 : v)) text.value = show(v)
})
const bad = ref(false)
function input(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  const n = Number(text.value)
  const v = props.percent ? n / 100 : n
  bad.value = text.value.trim() === '' || !Number.isFinite(n) || v < props.min || v > props.max
  if (!bad.value) model.value = v
}
</script>

<template>
  <div class="field" :class="{ bad }">
    <label :for="id">{{ label }}</label>
    <span class="box">
      <input :id="id" type="number" inputmode="decimal" :step="percent ? step * 100 : step" :value="text" :aria-invalid="bad" :aria-describedby="hint ? `${id}-h` : undefined" @input="input" @blur="bad && (text = show(model), bad = false)" />
      <span v-if="unit" class="unit">{{ unit }}</span>
    </span>
    <span v-if="hint" :id="`${id}-h`" class="hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
label { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.box { display: flex; align-items: center; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); padding-right: 10px; }
.box:focus-within { outline: 2px solid var(--rs-focus); outline-offset: 1px; }
input { flex: 1; min-width: 0; height: 36px; padding: 0 10px; border: 0; background: transparent; color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: var(--rs-text-sm); }
input:focus { outline: none; }
.unit { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.hint { font-size: 11px; color: var(--rs-text-muted); }
.bad .box { border-color: var(--rs-danger); }
</style>
