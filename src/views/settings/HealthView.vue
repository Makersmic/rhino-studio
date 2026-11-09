<script setup lang="ts">
/**
 * Settings / Host health: how hard the host's cores work and how warm they are, memory, disks, the Rhino's own
 * programs and the boards, with what deserves a look at the top. Read only: nothing here changes anything.
 * Logic: src/system/hostHealth.ts. Readings: src/stores/hostHealth.ts.
 */
import './settings.css'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import { useHostHealthStore } from '@/stores/hostHealth'
import { bytes, coreSummary, coreTemp, duration, pct, report, sparkPath, splitSensors } from '@/system/hostHealth'

const h = useHostHealthStore()
onMounted(() => h.watch(true))
onUnmounted(() => h.watch(false))

// the graphs span what has been seen so far, from 1 to 10 minutes
const SPAN = computed(() => Math.min(10 * 60_000, Math.max(60_000, (last.value?.t ?? 0) - (h.samples[0]?.t ?? 0))))
const last = computed(() => h.samples[h.samples.length - 1] ?? null)
const sensors = computed(() => splitSensors(h.stats?.sensors ?? []))
const pkg = computed(() => sensors.value.cpu.find((s) => /package|tctl|tdie/i.test(s.label)) ?? null)
const cores = computed(() =>
  (last.value?.cores ?? []).map((load, i) => ({
    id: i,
    load,
    ...coreSummary(h.samples, i),
    temp: coreTemp(sensors.value.cpu, i),
    mhz: h.stats?.cpu.cores.find((c) => c.id === i)?.mhz ?? null,
    path: sparkPath(h.samples, (s) => s.cores[i], SPAN.value, 200, 40),
  })),
)
const mem = computed(() => h.stats?.memory ?? null)
const memUsed = computed(() => (mem.value?.total && mem.value.available != null ? ((mem.value.total - mem.value.available) / mem.value.total) * 100 : last.value?.memUsedPct ?? null))
const swapUsed = computed(() => (mem.value?.swap_total ? mem.value.swap_total - (mem.value.swap_free ?? 0) : null))
const progs = computed(() => [...(h.stats?.processes.own ?? []).map((p) => ({ ...p, own: true })), ...(h.stats?.processes.others ?? []).map((p) => ({ ...p, own: false }))])
const klipperProc = computed(() => h.stats?.processes.own.find((p) => p.name === 'Klipper') ?? null)

function text() {
  return report({ samples: h.samples, stats: h.stats, mcus: h.mcus, mcuBase: h.mcuBase, services: h.services, when: new Date(), version: __APP_VERSION__, klipper: h.klipper })
}
const copied = ref(false)
async function copy() {
  const t = text()
  try {
    await navigator.clipboard.writeText(t)
  } catch {
    // http:// pages have no clipboard API: fall back to a hidden text box
    const ta = Object.assign(document.createElement('textarea'), { value: t })
    document.body.append(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
function download() {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text()], { type: 'text/plain' })),
    download: `rhino-host-health-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`,
  })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
