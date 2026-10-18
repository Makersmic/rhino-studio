<script setup lang="ts">
/**
 * Settings / Network.
 *   Link now            round trip, Wi-Fi signal, traffic, screens connected
 *   This screen         reconnecting, cameras on a slow link (this browser only)
 *   The Rhino's network name, address, Wi-Fi, power saving: through the Rhino
 *                       Portal (1.4.8+). Each change asks, then switches back by
 *                       itself unless it's kept, so a mistake can't lock you out.
 */
import './settings.css'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StepInput from '@/control/StepInput.vue'
import { useNetworkStore } from '@/stores/network'
import { useMachineStore } from '@/stores/machine'
import { CAMERA_LINK, RECONNECT, SNAPSHOT_FPS, hostnameError, ipv4Errors, rate, signalWord, type CameraLink, type Ipv4Form, type NetInterface, type ReconnectProfile } from '@/system/network'

const net = useNetworkStore()
const machine = useMachineStore()

onMounted(() => {
  net.watchClosely(true)
  void net.loadPi()
})
onBeforeUnmount(() => net.watchClosely(false))
watch(() => machine.online, (on) => on && (void net.loadSystemInfo(), void net.loadPi()))

// ---- link now ---------------------------------------------------------------
const wifiIf = computed(() => net.pi?.interfaces.find((i) => i.type === 'wifi' && i.state === 'connected') ?? null)
const signal = computed(() => wifiIf.value?.signal ?? null)
const traffic = computed(() => rate(net.traffic?.bps))
const addressLine = computed(() => {
  const host = net.pi?.hostname ?? (net.systemInfo?.distribution as { name?: string } | undefined)?.name ?? ''
  const i = net.interfaces.find((x) => x.ipv4)
  return [host && `${host}.local`, i?.ipv4, i?.mac].filter(Boolean).join(' · ')
})

const reconnectOpts: { value: ReconnectProfile; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'patient', label: 'Patient' },
]
const cameraOpts: { value: CameraLink; label: string }[] = [
  { value: 'live', label: 'Live video' },
  { value: 'auto', label: 'Auto' },
  { value: 'snapshot', label: 'Snapshots' },
]

// ---- the Rhino's network ------------------------------------------------------
const hostname = ref('')
watch(() => net.pi?.hostname, (h) => h && !hostname.value && (hostname.value = h), { immediate: true })
const hostErr = computed(() => (hostname.value && hostname.value !== net.pi?.hostname ? hostnameError(hostname.value) : null))

const forms = reactive<Record<string, Ipv4Form>>({})
function formFor(i: NetInterface): Ipv4Form {
  return (forms[i.name] ??= {
    method: i.method === 'manual' ? 'manual' : 'auto',
    address: i.ip ?? '',
    prefix: i.prefix ?? 24,
    gateway: i.gateway ?? '',
    dns: (i.dns ?? []).join(' '),
  })
}
const changed = (i: NetInterface) => {
  const f = formFor(i)
  if (f.method !== (i.method ?? 'auto')) return true
  return f.method === 'manual' && (f.address !== (i.ip ?? '') || f.prefix !== (i.prefix ?? 24) || f.gateway !== (i.gateway ?? '') || f.dns.trim() !== (i.dns ?? []).join(' '))
}
const errs = (i: NetInterface) => ipv4Errors(formFor(i))

