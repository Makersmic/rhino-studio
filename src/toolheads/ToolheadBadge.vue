<script setup lang="ts">
/**
 * Compact toolhead mark: emblem on its accent disc, with name and slot.
 * "verified" = Klipper reported this tool; false shows the hatched look so a
 * guess is never mistaken for a fact.
 */
import { computed } from 'vue'
import Icon from '@/icons/Icon.vue'
import type { ToolheadLook } from './registry'

const props = withDefaults(
  defineProps<{
    look: ToolheadLook
    slot?: number | null
    size?: 'sm' | 'md' | 'lg'
    verified?: boolean
    showSummary?: boolean
  }>(),
  { slot: null, size: 'md', verified: true, showSummary: false },
)

const iconPx = computed(() => ({ sm: 20, md: 26, lg: 40 })[props.size])
</script>

<template>
  <span class="badge" :class="[`size-${size}`, { unverified: !verified }]" :style="{ '--accent': `var(${look.accentVar})` }">
    <span class="disc">
      <Icon :tool="look.icon" :size="iconPx" />
    </span>
    <span class="text">
      <span class="name">{{ look.name }}</span>
      <span v-if="slot != null && size !== 'sm'" class="meta">Slot {{ slot }}</span>
      <span v-if="showSummary" class="summary">{{ look.summary }}</span>
    </span>
  </span>
</template>

<style scoped>
.badge { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.disc {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: var(--rs-radius-md);
  background: var(--rs-surface-2);
  color: var(--rs-text-strong);
  box-shadow: inset 0 0 0 1px var(--rs-line);
  overflow: hidden;
}
/* The tool's colour: a tab on the tile's edge */
.disc::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
.size-sm .disc { width: 32px; height: 32px; }
.size-md .disc { width: 44px; height: 44px; }
.size-lg .disc { width: 60px; height: 60px; border-radius: var(--rs-radius-lg); }
.unverified .disc { background: var(--rs-dither-faint), var(--rs-surface-2); color: var(--rs-text-muted); }
.unverified .disc::after { display: none; }
.text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.name { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.size-lg .name { font-size: var(--rs-text-lg); }
.meta, .summary { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.summary { margin-top: 2px; }
</style>
