<script setup lang="ts">
/** A readout cell: label, a big seven-segment number, detail. An em dash when there's no data. */
defineProps<{ label: string; value?: string | null; unit?: string; detail?: string; note?: string }>()
</script>

<template>
  <div class="readout">
    <div class="head">
      <span class="label">{{ label }}</span>
      <span v-if="note" class="note">{{ note }}</span>
    </div>
    <div class="row">
      <span class="value rs-num">{{ value ?? '—' }}<span v-if="unit && value != null" class="unit">{{ unit }}</span></span>
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
  min-height: 132px;
  padding: var(--rs-space-4) var(--rs-space-5);
  border-radius: var(--rs-radius-lg);
  border: 1px solid var(--rs-line);
  background: var(--rs-surface);
}
.head { display: flex; justify-content: space-between; gap: var(--rs-space-3); }
.label { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text); }
.note { font-size: var(--rs-text-sm); color: var(--rs-text-muted); white-space: nowrap; }
.row { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--rs-space-3); }
.value { font-size: var(--rs-text-2xl); }
.unit { font-family: var(--rs-font-ui); font-size: 0.32em; font-weight: var(--rs-weight-medium); margin-left: 4px; color: var(--rs-text-muted); }
.detail { font-size: var(--rs-text-sm); color: var(--rs-text-muted); text-align: right; white-space: pre-line; }
@media (max-width: 560px) {
  .readout { min-height: 108px; padding: var(--rs-space-3) var(--rs-space-4); }
  .value { font-size: 2.25rem; }
  .detail { display: none; }
}
</style>
