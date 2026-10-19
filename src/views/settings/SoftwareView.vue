<script setup lang="ts">
/**
 * Settings / Software and updates.
 *
 * Packages: what Studio runs on, from Moonraker's update manager, plus the
 * Rhino Tool Manager (installed from its zip) and Rhino Studio (while it runs
 * from a PC). One status column: "Up to date", or an Update button. Mainsail
 * and Fluidd are left out (Mike, 2026-10-18).
 * Built with: the libraries this build of Studio was made with.
 */
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useUpdatesStore } from '@/stores/updates'
import { useMachineStore } from '@/stores/machine'
import { updatePlan } from '@/system/updates'
import ZipUpdatePanel from '@/system/ZipUpdatePanel.vue'

const up = useUpdatesStore()
const machine = useMachineStore()
onMounted(() => void up.load())

const plan = computed(() => updatePlan(up.packages))
const open = ref<string | null>(null) // extra row showing how to update
const ago = computed(() => {
  if (!up.checkedAt) return 'Not checked yet'
  const m = Math.round((Date.now() - up.checkedAt) / 60000)
  return m < 1 ? 'Checked just now' : `Checked ${m} min ago`
})
const summary = computed(() => {
  if (up.running) return `Updating ${up.packages.find((p) => p.name === up.running)?.label ?? up.running}…${machine.online ? '' : ' (waiting for it to restart)'}`
  if (!machine.online) return 'Not connected to the machine'
  const parts = []
  if (up.runnableCount) parts.push(`${up.runnableCount} update${up.runnableCount > 1 ? 's' : ''} ready`)
  if (up.engineCount) parts.push('PrusaSlicer update ready')
  if (up.byHandCount) parts.push(`${up.byHandCount} to install by hand`)
  return parts.length ? parts.join(' · ') : 'Everything is up to date'
})
const label = (name: string) => up.packages.find((p) => p.name === name)?.label ?? name
const stepState = (name: string) => (up.doneSteps.includes(name) ? 'done' : up.running === name ? 'now' : 'wait')
const libs = __BUILT_WITH__
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Packages" index="01" panel-id="settings.software" class="wide">
        <div class="summary">
          <div class="sum-text">
            <strong>{{ summary }}</strong>
            <span class="muted small">{{ ago }}<template v-if="up.block && machine.online"> · {{ up.block }}</template></span>
          </div>
          <RsButton variant="quiet" :disabled="up.loading || !!up.running || !machine.online" @click="up.refresh()">{{ up.loading ? 'Checking…' : 'Check now' }}</RsButton>
          <RsButton variant="primary" :disabled="!plan.length || !!up.block" @click="up.run()">Update all{{ plan.length ? ` (${plan.length})` : '' }}</RsButton>
        </div>
        <p v-if="up.error" class="msg bad" role="alert">{{ up.error }}</p>

        <!-- A run in progress, or the last one that stopped -->
        <div v-if="up.running || up.runError || (up.runPlan.length && up.doneSteps.length)" class="run" aria-live="polite">
          <ol class="steps">
            <li v-for="(n, i) in up.runPlan" :key="n" :class="stepState(n)">
              <span class="n">{{ stepState(n) === 'done' ? '✓' : i + 1 }}</span>{{ label(n) }}
            </li>
          </ol>
          <p v-if="up.runError" class="msg bad">{{ up.runError }}</p>
          <pre v-if="up.progress.length" class="log">{{ up.progress.slice(-6).join('\n') }}</pre>
        </div>

        <table class="pk">
          <thead>
            <tr><th>Package</th><th>Installed</th><th>Latest</th><th class="st">Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in up.packages" :key="p.name">
              <td>
                <span class="pl">{{ p.label }}</span>
                <span v-if="p.note" class="pn">{{ p.note }}</span>
              </td>
              <td class="mono">{{ p.kind === 'system' ? '—' : p.installed ?? '?' }}</td>
              <td class="mono">{{ p.kind === 'system' ? (p.packageCount ? `${p.packageCount} upgrades` : 'None waiting') : p.latest ?? '?' }}</td>
              <td class="st">
                <span v-if="p.problem" class="chip attn" :title="p.problem">Needs attention</span>
                <button v-else-if="p.needsUpdate" type="button" class="upd" :disabled="!!up.block" :title="up.block ?? `Update ${p.label}`" @click="up.run(p.name)">
                  {{ up.running === p.name ? 'Updating…' : 'Update' }}
                </button>
                <span v-else class="chip">Up to date</span>
              </td>
            </tr>
            <template v-for="r in up.extras" :key="r.name">
              <tr>
                <td>
                  <span class="pl">{{ r.label }}</span>
                  <span class="pn">{{ r.note }}</span>
                </td>
                <td class="mono">{{ r.installed ?? '?' }}</td>
                <td class="mono">{{ r.latest ?? 'Can’t check' }}</td>
                <td class="st">
                  <button v-if="r.action && (r.needsUpdate || !r.installed)" type="button" class="upd" :disabled="r.busy || !!up.block" :title="up.block ?? ''" @click="up.runEngine()">
                    {{ r.busy ? 'Installing…' : r.actionLabel }}
                  </button>
                  <button v-else-if="r.needsUpdate" type="button" class="upd" :aria-expanded="open === r.name" @click="open = open === r.name ? null : r.name">Update</button>
                  <span v-else-if="r.blocked" class="chip quiet">Not offered</span>
                  <span v-else-if="r.latest && r.installed" class="chip">Up to date</span>
                  <span v-else class="chip quiet">—</span>
                </td>
              </tr>
              <tr v-if="open === r.name || (!r.action && r.how && (!r.installed || r.blocked) && r.name === 'prusaslicer')" class="how">
                <td colspan="4">{{ r.how }}</td>
              </tr>
              <tr v-if="r.busy && r.busyNote" class="how">
                <td colspan="4">{{ r.busyNote }}…</td>
              </tr>
              <tr v-if="r.error" class="how">
                <td colspan="4">{{ r.error }}</td>
              </tr>
              <tr v-if="r.back" class="how">
                <td colspan="4">
                  <RsButton class="back" variant="quiet" size="sm" :disabled="!!up.block" :title="up.block ?? ''" @click="up.rollBackEngine()">Go back to {{ r.back }}</RsButton>
                </td>
              </tr>
            </template>
            <tr v-if="!up.packages.length && machine.online && !up.loading">
              <td colspan="4" class="muted small">Moonraker's update manager lists nothing. Check <code>[update_manager]</code> in moonraker.conf.</td>
            </tr>
          </tbody>
        </table>

        <div class="order">
          <span class="muted small">Update all runs in dependency order, each service restarted once:</span>
          <ol class="steps quiet">
            <li>System packages</li><li>Moonraker</li><li>Config and helper repos</li><li>Klipper, restarted once</li><li>Web apps</li>
          </ol>
          <span class="muted small">Up-to-date steps are skipped. Refused while a job runs. Mainsail isn't listed or updated here. The PrusaSlicer engine comes from Flathub and updates on its own button: it restarts nothing, and the version before can be put back. The Rhino Tool Manager installs from its release zip (Install from zip, below; the first time with <code>rhino.sh</code>), and Rhino Studio comes in the same zip when it is served from the Rhino.</span>
        </div>
      </RsPanel>

      <ZipUpdatePanel />

      <RsPanel title="Built with" index="03" panel-id="settings.builtwith" class="wide">
        <p class="muted small">The libraries in this build of Rhino Studio. They change only with a new Studio release, so there's nothing to update here.</p>
        <table class="pk">
          <thead><tr><th>Library</th><th>Version</th><th>Licence</th><th>Used for</th></tr></thead>
          <tbody>
            <tr v-for="l in libs" :key="l.name">
              <td class="pl">{{ l.name }}</td>
              <td class="mono">{{ l.version }}</td>
              <td class="muted">{{ l.licence }}</td>
              <td class="muted">{{ l.role }}</td>
            </tr>
          </tbody>
        </table>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.summary { display: flex; align-items: center; gap: var(--rs-space-3); flex-wrap: wrap; padding-bottom: var(--rs-space-3); }
