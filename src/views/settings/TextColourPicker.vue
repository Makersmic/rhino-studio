<script setup lang="ts">
/**
 * Settings / Appearance: one text colour across the screen, for the look showing now, over whatever the theme says.
 * Text on filled buttons keeps its own pair, and Stop and an unlocked panel don't change.
 */
import { computed } from 'vue'
import { usePanelThemeStore } from '@/stores/panelTheme'
import { DEFAULTS, worstContrast } from '@/theme/panelColors'

defineProps<{ /** a theme is being previewed: choosing now would land on the wrong one */ locked: boolean }>()

const themes = usePanelThemeStore()
const font = computed(() => themes.pageColours?.font ?? null)
const modeWord = computed(() => (themes.mode === 'day' ? 'day' : 'night'))
const ratio = computed(() => (font.value ? worstContrast(font.value, themes.shown, themes.mode) : null))
const value = (e: Event) => (e.target as HTMLInputElement).value
const SWATCHES = ['#ffffff', '#f4efe2', '#ffe9a8', '#ffd0a6', '#ffc2dc', '#c8e6ff', '#c9f5d4', '#111214', '#1f3e53', '#2e4a2e', '#3a1f4a']
</script>

<template>
  <h3 class="sub-h">Text colour</h3>
  <div class="row">
    <button type="button" class="def" :class="{ on: !font }" :aria-pressed="!font" :disabled="locked" @click="themes.setFont(null)">Theme's own</button>
    <button v-for="c in SWATCHES" :key="c" type="button" class="sw" :class="{ on: font === c }" :style="{ background: c }" :aria-label="`Text colour ${c}`" :aria-pressed="font === c" :title="c" :disabled="locked" @click="themes.setFont(c)" />
    <label class="custom">
      <input type="color" aria-label="Any text colour" :value="font ?? DEFAULTS[themes.mode].text" :disabled="locked" @input="themes.setFont(value($event), false)" @change="themes.setFont(value($event))" />
      <span>Custom</span>
    </label>
  </div>
  <p v-if="ratio !== null && ratio < 4.5" class="warn" role="status">This colour is hard to read on at least one panel here (contrast {{ ratio.toFixed(1) }}:1; aim for 4.5:1 or more).</p>
  <p class="muted small">Sets text, titles and big numbers on every screen, for the {{ modeWord }} look. It's saved with the theme in use. Text on filled buttons, Stop and an unlocked panel keep their own colours.</p>
</template>

<style scoped>
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); margin-bottom: var(--rs-space-2); }
.def, .custom { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; font: inherit; font-size: var(--rs-text-xs); color: var(--rs-text-strong); background: transparent; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); cursor: pointer; }
/* The way back has to stay readable whatever colour was just picked, so these two don't use the theme's colours */
.def, .def.on { color: #111214; background: #ffffff; border-color: #111214; }
.def.on { box-shadow: inset 0 0 0 2px #111214; font-weight: var(--rs-weight-medium); }
.warn { margin: 0 0 var(--rs-space-2); padding: 8px 12px; font-size: var(--rs-text-sm); color: #111214; background: #ffffff; border: 1px solid #111214; border-radius: var(--rs-radius-md); }
.sw { width: 32px; height: 32px; padding: 0; border: 1px solid var(--rs-line-strong); border-radius: 50%; cursor: pointer; }
.sw.on { outline: 3px solid var(--rs-ink); outline-offset: 2px; }
.sw:focus-visible, .def:focus-visible { outline: 3px solid var(--rs-focus-ring); outline-offset: 2px; }
.sw:disabled, .def:disabled { cursor: not-allowed; opacity: 0.5; }
.custom input { width: 22px; height: 22px; padding: 0; background: none; border: 0; cursor: pointer; }
.small { font-size: var(--rs-text-xs); }
</style>
