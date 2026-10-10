<script setup lang="ts">
/**
 * The signature block: a toolhead as a solid colour tile with its emblem
 * drawn large, framed by crop marks, and its slot as an index number.
 */
import Icon from '@/icons/Icon.vue'
import type { ToolheadLook } from './registry'

withDefaults(
  defineProps<{ look: ToolheadLook; slot?: number | null; caption?: string; mounted?: boolean }>(),
  { slot: null, caption: undefined, mounted: false },
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
  </article>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: var(--rs-space-3);
  padding: var(--rs-space-4) var(--rs-space-5) var(--rs-space-5);
  border-radius: var(--rs-radius-xl);
  background: var(--accent);
  color: var(--th-ink);
  min-width: 0;
}
.top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rs-space-2); }
.name { color: inherit; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); }
.index { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); opacity: 0.7; }

.frame {
  position: relative;
  display: grid;
  place-items: center;
  padding: var(--rs-space-4) 0;
  /* faint dot grid, like drafting paper */
  background-image: radial-gradient(color-mix(in srgb, var(--th-ink) 22%, transparent) 0.8px, transparent 1.2px);
  background-size: 12px 12px;
  background-position: center;
}
.crop { position: absolute; width: 12px; height: 12px; border: 0 solid var(--th-ink); }
.tl { top: 0; left: 0; border-top-width: 1.5px; border-left-width: 1.5px; }
.tr { top: 0; right: 0; border-top-width: 1.5px; border-right-width: 1.5px; }
.bl { bottom: 0; left: 0; border-bottom-width: 1.5px; border-left-width: 1.5px; }
.br { bottom: 0; right: 0; border-bottom-width: 1.5px; border-right-width: 1.5px; }

.foot { display: flex; flex-direction: column; gap: 2px; font-size: var(--rs-text-sm); line-height: 1.35; }
.caption { opacity: 0.72; font-size: var(--rs-text-xs); }
.mounted {
  align-self: flex-start;
  margin-top: var(--rs-space-2);
  padding: 2px 10px;
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--th-ink);
  font-size: var(--rs-text-xs);
  font-weight: var(--rs-weight-medium);
}
</style>
