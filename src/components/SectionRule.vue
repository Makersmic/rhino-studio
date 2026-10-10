<script setup lang="ts">
/** Section divider: a small diamond, the label, then a dotted leader line. */
defineProps<{ label: string }>()
</script>

<template>
  <div class="rule" role="presentation">
    <span class="mark" aria-hidden="true" />
    <span class="label">{{ label }}</span>
    <span class="leader" aria-hidden="true" />
  </div>
</template>

<style scoped>
.rule { display: flex; align-items: center; gap: var(--rs-space-3); margin-top: var(--rs-space-4); padding: 0 var(--rs-space-1); color: var(--rs-text-muted); }
.mark { width: 8px; height: 8px; border: 1.5px solid currentColor; transform: rotate(45deg); flex: none; }
.label { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text); white-space: nowrap; }
.leader { flex: 1; height: 2px; background-image: radial-gradient(currentColor 0.9px, transparent 1.2px); background-size: 6px 2px; opacity: 0.6; }
</style>
