<script setup lang="ts">
/**
 * The "What this does" under a wizard step (docs/wizard-rules.md, rule 1): shut by default, one click to open. The plain
 * sentence is in the step; in here goes the real thing: the setting, the file, the command or the G-code.
 */
defineProps<{ title?: string }>()
</script>

<template>
  <details class="wtd">
    <summary>{{ title ?? 'What this does' }}</summary>
    <div class="in"><slot /></div>
  </details>
</template>

<style scoped>
.wtd { border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); }
summary { cursor: pointer; padding: 8px 12px; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
summary:hover { color: var(--rs-text-strong); }
.wtd[open] summary { color: var(--rs-text-strong); border-bottom: 1px solid var(--rs-line); }
.in { padding: 10px 12px; display: flex; flex-direction: column; gap: var(--rs-space-2); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.in :deep(pre) { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--rs-font-code); font-size: var(--rs-text-xs); }
</style>
