<script setup lang="ts">
/**
 * Settings / Trusted addresses: Moonraker's trusted_clients, the list Mainsail
 * also goes by. The Rhino Portal edits moonraker.conf (only those lines, with a
 * backup) and restarts Moonraker; it refuses during a job, never removes the
 * entry that lets this screen or the Portal itself in, and only answers screens
 * that are already trusted, so a screen can't let itself in.
 */
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useControlStore } from '@/stores/control'
import type { TrustState } from '@/portal/client'

const maint = useMaintenanceStore()
const control = useControlStore()
const st = ref<TrustState | null>(null)
const loaded = ref(false)
const busy = ref<string | null>(null)
const error = ref<string | null>(null)
const done = ref<string | null>(null)
const typed = ref('')

async function load() {
  const c = maint.portal()
  if (!c) return
  try {
    st.value = await c.trust()
    error.value = null
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loaded.value = true
  }
}
onMounted(load)

const why = (e: string) => {
  if (e === '127.0.0.0/8' || e === '127.0.0.1') return 'this Rhino itself (the Portal)'
  if (e === '100.64.0.0/10') return 'Tailscale'
  return ''
}
/** The entry that lets this screen in: can't be removed from here */
const mine = computed(() => {
  const s = st.value
  if (!s?.covered) return null
  return s.entries.find((e) => covers(e, s.address)) ?? null
})
function covers(entry: string, ip: string): boolean {
  const [net, bits] = entry.split('/')
  const a = ip.split('.').map(Number)
  const n = (net ?? '').split('.').map(Number)
  if (a.length !== 4 || n.length !== 4 || a.some(isNaN) || n.some(isNaN)) return entry === ip
  const b = bits === undefined ? 32 : Number(bits)
  const v = (x: number[]) => ((x[0]! << 24) >>> 0) + (x[1]! << 16) + (x[2]! << 8) + x[3]!
  const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0
  return ((v(a) & mask) >>> 0) === ((v(n) & mask) >>> 0)
}

async function add(entry: string) {
  const c = maint.portal()
  if (!c || !entry.trim()) return
  const ok = await control.confirm({
    title: `Trust ${entry.trim()}?`,
    body: `Every device at ${entry.trim()} can then use this Rhino from Studio or Mainsail, without a login. Moonraker restarts to take it in; screens reconnect by themselves in a few seconds.`,
    confirmLabel: 'Trust and restart Moonraker',
    tone: 'normal',
  })
  if (!ok) return
  await change(entry.trim(), () => c.addTrust(entry.trim()), `Added ${entry.trim()}.`)
  if (!error.value) typed.value = ''
}
async function remove(entry: string) {
  const c = maint.portal()
  if (!c) return
  const ok = await control.confirm({
    title: `Stop trusting ${entry}?`,
    body: `Devices that only ${entry} let in will see "Moonraker doesn't trust this screen" (Mainsail: Unauthorized). Moonraker restarts.`,
    confirmLabel: 'Remove and restart Moonraker',
    tone: 'danger',
  })
  if (!ok) return
  await change(entry, () => c.removeTrust(entry), `Removed ${entry}.`)
}
async function change(entry: string, fn: () => Promise<TrustState>, msg: string) {
  busy.value = entry
  error.value = done.value = null
  try {
    st.value = await fn()
    done.value = msg
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Trusted addresses" index="01" panel-id="settings.trust">
        <div class="stack">
          <p v-if="!loaded" class="muted small">Reading moonraker.conf…</p>
          <p v-else-if="!st && !error" class="muted small">The Rhino Portal doesn't offer this (Tool Manager before 1.5.4, or not reachable).</p>
          <template v-else-if="st && !st.configured">
            <p class="state">Every address is trusted</p>
            <p class="muted small">moonraker.conf has no <code>[authorization]</code> section, so Moonraker lets any device on the network in. Nothing to add here.</p>
          </template>
          <template v-else-if="st">
            <p class="muted small">
              This screen is <strong class="mono">{{ st.address }}</strong><template v-if="mine">, let in by <span class="mono">{{ mine }}</span></template>.
            </p>
            <p v-if="st.force_logins" class="msg bad">Moonraker has <code>force_logins</code> on, so it ignores this list and asks every screen for a login. Mainsail and Studio need it off.</p>
            <ul class="list">
              <li v-for="e in st.entries" :key="e">
                <span class="mono">{{ e }}</span>
                <span v-if="why(e) || e === mine" class="muted small">{{ e === mine ? 'this screen' : why(e) }}</span>
                <button v-if="e !== mine && !why(e).startsWith('this Rhino')" type="button" class="link rm" :disabled="!!busy" @click="remove(e)">{{ busy === e ? 'Removing…' : 'Remove' }}</button>
              </li>
            </ul>
            <p v-if="st.include" class="muted small">moonraker.conf includes other files; only the list written in moonraker.conf itself is shown and changed.</p>
          </template>
          <p v-if="error" class="msg bad" role="alert">{{ error }}</p>
          <p v-if="done" class="msg" role="status">{{ done }} Moonraker restarted.</p>
        </div>
      </RsPanel>

      <RsPanel v-if="st?.configured" title="Add" index="02" panel-id="settings.trust.add">
        <div class="stack">
          <div v-for="s in st.suggestions" :key="s.entry" class="sugg">
            <div>
              <span class="mono">{{ s.entry }}</span>
              <span class="muted small why">{{ s.why }}</span>
            </div>
            <RsButton size="sm" :disabled="!!busy" @click="add(s.entry)">{{ busy === s.entry ? 'Adding…' : 'Add' }}</RsButton>
          </div>
          <form class="stack" @submit.prevent="add(typed)">
            <label class="field">
              <span>Address or range</span>
              <input v-model="typed" class="mono" type="text" placeholder="192.168.1.0/24" autocomplete="off" spellcheck="false" autocapitalize="off" />
            </label>
            <div class="row">
              <RsButton type="submit" :disabled="!!busy || !typed.trim()">{{ busy && busy === typed.trim() ? 'Adding…' : 'Add' }}</RsButton>
            </div>
          </form>
          <p class="muted small">A range like <span class="mono">192.168.1.0/24</span> lets in everything on that home network, guests' phones included. For Tailscale, <span class="mono">100.64.0.0/10</span> lets in every device on your tailnet and nothing else. Each change restarts Moonraker (not during a job) and keeps a copy of moonraker.conf on the Rhino.</p>
        </div>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.state { margin: 0; font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.muted { color: var(--rs-text-muted); margin: 0; line-height: 1.5; }
.list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rs-line); }
.list li { display: flex; align-items: baseline; gap: var(--rs-space-3); padding: 9px 0; border-bottom: 1px solid var(--rs-line); }
.list .rm { margin-left: auto; }
.sugg .why { margin-left: 10px; }
.sugg { display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-3); padding: 6px 0; border-bottom: 1px dotted var(--rs-line); }
code { font-family: var(--rs-font-code); font-size: 0.92em; }
</style>