const joining = ref<string | null>(null)
const password = ref('')
async function join(ssid: string) {
  const ok = await net.joinWifi(ssid, password.value)
  password.value = ''
  if (ok) joining.value = null
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <!-- Link now -->
      <RsPanel title="Link now" index="01" panel-id="settings.netlink" class="wide">
        <div class="cells">
          <div class="cell">
            <span class="k">Response</span>
            <span class="big rs-num" :class="{ empty: net.rttMs == null }">{{ net.rttMs == null ? '—' : Math.round(net.rttMs) }}<small v-if="net.rttMs != null">ms</small></span>
            <span class="sub">Round trip to Moonraker</span>
          </div>
          <div class="cell">
            <span class="k">Wi-Fi signal</span>
            <span class="big rs-num" :class="{ empty: signal == null }">{{ signal ?? '—' }}<small v-if="signal != null">%</small></span>
            <span class="sub">{{ wifiIf ? `${wifiIf.ssid ?? wifiIf.name} · ${signalWord(signal)}` : net.pi ? 'Not on Wi-Fi' : 'From the Rhino Portal' }}</span>
          </div>
          <div class="cell">
            <span class="k">Traffic</span>
            <span class="big rs-num" :class="{ empty: !traffic }">{{ traffic?.value ?? '—' }}<small v-if="traffic">{{ traffic.unit }}</small></span>
            <span class="sub">{{ net.traffic ? `${net.traffic.iface}, in and out` : 'Waiting for Moonraker' }}</span>
          </div>
          <div class="cell">
            <span class="k">Screens connected</span>
            <span class="big rs-num" :class="{ empty: net.connections == null }">{{ net.connections ?? '—' }}</span>
            <span class="sub">Studio, Mainsail, phones</span>
          </div>
        </div>
        <p v-if="addressLine" class="addr mono">{{ addressLine }}</p>
      </RsPanel>

      <!-- This screen -->
      <RsPanel title="This screen" index="02" panel-id="settings.netscreen">
        <h3 class="sub-h">Reconnect <span class="badge">this browser</span></h3>
        <fieldset class="segmented">
          <legend class="visually-hidden">Reconnect</legend>
          <label v-for="o in reconnectOpts" :key="o.value" class="seg">
            <input v-model="net.reconnect" type="radio" name="reconnect" :value="o.value" class="visually-hidden" />
            <span>{{ o.label }}</span>
          </label>
        </fieldset>
        <p class="muted small">{{ RECONNECT[net.reconnect].text }}.</p>

        <h3 class="sub-h">Cameras on a slow link</h3>
        <fieldset class="segmented">
          <legend class="visually-hidden">Cameras on a slow link</legend>
          <label v-for="o in cameraOpts" :key="o.value" class="seg">
            <input v-model="net.cameraLink" type="radio" name="camlink" :value="o.value" class="visually-hidden" />
            <span>{{ o.label }}</span>
          </label>
        </fieldset>
        <p class="muted small">{{ CAMERA_LINK[net.cameraLink] }}. <strong v-if="net.cameraLink === 'auto'" class="now">{{ net.camerasAsSnapshots ? 'Showing snapshots now.' : 'Showing live video now.' }}</strong></p>

        <div class="row" :class="{ off: net.cameraLink === 'live' }">
          <span class="small">Snapshot rate</span>
          <StepInput :model-value="net.snapshotFps" v-bind="SNAPSHOT_FPS" :decimals="1" unit="fps" label="Snapshot rate" :disabled="net.cameraLink === 'live'" @commit="(v) => (net.snapshotFps = v)" />
          <span class="muted small">Lower spares the Pi's Wi-Fi</span>
        </div>
      </RsPanel>

      <!-- The Rhino's network -->
      <RsPanel title="The Rhino’s network" index="03" panel-id="settings.netpi">
        <!-- A change waiting to be kept -->
        <div v-if="net.pending" class="pending" role="alert">
          <div class="p-top">
            <strong>{{ net.pending.summary }}</strong>
            <span class="count rs-num">{{ mmss(net.pendingSeconds) }}</span>
          </div>
          <p class="small">Switches back when the time runs out. Keep it if this screen still works.</p>
          <p v-if="net.pending.confirm_url" class="small">The address changed: open <a :href="net.pending.confirm_url" target="_blank" rel="noopener">{{ net.pending.confirm_url }}</a> and keep it there.</p>
          <div class="row">
            <RsButton variant="primary" @click="net.keep()">Keep</RsButton>
            <RsButton @click="net.undo()">Undo now</RsButton>
          </div>
        </div>

        <p v-if="net.piError" class="msg bad" role="alert">{{ net.piError }}</p>
        <p v-else-if="net.piLoading && !net.pi" class="muted small">Asking the Rhino Portal…</p>
        <p v-else-if="net.pi && !net.pi.supported" class="msg">{{ net.pi.reason ?? 'This Pi’s network can’t be changed from here.' }}</p>

        <template v-if="net.pi?.supported">
          <p v-if="net.changeBlock && !net.pending" class="muted small">{{ net.changeBlock }}</p>

          <h3 class="sub-h">Name on the network</h3>
          <form class="row" @submit.prevent="net.setHostname(hostname.trim())">
            <label class="field grow">
              <span class="visually-hidden">Hostname</span>
              <input v-model="hostname" type="text" class="mono" maxlength="63" autocomplete="off" spellcheck="false" />
            </label>
            <span class="muted small">.local</span>
            <RsButton type="submit" :disabled="!hostname.trim() || hostname.trim() === net.pi.hostname || !!hostErr || !!net.changeBlock || net.applying">Rename</RsButton>
          </form>
          <p v-if="hostErr" class="err small">{{ hostErr }}</p>

          <template v-for="i in net.pi.interfaces" :key="i.name">
            <h3 class="sub-h">{{ i.type === 'wifi' ? 'Wi-Fi' : 'Wired' }} <span class="mono iname">{{ i.name }}</span> <span class="badge">{{ i.state }}</span></h3>
            <fieldset class="segmented">
              <legend class="visually-hidden">Address for {{ i.name }}</legend>
              <label class="seg"><input v-model="formFor(i).method" type="radio" :name="`m-${i.name}`" value="auto" class="visually-hidden" /><span>Automatic (DHCP)</span></label>
              <label class="seg"><input v-model="formFor(i).method" type="radio" :name="`m-${i.name}`" value="manual" class="visually-hidden" /><span>Fixed</span></label>
            </fieldset>
            <p v-if="formFor(i).method === 'auto'" class="muted small mono">{{ i.ip ? `${i.ip}/${i.prefix} via ${i.gateway ?? '—'}` : 'No address' }}</p>
            <div v-else class="ipgrid">
              <label class="field"><span>Address</span><input v-model="formFor(i).address" class="mono" inputmode="decimal" placeholder="192.168.1.50" /></label>
              <label class="field"><span>Prefix</span><input v-model.number="formFor(i).prefix" class="mono" inputmode="numeric" /></label>
              <label class="field"><span>Gateway</span><input v-model="formFor(i).gateway" class="mono" inputmode="decimal" placeholder="192.168.1.1" /></label>
              <label class="field"><span>DNS</span><input v-model="formFor(i).dns" class="mono" placeholder="192.168.1.1 1.1.1.1" /></label>
            </div>
            <ul v-if="changed(i) && errs(i).length" class="err small"><li v-for="e in errs(i)" :key="e">{{ e }}</li></ul>
            <div v-if="changed(i)" class="row">
              <RsButton :disabled="!!errs(i).length || !!net.changeBlock || net.applying" @click="net.setIpv4(i.name, formFor(i))">Apply to {{ i.name }}</RsButton>
            </div>

            <template v-if="i.type === 'wifi'">
              <div class="row ps">
                <span class="small">Power saving</span>
                <fieldset class="segmented tight">
                  <legend class="visually-hidden">Wi-Fi power saving</legend>
                  <label class="seg"><input type="radio" :name="`ps-${i.name}`" :checked="i.powersave === true" :disabled="!!net.changeBlock || net.applying" class="visually-hidden" @change="net.setPowersave(true)" /><span>On</span></label>
                  <label class="seg"><input type="radio" :name="`ps-${i.name}`" :checked="i.powersave === false" :disabled="!!net.changeBlock || net.applying" class="visually-hidden" @change="net.setPowersave(false)" /><span>Off</span></label>
                </fieldset>
                <span class="muted small">Off keeps the Pi 3B from dropping out</span>
              </div>

              <div class="wifi-head">
                <span class="small">Networks</span>
                <RsButton variant="quiet" :disabled="net.scanning" @click="net.scanWifi()">{{ net.scanning ? 'Looking…' : 'Look for networks' }}</RsButton>
              </div>
              <ul v-if="net.wifi.length" class="wifi">
                <li v-for="w in net.wifi" :key="w.ssid">
                  <div class="w-row">
                    <span class="w-name">{{ w.ssid }}<span v-if="w.in_use" class="muted"> · connected</span></span>
                    <span class="bars" :aria-label="`Signal ${w.signal}%`"><i v-for="b in 4" :key="b" :class="{ on: w.signal >= b * 25 - 10 }" /></span>
                    <span class="muted small sec">{{ w.security || 'Open' }}</span>
                    <button v-if="!w.in_use" type="button" class="link" :disabled="!!net.changeBlock" @click="joining = joining === w.ssid ? null : w.ssid">Join…</button>
                  </div>
                  <form v-if="joining === w.ssid" class="row join" @submit.prevent="join(w.ssid)">
                    <label v-if="w.security" class="field grow">
                      <span>Password for {{ w.ssid }}</span>
                      <input v-model="password" type="password" autocomplete="new-password" minlength="8" maxlength="63" />
                    </label>
                    <RsButton type="submit" :disabled="(!!w.security && password.length < 8) || net.applying">Join</RsButton>
                  </form>
                </li>
              </ul>
            </template>
          </template>
          <p class="muted small note">Every change asks first. If this screen can't reach the Rhino afterwards, it switches back by itself after {{ Math.round((net.pi.revert_seconds ?? 120) / 60) }} minutes.</p>
        </template>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--rs-space-4); }
.cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.k { font-size: var(--rs-text-xs); line-height: 18px; color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); }
.big { font-size: 2.2rem; line-height: 0.95; margin-top: 10px; white-space: nowrap; }
.big small { font-family: var(--rs-font-ui); font-size: 0.36em; color: var(--rs-text-muted); margin-left: 2px; vertical-align: top; }
.big.empty { color: var(--rs-text-muted); }
.sub { font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.addr { margin-top: var(--rs-space-4); padding-top: var(--rs-space-3); border-top: 1px dotted var(--rs-line-strong); font-size: 12px; color: var(--rs-text-muted); }
.now { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.off { opacity: 0.55; }
.segmented.tight { margin: 0; }
.segmented.tight .seg span { height: 30px; padding: 0 14px; }
.pending { margin-bottom: var(--rs-space-4); padding: var(--rs-space-3) var(--rs-space-4); border-radius: var(--rs-radius-md); background: var(--rs-dither-faint), var(--rs-surface-2); box-shadow: inset 0 0 0 1px var(--rs-line-strong); }
.p-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rs-space-3); }
.p-top strong { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.pending .count { font-size: 1.6rem; }
.grow { flex: 1; min-width: 0; margin-bottom: 0; }
.err { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); margin: 4px 0 0; padding-left: 18px; }
p.err { padding-left: 0; }
.iname { font-size: 11px; color: var(--rs-text-muted); font-weight: 400; }
.ipgrid { display: grid; grid-template-columns: 1.4fr 0.6fr 1.4fr 1.6fr; gap: var(--rs-space-2); }
.ps { margin-top: var(--rs-space-4); }
.wifi-head { display: flex; align-items: center; justify-content: space-between; margin-top: var(--rs-space-4); }
.wifi { list-style: none; margin: 6px 0 0; padding: 0; }
.wifi li { border-top: 1px solid var(--rs-line); padding: 8px 0; }
.w-row { display: flex; align-items: center; gap: var(--rs-space-3); }
.w-name { flex: 1; min-width: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sec { width: 70px; }
.bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
.bars i { width: 4px; background: var(--rs-line-strong); border-radius: 1px; }
.bars i:nth-child(1) { height: 4px; } .bars i:nth-child(2) { height: 7px; } .bars i:nth-child(3) { height: 10px; } .bars i:nth-child(4) { height: 14px; }
.bars i.on { background: var(--rs-ink); }
.join { margin-top: var(--rs-space-2); align-items: flex-end; }
.note { margin-top: var(--rs-space-4); }
@media (max-width: 720px) {
  .cells { grid-template-columns: 1fr 1fr; }
  .ipgrid { grid-template-columns: 1fr 1fr; }
}
</style>
