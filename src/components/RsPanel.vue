<script setup lang="ts">
/**
 * The e-paper module: every card in the app.
 * Header: title on the left, a short live status or actions on the right,
 * then a dotted rule. `index` is accepted for older callers and ignored.
 */
withDefaults(defineProps<{ title?: string; index?: string; status?: string; flush?: boolean }>(), {
  title: undefined,
  index: undefined,
  status: undefined,
  flush: false,
})
</script>

<template>
  <section class="module" :class="{ flush }">
    <header v-if="title || status || $slots.actions" class="head">
      <h2 v-if="title">{{ title }}</h2>
      <span v-if="status" class="status">{{ status }}</span>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </header>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.module {
  background: var(--rs-surface);
  border: 1px solid var(--rs-line);
  border-radius: var(--rs-radius-lg);
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.head {
  display: flex;
  align-items: center;
  gap: var(--rs-space-3);
  min-height: 48px;
  padding: 0 var(--rs-space-4) 0 var(--rs-space-5);
  background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 100% / 5px 2px repeat-x;
}
h2 { font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); }
.status { font-size: var(--rs-text-sm); color: var(--rs-text-muted); margin-left: auto; white-space: nowrap; }
.actions { display: flex; align-items: center; gap: var(--rs-space-2); margin-left: auto; }
.status + .actions { margin-left: var(--rs-space-3); }
.body { padding: var(--rs-space-4) var(--rs-space-5) var(--rs-space-5); flex: 1; min-width: 0; }
.flush .body { padding: 0; }
</style>
