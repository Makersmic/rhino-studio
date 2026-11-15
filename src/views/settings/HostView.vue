<script setup lang="ts">
/**
 * Settings / Host: restart Klipper and services, reboot or shut down the host.
 * Every action confirms, and all are refused during a job (src/system/power.ts).
 * Replaces Mainsail's power menu. Nothing here moves the machine.
 * Backups (Tool Manager 1.7): Back up now and restore, src/system/BackupPanel.vue.
 */
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import BackupPanel from '@/system/BackupPanel.vue'
import HostnamePanel from '@/system/HostnamePanel.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { POWER_ACTIONS, powerBlock, type PowerAction } from '@/system/power'
import { useMaintenanceStore } from '@/stores/maintenance'
import { extrasSummary, type HostExtras } from '@/system/klipperExtras'

const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()
// The Rhino's Klipper extras (Tool Manager 1.9.30): read on open; Relink is a Portal write
const extras = ref<HostExtras | null>(null)
const extrasMsg = ref<string | null>(null)
const relinking = ref(false)
const summary = computed(() => extrasSummary(extras.value))
async function readExtras() {
  const c = care.portal()
  if (!c) return
  try {
    extras.value = await c.hostExtras()
  } catch {
    extras.value = null // an older Tool Manager without extras
  }
}
async function relink() {
  const ok = await control.confirm({
    title: 'Link the Klipper extras?',
    body: `Makes a link in ${extras.value?.klipper_dir ?? '~/klipper'}/klippy/extras for each module. Nothing else changes; Klipper uses them at its next restart.`,
    confirmLabel: 'Link',
    tone: 'normal',
  })
  if (!ok) return
  relinking.value = true
  extrasMsg.value = null
  try {
    extras.value = await care.portal()!.hostExtrasRelink()
    extrasMsg.value = 'Linked. Restart Klipper when you add a section that needs them.'
  } catch (e) {
    extrasMsg.value = `Not linked: ${(e as Error).message}`
  } finally {
    relinking.value = false
  }
}
onMounted(() => void readExtras())
const block = computed(() => powerBlock({ online: machine.online, jobState: machine.job.state ?? '' }))
const running = ref<string | null>(null)
const msg = ref<{ text: string; bad: boolean } | null>(null)

const groups = [
  { id: 'klipper', title: 'Klipper', index: '01', lead: 'Restart after editing the config. The axes need homing again afterwards.' },
  { id: 'services', title: 'Services', index: '02', lead: 'Restart a program on the host when it misbehaves.' },
  { id: 'host', title: 'Host computer', index: '03', lead: 'The computer that runs Klipper, Moonraker and the Rhino Portal.' },
] as const

async function run(a: PowerAction) {
  if (block.value) return
  const ok = await control.confirm({ title: a.confirmTitle, body: a.confirmBody, confirmLabel: a.confirmLabel, tone: a.heavy ? 'danger' : 'normal' })
  if (!ok) return
  running.value = a.id
  msg.value = null
  try {
    await machine.power(a.method, a.params)
    msg.value = { text: a.id === 'shutdown' ? 'Shutting down. Switch it on at the machine when you need it.' : a.id === 'reboot' ? 'Rebooting. Studio reconnects when the host is back.' : `${a.label}: done.`, bad: false }
  } catch (e) {
    const t = (e as Error).message
    // Moonraker and the host drop the connection while they restart: that's success
    if (/Disconnected|timed out/i.test(t) && a.group !== 'klipper') msg.value = { text: `${a.label}: restarting. Studio reconnects by itself.`, bad: false }
    else msg.value = { text: `${a.label} didn't run: ${t}`, bad: true }
  } finally {
    running.value = null
  }
}
</script>

<template>
  <div class="set-page">
    <p v-if="block" class="msg bad">{{ block }}.</p>
    <p v-if="msg" class="msg" :class="{ bad: msg.bad }" role="status">{{ msg.text }}</p>
    <div class="grid">
      <RsPanel v-for="g in groups" :key="g.id" :title="g.title" :index="g.index" :panel-id="`settings.host.${g.id}`">
        <p class="muted small lead">{{ g.lead }}</p>
        <ul class="acts">
          <li v-for="a in POWER_ACTIONS.filter((x) => x.group === g.id)" :key="a.id">
            <span class="txt">
              <strong>{{ a.label }}</strong>
              <span class="muted small">{{ a.what }}</span>
            </span>
            <RsButton
              :variant="a.heavy ? 'danger-outline' : 'default'"
              size="sm"
              :disabled="!!block || !!running"
              :title="block ?? ''"
              @click="run(a)"
            >{{ running === a.id ? 'Working…' : a.button }}</RsButton>
          </li>
        </ul>
      </RsPanel>
      <RsPanel v-if="extras" title="Klipper extras" index="04" panel-id="settings.host.extras">
        <p class="muted small lead">The Rhino's own Klipper modules (filament encoder, spindle tachometer), linked into Klipper by the installer.</p>
        <p class="small" :class="{ bad: summary.tone === 'warn', muted: summary.tone === 'muted' }">{{ summary.text }}</p>
        <ul class="acts">
          <li v-for="e in extras.extras" :key="e.name">
            <span class="txt">
              <strong>{{ e.name }}</strong>
              <span class="muted small">{{ e.linked ? 'Linked' : e.in_the_way ? 'A real file is in the way' : 'Not linked' }}</span>
            </span>
          </li>
        </ul>
        <p v-if="extrasMsg" class="msg small" role="status">{{ extrasMsg }}</p>
        <RsButton size="sm" :disabled="relinking || !extras.found || extras.all_linked" :title="!extras.found ? summary.text : ''" @click="relink">{{ relinking ? 'Working…' : extras.all_linked ? 'All linked' : 'Relink' }}</RsButton>
      </RsPanel>
      <HostnamePanel />
      <BackupPanel />
    </div>
  </div>
</template>

<style scoped>
.lead { margin: 0 0 var(--rs-space-2); }
.acts { list-style: none; margin: 0; padding: 0; }
.acts li { display: flex; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) 0; border-top: 1px solid var(--rs-line); }
.acts li:first-child { border-top: 0; }
.txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.txt strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.set-page > .msg { margin: 0 0 var(--rs-space-3); }
</style>
