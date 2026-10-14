<script setup lang="ts">
/** A titled fold-out for advanced settings. Remembers nothing; closed by default. */
defineProps<{ title: string; note?: string }>()
</script>

<template>
  <details class="fold">
    <summary>
      <span class="chev" aria-hidden="true">▸</span>
      <span class="t">{{ title }}</span>
      <span v-if="note" class="n">{{ note }}</span>
    </summary>
    <div class="body"><slot /></div>
  </details>
</template>

<style scoped>
.fold { border-top: 1px solid var(--rs-line); }
summary { display: flex; align-items: baseline; gap: 8px; min-height: 40px; padding: 10px 0; cursor: pointer; list-style: none; color: var(--rs-text-strong); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); }
summary::-webkit-details-marker { display: none; }
.chev { display: inline-block; width: 10px; font-size: 10px; transition: transform var(--rs-dur, 0.15s); }
.fold[open] .chev { transform: rotate(90deg); }
.n { font-size: 11px; font-weight: var(--rs-weight-body); color: var(--rs-text-muted); }
.body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--rs-space-3) var(--rs-space-4); padding: 0 0 var(--rs-space-4); }
.body :deep(.wide) { grid-column: 1 / -1; }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
</style>
