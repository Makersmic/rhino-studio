<script setup lang="ts">
import RsPanel from '@/components/RsPanel.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useThemeStore, type ThemePref } from '@/stores/theme'
import { useSettingsStore, normalizeAddress, portalBase } from '@/stores/settings'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useMachineStore } from '@/stores/machine'
import { brand } from '@/brand/brand'
import CamerasPanel from '@/webcams/CamerasPanel.vue'
import { usePanelThemeStore } from '@/stores/panelTheme'
import { ADAPTERS } from '@/tools/adapters'

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
const settings = useSettingsStore()
const machine = useMachineStore()
const address = ref(settings.moonrakerUrl)
const portal = ref(settings.portalUrl)
const saved = ref(false)

function save() {
  settings.moonrakerUrl = normalizeAddress(address.value)
  address.value = settings.moonrakerUrl
  machine.connect(settings.moonrakerUrl)
  settings.portalUrl = normalizeAddress(portal.value)
  portal.value = settings.portalUrl
  useMaintenanceStore().start(portalBase(settings.portalUrl))
  saved.value = true
  setTimeout(() => (saved.value = false), 3000)
}
const options: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Settings</h1>
    </div>

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

      <RsPanel title="Machine" index="02" panel-id="settings.machine">
        <form class="stack" @submit.prevent="save">
          <label class="field">
            <span>Moonraker address</span>
            <input v-model="address" type="text" placeholder="Leave blank to use this app's address" autocomplete="off" spellcheck="false" />
          </label>
          <p class="muted small">Leave blank when the app is served from the Pi or run with <code>npm run dev</code> (set <code>MOONRAKER=</code> for the dev server instead). Fill it in, for example <code>http://192.168.1.50</code>, only if the app is hosted elsewhere; Moonraker then needs this app's address in <code>cors_domains</code>.</p>
          <label class="field">
            <span>Rhino Portal address (maintenance)</span>
            <input v-model="portal" type="text" placeholder="Leave blank for /portal on this app's address" autocomplete="off" spellcheck="false" />
          </label>
          <p class="muted small">The Portal runs on the Pi at port 5000. In development the dev server forwards <code>/portal</code> to it (set <code>PORTAL=</code> to change where).</p>
          <label class="check">
            <input v-model="settings.autoConnect" type="checkbox" />
            Connect when the app opens
          </label>
          <div class="row">
            <RsButton type="submit">Save and reconnect</RsButton>
            <span v-if="saved" class="muted small" role="status">Saved</span>
          </div>
        </form>

        <!-- How this machine changes tools: the tool-change adapter -->
        <div class="adapter">
          <label class="field">
            <span>Tool changing</span>
            <select v-model="settings.toolAdapter">
              <option value="auto">Automatic{{ machine.online ? ` (found: ${machine.adapterPick.matched ? machine.adapter.label : 'nothing recognised'})` : '' }}</option>
              <option v-for="a in ADAPTERS" :key="a.id" :value="a.id">{{ a.label }}</option>
            </select>
          </label>
          <p class="muted small">
            {{ machine.adapter.about }}
            <template v-if="machine.online && !machine.adapterPick.matched">
              <strong class="warn-text">This machine doesn't look like {{ settings.toolAdapter === 'auto' ? 'any kind Studio knows' : machine.adapter.label }}, so the mounted tool can't be confirmed and jogging, tool power and jobs stay locked.</strong>
            </template>
          </p>
          <p class="muted small">
            <template v-if="machine.adapter.style === 'automatic'">
              This machine changes tools itself: jobs pick up the tools they use, and a job can start with no tool on the head.
            </template>
            <template v-else>
              On this machine you swap the tool yourself: a job only starts once the tool it needs is confirmed, and every swap is confirmed first.
            </template>
          </p>
          <label v-if="machine.adapter.style === 'automatic'" class="check">
            <input v-model="settings.confirmSwaps" type="checkbox" />
            Ask before tool changes I start from the Swap list
          </label>
          <p v-if="machine.adapter.style === 'automatic' && !settings.confirmSwaps" class="muted small">
            Picking a tool in Swap changes it straight away. Commands typed in the console still ask, and a tool-sensor mismatch still stops everything.
          </p>
        </div>
      </RsPanel>

      <CamerasPanel class="wide" />

      <RsPanel title="About" index="03" panel-id="settings.about">
        <p>{{ brand.name }} {{ brand.version }}</p>
        <p class="muted small">For the {{ brand.machine }}. Free software under GPL-3.0-or-later.</p>
        <p class="small"><RouterLink to="/style">Style guide</RouterLink> <span class="muted">· colours, type, icons and components</span></p>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.wide { grid-column: 1 / -1; }
.segmented { border: 1px solid var(--rs-line-strong); margin: 0 0 var(--rs-space-3); padding: 0; display: inline-flex; border-radius: var(--rs-radius-md); overflow: hidden; }
.seg + .seg span { border-left: 1px solid var(--rs-line-strong); }
.seg span { display: inline-flex; align-items: center; height: 36px; padding: 0 var(--rs-space-4); cursor: pointer; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.seg input:checked + span { background: var(--rs-ink); color: var(--rs-on-ink); }
.seg input:focus-visible + span { box-shadow: var(--rs-focus); }
.field { display: flex; flex-direction: column; gap: var(--rs-space-1); font-size: var(--rs-text-sm); margin-bottom: var(--rs-space-2); }
.field input { height: 38px; padding: 0 12px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); }
.field input:focus-visible { border-color: var(--rs-text-strong); }
.small { font-size: var(--rs-text-sm); }
.stack { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.check { display: flex; align-items: center; gap: var(--rs-space-2); cursor: pointer; }
.check input { width: 18px; height: 18px; accent-color: var(--rs-text-strong); }
.row { display: flex; align-items: center; gap: var(--rs-space-3); }
.sub-h { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); margin: 0 0 var(--rs-space-2); }
.sub-h:not(:first-child) { margin-top: var(--rs-space-5); }
.theme-pick { display: flex; align-items: center; gap: var(--rs-space-3); margin-bottom: var(--rs-space-2); }
.theme-pick select {
  flex: 1; min-width: 0; height: 38px; padding: 0 10px; border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit;
}
.link { padding: 0; border: 0; background: none; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.apply-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-4); }
.pending { font-size: var(--rs-text-sm); color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.save-row { display: flex; align-items: flex-end; gap: var(--rs-space-2); margin-top: var(--rs-space-5); padding-top: var(--rs-space-4); border-top: 1px solid var(--rs-line); }
.save-row .field { margin-bottom: 0; }
.grow { flex: 1; min-width: 0; }
.file-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-3); }
.push { margin-left: auto; }
.msg { margin-top: var(--rs-space-3); padding: 8px 12px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.msg.bad { border-left: 4px solid var(--rs-text-strong); }
.adapter { margin-top: var(--rs-space-5); padding-top: var(--rs-space-4); border-top: 1px solid var(--rs-line); }
.adapter select { height: 38px; padding: 0 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; }
.warn-text { display: block; margin-top: 4px; color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
</style>
