<script setup lang="ts">
import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import AppTopBar from '@/components/AppTopBar.vue'
import AppRail from '@/components/AppRail.vue'
import AppAlerts from '@/components/AppAlerts.vue'
import ConfirmDialog from '@/control/ConfirmDialog.vue'
import PromptDialog from '@/control/PromptDialog.vue'
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
  document.documentElement.style.setProperty('--rs-active', `var(${v})`)
})

watchEffect(() => {
  const page = route.meta.title as string | undefined
  document.title = page ? `${page} · ${brand.name}` : brand.name
})
</script>

<template>
  <!-- Pendant mode is full screen: no top bar or nav (it has its own Stop) -->
  <RouterView v-if="route.meta.bare" />
  <template v-else>
    <a class="skip" href="#main">Skip to content</a>
    <AppTopBar />
    <div class="body">
      <AppRail />
      <main id="main" tabindex="-1">
        <AppAlerts />
        <RouterView />
      </main>
    </div>
  </template>
  <PromptDialog />
  <ConfirmDialog />
</template>

<style scoped>
.body { display: flex; align-items: flex-start; }
main { flex: 1; min-width: 0; outline: none; }
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
