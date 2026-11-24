<script setup lang="ts">
/**
 * The step bar of a wizard: numbered steps, the one you are on filled in, earlier ones clickable to go back.
 * Shared by the newer wizards (connect, update, positions, nozzle cleaning); the older ones keep their own copy.
 */
defineProps<{ steps: { id: string; label: string; help?: string }[]; at: number }>()
defineEmits<{ go: [index: number] }>()
</script>

<template>
  <ol class="wsteps" aria-label="Steps">
    <li v-for="(s, i) in steps" :key="s.id" :class="{ now: i === at, done: i < at }" :aria-current="i === at ? 'step' : undefined">
      <component :is="i < at ? 'button' : 'span'" type="button" class="in" @click="i < at && $emit('go', i)">
        <span class="num">{{ i < at ? '✓' : String(i + 1).padStart(2, '0') }}</span>
        <span class="txt"><span class="lab">{{ s.label }}</span><span v-if="s.help" class="det">{{ s.help }}</span></span>
      </component>
    </li>
  </ol>
</template>

<style scoped>
.wsteps { list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; }
.wsteps li { min-width: 0; }
.in { display: flex; align-items: flex-start; gap: 10px; width: 100%; height: 100%; padding: 10px 12px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); text-align: left; font: inherit; color: inherit; box-sizing: border-box; }
button.in { cursor: pointer; }
button.in:hover { border-color: var(--rs-line-strong); }
.num { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-muted); padding-top: 1px; }
.txt { display: flex; flex-direction: column; min-width: 0; }
.lab { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.det { font-size: 11px; color: var(--rs-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.now .in { background: var(--rs-ink); border-color: var(--rs-ink); }
.now .lab, .now .num { color: var(--rs-on-ink); }
.now .det { color: var(--rs-on-ink); opacity: 0.75; }
.done .num { color: var(--rs-text-strong); }
@media (max-width: 900px) {
  .wsteps { grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .det { display: none; }
}
</style>
