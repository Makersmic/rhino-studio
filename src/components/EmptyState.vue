<script setup lang="ts">
/** What to show when a screen has nothing yet: say why, and what comes next. */
defineProps<{ title: string; phase?: string }>()
</script>

<template>
  <div class="empty">
    <div class="art" aria-hidden="true"><slot name="art" /></div>
    <div class="text">
      <h2>{{ title }}</h2>
      <p class="body"><slot /></p>
      <p v-if="phase" class="phase">Arrives in {{ phase }}</p>
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  align-items: center;
  gap: var(--rs-space-6);
  padding: var(--rs-space-6);
  border: 1.5px dashed var(--rs-line-strong);
  border-radius: var(--rs-radius-xl);
}
.art { color: var(--rs-text-muted); flex: none; }
.art:empty { display: none; }
.text { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-2); }
.body { color: var(--rs-text-muted); }
.phase {
  margin-top: var(--rs-space-2);
  font-size: var(--rs-text-xs);
  font-weight: var(--rs-weight-medium);
  padding: 3px 12px;
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line-strong);
}
@media (max-width: 560px) { .empty { flex-direction: column; align-items: flex-start; gap: var(--rs-space-4); padding: var(--rs-space-5); } }
</style>
