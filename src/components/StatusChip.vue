<script setup lang="ts">
/** Pill status chip. The dot changes shape with tone, so it reads without colour. */
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
  padding: 0 12px;
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line-strong);
  color: var(--rs-text);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  white-space: nowrap;
}
.dot { width: 8px; height: 8px; border-radius: 50%; }
.ok .dot { background: var(--rs-ok); }
.warn .dot { background: var(--rs-warn); border-radius: 1px; transform: rotate(45deg); }
.danger .dot { background: var(--rs-danger); border-radius: 1px; }
.neutral .dot { box-shadow: inset 0 0 0 1.5px var(--rs-text-muted); }
</style>
