<script setup lang="ts">
import { brand, logoSvg } from './brand'

withDefaults(defineProps<{ size?: number; showName?: boolean }>(), {
  size: 30,
  showName: true,
})
</script>

<template>
  <span class="brand-mark">
    <span class="logo" :style="{ width: `${size}px`, height: `${size}px` }" v-html="logoSvg" />
    <span v-if="showName" class="name" :style="{ fontSize: `${Math.max(15, size * 0.6)}px` }">
      <span class="full">{{ brand.name }}</span>
      <span class="short">{{ brand.shortName }}</span>
    </span>
  </span>
</template>

<style scoped>
.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--rs-text-strong);
}
.logo { display: inline-flex; flex: none; }
.logo :deep(svg) { width: 100%; height: 100%; }
.name {
  font-weight: var(--rs-weight-bold);
  font-stretch: 118%;
  letter-spacing: -0.015em;
  white-space: nowrap;
  line-height: 1;
}
.short { display: none; }
@media (max-width: 560px) {
  .full { display: none; }
  .short { display: inline; }
}
</style>
