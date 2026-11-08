<script setup lang="ts">
/**
 * Where you are in a job setup: File -> Process -> Setup -> Preview -> Job file (Mike, Nov 7).
 * File and Process are buttons once done, and take you back to them. Past Process, Setup, Preview and Job file are
 * all buttons: moving between them keeps everything as it was.
 */
type Step = 'file' | 'process' | 'setup' | 'preview' | 'jobfile'
const props = defineProps<{ step: Step }>()
const emit = defineEmits<{ go: [step: Step] }>()

const steps = [
  { id: 'file', label: 'File', detail: 'Drop a model or drawing' },
  { id: 'process', label: 'Process', detail: 'Confirm what the Rhino does' },
  { id: 'setup', label: 'Setup', detail: 'Place it and set it' },
  { id: 'preview', label: 'Preview', detail: 'Every layer and move' },
  { id: 'jobfile', label: 'Job file', detail: 'Check, send, start' },
] as const
const order = { file: 0, process: 1, setup: 2, preview: 3, jobfile: 4 } as const
/** a step you can go to from here */
const goable = (s: Step) => s !== props.step && (order[s] < order[props.step] || (order[props.step] >= order.setup && order[s] >= order.setup))
const done = (s: Step) => order[s] < order[props.step] && order[s] < order.setup
</script>

<template>
  <ol class="steps" aria-label="Job setup steps">
    <li v-for="(s, i) in steps" :key="s.id" :class="{ now: s.id === step, done: done(s.id), open: goable(s.id) }" :aria-current="s.id === step ? 'step' : undefined">
      <component :is="goable(s.id) ? 'button' : 'span'" type="button" class="inner" @click="goable(s.id) && emit('go', s.id)">
        <span class="num">{{ done(s.id) ? '✓' : String(i + 1).padStart(2, '0') }}</span>
        <span class="text">
          <span class="label">{{ s.label }}</span>
          <span class="detail">{{ s.detail }}</span>
        </span>
      </component>
    </li>
  </ol>
</template>

<style scoped>
.steps { list-style: none; margin: 0 0 var(--rs-gap); padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.open .inner { color: var(--rs-text-strong); }
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
@media (max-width: 520px) { .num { display: none; } .inner { justify-content: center; padding: 6px 4px; text-align: center; } .label { font-size: var(--rs-text-xs); } }
</style>
