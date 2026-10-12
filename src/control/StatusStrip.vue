<script setup lang="ts">
/**
 * The machine at a glance, as one e-paper display:
 * toolhead | hotend | bed | position | job.
 * Big numbers are dot-matrix; everything else is quiet.
 */
import { computed } from 'vue'
import Icon from '@/icons/Icon.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { careText } from '@/maintenance/summary'

const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()

const temp = (n: number | null) => (n == null ? '—' : n.toFixed(0))
const pos = computed(() => machine.position.xyz)
const homed = computed(() => machine.position.homed.toLowerCase())
const f2 = (n: number | undefined) => (n == null ? '—' : n.toFixed(2))

const toolState = computed(() => {
  switch (machine.toolState.kind) {
    case 'mounted': return `Slot ${machine.toolState.slot} · confirmed`
    case 'swapping': return 'Swap in progress'
    case 'none-confirmed': return 'Not confirmed since restart'
    case 'unmapped': return `Slot ${machine.toolState.slot} not in tool list`
    default: return machine.online ? 'Waiting for Klipper' : 'Not connected'
  }
})

const job = computed(() => machine.job)
const jobActive = computed(() => job.value.state === 'printing' || job.value.state === 'paused')
const pct = computed(() => Math.round((job.value.progress ?? 0) * 100))
const jobLabel: Record<string, string> = { standby: 'Idle', printing: 'Running', paused: 'Paused', complete: 'Finished', cancelled: 'Cancelled', error: 'Error' }
</script>

<template>
  <section class="strip" aria-label="Machine status">
    <!-- Toolhead -->
    <div class="seg tool" :style="{ '--accent': `var(${machine.mountedLook.accentVar})` }" :class="{ unverified: !machine.mountedVerified }">
      <span class="emblem"><Icon :tool="machine.mountedLook.icon" :size="40" /></span>
      <div class="tool-text">
        <span class="k">Toolhead</span>
        <strong class="tool-name">{{ machine.mountedVerified ? machine.mountedName : 'Unknown' }}</strong>
        <span class="sub">{{ toolState }}</span>
        <RouterLink v-if="care.mountedCare && (care.mountedCare.overdue || care.mountedCare.dueSoon)" to="/care" class="care" :class="{ overdue: care.mountedCare.overdue }">
          Care: {{ careText(care.mountedCare) }}
        </RouterLink>
      </div>
      <div class="tool-actions">
        <button
          v-if="machine.toolState.kind === 'none-confirmed' && control.macros.has('RESTORE_TOOL')"
          type="button"
          class="mini primary"
          @click="control.send('RESTORE_TOOL', { label: 'Confirm mounted tool' })"
        >Confirm tool</button>
        <button
          v-else-if="control.macros.has('SWAP_TOOL')"
          type="button"
          class="mini"
          :disabled="!machine.klippyReady || control.jobActive"
          @click="control.send('SWAP_TOOL', { label: 'Swap toolhead' })"
        >Swap</button>
      </div>
    </div>

    <!-- Hotend -->
    <div class="seg">
      <span class="k">Hotend</span>
      <span class="big rs-num" :class="{ empty: machine.hotend.temp == null }">{{ temp(machine.hotend.temp) }}<small v-if="machine.hotend.temp != null">°</small></span>
      <span class="sub">{{ machine.hotend.target ? `Target ${temp(machine.hotend.target)}°` : machine.hotend.temp == null ? '—' : 'Off' }}</span>
    </div>

    <!-- Bed -->
    <div class="seg">
      <span class="k">Bed</span>
      <span class="big rs-num" :class="{ empty: machine.bed.temp == null }">{{ temp(machine.bed.temp) }}<small v-if="machine.bed.temp != null">°</small></span>
      <span class="sub">{{ machine.bed.target ? `Target ${temp(machine.bed.target)}°` : machine.bed.temp == null ? '—' : 'Off' }}</span>
    </div>

    <!-- Position -->
    <div class="seg position">
      <span class="k">Position <em>{{ homed ? `homed ${homed.toUpperCase()}` : 'not homed' }}</em></span>
      <div class="xyz">
        <span v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" :class="{ unhomed: !homed.includes(a.toLowerCase()) }">
          <b>{{ a }}</b><span class="rs-num" :class="{ empty: pos?.[i] == null }">{{ f2(pos?.[i]) }}</span>
        </span>
      </div>
    </div>

    <!-- Job -->
    <div class="seg job">
      <span class="k">Job <em>{{ job.state ? jobLabel[job.state] ?? job.state : '—' }}</em></span>
      <span class="big rs-num" :class="{ empty: !jobActive }">{{ jobActive ? pct : '—' }}<small v-if="jobActive">%</small></span>
      <span class="sub file">{{ job.filename || 'No file loaded' }}</span>
      <span v-if="jobActive" class="bar" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${pct}%` }" /></span>
    </div>
  </section>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: minmax(250px, 1.5fr) repeat(2, minmax(110px, 0.7fr)) minmax(230px, 1.2fr) minmax(170px, 1fr);
  border: 1px solid var(--rs-line);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  overflow: hidden;
}
.seg {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--rs-space-4) var(--rs-space-5);
  min-width: 0;
}
/* dotted divider between segments */
.seg + .seg::before {
  content: '';
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 2px;
  background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 50% 0 / 2px 5px repeat-y;
}
.k { font-size: var(--rs-text-xs); color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); }
.k em { font-style: normal; margin-left: 6px; color: var(--rs-text); }
.big { font-size: 3.1rem; margin-top: auto; }
.big small { font-family: var(--rs-font-ui); font-size: 0.34em; color: var(--rs-text-muted); margin-left: 2px; vertical-align: top; }
.sub { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* toolhead */
.tool { flex-direction: row; align-items: center; gap: var(--rs-space-4); }
.emblem {
  position: relative;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  flex: none;
  border-radius: var(--rs-radius-md);
  background: var(--rs-surface-2);
  color: var(--rs-text-strong);
  overflow: hidden;
}
.emblem::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--accent); }
.unverified .emblem { background: var(--rs-dither-faint), var(--rs-surface-2); color: var(--rs-text-muted); }
.unverified .emblem::after { display: none; }
.tool-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.tool-name { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.care { align-self: flex-start; margin-top: 4px; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); text-decoration: none; padding: 1px 7px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); }
.care.overdue { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.tool-actions { align-self: flex-start; }
.mini { height: 30px; padding: 0 12px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); cursor: pointer; }
.mini.primary { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.mini:disabled { opacity: 0.35; cursor: not-allowed; }

/* position */
.xyz { display: flex; flex-direction: column; gap: 3px; margin-top: auto; }
.xyz > span { display: flex; align-items: baseline; justify-content: space-between; gap: var(--rs-space-3); }
.xyz b { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.xyz .rs-num { font-size: 1.6rem; }
.xyz .unhomed .rs-num { color: var(--rs-text-muted); }

/* job */
.file { margin-top: 2px; }
.bar { display: block; height: 6px; border-radius: 2px; background: var(--rs-dither-faint); box-shadow: inset 0 0 0 1px var(--rs-line); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--rs-ink); }

@media (max-width: 1180px) {
  .strip { grid-template-columns: 1fr 1fr 1fr; }
  .tool { grid-column: 1 / -1; }
  .seg + .seg::before { display: none; }
  .seg { border-top: 1px solid var(--rs-line); }
  .tool { border-top: 0; }
}
@media (max-width: 560px) {
  .strip { grid-template-columns: 1fr 1fr; }
  .position, .job { grid-column: span 1; }
  .big { font-size: 2.4rem; }
}
</style>
