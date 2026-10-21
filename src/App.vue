<script setup lang="ts">
import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import AppTopBar from '@/components/AppTopBar.vue'
import AppRail from '@/components/AppRail.vue'
import AppAlerts from '@/components/AppAlerts.vue'
import ConfirmDialog from '@/control/ConfirmDialog.vue'
import PromptDialog from '@/control/PromptDialog.vue'
import PanelColorDialog from '@/components/PanelColorDialog.vue'
import UntrustedCard from '@/components/UntrustedCard.vue'
import { useMachineStore } from '@/stores/machine'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore, portalBase } from '@/stores/settings'
import { useMaintenanceStore } from '@/stores/maintenance'
import { brand } from '@/brand/brand'

const machine = useMachineStore()
useThemeStore() // applies the saved theme on startup
const route = useRoute()
const settings = useSettingsStore()

// Connecting only reads status; nothing in Phase 2a can move the machine.
if (settings.autoConnect) machine.connect(settings.moonrakerUrl)

// Maintenance comes from the Rhino Portal; reading it never touches the machine
useMaintenanceStore().start(portalBase(settings.portalUrl))

// The whole app follows the mounted toolhead's accent, but only when Klipper
// has verified which tool is on. Otherwise it stays neutral steel.
watchEffect(() => {
  const v = machine.mountedVerified ? machine.mountedLook.accentVar : '--th-unknown'
  // --rs-tool: the mounted tool's accent, used only as small tabs and the top band.
  // --rs-active is the old name for the same thing.
  document.documentElement.style.setProperty('--rs-tool', `var(${v})`)
  document.documentElement.style.setProperty('--rs-active', `var(${v})`)
})

watchEffect(() => {
  const page = route.meta.title as string | undefined
  document.title = page ? `${page} · ${brand.name}` : brand.name
})
</script>

<template>
  <!-- Pendant mode is full screen: no top bar or nav (it has its own Stop) -->
  <template v-if="route.meta.bare">
    <UntrustedCard v-if="machine.untrusted" />
    <RouterView v-else />
  </template>
  <template v-else>
    <a class="skip" href="#main">Skip to content</a>
    <AppTopBar />
    <div class="body">
      <AppRail />
      <main id="main" tabindex="-1">
        <!-- The Dashboard shows the same alerts as its own notices -->
        <!-- Moonraker doesn't trust this screen (Mainsail's "Unauthorized"): say how to fix it -->
        <UntrustedCard v-if="machine.untrusted" />
        <template v-else>
          <AppAlerts v-if="!route.meta.ownAlerts" />
          <RouterView />
        </template>
      </main>
    </div>
  </template>
  <!-- The Dashboard is look-only: wizard questions are answered on Control (its notice says so) -->
  <PromptDialog v-if="!route.meta.lookOnly" />
  <ConfirmDialog />
  <PanelColorDialog />
</template>

<style scoped>
.body { display: flex; align-items: flex-start; }
main { flex: 1; min-width: 0; outline: none; display: flex; flex-direction: column; min-height: calc(100vh - var(--rs-topbar-h)); }
.skip {
  position: absolute;
  left: var(--rs-space-2);
  top: -60px;
  z-index: 50;
  padding: var(--rs-space-2) var(--rs-space-3);
  background: var(--rs-surface-2);
  border-radius: var(--rs-radius-md);
}
.skip:focus { top: var(--rs-space-2); }
</style>
