<script setup lang="ts">
/**
 * One labelled number for the chain builder. Shows what you type; the model only takes a value that is a number inside
 * min..max (a half-typed "3." never reaches the checks), and an empty box gives null when `blank` allows it.
 */
import { ref, useId, watch } from 'vue'

const props = withDefaults(defineProps<{ label: string; unit?: string; min: number; max: number; step?: number; blank?: boolean; placeholder?: string }>(), {
  unit: 'mm',
  step: 1,
  blank: false,
  placeholder: '',
})
const model = defineModel<number | null>({ required: true })
const id = useId()
const text = ref(model.value == null ? '' : String(model.value))
const bad = ref(false)
watch(model, (v) => {
  if ((v == null ? '' : String(v)) !== text.value && Number(text.value) !== v) text.value = v == null ? '' : String(v)
})
function input(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  if (text.value.trim() === '' && props.blank) {
    bad.value = false
    model.value = null
    return
  }
  const n = Number(text.value)
  bad.value = text.value.trim() === '' || !Number.isFinite(n) || n < props.min || n > props.max
  if (!bad.value) model.value = n
}
</script>

<template>
  <div class="fld">
    <label :for="id">{{ label }}</label>
    <span class="box" :class="{ bad }">
      <input :id="id" :value="text" inputmode="decimal" :placeholder="placeholder" :aria-invalid="bad" :aria-describedby="bad ? id + '-e' : undefined" autocomplete="off" @input="input" />
      <i v-if="unit">{{ unit }}</i>
    </span>
    <span v-if="bad" :id="id + '-e'" class="err">{{ min }} to {{ max }}{{ unit ? ' ' + unit : '' }}</span>
  </div>
</template>

<style scoped>
.fld { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
label { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.box { display: flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px; border-radius: var(--rs-radius-sm); background: var(--rs-field-bg); border: 1px solid var(--rs-line-strong); }
.box:focus-within { border-color: var(--rs-ink); }
.box.bad { border-color: var(--rs-danger); }
input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-family: var(--rs-font-code); font-size: var(--rs-text-sm); outline: none; padding: 6px 0; }
i { font-style: normal; font-size: 11px; color: var(--rs-field-muted); }
.err { font-size: var(--rs-text-xs); color: var(--rs-danger); }
</style>
