<script setup lang="ts">
/**
 * Settings / Appearance: a picture behind the page. The Rhino keeps the pictures, through the Portal, so they're backed up
 * and every screen shows the same one. The choice belongs to the theme in use.
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { usePanelThemeStore } from '@/stores/panelTheme'
import { useMaintenanceStore } from '@/stores/maintenance'
import { DIM_DEFAULT, DIM_MAX, DIM_MIN, SEE_MAX, type ImageFit } from '@/theme/panelColors'
import { PICTURE_TYPES, preparePicture } from '@/theme/pageImage'
import type { ThemeImages } from '@/portal/client'

const props = defineProps<{ /** a theme is being previewed: choosing now would land on the wrong one */ locked: boolean }>()

const themes = usePanelThemeStore()
const maintenance = useMaintenanceStore()
const portal = computed(() => maintenance.portal())

const list = ref<ThemeImages['images']>([])
const max = ref(12)
const busy = ref(false)
const problem = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)

const current = computed(() => themes.pageColours?.image ?? null)
const dim = computed(() => themes.pageColours?.imageDim ?? DIM_DEFAULT)
const see = computed(() => themes.pageColours?.panelSee ?? 0)
const full = computed(() => list.value.length >= max.value)
const thumb = (name: string) => portal.value?.media(`/theme-media/${name}`) ?? ''

async function refresh() {
  const p = portal.value
  if (!p) {
    problem.value = 'Background pictures are kept on the Rhino. Set the Rhino Portal’s address in Settings > Connection.'
    return
  }
  try {
    const r = await p.themeImages()
    list.value = r.images
    max.value = r.max ?? 12
    problem.value = null
  } catch (e) {
    problem.value = (e as Error).message
  }
}
onMounted(refresh)

async function run(job: () => Promise<void>) {
  busy.value = true
  problem.value = null
  try {
    await job()
  } catch (e) {
    problem.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
function add(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  const p = portal.value
  if (!file || !p) return
  void run(async () => {
    const { blob, filename } = await preparePicture(file)
    const r = await p.addThemeImage(blob, filename)
    list.value = r.images
    await themes.setBackground({ image: r.name })
  })
}
const pick = (name: string | null) => run(() => themes.setBackground({ image: name }))
function remove(name: string) {
  const p = portal.value
  if (!p || !window.confirm('Delete this picture from the Rhino? Any saved theme using it goes back to its plain page colour.')) return
  void run(async () => {
    if (current.value === name) await themes.setBackground({ image: null })
    list.value = (await p.deleteThemeImage(name)).images
  })
}
const fit = computed(() => themes.pageColours?.imageFit ?? 'cover')
const FITS: { value: ImageFit; label: string }[] = [
  { value: 'cover', label: 'Fill the page: enlarges and crops to cover' },
  { value: 'contain', label: 'Fit: the whole picture, with page colour around it' },
  { value: 'stretch', label: 'Stretch: fills the page, changing its shape' },
  { value: 'actual', label: 'Actual size: centred, never enlarged' },
  { value: 'tile', label: 'Tile: repeats at actual size' },
]
const value = (e: Event) => Number((e.target as HTMLInputElement).value)
</script>

<template>
  <h3 class="sub-h">Background picture</h3>
  <p v-if="locked" class="muted small">Apply or revert the theme above first, so the picture goes on the right one.</p>
  <div class="pics" :class="{ off: locked || busy }">
    <button type="button" class="pic none" :class="{ on: !current }" :aria-pressed="!current" :disabled="locked || busy" @click="pick(null)">None</button>
    <div v-for="i in list" :key="i.name" class="cell">
      <button type="button" class="pic" :class="{ on: current === i.name }" :aria-pressed="current === i.name" :aria-label="`Use picture added ${new Date(i.added * 1000).toLocaleDateString()}`" :disabled="locked || busy" :style="{ backgroundImage: `url(&quot;${thumb(i.name)}&quot;)` }" @click="pick(i.name)" />
      <button type="button" class="del" aria-label="Delete this picture" :disabled="busy" @click="remove(i.name)">×</button>
    </div>
    <RsButton :disabled="locked || busy || full || !portal" @click="input?.click()">{{ busy ? 'Working…' : 'Add picture…' }}</RsButton>
    <input ref="input" type="file" :accept="PICTURE_TYPES.join(',')" class="visually-hidden" aria-label="Choose a background picture" @change="add" />
  </div>
  <p v-if="full" class="muted small">That's the {{ max }} the Rhino keeps. Delete one to add another.</p>

  <template v-if="current">
    <label class="slide">
      <span>How it fits</span>
      <select :value="fit" :disabled="locked" @change="themes.setBackground({ imageFit: ($event.target as HTMLSelectElement).value as ImageFit })">
        <option v-for="f in FITS" :key="f.value" :value="f.value">{{ f.label }}</option>
      </select>
    </label>
    <label class="slide">
      <span>Dim the picture <em>{{ dim }} %</em></span>
      <input type="range" :min="DIM_MIN" :max="DIM_MAX" step="5" :value="dim" :disabled="locked" @input="themes.setBackground({ imageDim: value($event) }, false)" @change="themes.setBackground({ imageDim: value($event) })" />
    </label>
    <label class="slide">
      <span>Show it through the panels <em>{{ see }} %</em></span>
      <input type="range" min="0" :max="SEE_MAX" step="5" :value="see" :disabled="locked" @input="themes.setBackground({ panelSee: value($event) }, false)" @change="themes.setBackground({ panelSee: value($event) })" />
    </label>
  </template>
  <p class="muted small">The picture stays behind the panels. The top bar, Stop, alerts and an unlocked panel stay solid. It's saved with the theme in use, for day and night.</p>
  <p v-if="problem" class="msg bad" role="alert">{{ problem }}</p>
</template>

<style scoped>
.pics { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); margin-bottom: var(--rs-space-2); }
.pics.off { opacity: 0.6; }
.cell { position: relative; }
.pic { display: block; width: 88px; height: 56px; padding: 0; font: inherit; font-size: var(--rs-text-xs); color: var(--rs-text-strong); background: var(--rs-surface-2) center / cover no-repeat; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); cursor: pointer; }
.pic.on { outline: 3px solid var(--rs-ink); outline-offset: 1px; }
.pic:focus-visible { outline: 3px solid var(--rs-focus-ring); outline-offset: 1px; }
.pic:disabled { cursor: not-allowed; }
.del { position: absolute; top: -8px; right: -8px; width: 28px; height: 28px; padding: 0; font: inherit; line-height: 1; color: var(--rs-menu-text); background: var(--rs-menu-bg); border: 1px solid var(--rs-line-strong); border-radius: 50%; cursor: pointer; }
.slide { display: flex; flex-direction: column; gap: 4px; margin-top: var(--rs-space-3); font-size: var(--rs-text-sm); }
.slide em { font-style: normal; color: var(--rs-text-muted); }
.slide input { width: 100%; max-width: 360px; min-height: 28px; accent-color: var(--rs-ink); }
.slide select { width: 100%; max-width: 420px; height: 38px; padding: 0 10px; font: inherit; color: var(--rs-text-strong); background: var(--rs-surface); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.small { font-size: var(--rs-text-xs); }
</style>
