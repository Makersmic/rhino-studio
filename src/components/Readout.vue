<script setup lang="ts">
/**
 * Instrument readout on a cream "paper" tile: label top-left, big light
 * number bottom-left, optional detail on the right. When there's no live
 * value it shows an em dash, never a placeholder number.
 */
defineProps<{ label: string; value?: string | null; unit?: string; detail?: string; note?: string }>()
</script>

<template>
  <div class="readout">
    <div class="head">
      <span class="label">{{ label }}</span>
      <span v-if="note" class="note">{{ note }}</span>
    </div>
    <div class="row">
      <span class="value">{{ value ?? '—' }}<span v-if="unit && value != null" class="unit">{{ unit }}</span></span>
      <span v-if="detail" class="detail">{{ detail }}</span>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.readout {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--rs-space-3);
  min-height: 150px;
  padding: var(--rs-space-4) var(--rs-space-5);
  border-radius: var(--rs-radius-xl);
  background: var(--rs-paper);
  color: var(--rs-paper-ink);
}
.head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--rs-space-3); }
.label { font-weight: var(--rs-weight-medium); }
.note { font-size: var(--rs-text-sm); color: var(--rs-paper-muted); white-space: nowrap; }
.row { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--rs-space-3); }
.value {
  font-size: var(--rs-text-2xl);
  font-weight: var(--rs-weight-light);
  letter-spacing: -0.04em;
  line-height: 0.9;
}
.unit { font-size: 0.5em; margin-left: 2px; letter-spacing: 0; }
.detail { font-size: var(--rs-text-sm); color: var(--rs-paper-muted); text-align: right; white-space: pre-line; }
</style>
