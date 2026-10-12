<script setup lang="ts">
/** Status label. The mark changes shape with tone, so it reads without colour. */
withDefaults(defineProps<{ tone?: 'ok' | 'warn' | 'danger' | 'neutral' }>(), { tone: 'neutral' })
</script>

<template>
  <span class="chip" :class="tone">
    <span class="dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line);
  color: var(--rs-text);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  white-space: nowrap;
}
.dot { width: 8px; height: 8px; border-radius: 50%; }
.ok .dot { background: var(--rs-ink); }
.warn .dot { width: 9px; height: 9px; border-radius: 0; background: var(--rs-dither-dense); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.danger { border-color: var(--rs-danger); color: var(--rs-danger); }
.danger .dot { background: var(--rs-danger); border-radius: 1px; }
.neutral .dot { box-shadow: inset 0 0 0 1.5px var(--rs-text-muted); }
</style>
