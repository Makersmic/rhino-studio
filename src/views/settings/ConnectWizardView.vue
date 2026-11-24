<script setup lang="ts">
/**
 * Settings / Connect: a five-step wizard for the part people find hardest. Where am I, how is the Rhino connected,
 * who may connect, from outside the house, and a check. Reads first; the one thing it writes is a trusted_clients entry
 * through the Portal's existing safe editor (which refuses what is unsafe and keeps a backup). Never touches the router,
 * never opens the Rhino to the internet. Design: Tool Manager docs/proposal-connect-wizard.md, docs/wizard-rules.md.
 * Logic: src/connect/steps.ts.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import { CONNECT_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { suggestRange } from '@/moonraker/trust'
import { LEVEL_TONE, LEVEL_WORD, verdict } from '@/system/healthCheck'
import type { NetState } from '@/system/network'
import type { TrustState } from '@/portal/client'
import { checkLines, classifyHost, describeRange, linkAdvice, rangeProblem, trustedLines } from '@/connect/steps'

const STEPS = [
  { id: 'where', label: 'Where am I?', help: 'The address you used' },
  { id: 'link', label: 'How it connects', help: 'Cable or Wi-Fi' },
  { id: 'trust', label: 'Who may connect', help: 'The trusted list' },
  { id: 'outside', label: 'From outside', help: 'Tailscale, optional' },
  { id: 'check', label: 'Check it', help: 'One line each' },
] as const
type StepId = (typeof STEPS)[number]['id']

const router = useRouter()
const machine = useMachineStore()
const maint = useMaintenanceStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)

const host = window.location.hostname
const origin = window.location.origin
const here = computed(() => classifyHost(host))
const trust = ref<TrustState | null>(null)
const trustError = ref<string | null>(null)
const net = ref<NetState | null>(null)
const netError = ref<string | null>(null)
const portalOk = ref(false)

async function load() {
  const p = maint.portal()
  if (!p) {
    trustError.value = netError.value = 'The Rhino Portal isn’t connected, so this wizard can’t read the Rhino’s own settings.'
    return
  }
  try {
    trust.value = await p.trust()
    portalOk.value = true
    trustError.value = trust.value ? null : 'This Rhino needs Tool Manager 1.5.4 or later for the trusted list.'
  } catch (e) {
    portalOk.value = false
    trustError.value = (e as Error).message
  }
  try {
    net.value = await p.netState()
    netError.value = null
  } catch (e) {
    netError.value = (e as Error).message
  }
}
onMounted(load)

// ---- step 2
const iface = computed(() => {
  const list = net.value?.interfaces ?? []
  return list.find((i) => i.ip && i.state === 'up' && i.type === 'ethernet') ?? list.find((i) => i.ip && i.state === 'up') ?? null
})
const advice = computed(() => linkAdvice(net.value?.supported ? iface.value : null))

// ---- step 3
const suggested = computed(() => trust.value?.suggestions.find((s) => !s.entry.startsWith('100.64.'))?.entry ?? suggestRange(trust.value?.address ?? null))
const entry = ref('')
const entryTouched = ref(false)
const entryText = computed(() => (entryTouched.value ? entry.value : suggested.value))
const problem = computed(() => rangeProblem(entryText.value))
const working = ref(false)
const done = ref<string | null>(null)
const actError = ref<string | null>(null)
const trustedScreen = computed(() => !machine.untrusted)

async function addEntry(text: string) {
  const p = maint.portal()
  if (!p) return
  working.value = true
  actError.value = null
  done.value = null
  try {
    trust.value = await p.addTrust(text.trim())
    done.value = `${text.trim()} is trusted now. Moonraker restarted, and Studio reconnects by itself.`
    entryTouched.value = false
  } catch (e) {
    actError.value = (e as Error).message
  } finally {
    working.value = false
  }
}

// ---- step 4
const tailnet = '100.64.0.0/10'
const tailnetTrusted = computed(() => !!trust.value?.entries.includes(tailnet))
const understand = ref(false)

// ---- step 5
const lines = computed(() =>
  checkLines({
    moonraker: machine.untrusted ? 'untrusted' : machine.connection === 'online' ? 'online' : 'down',
    klippyReady: machine.klippyReady,
    portalOk: portalOk.value,
    covered: trust.value ? trust.value.covered : null,
    hostKind: here.value.kind,
  }),
)
const summary = computed(() => {
  const counts = { PASS: 0, WARN: 0, FAIL: 0, INFO: 0 }
  for (const l of lines.value) counts[l.level]++
  return verdict(counts)
})

function next() {
  if (at.value === STEPS.length - 1) return void router.push('/settings')
  at.value++
  if (step.value === 'check') void load()
}
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="connect.step">
      <MascotRow :pose="CONNECT_STEP_POSE[step]">
        <!-- ===== 1 Where ===== -->
        <template v-if="step === 'where'">
          <p class="q">This is how you reached the Rhino.</p>
          <p class="plain"><b class="mono">{{ host }}</b> · {{ here.text }}</p>
          <p v-if="trust?.address" class="plain">The Rhino sees this screen as <b class="mono">{{ trust.address }}</b>.</p>
          <p v-if="trustError && !trust" class="tm-warn">{{ trustError }}</p>
          <WhatThisDoes>
            <p>Studio opened from <span class="mono">{{ origin }}</span>. The Portal reports the address it sees this screen coming from; Moonraker's trusted list is checked against that address.</p>
            <p v-if="net?.hostname">The Rhino's own name is <span class="mono">{{ net.hostname }}</span>, so <span class="mono">{{ net.hostname }}.local</span> is the name to bookmark.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 2 Link ===== -->
        <template v-if="step === 'link'">
          <p class="q">How is the Rhino connected to your network?</p>
          <p class="row"><StatusChip :tone="LEVEL_TONE[advice.level]">{{ LEVEL_WORD[advice.level] }}</StatusChip><span class="plain">{{ advice.text }}</span></p>
          <p v-if="iface?.ip" class="plain">Its address is <b class="mono">{{ iface.ip }}</b> on <b>{{ iface.name }}</b>.</p>
          <p class="plain">A machine left alone should keep the same address. Most routers can <b>reserve an address</b> for a device (the menu is called address reservation or DHCP reservation). That is safer than typing a fixed address into the Rhino itself, where a mistake can lose it.</p>
          <p class="row"><RsButton @click="router.push('/settings/network')">Open Network settings</RsButton><span class="tm-hint">Name, address and Wi-Fi changes there switch back by themselves after two minutes unless you keep them.</span></p>
          <p v-if="netError && !net" class="tm-warn">{{ netError }}</p>
          <WhatThisDoes>
            <p>Read from the Rhino's network manager: <span class="mono">{{ iface ? `${iface.name} (${iface.type}), ${iface.ip}/${iface.prefix}, ${iface.method === 'manual' ? 'fixed address' : 'address from the router'}` : 'nothing to read' }}</span>.</p>
            <p>This step changes nothing. Changes are made in Settings &gt; Network.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 3 Trust ===== -->
        <template v-if="step === 'trust'">
          <p class="q">Who is allowed to control the machine?</p>
          <p class="plain">Moonraker has no password. A screen on a <b>trusted</b> address can press Stop, move the machine and start jobs. So trust your own network, nothing wider.</p>
          <p v-if="trustError" class="tm-warn">{{ trustError }}</p>
          <template v-if="trust?.configured">
            <ul class="list">
              <li v-for="e in trust.entries" :key="e"><span class="mono">{{ e }}</span><span class="muted">{{ describeRange(e) }}</span></li>
            </ul>
            <p class="row"><StatusChip :tone="trust.covered ? 'ok' : 'warn'">{{ trust.covered ? 'Good' : 'Look' }}</StatusChip><span class="plain">{{ trust.covered ? 'This screen is on the list.' : 'This screen isn’t covered by the list.' }}</span></p>
            <div v-if="trustedScreen" class="addbox">
              <div class="tm-fld">
                <label for="rng">Add an address or range</label>
                <input id="rng" class="tm-in code" :value="entryText" spellcheck="false" autocomplete="off" @input="entry = ($event.target as HTMLInputElement).value; entryTouched = true">
                <span class="tm-hint">Suggested from this screen's address: your whole home network. For one device, type its number alone.</span>
              </div>
              <p v-if="problem" class="tm-err" role="alert">{{ problem }}</p>
              <p v-else class="tm-ok">That lets in {{ describeRange(entryText) }}.</p>
              <p class="row">
                <RsButton variant="primary" :disabled="!!problem || working || trust.entries.includes(entryText.trim())" @click="addEntry(entryText)">{{ working ? 'Adding…' : 'Add it and restart Moonraker' }}</RsButton>
                <span class="tm-hint">Takes about ten seconds. Refused while a job is running.</span>
              </p>
              <p v-if="done" class="tm-ok">{{ done }}</p>
              <p v-if="actError" class="tm-err" role="alert">{{ actError }}</p>
            </div>
            <div v-else class="tm-warn">
              This screen isn't trusted, so the Rhino won't change the list for it (a screen can't let itself in). On the host, add these lines to <span class="mono">moonraker.conf</span> and restart Moonraker:
              <pre class="tm-pre">{{ trustedLines(['127.0.0.0/8', suggested]) }}</pre>
            </div>
          </template>
          <p v-else-if="trust" class="plain">Moonraker has no <span class="mono">[authorization]</span> section, so it already trusts every address. Nothing to set here.</p>
          <WhatThisDoes>
            <p>This is what <span class="mono">moonraker.conf</span> will hold after you add it:</p>
            <pre>{{ trust?.configured && !problem ? trustedLines(trust.entries, entryText.trim()) : trustedLines(trust?.entries ?? []) }}</pre>
            <p>The Rhino edits only the <span class="mono">trusted_clients</span> lines, keeps a copy of the file first, restarts Moonraker through its own API and puts the old file back if Moonraker doesn't come back. It never removes the entry that lets this screen or the Portal in, and never accepts "everyone" or anything wider than /8.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 4 Outside ===== -->
        <template v-if="step === 'outside'">
          <p class="q">Do you want to reach the Rhino from outside your house?</p>
          <p class="plain">This step is optional, and you can skip it. <b>Tailscale</b> is a free private network between your own devices: your phone can reach the Rhino from anywhere, with no changes to your router and nothing open to the internet. Never forward a port on your router to the Rhino.</p>
          <p v-if="trust" class="row">
            <StatusChip :tone="trust.tailscale ? 'ok' : 'neutral'">{{ trust.tailscale ? 'Found' : 'Not found' }}</StatusChip>
            <span class="plain">{{ trust.tailscale ? 'Tailscale is running on this Rhino.' : 'Tailscale isn’t running on this Rhino.' }}</span>
          </p>
          <p v-if="trust && !trust.tailscale" class="plain">The Rhino doesn't install it. Follow <a href="https://tailscale.com/kb/1017/install" target="_blank" rel="noopener">Tailscale's own steps</a> for the host and for your phone, then come back.</p>
          <template v-if="trust?.tailscale && trust.configured">
            <p v-if="tailnetTrusted" class="row"><StatusChip tone="ok">Good</StatusChip><span class="plain">Your tailnet is already trusted.</span></p>
            <div v-else-if="trustedScreen" class="addbox">
              <div class="tm-warn">Trusting the tailnet lets <b>every device on it</b> control the machine, <b>including any device someone has shared with you</b>. If you share your tailnet, limit who can reach the Rhino in Tailscale's access rules instead, or trust single devices by their Tailscale numbers (type them in the previous step).</div>
              <label class="chip"><input v-model="understand" type="checkbox"> I understand, and I only share my tailnet with people I'd trust at the machine</label>
              <p class="row"><RsButton :disabled="!understand || working" @click="addEntry(tailnet)">{{ working ? 'Adding…' : 'Trust my tailnet' }}</RsButton><span class="tm-hint">Nothing is added unless you press this.</span></p>
              <p v-if="done" class="tm-ok">{{ done }}</p>
              <p v-if="actError" class="tm-err" role="alert">{{ actError }}</p>
            </div>
          </template>
          <WhatThisDoes>
            <p>Tailscale's range is <span class="mono">{{ tailnet }}</span>. Adding it writes one more line under <span class="mono">trusted_clients:</span> in <span class="mono">moonraker.conf</span>, by the same safe editor as the previous step.</p>
            <p>This step never installs anything, never opens a port, and adds nothing by default.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 5 Check ===== -->
        <template v-if="step === 'check'">
          <p class="q">Does it all work from here?</p>
          <p v-if="summary" class="row verdict"><StatusChip :tone="summary.tone">{{ summary.tone === 'danger' ? 'Fix' : summary.tone === 'warn' ? 'Look' : 'Good' }}</StatusChip><span>{{ summary.text }}</span></p>
          <ul class="list checks">
            <li v-for="(l, i) in lines" :key="i">
              <StatusChip :tone="LEVEL_TONE[l.level]">{{ LEVEL_WORD[l.level] }}</StatusChip>
              <span>{{ l.what }}<span v-if="l.detail" class="detail">{{ l.detail }}</span></span>
            </li>
          </ul>
          <p class="plain">For the host itself (sleep, the boards, the services, the Rhino's files) run the <RouterLink to="/settings/health-check">Health check</RouterLink>.</p>
          <WhatThisDoes>
            <p>Read from this screen: the live link to Moonraker, Klipper's state, whether the Portal answered, and whether the trusted list covers this screen's address. Nothing is sent to the machine.</p>
          </WhatThisDoes>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" @click="at--">Back</RsButton>
      <RsButton variant="primary" @click="next">{{ at === STEPS.length - 1 ? 'Done' : step === 'outside' ? 'Next (or skip)' : 'Next' }}</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
      <RsButton class="cancel" variant="quiet" @click="router.push('/settings')">Close</RsButton>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.mono { font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.muted { color: var(--rs-text-muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--rs-space-3); padding: 6px 0; border-bottom: 1px solid var(--rs-line); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.checks li { border: 0; padding: 2px 0; align-items: baseline; flex-wrap: nowrap; }
.checks li > :first-child { flex: none; }
.checks li > span { min-width: 0; overflow-wrap: anywhere; }
.detail { display: block; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.verdict { font-weight: var(--rs-weight-medium); }
.addbox { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-3); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); }
.chip { display: flex; align-items: flex-start; gap: 8px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.chip input { margin-top: 3px; accent-color: var(--rs-text-strong); }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.cancel { margin-left: auto; }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
