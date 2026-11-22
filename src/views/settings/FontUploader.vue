<script setup lang="ts">
/**
 * Settings / Appearance / Text: fonts the person adds. The Rhino keeps the files, through the Portal, so every screen has them
 * and they're backed up. Once added, a font is offered in every typeface drop-down above.
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useFontsStore } from '@/stores/fonts'
import { usePanelThemeStore } from '@/stores/panelTheme'
import { FONT_TYPES, uploadedFamily, uploadedId } from '@/theme/typefaces'
import { fontsUsed } from '@/theme/uploadedFonts'

const fonts = useFontsStore()
const themes = usePanelThemeStore()
const input = ref<HTMLInputElement | null>(null)
const inUse = computed(() => new Set(fontsUsed(themes.pageColours)))
onMounted(() => void fonts.refresh())

async function add(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) await fonts.add(file)
}
function remove(name: string, label: string) {
  const used = inUse.value.has(name)
  const text = used
    ? `Delete "${label}" from the Rhino? The theme in use shows it now, and goes back to Archivo for that text.`
    : `Delete "${label}" from the Rhino? Any saved theme using it goes back to Archivo for that text.`
  if (window.confirm(text)) void fonts.remove(name)
}
</script>

<template>
  <ul v-if="fonts.list.length" class="fonts">
    <li v-for="f in fonts.list" :key="f.name">
      <span class="name">{{ f.label }}</span>
      <em class="sample" :style="{ fontFamily: `'${uploadedFamily(f.name)}', 'Archivo Variable', sans-serif` }">The quick brown fox jumps over the lazy dog 0123456789</em>
      <span class="meta">{{ Math.max(1, Math.round(f.size / 1024)) }} KB<template v-if="inUse.has(f.name)"> · in use</template></span>
      <button type="button" class="link" :disabled="fonts.busy" :aria-label="`Delete ${f.label}`" :data-id="uploadedId(f.name)" @click="remove(f.name, f.label)">Delete</button>
    </li>
  </ul>
  <p v-else class="muted small">No fonts added yet. Add a WOFF2, WOFF, TTF or OTF file and it appears in the typeface lists above.</p>
  <div class="row">
    <RsButton :disabled="fonts.busy || fonts.full" @click="input?.click()">{{ fonts.busy ? 'Working…' : 'Add font…' }}</RsButton>
    <input ref="input" type="file" :accept="FONT_TYPES.join(',')" class="visually-hidden" aria-label="Choose a font file" @change="add" />
  </div>
  <p v-if="fonts.full" class="muted small">That's the {{ fonts.max }} the Rhino keeps. Delete one to add another.</p>
  <p class="muted small">Up to 2 MB each. A WOFF2 file is the smallest. Use fonts you have the right to use: Studio doesn't check licences. A font missing a letter shows Archivo for it, and if the Rhino can't be reached Studio shows Archivo until it can. Big numbers, positions, the console and Stop keep their own fonts.</p>
  <p v-if="fonts.problem" class="msg bad" role="alert">{{ fonts.problem }}</p>
</template>

<style scoped>
.fonts { list-style: none; margin: 0 0 var(--rs-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--rs-space-3); }
.fonts li { display: grid; grid-template-columns: 1fr auto auto; align-items: baseline; gap: 2px var(--rs-space-3); padding-bottom: var(--rs-space-3); border-bottom: 1px solid var(--rs-line); }
.name { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); min-width: 0; overflow-wrap: anywhere; }
.sample { grid-column: 1 / -1; grid-row: 2; font-style: normal; font-size: var(--rs-text-md); color: var(--rs-text-strong); overflow-wrap: anywhere; }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.row { display: flex; gap: var(--rs-space-2); margin-bottom: var(--rs-space-2); }
.small { font-size: var(--rs-text-xs); }
</style>
