<script setup lang="ts">
/**
 * Settings / Host: restart Klipper and services, reboot or shut down the host.
 * Every action confirms, and all are refused during a job (src/system/power.ts).
 * Replaces Mainsail's power menu. Nothing here moves the machine.
 */
import './settings.css'
import { computed, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { POWER_ACTIONS, powerBlock, type PowerAction } from '@/system/power'

const machine = useMachineStore()
const control = useControlStore()
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