const tone = (v: number | null | undefined, warn: number) => (v != null && v >= warn ? 'warn' : '')
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="What to look at" index="01" panel-id="settings.health.findings" class="wide">
        <template #actions>
          <RsButton size="sm" @click="copy">{{ copied ? 'Copied' : 'Copy report' }}</RsButton>
          <RsButton size="sm" variant="quiet" @click="download">Download</RsButton>
        </template>
        <p v-if="!h.found.length" class="row"><StatusChip tone="ok">Normal</StatusChip><span class="small">Nothing out of the ordinary in the readings below.</span></p>
        <ul v-else class="finds">
          <li v-for="(f, i) in h.found" :key="i"><StatusChip :tone="f.tone">{{ f.tone === 'danger' ? 'Now' : 'Look' }}</StatusChip><span>{{ f.text }}</span></li>
        </ul>
        <p class="muted small foot">Read only: this page changes nothing. The report holds every reading here, to send with a problem or keep in a note. For errors, see <RouterLink to="/settings/logs">Logs</RouterLink>.</p>
        <p v-if="h.statsError" class="msg bad">{{ h.statsError }}</p>
      </RsPanel>

      <RsPanel title="Processor" index="02" panel-id="settings.health.cpu" class="wide">
        <p class="muted small lead">
          {{ h.stats?.cpu.model ?? 'The host' }}<template v-if="h.stats?.cpu.governor"> · governor {{ h.stats.cpu.governor }}</template><template v-if="h.stats?.cpu.isolated"> · cores {{ h.stats.cpu.isolated }} kept for Klipper</template><template v-if="h.stats?.uptime != null"> · up {{ duration(h.stats.uptime) }}</template>
        </p>
        <p v-if="!cores.length" class="muted small">Waiting for Moonraker's first reading…</p>
        <div class="cores">
          <div v-for="c in cores" :key="c.id" class="core">
            <span class="lbl">Core {{ c.id }}<StatusChip v-if="(c.temp?.c ?? 0) >= 85 || (c.load ?? 0) >= 90" tone="warn">High</StatusChip></span>
            <span class="big rs-num">{{ Math.round(c.load ?? 0) }}<small>%</small></span>
            <svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path :d="c.path" /></svg>
            <span class="det">{{ Math.round(SPAN / 60_000) }} min: avg {{ pct(c.avg) }}, peak {{ pct(c.peak) }}</span>
            <span class="det"><b :class="tone(c.temp?.c, 85)">{{ c.temp ? `${c.temp.c} °C` : '— °C' }}</b> · {{ c.mhz ? `${c.mhz} MHz` : '— MHz' }}</span>
          </div>
        </div>
        <dl class="facts">
          <div><dt>Package</dt><dd>{{ pkg ? `${pkg.c} °C` : last?.cpuTemp != null ? `${last.cpuTemp.toFixed(1)} °C` : '—' }}<span v-if="pkg?.high" class="muted"> (high {{ pkg.high }})</span></dd></div>
          <div><dt>Load average</dt><dd class="mono">{{ h.stats?.load?.join('  ') ?? '—' }}</dd></div>
          <div><dt>Waited for a core</dt><dd>{{ h.stats?.pressure?.cpu?.some != null ? `${h.stats.pressure.cpu.some} % of 10 s` : '—' }}</dd></div>
        </dl>
      </RsPanel>

      <RsPanel title="Klipper and the boards" index="03" panel-id="settings.health.klipper">
        <p class="muted small lead">A busy board, or bytes resent over USB, is where "Timer too close" and lost communication start.</p>
        <dl class="facts">
          <div><dt>Klipper's program</dt><dd>{{ klipperProc ? `${pct(klipperProc.cpu)} of a core, on core ${klipperProc.core}` : '—' }}</dd></div>
          <div><dt>May use cores</dt><dd class="mono">{{ klipperProc?.allowed ?? '—' }}</dd></div>
          <div><dt>Host load, as Klipper sees it</dt><dd class="mono">{{ h.klipper?.sysload ?? '—' }}</dd></div>
        </dl>
        <p v-if="!h.mcus.length" class="muted small">Klipper isn't ready, so the boards can't be read.</p>
        <table v-else class="tbl">
          <thead><tr><th>Board</th><th>Load</th><th>Awake</th><th>Resent</th><th>Round trip</th></tr></thead>
          <tbody>
            <tr v-for="b in h.mcus" :key="b.name">
              <td>{{ b.name }}</td>
              <td :class="tone(b.load, 60)">{{ pct(b.load) }}</td>
              <td>{{ pct(b.awake) }}</td>
              <td :class="{ warn: (h.mcuBase[b.name] ?? b.retransmit) < b.retransmit }">{{ b.retransmit - (h.mcuBase[b.name] ?? b.retransmit) }} B<span class="muted"> ({{ b.retransmit }})</span></td>
              <td>{{ b.srttMs != null ? `${b.srttMs.toFixed(1)} ms` : '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="muted small foot">Resent counts from when this page opened; the total since Klipper started is in brackets.</p>
      </RsPanel>

      <RsPanel title="Memory and storage" index="04" panel-id="settings.health.mem">
        <div class="meter">
          <span class="mlbl">Memory <span class="muted">{{ mem?.available != null ? `${bytes(mem.available)} free of ${bytes(mem.total)}` : '' }}</span></span>
          <span class="bar"><span :style="{ width: `${Math.round(memUsed ?? 0)}%` }"></span></span>
        </div>
        <div v-if="mem?.swap_total" class="meter">
          <span class="mlbl">Swap <span class="muted">{{ bytes(swapUsed) }} used of {{ bytes(mem.swap_total) }}</span></span>
          <span class="bar"><span :style="{ width: `${Math.round(((swapUsed ?? 0) / mem.swap_total) * 100)}%` }"></span></span>
        </div>
        <div v-for="d in h.stats?.disks ?? []" :key="d.path" class="meter">
          <span class="mlbl">{{ d.label }} <span class="muted">{{ bytes(d.free) }} free of {{ bytes(d.total) }}</span></span>
          <span class="bar"><span :style="{ width: `${Math.round((1 - d.free / d.total) * 100)}%` }"></span></span>
        </div>
        <dl class="facts">
          <div><dt>Waited for memory</dt><dd>{{ h.stats?.pressure?.memory?.some != null ? `${h.stats.pressure.memory.some} % of 10 s` : '—' }}</dd></div>
          <div><dt>Waited for the disk</dt><dd>{{ h.stats?.pressure?.io?.some != null ? `${h.stats.pressure.io.some} % of 10 s` : '—' }}</dd></div>
        </dl>
      </RsPanel>

      <RsPanel title="Programs" index="05" panel-id="settings.health.procs" class="wide">
        <p class="muted small lead">The Rhino's own programs, then the busiest others. CPU is a share of one core: 100 % is one core fully busy.</p>
        <p v-if="!progs.length" class="muted small">No readings yet.</p>
        <div v-else class="scroll">
          <table class="tbl">
            <thead><tr><th>Program</th><th>CPU</th><th>Memory</th><th>On core</th><th>May use</th><th>Priority</th><th>PID</th></tr></thead>
            <tbody>
              <tr v-for="p in progs" :key="p.name + p.pids[0]" :class="{ other: !p.own }">
                <td>{{ p.name }}</td>
                <td :class="tone(p.cpu, 90)">{{ p.cpu == null ? '…' : `${p.cpu} %` }}</td>
                <td>{{ bytes(p.rss) }}</td>
                <td>{{ p.core }}</td>
                <td class="mono">{{ p.allowed ?? '—' }}</td>
                <td>{{ p.nice === 0 ? 'normal' : p.nice > 0 ? `lower (${p.nice})` : `higher (${p.nice})` }}</td>
                <td class="mono muted">{{ p.pids.join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </RsPanel>

      <RsPanel title="Services" index="06" panel-id="settings.health.services">
        <p v-if="!h.services" class="muted small">Moonraker hasn't listed its services yet.</p>
        <ul v-else class="svc">
          <li v-for="(s, n) in h.services" :key="n">
            <span>{{ n }}</span>
            <StatusChip :tone="s.active_state === 'active' ? 'ok' : 'danger'">{{ s.sub_state ?? s.active_state ?? '?' }}</StatusChip>
          </li>
        </ul>
      </RsPanel>

      <RsPanel title="Other temperatures" index="07" panel-id="settings.health.sensors">
        <p v-if="!sensors.other.length" class="muted small">No other sensors on this host.</p>
        <ul v-else class="svc">
          <li v-for="(s, i) in sensors.other" :key="i">
            <span>{{ s.chip }} <span class="muted">{{ s.label }}</span></span>
            <span class="mono">{{ s.c }} °C<span v-if="s.high" class="muted"> / {{ s.high }}</span></span>
          </li>
        </ul>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.lead { margin: 0 0 var(--rs-space-3); }
.foot { margin: var(--rs-space-3) 0 0; }
.finds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--rs-space-2); }
.finds li { display: flex; align-items: baseline; gap: var(--rs-space-2); color: var(--rs-text-strong); }
.set-page .grid { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
.cores { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--rs-space-3); }
.core { display: flex; flex-direction: column; gap: 2px; padding: var(--rs-space-3); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); min-width: 0; }
.core .lbl { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 22px; font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.core .big { font-size: 2.4rem; line-height: 1.05; color: var(--rs-text-strong); }
.core .big small { font-size: 0.36em; vertical-align: top; margin-left: 2px; }
.core .det { font-size: 11px; color: var(--rs-text-muted); }
.core .det b { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.spark { width: 100%; height: 40px; margin: 4px 0; background: var(--rs-dither-faint), var(--rs-surface); border-radius: var(--rs-radius-sm); }
.spark path { fill: none; stroke: var(--rs-ink); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.warn { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; font-weight: var(--rs-weight-medium); }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--rs-space-2) var(--rs-space-4); margin: var(--rs-space-3) 0 0; }
.facts div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.facts dt { font-size: 12px; color: var(--rs-text-muted); }
.facts dd { margin: 0; color: var(--rs-text-strong); overflow-wrap: anywhere; }
.tbl { width: 100%; border-collapse: collapse; font-size: var(--rs-text-sm); margin-top: var(--rs-space-3); }
.tbl th { text-align: left; font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 4px 8px 4px 0; border-bottom: 1px solid var(--rs-line-strong); white-space: nowrap; }
.tbl td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--rs-line); color: var(--rs-text-strong); white-space: nowrap; }
.tbl tr.other td:first-child { color: var(--rs-text-muted); }
.scroll { overflow-x: auto; }
.meter { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--rs-space-3); }
.mlbl { font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.bar { display: block; height: 10px; border-radius: 5px; box-shadow: inset 0 0 0 1px var(--rs-line-strong); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--rs-dither-dense), var(--rs-surface-2); border-right: 2px solid var(--rs-ink); }
.svc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.svc li { display: flex; justify-content: space-between; align-items: center; gap: var(--rs-space-2); padding: 6px 0; border-bottom: 1px solid var(--rs-line); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
@media (min-width: 1100px) { .cores { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); } }
</style>
