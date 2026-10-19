<script setup lang="ts">
/** Settings / Connection: where Moonraker and the Rhino Portal are, and connecting on open. */
import './settings.css'
import { ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useSettingsStore, normalizeAddress, portalBase } from '@/stores/settings'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useMachineStore } from '@/stores/machine'

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
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Connection" index="01" panel-id="settings.machine">
        <form class="stack" @submit.prevent="save">
          <label class="field">
            <span>Moonraker address</span>
            <input v-model="address" type="text" placeholder="Leave blank to use this app's address" autocomplete="off" spellcheck="false" />
          </label>
          <p class="muted small">Leave blank when the app is served from the Pi or run with <code>npm run dev</code> (set <code>MOONRAKER=</code> for the dev server instead). Fill it in, for example <code>http://192.168.1.50</code>, only if the app is hosted elsewhere; Moonraker then needs this app's address in <code>cors_domains</code>.</p>
          <label class="field">
            <span>Rhino Portal address (maintenance, toolheads, network)</span>
            <input v-model="portal" type="text" placeholder="Leave blank for /portal on this app's address" autocomplete="off" spellcheck="false" />
          </label>
          <p class="muted small">The Portal runs on the Pi at port 5000. When Studio is served from the Pi, the Pi's nginx forwards <code>/portal</code> to it; in development the dev server does (set <code>PORTAL=</code> to change where).</p>
          <label class="check">
            <input v-model="settings.autoConnect" type="checkbox" />
            Connect when the app opens
          </label>
          <div class="row">
            <RsButton type="submit">Save and reconnect</RsButton>
            <span v-if="saved" class="muted small" role="status">Saved</span>
          </div>
        </form>
        <p class="muted small" style="margin-top: var(--rs-space-4)">How this screen reconnects and handles cameras on a slow link is under <RouterLink to="/settings/network">Network</RouterLink>.</p>
      </RsPanel>
    </div>
  </div>
</template>
