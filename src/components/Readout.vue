<script setup lang="ts">
/**
 * A readout tile, built like the cells of Control's status box (the approved
 * anatomy, used everywhere a big number appears):
 *   label        12px medium, muted, on one 18px line (with an optional note after it)
 *   value        seven-segment numerals right under the label; unit small, top-aligned, tight
 *   detail       11px muted line under the value
 * Everything left-aligned. An em dash in the interface font when there's no data.
 */
defineProps<{ label: string; value?: string | null; unit?: string; detail?: string; note?: string }>()
</script>

<template>
  <div class="readout">
    <span class="label">{{ label }}<em v-if="note">{{ note }}</em></span>
    <span class="value rs-num" :class="{ empty: value == null }">{{ value ?? '—' }}<small v-if="unit && value != null">{{ unit }}</small></span>
    <span v-if="detail" class="detail">{{ detail }}</span>
    <slot />
  </div>
</template>

<style scoped>
.readout {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: var(--rs-space-3) var(--rs-space-5);
  border-radius: var(--rs-radius-lg);
  border: 1px solid var(--rs-line);
  background: var(--rs-surface);
  min-width: 0;
}
.label { font-size: var(--rs-text-xs); line-height: 18px; height: 18px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); white-space: nowrap; }
.label em { font-style: normal; margin-left: 6px; color: var(--rs-text); }
.value { font-size: 2.4rem; line-height: 0.9; margin-top: 6px; white-space: nowrap; }
.value small { font-family: var(--rs-font-ui); font-size: 0.4em; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.detail { font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); white-space: pre-line; }
@media (max-width: 560px) {
  .value { font-size: 2.1rem; }
}
</style>
