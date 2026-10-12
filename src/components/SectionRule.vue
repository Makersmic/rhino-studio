<script setup lang="ts">
/** Section label followed by a dotted rule. */
defineProps<{ label: string }>()
</script>

<template>
  <div class="rule" role="presentation">
    <span class="label">{{ label }}</span>
    <span class="leader rs-rule" aria-hidden="true" />
  </div>
</template>

<style scoped>
.rule { display: flex; align-items: center; gap: var(--rs-space-3); margin-top: var(--rs-space-4); padding: 0 var(--rs-space-1); }
.label { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); white-space: nowrap; }
.leader { flex: 1; }
</style>
