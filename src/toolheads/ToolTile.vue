<script setup lang="ts">
/**
 * The signature block: a toolhead as a solid colour tile with its emblem
 * drawn large, framed by crop marks, and its slot as an index number.
 */
import Icon from '@/icons/Icon.vue'
import type { ToolheadLook } from './registry'
import CareBar from '@/maintenance/CareBar.vue'
import { careText, type AssetCare } from '@/maintenance/summary'

withDefaults(
  defineProps<{ look: ToolheadLook; slot?: number | null; caption?: string; mounted?: boolean; care?: AssetCare | null }>(),
  { slot: null, caption: undefined, mounted: false, care: null },
)
</script>

<template>
  <article class="tile" :style="{ '--accent': `var(${look.accentVar})` }">
    <header class="top">
      <h3 class="name">{{ look.name }}</h3>
      <span v-if="slot != null" class="index">{{ String(slot).padStart(2, '0') }}</span>
    </header>

    <div class="frame">
      <span class="crop tl" /><span class="crop tr" /><span class="crop bl" /><span class="crop br" />
      <Icon :tool="look.icon" :size="128" :label="look.name" />
    </div>

    <footer class="foot">
      <span>{{ look.summary }}</span>
      <span v-if="caption" class="caption">{{ caption }}</span>
      <span v-if="mounted" class="mounted">Mounted</span>
    </footer>

    <RouterLink v-if="care && care.total" to="/care" class="care" :class="care.level" :title="care.next?.title">
      <span class="care-text">{{ careText(care) }}</span>
      <CareBar :fraction="care.worstFraction" :level="care.level" :label="`${look.name} care`" />
    </RouterLink>
  </article>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--rs-space-3);
  padding: var(--rs-space-4) var(--rs-space-5) var(--rs-space-5);
  border-radius: var(--rs-radius-lg);
  border: 1px solid var(--rs-line);
  background: var(--rs-surface);
  color: var(--rs-text);
  min-width: 0;
  overflow: hidden;
}
/* The tool's colour: one tab along the top edge */
.tile::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--accent); }
.top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rs-space-2); }
.name { color: var(--rs-text-strong); font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); }
.index { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.frame {
  position: relative;
  display: grid;
  place-items: center;
  padding: var(--rs-space-4) 0;
  color: var(--rs-text-strong);
  background: var(--rs-dither-faint);
}
.crop { position: absolute; width: 10px; height: 10px; border: 0 solid var(--rs-line-strong); }
.tl { top: 0; left: 0; border-top-width: 1px; border-left-width: 1px; }
.tr { top: 0; right: 0; border-top-width: 1px; border-right-width: 1px; }
.bl { bottom: 0; left: 0; border-bottom-width: 1px; border-left-width: 1px; }
.br { bottom: 0; right: 0; border-bottom-width: 1px; border-right-width: 1px; }
.foot { display: flex; flex-direction: column; gap: 2px; font-size: var(--rs-text-sm); line-height: 1.35; }
.caption { color: var(--rs-text-muted); font-size: var(--rs-text-xs); }
.mounted {
  align-self: flex-start;
  margin-top: var(--rs-space-2);
  padding: 2px 9px;
  border-radius: var(--rs-radius-sm);
  background: var(--rs-ink);
  color: var(--rs-on-ink);
  font-size: var(--rs-text-xs);
  font-weight: var(--rs-weight-medium);
}
.care {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  padding-top: var(--rs-space-3);
  color: var(--rs-text);
  text-decoration: none;
  font-size: var(--rs-text-xs);
  background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 0 / 5px 2px repeat-x;
}
.care-text { font-weight: var(--rs-weight-medium); }
.care.due_soon .care-text, .care.overdue .care-text { color: var(--rs-text-strong); }
</style>
