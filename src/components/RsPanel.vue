<script setup lang="ts">
/** Charcoal panel. Optional index number ("01") sits top-right, like a drawing sheet. */
defineProps<{ title?: string; index?: string }>()
</script>

<template>
  <section class="panel">
    <header v-if="title || index || $slots.actions" class="head">
      <h2 v-if="title">{{ title }}</h2>
      <div class="actions"><slot name="actions" /></div>
      <span v-if="index" class="index">{{ index }}</span>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.panel {
  background: var(--rs-surface);
  border-radius: var(--rs-radius-lg);
  padding: var(--rs-space-5);
  min-width: 0;
}
.head {
  display: flex;
  align-items: baseline;
  gap: var(--rs-space-3);
  margin-bottom: var(--rs-space-4);
}
.actions { display: flex; gap: var(--rs-space-2); margin-left: auto; }
.actions:empty { display: none; }
.index { margin-left: auto; font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.actions:not(:empty) + .index { margin-left: var(--rs-space-3); }
</style>
