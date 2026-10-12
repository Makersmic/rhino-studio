<script setup lang="ts">
/**
 * The ⋮ in a panel's top-right corner: that panel's own settings.
 * For now: its colours (opens the colour picker) and a reset. Vertical dots,
 * so it never looks like the horizontal ••• that widens a temperature graph.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { usePanelThemeStore } from '@/stores/panelTheme'

const props = defineProps<{ panelId: string; title: string }>()
const themes = usePanelThemeStore()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const first = ref<HTMLButtonElement | null>(null)
// Fixed to the window, so a panel that clips its contents can't cut the menu off
const at = ref({ top: 0, right: 0 })
function place() {
  const r = root.value?.getBoundingClientRect()
  if (r) at.value = { top: Math.round(r.bottom + 4), right: Math.max(8, Math.round(window.innerWidth - r.right)) }
}
const close = () => (open.value = false)

function colours() {
  open.value = false
  themes.startEdit(props.panelId, props.title)
}
function reset() {
  open.value = false
  void themes.reset(props.panelId)
}

const onOutside = (e: PointerEvent) => {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    open.value = false
    root.value?.querySelector<HTMLButtonElement>('.dots')?.focus()
  }
}
watch(open, async (o) => {
  if (o) {
    place()
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    await nextTick()
    first.value?.focus()
  } else {
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('scroll', close, true)
    window.removeEventListener('resize', close)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <div ref="root" class="panel-menu">
    <button
      type="button"
      class="dots"
      :class="{ open }"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="`${title} settings`"
      :title="`${title} settings`"
      @click="open = !open"
    >
      <svg viewBox="0 0 4 16" width="4" height="16" aria-hidden="true">
        <circle cx="2" cy="2" r="1.6" /><circle cx="2" cy="8" r="1.6" /><circle cx="2" cy="14" r="1.6" />
      </svg>
    </button>
    <div v-if="open" class="pm-list" role="menu" :style="{ top: `${at.top}px`, right: `${at.right}px` }" :aria-label="`${title} settings`">
      <p class="head">{{ title }}</p>
      <button ref="first" type="button" role="menuitem" class="item" @click="colours">Panel colours…</button>
      <button type="button" role="menuitem" class="item" :disabled="!themes.isCustom(panelId)" @click="reset">Reset to default colours</button>
    </div>
  </div>
</template>

<style scoped>
.panel-menu { position: relative; flex: none; }
.dots {
  display: grid;
  place-items: center;
  width: 26px;
  height: 28px;
  border: 0;
  border-radius: var(--rs-radius-sm);
  background: transparent;
  color: var(--rs-text-muted);
  cursor: pointer;
}
.dots svg { fill: currentColor; }
.dots:hover, .dots.open { color: var(--rs-text-strong); background: var(--rs-surface-2); }
.pm-list {
  position: fixed;
  z-index: 60;
  min-width: 210px;
  padding: 6px;
  border-radius: var(--rs-radius-md);
  border: 1px solid color-mix(in srgb, var(--rs-menu-text) 35%, transparent);
  /* the menu keeps the app's own colours, whatever the panel is painted */
  background: var(--rs-menu-bg, #121314);
  color: var(--rs-menu-text, #ecebe6);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.28);
}
.head { margin: 0; padding: 6px 8px; font-size: 11px; font-weight: var(--rs-weight-medium); opacity: 0.7; }
.item {
  display: block;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: var(--rs-radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--rs-text-sm);
  text-align: left;
  cursor: pointer;
}
.item:hover:not(:disabled), .item:focus-visible { background: var(--rs-menu-text, #ecebe6); color: var(--rs-menu-bg, #121314); outline: none; }
.item:disabled { opacity: 0.4; cursor: default; }
</style>
