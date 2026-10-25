<script setup lang="ts">
/**
 * Settings / Host / Name on the network (moved from Network, Mike 2026-10-25).
 * The same Portal route as before (/api/net/hostname, through the network
 * store); a rename waits to be kept like every network change, so the
 * Keep / Undo box shows here too while one is waiting.
 * No password field: the Portal renames through its own sudoers rule, so no
 * password ever travels over HTTP (design note pending, handoff 2026-10-25).
 */
import { computed, onMounted, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useNetworkStore } from '@/stores/network'
import { useMachineStore } from '@/stores/machine'
import { hostnameError } from '@/system/network'

const net = useNetworkStore()
const machine = useMachineStore()
onMounted(() => void net.loadPi())
watch(() => machine.online, (on) => on && void net.loadPi())

const hostname = ref('')
watch(() => net.pi?.hostname, (h) => h && !hostname.value && (hostname.value = h), { immediate: true })
const hostErr = computed(() => (hostname.value && hostname.value !== net.pi?.hostname ? hostnameError(hostname.value) : null))
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`
</script>

<template>
  <RsPanel title="Name on the network" panel-id="settings.host.hostname">
    <div class="set-page inner">
      <div v-if="net.pending" class="pending" role="alert">
        <strong>{{ net.pending.summary }}</strong> <span class="mono small">{{ mmss(net.pendingSeconds) }}</span>
        <p class="small">Switches back when the time runs out. Keep it if this screen still works.</p>
        <p v-if="net.pending.confirm_url" class="small">Open <a :href="net.pending.confirm_url" target="_blank" rel="noopener">{{ net.pending.confirm_url }}</a> and keep it there.</p>
        <div class="row">
          <RsButton variant="primary" @click="net.keep()">Keep</RsButton>
          <RsButton @click="net.undo()">Undo now</RsButton>
        </div>
      </div>

      <p v-if="net.piError" class="msg bad" role="alert">{{ net.piError }}</p>
      <p v-else-if="net.piLoading && !net.pi" class="muted small">Asking the Rhino Portal…</p>
      <p v-else-if="net.pi && !net.pi.supported" class="msg">{{ net.pi.reason ?? 'This Pi’s name can’t be changed from here.' }}</p>

      <template v-if="net.pi?.supported">
        <p class="muted small lead">What other computers call the Rhino. Screens that open it by the old name need the new one.</p>
        <p v-if="net.changeBlock && !net.pending" class="muted small">{{ net.changeBlock }}</p>
        <form class="row" @submit.prevent="net.setHostname(hostname.trim())">
          <label class="field grow">
            <span class="visually-hidden">Hostname</span>
            <input v-model="hostname" type="text" class="mono" maxlength="63" autocomplete="off" spellcheck="false" />
          </label>
          <span class="muted small">.local</span>
          <RsButton type="submit" :disabled="!hostname.trim() || hostname.trim() === net.pi.hostname || !!hostErr || !!net.changeBlock || net.applying">Rename</RsButton>
        </form>
        <p v-if="hostErr" class="err small">{{ hostErr }}</p>
      </template>
    </div>
  </RsPanel>
</template>

<style scoped>
.inner { padding: 0; }
.lead { margin: 0 0 var(--rs-space-2); }
.grow { flex: 1; min-width: 0; margin-bottom: 0; }
.err { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); margin: 4px 0 0; }
.pending { padding: var(--rs-space-3); margin-bottom: var(--rs-space-3); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.pending p { margin: 4px 0; }
</style>
