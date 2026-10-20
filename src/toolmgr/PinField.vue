<script setup lang="ts">
/**
 * A pin value you can change: click it for a drop-down of the pins it may
 * use. Picking a different one shows a save button beside it and, under it in
 * small type, the value it had ("was PB5"). Saving is the parent's call
 * (it goes to the Portal); after it, "was …" stays until the next change.
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  value: string
  /** pins it may use, besides its own */
  options: { pin: string; note?: string; disabled?: boolean }[]
  label: string
  saving?: boolean
  /** after a save: the value before it */
  savedFrom?: string | null
}>()
const emit = defineEmits<{ save: [pin: string] }>()

const picked = ref(props.value)
watch(() => props.value, (v) => (picked.value = v))
const changed = computed(() => picked.value !== props.value)
type Opt = { pin: string; note?: string; disabled?: boolean }
const list = computed<Opt[]>(() => {
  const seen = new Set<string>()
  return ([{ pin: props.value }, ...props.options] as Opt[]).filter((o) => (seen.has(o.pin) ? false : (seen.add(o.pin), true)))
})
</script>

<template>
  <span class="pf" :class="{ changed }">
    <span class="line">
      <select v-model="picked" class="sel" :aria-label="label" :disabled="saving">
        <option v-for="o in list" :key="o.pin" :value="o.pin" :disabled="o.disabled && o.pin !== value">{{ o.pin }}{{ o.note ? ` · ${o.note}` : '' }}</option>
      </select>
      <button v-if="changed" type="button" class="save" :disabled="saving" :title="`Save ${label}: ${value} → ${picked}`" :aria-label="`Save ${label}`" @click="emit('save', picked)">
        <!-- save (a floppy disk) -->
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3.5 2.5h10l3 3v11a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M6 2.5v4.5h7V2.5M6 17.5v-5.5h8v5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
      </button>
    </span>
    <span v-if="changed" class="was">was {{ value }}</span>
    <span v-else-if="savedFrom && savedFrom !== value" class="was">was {{ savedFrom }} · applies after a Klipper restart</span>
  </span>
</template>

<style scoped>
.pf { display: inline-flex; flex-direction: column; gap: 2px; min-width: 0; }
.line { display: inline-flex; align-items: center; gap: 6px; }
.sel { min-width: 104px; padding: 5px 26px 5px 9px; border: 1px solid var(--rs-line-strong); border-radius: 8px; background: var(--rs-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 9px center; color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: var(--rs-text-sm); appearance: none; cursor: pointer; }
.sel:hover:not(:disabled) { border-color: var(--rs-ink); }
.sel:focus-visible { outline: 2px solid var(--rs-ink); outline-offset: 1px; }
.changed .sel { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.save { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: var(--rs-ink); color: var(--rs-on-ink); cursor: pointer; }
.save:disabled { opacity: 0.5; cursor: wait; }
.save:focus-visible { outline: 2px solid var(--rs-ink); outline-offset: 2px; }
.was { font-size: var(--rs-text-xs); color: var(--rs-text-muted); font-family: var(--rs-font-code); }
</style>
