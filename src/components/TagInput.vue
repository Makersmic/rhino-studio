<script setup lang="ts">
/**
 * A list of short names as removable tags, with a box to add more
 * (Enter, comma or Tab adds; pasting "PLA, PETG" adds both).
 */
import { ref } from 'vue'

const props = withDefaults(defineProps<{ modelValue: string[]; label: string; placeholder?: string; upper?: boolean; numeric?: boolean }>(), {
  placeholder: 'Add…',
  upper: false,
  numeric: false,
})
const emit = defineEmits<{ 'update:modelValue': [v: string[]] }>()
const text = ref('')

function clean(s: string) {
  let v = s.trim()
  if (props.upper) v = v.toUpperCase().replace(/\s+/g, '_')
  if (props.numeric && v !== '' && !Number.isFinite(Number(v))) return ''
  return v
}
function add() {
  const items = text.value.split(/[,\n]/).map(clean).filter((x) => x && !props.modelValue.includes(x))
  if (items.length) emit('update:modelValue', [...props.modelValue, ...items])
  text.value = ''
}
function key(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && text.value.trim())) {
    e.preventDefault()
    add()
  } else if (e.key === 'Backspace' && !text.value && props.modelValue.length) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}
const drop = (x: string) => emit('update:modelValue', props.modelValue.filter((y) => y !== x))
</script>

<template>
  <div class="ti" @click="($refs.box as HTMLInputElement)?.focus()">
    <span v-for="x in modelValue" :key="x" class="tag">{{ x }}<button type="button" class="x" :aria-label="`Remove ${x}`" @click.stop="drop(x)">×</button></span>
    <input ref="box" v-model="text" class="in" :aria-label="`Add to ${label}`" :placeholder="modelValue.length ? '' : placeholder" :inputmode="numeric ? 'decimal' : 'text'" @keydown="key" @blur="add" />
  </div>
</template>

<style scoped>
.ti { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 42px; padding: 6px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); cursor: text; }
.ti:focus-within { outline: 2px solid var(--rs-ink); outline-offset: 1px; }
.tag { display: inline-flex; align-items: center; gap: 2px; height: 26px; padding: 0 2px 0 9px; border-radius: var(--rs-radius-sm); background: var(--rs-surface-2); font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-strong); }
.x { width: 22px; height: 22px; display: grid; place-items: center; border: 0; border-radius: 3px; background: none; color: var(--rs-text-muted); font-size: 15px; line-height: 1; cursor: pointer; }
.x:hover { background: var(--rs-line); color: var(--rs-text-strong); }
.in { flex: 1; min-width: 90px; height: 26px; border: 0; outline: 0; background: none; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
</style>
