<script setup lang="ts">
/** Care at a glance for one toolhead or machine area. */
import Icon from '@/icons/Icon.vue'
import type { ToolheadLook } from '@/toolheads/registry'
import CareBar from './CareBar.vue'
import { careText, type AssetCare } from './summary'

defineProps<{ care: AssetCare; look?: ToolheadLook | null; mounted?: boolean }>()
</script>

<template>
  <article class="tile" :class="care.level">
    <header class="top">
      <span v-if="look" class="disc" :style="{ background: `var(${look.accentVar})` }">
        <Icon :tool="look.icon" :size="26" />
      </span>
      <span class="name">{{ look?.name ?? care.label }}</span>
      <span v-if="mounted" class="mounted">Mounted</span>
    </header>
    <p class="status">{{ careText(care) }}</p>
    <CareBar :fraction="care.worstFraction" :level="care.level" :label="`${care.label}: closest task`" />
    <p v-if="care.next" class="next">
      <span class="muted">Next:</span> {{ care.next.title }}
      <span class="when">{{ care.next.status?.next?.text }}</span>
    </p>
  </article>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: var(--rs-space-2);
  padding: var(--rs-space-4);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  min-width: 0;
}
.top { display: flex; align-items: center; gap: var(--rs-space-2); min-height: 40px; }
.disc { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: var(--th-ink); flex: none; }
.name { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); font-size: var(--rs-text-lg); }
.mounted { margin-left: auto; font-size: var(--rs-text-xs); padding: 2px 9px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); }
.status { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.due_soon .status, .overdue .status { color: var(--rs-warn); }
.next { font-size: var(--rs-text-sm); color: var(--rs-text); }
.when { display: block; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
</style>
