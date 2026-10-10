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
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--th-ink);
}
.size-sm .disc { width: 32px; height: 32px; }
.size-md .disc { width: 44px; height: 44px; }
.size-lg .disc { width: 64px; height: 64px; }

.unverified .disc {
  background: repeating-linear-gradient(135deg, transparent 0 4px, var(--rs-hatch) 4px 8px);
  color: var(--rs-text-muted);
  box-shadow: inset 0 0 0 1.5px var(--rs-line-strong);
}

.text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.name {
  font-weight: var(--rs-weight-medium);
  color: var(--rs-text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.size-lg .name { font-size: var(--rs-text-lg); }
.meta, .summary { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.summary { margin-top: 2px; }
</style>
