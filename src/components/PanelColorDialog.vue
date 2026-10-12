<script setup lang="ts">
/**
 * Colours for one panel: background, text, and border & dividers, for day or
 * night. Changes preview live on the panel itself (when editing the mode
 * that's showing) and in the sample here; Save puts them in the machine's
 * theme so every screen shows them.
 *
 * Warns, without blocking, when text would be hard to read or a colour is
 * close to the red (stop) or orange (swap) the app reserves. Those reserved
 * colours are never changed by a theme.
 */
import { computed, nextTick, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { usePanelThemeStore } from '@/stores/panelTheme'
import { DEFAULTS, SWATCHES, baseVars, contrast, panelVars, reservedHue, type Mode, type PanelColors } from '@/theme/panelColors'

const store = usePanelThemeStore()
const dlg = ref<HTMLDialogElement | null>(null)

watch(
  () => store.editing,
  async (e) => {
    if (!e) {
      if (dlg.value?.open) dlg.value.close()
      return
    }
    await nextTick()
    if (!dlg.value?.open) dlg.value?.showModal()
  },
)

const ROWS: { key: keyof PanelColors; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'text', label: 'Text' },
  { key: 'border', label: 'Border and dividers' },
]

const effective = computed(() => ({ ...DEFAULTS[store.draftMode], ...store.draft }) as Required<PanelColors>)
const ratio = computed(() => contrast(effective.value.text, effective.value.bg))
const reserved = computed(() => {
  for (const r of ROWS) {
    const v = store.draft[r.key]
    const hue = v ? reservedHue(v) : null
    if (hue) return { row: r.label, hue }
  }
  return null
})
const previewStyle = computed(() => ({ ...baseVars(store.draftMode), ...panelVars(store.draft) }))
const livePreview = computed(() => store.draftMode === store.mode)

function set(key: keyof PanelColors, value: string | undefined) {
  const next = { ...store.draft }
  if (value) next[key] = value.toLowerCase()
  else delete next[key]
  store.draft = next
}
const pickMode = (m: Mode) => store.switchDraftMode(m)
</script>

<template>
  <dialog ref="dlg" class="dlg" aria-labelledby="pc-title" @cancel.prevent="store.cancelEdit()">
    <div v-if="store.editing" class="body">
      <header class="top">
        <div>
          <h2 id="pc-title">Panel colours</h2>
          <p class="sub">{{ store.editing.title }}</p>
        </div>
        <div class="seg" role="radiogroup" aria-label="Which look">
          <button type="button" role="radio" :aria-checked="store.draftMode === 'day'" :class="{ on: store.draftMode === 'day' }" @click="pickMode('day')">Day</button>
          <button type="button" role="radio" :aria-checked="store.draftMode === 'night'" :class="{ on: store.draftMode === 'night' }" @click="pickMode('night')">Night</button>
        </div>
      </header>

      <!-- a small sample of the panel in the colours being picked -->
      <div class="sample" :style="previewStyle" aria-hidden="true">
        <div class="s-head">{{ store.editing.title }}</div>
        <div class="s-body">
          <span class="s-text">Text like this</span>
          <span class="s-muted">and quieter labels</span>
          <span class="s-btns"><span class="s-btn">Button</span><span class="s-btn on">Selected</span></span>
        </div>
      </div>

      <section v-for="r in ROWS" :key="r.key" class="row">
        <h3>{{ r.label }}</h3>
        <div class="swatches">
          <button type="button" class="def" :class="{ on: !store.draft[r.key] }" @click="set(r.key, undefined)">Default</button>
          <button
            v-for="c in SWATCHES"
            :key="c"
            type="button"
            class="sw"
            :class="{ on: store.draft[r.key] === c }"
            :style="{ background: c }"
            :aria-label="c"
            :title="c"
            @click="set(r.key, c)"
          />
          <label class="custom" :title="'Any colour'">
            <input type="color" :value="effective[r.key]" @input="set(r.key, ($event.target as HTMLInputElement).value)" />
            <span>Custom</span>
          </label>
        </div>
      </section>

      <p v-if="ratio < 4.5" class="warn">Text may be hard to read on this background (contrast {{ ratio.toFixed(1) }}:1; aim for 4.5:1 or more).</p>
      <p v-if="reserved" class="warn">{{ reserved.row }} is close to the {{ reserved.hue }} the app keeps for {{ reserved.hue === 'red' ? 'Stop and Cancel' : 'choosing a tool to swap to' }}. Those still show in their own colours, but they'll stand out less.</p>
      <p class="note">
        <template v-if="livePreview">The panel shows these colours while you choose.</template>
        <template v-else>You're editing the {{ store.draftMode }} look; you'll see it on the panel when the app is in {{ store.draftMode }} mode.</template>
        Saved on the machine, so every screen gets them. Red stop buttons, the orange swap list and graph lines never change.
      </p>
      <p v-if="store.error" class="warn">{{ store.error }}</p>

      <footer class="actions">
        <RsButton variant="primary" @click="store.saveEdit()">Save to theme</RsButton>
        <RsButton @click="store.cancelEdit()">Cancel</RsButton>
        <button type="button" class="reset" @click="store.draft = {}">Use default colours</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(560px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  padding: 0;
  border: 2px solid var(--rs-line-strong);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  color: var(--rs-text);
}
.dlg::backdrop { background: rgb(0 0 0 / 0.35); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5); }
.top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--rs-space-4); }
h2 { font-size: var(--rs-text-xl); font-weight: var(--rs-weight-body); letter-spacing: -0.02em; }
.sub { margin-top: 2px; color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.seg { display: inline-flex; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; flex: none; }
.seg button { height: 30px; padding: 0 14px; border: 0; background: transparent; color: var(--rs-text-strong); font-size: var(--rs-text-sm); cursor: pointer; }
.seg button.on { background: var(--rs-ink); color: var(--rs-on-ink); }

.sample {
  border: 1px solid var(--rs-line-strong);
  border-radius: var(--rs-radius-md);
  background: var(--rs-surface);
  color: var(--rs-text);
  overflow: hidden;
}
.s-head { padding: 10px 14px; font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 100% / 5px 2px repeat-x; }
.s-body { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 10px 14px 14px; }
.s-text { color: var(--rs-text-strong); }
.s-muted { color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.s-btns { display: inline-flex; gap: 6px; margin-left: auto; }
.s-btn { padding: 4px 10px; border-radius: var(--rs-radius-sm); border: 1px solid var(--rs-line); background: var(--rs-surface-2); color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.s-btn.on { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }

.row h3 { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); margin-bottom: 6px; }
.swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.sw { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--rs-line-strong); cursor: pointer; padding: 0; }
.sw.on { outline: 2px solid var(--rs-text-strong); outline-offset: 2px; }
.def, .custom { height: 26px; padding: 0 10px; border-radius: 13px; border: 1px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-size: var(--rs-text-xs); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.def.on { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.custom input { width: 18px; height: 18px; padding: 0; border: 0; background: none; cursor: pointer; }

.warn { padding: 8px 12px; border-radius: var(--rs-radius-md); border-left: 4px solid var(--rs-text-strong); background: var(--rs-surface-2); color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.note { font-size: var(--rs-text-xs); color: var(--rs-text-muted); line-height: 1.45; }
.actions { display: flex; align-items: center; gap: var(--rs-space-2); }
.reset { margin-left: auto; padding: 0; border: 0; background: none; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
