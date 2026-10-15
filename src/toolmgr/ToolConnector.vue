<script setup lang="ts">
/**
 * The 21W4 tool connector as drawn in the manual (and the Portal): big
 * contacts 1, 2 on the left and 11, 12 on the right, the top row 3-10 and 13,
 * the bottom row 21 down to 14.
 *
 * Read-only: contacts the tool uses are inked; selecting one emits `pick`.
 * Picker (`pickable`): every contact toggles, except `locked` ones (driven by
 * the tool's outputs), and v-model holds the chosen contact numbers.
 */
import { computed } from 'vue'

export interface ConnContact {
  contact: number
  label?: string
  pin?: string
  use?: string
  used?: boolean
}

const props = withDefaults(
  defineProps<{ contacts: ConnContact[]; pickable?: boolean; locked?: number[]; modelValue?: number[]; selected?: number | null }>(),
  { pickable: false, locked: () => [], modelValue: () => [], selected: null },
)
const emit = defineEmits<{ pick: [n: number]; 'update:modelValue': [v: number[]] }>()

const TOP = [3, 4, 5, 6, 7, 8, 9, 10, 13]
const BOT = [21, 20, 19, 18, 17, 16, 15, 14]
const PINS = [
  { n: 1, x: 75, y: 58, r: 17 },
  { n: 2, x: 120, y: 58, r: 17 },
  ...TOP.map((n, i) => ({ n, x: 160 + i * 30, y: 38, r: 9.5 })),
  ...BOT.map((n, i) => ({ n, x: 175 + i * 30, y: 76, r: 9.5 })),
  { n: 11, x: 440, y: 58, r: 17 },
  { n: 12, x: 485, y: 58, r: 17 },
]
const by = computed(() => Object.fromEntries(props.contacts.map((c) => [c.contact, c])))
const on = (n: number) => (props.pickable ? props.modelValue.includes(n) || props.locked.includes(n) : !!by.value[n]?.used)
const tip = (n: number) => {
  const c = by.value[n]
  const what = props.pickable ? (c?.label ?? '') : c?.used ? c.use || c.label : 'not used'
  return `Contact ${n}${what ? `: ${what}` : ''}${c?.pin ? ` (${c.pin})` : ''}${props.locked.includes(n) ? ' - used by an output' : ''}`
}
function hit(n: number) {
  if (!props.pickable) return emit('pick', n)
  if (props.locked.includes(n)) return
  const v = props.modelValue.filter((x) => x !== n)
  emit('update:modelValue', props.modelValue.includes(n) ? v : [...v, n].sort((a, b) => a - b))
}
</script>

<template>
  <svg class="conn" viewBox="0 0 560 124" role="group" :aria-label="pickable ? 'Tool connector: select the contacts this tool uses' : 'Tool connector: contacts this tool uses are filled'">
    <path class="shell" d="M14 12 Q8 12 9 18 L40 104 Q42 110 48 110 L512 110 Q518 110 520 104 L551 18 Q552 12 546 12 Z" />
    <path class="shell-in" d="M24 20 L52 100 L508 100 L536 20 Z" />
    <g
      v-for="p in PINS"
      :key="p.n"
      class="pin"
      :class="{ on: on(p.n), locked: locked.includes(p.n), sel: selected === p.n, pickable }"
      tabindex="0"
      :role="pickable ? 'checkbox' : 'button'"
      :aria-checked="pickable ? on(p.n) : undefined"
      :aria-label="tip(p.n)"
      @click="hit(p.n)"
      @keydown.enter.prevent="hit(p.n)"
      @keydown.space.prevent="hit(p.n)"
    >
      <title>{{ tip(p.n) }}</title>
      <circle :cx="p.x" :cy="p.y" :r="p.r" class="c" />
      <circle v-if="p.r > 12" :cx="p.x" :cy="p.y" :r="p.r - 4" class="ring" />
      <text :x="p.x" :y="p.y + p.r + 11" text-anchor="middle" class="n">{{ p.n }}</text>
    </g>
  </svg>
</template>

<style scoped>
.conn { display: block; width: 100%; max-width: 560px; height: auto; }
.shell { fill: transparent; stroke: var(--rs-text-strong); stroke-width: 2; }
.shell-in { fill: none; stroke: var(--rs-line-strong); stroke-width: 1; }
.pin { cursor: pointer; outline: none; }
.pin .c { fill: var(--rs-surface); stroke: var(--rs-text-muted); stroke-width: 1.4; transition: fill 0.12s; }
.pin .ring { fill: none; stroke: var(--rs-line-strong); stroke-width: 1; }
.pin .n { font-size: 10px; fill: var(--rs-text-muted); font-family: var(--rs-font-ui); }
.pin.on .c { fill: var(--rs-ink); stroke: var(--rs-ink); }
.pin.on .ring { stroke: var(--rs-on-ink); }
.pin.on .n { fill: var(--rs-text-strong); font-weight: 600; }
.pin.locked .c { fill: var(--rs-ink); stroke-dasharray: 0; }
.pin.locked { cursor: not-allowed; }
.pin.sel .c { stroke: var(--rs-ink); stroke-width: 3.5; }
.pin:hover .c { stroke: var(--rs-text-strong); stroke-width: 2.2; }
.pin:focus-visible .c { stroke: var(--rs-ink); stroke-width: 3; }
.pickable:not(.on):hover .c { fill: var(--rs-dither-dense); }
</style>
