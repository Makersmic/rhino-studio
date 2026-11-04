<script setup lang="ts">
/** Settings / Appearance: a typeface for each level of text. Only the family changes, so screens keep their spacing. */
import { computed } from 'vue'
import { usePanelThemeStore } from '@/stores/panelTheme'
import { TYPEFACES } from '@/theme/typefaces'

defineProps<{ /** a theme is being previewed: choosing now would land on the wrong one */ locked: boolean }>()

const themes = usePanelThemeStore()
type Level = 'faceTitle' | 'faceSub' | 'faceBody'
const ROWS: { level: Level; label: string; faces: typeof TYPEFACES; sample: string }[] = [
  { level: 'faceTitle', label: 'Category titles', faces: TYPEFACES, sample: 'Page and panel titles' },
  { level: 'faceSub', label: 'Subcategories', faces: TYPEFACES, sample: 'Section headings' },
  { level: 'faceBody', label: 'Regular text', faces: TYPEFACES.filter((f) => !f.titleOnly), sample: 'Labels, buttons and everything else' },
]
const everyday = (faces: typeof TYPEFACES) => faces.filter((f) => !f.titleOnly)
const posters = (faces: typeof TYPEFACES) => faces.filter((f) => f.titleOnly)
const chosen = computed(() => ({
  faceTitle: themes.pageColours?.faceTitle ?? '',
  faceSub: themes.pageColours?.faceSub ?? '',
  faceBody: themes.pageColours?.faceBody ?? '',
}))
const stackOf = (id: string) => TYPEFACES.find((f) => f.id === id)?.stack ?? 'var(--rs-font-fixed)'
const pick = (level: Level, e: Event) => themes.setTypeface(level, (e.target as HTMLSelectElement).value || null)
</script>

<template>
  <h3 class="sub-h">Typefaces</h3>
  <div class="faces">
    <label v-for="r in ROWS" :key="r.level" class="face">
      <span>{{ r.label }}</span>
      <select :value="chosen[r.level]" :aria-label="r.label" :disabled="locked" @change="pick(r.level, $event)">
        <option value="">Studio's own: Archivo</option>
        <optgroup label="Everyday">
          <option v-for="f in everyday(r.faces)" :key="f.id" :value="f.id">{{ f.label }}</option>
        </optgroup>
        <optgroup v-if="posters(r.faces).length" label="Poster type, for short titles">
          <option v-for="f in posters(r.faces)" :key="f.id" :value="f.id">{{ f.label }}</option>
        </optgroup>
      </select>
      <em aria-hidden="true" :style="{ fontFamily: stackOf(chosen[r.level]) }">{{ r.sample }}</em>
    </label>
  </div>
  <p class="muted small">Only the typeface changes: sizes stay as they are, though a wide font can still fill a tight space. It's saved with the theme in use, for day and night. Big numbers, positions, the console and Stop keep their own fonts.</p>
</template>

<style scoped>
.faces { display: flex; flex-direction: column; gap: var(--rs-space-3); margin-bottom: var(--rs-space-2); }
.face { display: flex; flex-direction: column; gap: 4px; font-size: var(--rs-text-sm); }
.face select { width: 100%; max-width: 420px; height: 38px; padding: 0 10px; font: inherit; color: var(--rs-text-strong); background: var(--rs-surface); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.face em { font-style: normal; font-size: var(--rs-text-md); color: var(--rs-text-strong); }
.small { font-size: var(--rs-text-xs); }
</style>
