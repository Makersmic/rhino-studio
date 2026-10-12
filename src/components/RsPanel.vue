<script setup lang="ts">
/**
 * The e-paper module: every card in the app.
 * Header: title on the left, a short live status or actions on the right,
 * then a dotted rule. `index` is accepted for older callers and ignored.
 *
 * panelId: a stable name for this panel ("control.motion"). Panels with one
 * get the ⋮ settings menu in the top-right corner and the user's colours
 * for it (stores/panelTheme.ts). Samples (the style guide) leave it out.
 */
import { computed } from 'vue'
import PanelMenu from './PanelMenu.vue'
import { usePanelThemeStore } from '@/stores/panelTheme'

const props = withDefaults(defineProps<{ title?: string; index?: string; status?: string; flush?: boolean; panelId?: string }>(), {
  title: undefined,
  index: undefined,
  status: undefined,
  flush: false,
  panelId: undefined,
})
const themes = usePanelThemeStore()
const colours = computed(() => themes.styleFor(props.panelId))
</script>

<template>
  <section class="module" :class="{ flush }" :style="colours">
    <header v-if="title || status || $slots.actions || panelId" class="head">
      <h2 v-if="title">{{ title }}</h2>
      <span v-if="status" class="status">{{ status }}</span>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
      <PanelMenu v-if="panelId" :panel-id="panelId" :title="title ?? 'Panel'" class="panel-dots" />
    </header>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.module {
  background: var(--rs-surface);
  border: 1px solid var(--rs-line);
  border-radius: var(--rs-radius-lg);
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.head {
  display: flex;
  align-items: center;
  gap: var(--rs-space-3);
  min-height: 48px;
  padding: 0 var(--rs-space-4) 0 var(--rs-space-5);
  background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 100% / 5px 2px repeat-x;
}
h2 { font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); }
.status { font-size: var(--rs-text-sm); color: var(--rs-text-muted); margin-left: auto; white-space: nowrap; }
.actions { display: flex; align-items: center; gap: var(--rs-space-2); margin-left: auto; }
.status + .actions { margin-left: var(--rs-space-3); }
/* the ⋮ always sits in the top-right corner, after any status or actions */
.panel-dots { margin-left: auto; margin-right: -8px; }
.status ~ .panel-dots, .actions ~ .panel-dots { margin-left: var(--rs-space-1); }
.body { padding: var(--rs-space-3) var(--rs-space-5) var(--rs-space-5); flex: 1; min-width: 0; }
.flush .body { padding: 0; }
</style>
