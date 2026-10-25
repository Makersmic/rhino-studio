<script setup lang="ts">
/**
 * The e-paper module: every card in the app.
 * Header: title on the left, a short live status or actions on the right,
 * then a dotted rule. `index` is accepted for older callers and ignored.
 *
 * panelId: a stable name for this panel ("control.motion"). Panels with one
 * get the ⋮ settings menu in the top-right corner and the user's colours
 * for it (stores/panelTheme.ts). Samples (the style guide) leave it out.
 *
 * collapsible: a chevron before the title folds the body away. Remembered per
 * browser (a convenience only, nothing durable), keyed by panelId. Emits
 * `collapse` when it folds, so a panel can lock itself (nothing stays live
 * out of sight).
 */
import { computed, ref } from 'vue'
import PanelMenu from './PanelMenu.vue'
import { usePanelThemeStore } from '@/stores/panelTheme'

const props = withDefaults(defineProps<{ title?: string; index?: string; status?: string; flush?: boolean; panelId?: string; live?: boolean; collapsible?: boolean }>(), {
  title: undefined,
  index: undefined,
  status: undefined,
  flush: false,
  panelId: undefined,
})
const themes = usePanelThemeStore()
const colours = computed(() => themes.styleFor(props.panelId))
const emit = defineEmits<{ collapse: [] }>()

const FOLD_KEY = 'rs.panel.folded'
function readFolds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const folded = ref(!!props.collapsible && !!props.panelId && readFolds().includes(props.panelId))
function toggleFold() {
  folded.value = !folded.value
  if (folded.value) emit('collapse')
  if (!props.panelId) return
  try {
    const rest = readFolds().filter((x) => x !== props.panelId)
    localStorage.setItem(FOLD_KEY, JSON.stringify(folded.value ? [...rest, props.panelId] : rest))
  } catch {
    /* private window or blocked storage: it just won't be remembered */
  }
}
</script>

<template>
  <!-- live: unlocked (red panel, see .rs-live in base.css); a panel's own colours step aside meanwhile -->
  <section class="module" :class="{ flush, folded, 'rs-live': live }" :style="live ? undefined : colours">
    <header v-if="title || status || $slots.actions || panelId" class="head">
      <button v-if="collapsible" type="button" class="fold" :aria-expanded="!folded" :aria-label="`${folded ? 'Show' : 'Hide'} ${title ?? 'panel'}`" @click="toggleFold">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <h2 v-if="title">{{ title }}</h2>
      </button>
      <h2 v-else-if="title">{{ title }}</h2>
      <span v-if="status" class="status">{{ status }}</span>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
      <PanelMenu v-if="panelId" :panel-id="panelId" :title="title ?? 'Panel'" class="panel-dots" />
    </header>
    <div v-show="!folded" class="body"><slot /></div>
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
.fold { display: inline-flex; align-items: center; gap: 8px; margin-left: -6px; padding: 4px 6px; border: 0; border-radius: var(--rs-radius-sm); background: none; color: var(--rs-text-strong); font: inherit; cursor: pointer; }
.fold svg { color: var(--rs-text-muted); transition: transform 0.15s ease; }
.folded .fold svg { transform: rotate(-90deg); }
.fold:hover { background: var(--rs-surface-2); }
.fold:focus-visible { box-shadow: var(--rs-focus); outline: none; }
.folded .head { background: none; }
</style>
