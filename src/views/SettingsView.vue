<script setup lang="ts">
import RsPanel from '@/components/RsPanel.vue'
import { ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useThemeStore, type ThemePref } from '@/stores/theme'
import { useSettingsStore, normalizeAddress, portalBase } from '@/stores/settings'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useMachineStore } from '@/stores/machine'
import { brand } from '@/brand/brand'
import CamerasPanel from '@/webcams/CamerasPanel.vue'
import { usePanelThemeStore } from '@/stores/panelTheme'

const theme = useThemeStore()
const panelTheme = usePanelThemeStore()
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
        <fieldset class="segmented">
          <legend class="visually-hidden">Theme</legend>
          <label v-for="o in options" :key="o.value" class="seg">
            <input v-model="theme.pref" type="radio" name="theme" :value="o.value" class="visually-hidden" />
            <span>{{ o.label }}</span>
          </label>
        </fieldset>
        <p class="muted small">Day or night is saved in this browser only.</p>
        <div class="theme-row">
          <div>
            <strong>Panel colours</strong>
            <p class="muted small">
              {{ panelTheme.customCount ? `${panelTheme.customCount} panel${panelTheme.customCount === 1 ? '' : 's'} with your own colours.` : 'All panels use the default colours.' }}
              Change a panel from the ⋮ in its top-right corner. Saved on the machine, so every screen shows the same theme.
            </p>
          </div>
          <RsButton v-if="panelTheme.customCount" variant="quiet" @click="panelTheme.resetAll()">Reset all panels</RsButton>
        </div>
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
.theme-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--rs-space-4); margin-top: var(--rs-space-5); padding-top: var(--rs-space-4); border-top: 1px solid var(--rs-line); }
.theme-row p { margin-top: 2px; }
</style>
