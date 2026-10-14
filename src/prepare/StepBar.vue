<script setup lang="ts">
/**
 * Where you are in a job setup: File -> Process -> Set up & send.
 * Done steps are buttons that take you back to them.
 */
defineProps<{ step: 'file' | 'process' | 'setup' }>()
const emit = defineEmits<{ go: [step: 'file' | 'process'] }>()

const steps = [
  { id: 'file', label: 'File', detail: 'Drop a model or drawing' },
  { id: 'process', label: 'Process', detail: 'Confirm what the Rhino does' },
  { id: 'setup', label: 'Set up & send', detail: 'Place, set, check, send' },
] as const
const order = { file: 0, process: 1, setup: 2 } as const
</script>

<template>
  <ol class="steps" aria-label="Job setup steps">
    <li v-for="(s, i) in steps" :key="s.id" :class="{ now: s.id === step, done: order[s.id] < order[step] }" :aria-current="s.id === step ? 'step' : undefined">
      <component :is="order[s.id] < order[step] && s.id !== 'setup' ? 'button' : 'span'" type="button" class="inner" @click="order[s.id] < order[step] && s.id !== 'setup' && emit('go', s.id)">
        <span class="num">{{ order[s.id] < order[step] ? '✓' : String(i + 1).padStart(2, '0') }}</span>
        <span class="text">
          <span class="label">{{ s.label }}</span>
          <span class="detail">{{ s.detail }}</span>
        </span>
      </component>
    </li>
  </ol>
</template>

<style scoped>
.steps { list-style: none; margin: 0 0 var(--rs-gap); padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.inner { display: flex; align-items: center; gap: var(--rs-space-3); width: 100%; min-height: 56px; padding: 8px var(--rs-space-4); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-muted); font: inherit; text-align: left; }
button.inner { cursor: pointer; }
button.inner:hover { border-color: var(--rs-line-strong); color: var(--rs-text-strong); }
.now .inner { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.done .inner { color: var(--rs-text-strong); }
.num { font-family: var(--rs-font-code); font-size: var(--rs-text-sm); min-width: 20px; }
.text { display: flex; flex-direction: column; min-width: 0; }
.label { font-weight: var(--rs-weight-medium); font-size: var(--rs-text-sm); }
.detail { font-size: 11px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 720px) { .detail { display: none; } .inner { min-height: 44px; padding: 6px 10px; } }
</style>