.sum-text { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
.sum-text strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.pk { width: 100%; border-collapse: collapse; font-size: var(--rs-text-sm); }
.pk th { text-align: left; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 6px 8px; border-bottom: 1px solid var(--rs-line); }
.pk td { padding: 9px 8px; border-bottom: 1px solid var(--rs-line); vertical-align: middle; }
.pk tbody tr:last-child td { border-bottom: 0; }
.pk .mono { font-family: var(--rs-font-code); font-size: 12px; }
.pl { display: block; color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.pn { display: block; font-size: 11px; color: var(--rs-text-muted); }
.st { width: 140px; text-align: right; }
.chip { display: inline-block; font-size: 12px; padding: 0 8px; line-height: 24px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); color: var(--rs-text); white-space: nowrap; }
.chip.quiet { box-shadow: none; color: var(--rs-text-muted); }
.how .back { margin-left: -12px; }
.chip.attn { background: var(--rs-dither-faint), var(--rs-surface-2); color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); cursor: help; }
.upd {
  height: 26px; padding: 0 12px; border-radius: var(--rs-radius-sm); border: 1px solid var(--rs-ink);
  background: var(--rs-ink); color: var(--rs-on-ink); font: inherit; font-size: 12px; font-weight: var(--rs-weight-medium); cursor: pointer; white-space: nowrap;
}
.upd:hover:not(:disabled) { background: transparent; color: var(--rs-text-strong); }
.upd:disabled { background: var(--rs-key-fill); border-color: var(--rs-line); color: var(--rs-text-muted); cursor: not-allowed; }
.how td { background: var(--rs-surface-2); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.run { margin: 0 0 var(--rs-space-3); padding: var(--rs-space-3); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: var(--rs-text-sm); }
.steps li { display: inline-flex; align-items: center; gap: 6px; color: var(--rs-text-muted); }
.steps .n { width: 18px; height: 18px; display: inline-grid; place-items: center; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--rs-line-strong); font-size: 10px; }
.steps .now, .steps .done { color: var(--rs-text-strong); }
.steps .now .n { box-shadow: inset 0 0 0 2px var(--rs-ink); }
.steps .done .n { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.steps.quiet { counter-reset: s; margin: 6px 0; }
.steps.quiet li::before { counter-increment: s; content: counter(s); width: 18px; height: 18px; display: inline-grid; place-items: center; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--rs-line-strong); font-size: 10px; }
.log { margin: var(--rs-space-2) 0 0; padding: 8px 10px; max-height: 120px; overflow: auto; border-radius: var(--rs-radius-sm); background: var(--rs-surface); font-family: var(--rs-font-code); font-size: 11px; color: var(--rs-text-muted); white-space: pre-wrap; }
.order { margin-top: var(--rs-space-4); padding-top: var(--rs-space-3); border-top: 1px dotted var(--rs-line-strong); display: flex; flex-direction: column; gap: 2px; }
@media (max-width: 720px) {
  .pk th:nth-child(2), .pk td:nth-child(2) { display: none; }
  .st { width: auto; }
}
</style>
