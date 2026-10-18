<script setup lang="ts">
/** Settings / Appearance: day or night, and the panel colour theme shared by every screen. */
import './settings.css'
import RsPanel from '@/components/RsPanel.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useThemeStore, type ThemePref } from '@/stores/theme'
import { usePanelThemeStore } from '@/stores/panelTheme'

const theme = useThemeStore()
const panelTheme = usePanelThemeStore()

// ---- Appearance: choices preview straight away, Apply keeps them ----
const DEFAULT = '__default__'
const CURRENT = '__current__'
const lookChoice = ref<ThemePref>(theme.pref)
const themeChoice = ref<string>(CURRENT)
const busy = ref(false)
const message = ref<{ text: string; bad?: boolean } | null>(null)
const newName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const currentLabel = computed(() =>
  panelTheme.activeName ?? (panelTheme.customCount ? 'Your own colours (not saved as a theme)' : 'Default colours'),
)
const pending = computed(() => lookChoice.value !== theme.pref || themeChoice.value !== CURRENT)

watch(lookChoice, (p) => theme.preview(p))
watch(themeChoice, (c) => {
  if (c === CURRENT) panelTheme.cancelPreview()
  else panelTheme.previewTheme(c === DEFAULT ? null : c)
})

function say(text: string, bad = false) {
  message.value = { text, bad }
  setTimeout(() => { if (message.value?.text === text) message.value = null }, 5000)
}
async function apply() {
  busy.value = true
  try {
    theme.pref = lookChoice.value
    if (themeChoice.value !== CURRENT) await panelTheme.applyPreview()
    themeChoice.value = CURRENT
    say(panelTheme.error ?? 'Applied. Every screen connected to the machine now shows this theme.', !!panelTheme.error)
  } finally {
    busy.value = false
  }
}
function revert() {
  lookChoice.value = theme.pref
  themeChoice.value = CURRENT
  theme.unpreview()
  panelTheme.cancelPreview()
}
async function saveTheme() {
  busy.value = true
  try {
    const name = await panelTheme.saveAs(newName.value)
    newName.value = ''
    say(`Saved as "${name}".`)
  } catch (e) {
    say((e as Error).message, true)
  } finally {
    busy.value = false
  }
}
async function deleteTheme() {
  const name = themeChoice.value
  if (name === CURRENT || name === DEFAULT) return
  if (!window.confirm(`Delete the saved theme "${name}"? Panels keep the colours they show now.`)) return
  themeChoice.value = CURRENT
  try {
    await panelTheme.deleteSaved(name)
    say(`Deleted "${name}".`)
  } catch (e) {
    say((e as Error).message, true)
  }
}
function download() {
  const { filename, text } = panelTheme.exportFile()
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function openFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    if (file.size > 200_000) throw new Error('That file is too big to be a theme.')
    const name = await panelTheme.importFile(await file.text(), file.name)
    themeChoice.value = name
    say(`Loaded "${name}". It's showing now; press Apply to keep it.`)
  } catch (err) {
    say((err as Error).message, true)
  }
}
async function resetAll() {
  const name = panelTheme.activeName
  await panelTheme.resetAll()
  say(name ? `All panels back to the default colours. "${name}" is still saved; pick it above to use it again.` : 'All panels back to the default colours.')
}
// Leaving the page without Apply drops the preview
onBeforeUnmount(() => {
  if (pending.value) revert()
})
const options: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Appearance" index="01" panel-id="settings.appearance">
        <h3 class="sub-h">Look</h3>
        <fieldset class="segmented">
          <legend class="visually-hidden">Day or night</legend>
          <label v-for="o in options" :key="o.value" class="seg">
            <input v-model="lookChoice" type="radio" name="theme" :value="o.value" class="visually-hidden" />
            <span>{{ o.label }}</span>
          </label>
        </fieldset>
        <p class="muted small">Day or night is kept in this browser only.</p>

        <h3 class="sub-h">Theme</h3>
        <div class="theme-pick">
          <select v-model="themeChoice" aria-label="Theme">
            <option :value="CURRENT">In use: {{ currentLabel }}</option>
            <option v-if="panelTheme.customCount || panelTheme.activeName" :value="DEFAULT">Default colours</option>
            <option v-for="n in panelTheme.savedNames.filter((x) => x !== panelTheme.activeName)" :key="n" :value="n">{{ n }}</option>
          </select>
          <button v-if="themeChoice !== CURRENT && themeChoice !== DEFAULT" type="button" class="link" @click="deleteTheme">Delete</button>
        </div>
        <p class="muted small">
          A theme is every panel's colours, day and night. Change one panel from the ⋮ in its corner.
          Themes are kept on the machine, so every screen shows the same one.
        </p>

        <div class="apply-row">
          <RsButton variant="primary" :disabled="!pending || busy" @click="apply">Apply</RsButton>
          <RsButton :disabled="!pending || busy" @click="revert">Revert</RsButton>
          <span v-if="pending" class="pending">Showing a preview: Apply to keep it.</span>
        </div>

        <form class="save-row" @submit.prevent="saveTheme">
          <label class="field grow">
            <span>Save the colours in use as a theme</span>
            <input v-model="newName" type="text" maxlength="40" placeholder="Theme name, e.g. Shop night" :disabled="!panelTheme.customCount" />
          </label>
          <RsButton type="submit" :disabled="!newName.trim() || busy || !panelTheme.customCount">Save theme</RsButton>
        </form>

        <div class="file-row">
          <RsButton variant="quiet" :disabled="!panelTheme.customCount" @click="download">Download theme file</RsButton>
          <RsButton variant="quiet" @click="fileInput?.click()">Load theme file…</RsButton>
          <input ref="fileInput" type="file" accept=".json,application/json" class="visually-hidden" @change="openFile" />
          <RsButton v-if="panelTheme.customCount" variant="quiet" class="push" @click="resetAll">Reset all panels</RsButton>
        </div>

        <p v-if="message" class="msg" :class="{ bad: message.bad }" role="status">{{ message.text }}</p>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.theme-pick { display: flex; align-items: center; gap: var(--rs-space-3); margin-bottom: var(--rs-space-2); }
.theme-pick select {
  flex: 1; min-width: 0; height: 38px; padding: 0 10px; border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit;
}
.apply-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-4); }
.pending { font-size: var(--rs-text-sm); color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.save-row { display: flex; align-items: flex-end; gap: var(--rs-space-2); margin-top: var(--rs-space-5); padding-top: var(--rs-space-4); border-top: 1px solid var(--rs-line); }
.save-row .field { margin-bottom: 0; }
.grow { flex: 1; min-width: 0; }
.file-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-3); }
.push { margin-left: auto; }
</style>
