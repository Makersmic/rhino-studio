<script setup lang="ts">
/**
 * The machine at a glance, as one e-paper display:
 *   toolhead | what this tool uses | position | job
 * The middle depends on the mounted tool (src/toolheads/readouts.ts):
 *   print head   hotend, bed, part fan
 *   laser        laser rail and power, body temperature
 *   spindle      spindle relay and throttle, body temperature
 *   knife        nothing extra (body temperature once a thermistor reads)
 * plus a warm bed or a hotend heater left on, whatever the tool, so they
 * can be switched off. Temperatures are edited in place (TempCell), each
 * with its history graph; tool outputs are read only (OutputCell).
 */
import { computed } from 'vue'
import Icon from '@/icons/Icon.vue'
import TempCell from './TempCell.vue'
import OutputCell from './OutputCell.vue'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { careText } from '@/maintenance/summary'

const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()


// Only a confirmed print head can heat the hotend; other tools show their
// body temperature from the same T0 input.
const printHead = computed(() => machine.toolKind === 'print')
const hotendLock = computed(() => (printHead.value ? undefined : 'Confirm a print head to heat it'))
const readouts = computed(() => machine.plan.readouts)
const out = computed(() => machine.outputs)
const pct = (v: number | null | undefined) => (v == null ? null : v * 100)

const work = computed(() => machine.plan.position === 'work')
const pos = computed(() => (work.value ? machine.workPosition : machine.position.xyz))
const homed = computed(() => machine.position.homed.toLowerCase())
const f2 = (n: number | undefined) => (n == null ? '—' : n.toFixed(2))
const f1 = (n: number | undefined) => (n == null ? '—' : n.toFixed(1))

const columns = computed(() => `minmax(240px, 1.3fr) ${'auto '.repeat(readouts.value.length)}minmax(200px, 1fr) minmax(170px, 1fr)`)

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
const jobPct = computed(() => Math.round((job.value.progress ?? 0) * 100))
const jobLabel: Record<string, string> = { standby: 'Idle', printing: 'Running', paused: 'Paused', complete: 'Finished', cancelled: 'Cancelled', error: 'Error' }
</script>

<template>
  <section class="strip" aria-label="Machine status" :style="{ '--cols': columns }">
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

    <!-- What this tool uses -->
    <div v-for="r in readouts" :key="r" class="seg">
      <TempCell v-if="r === 'hotend'" heater="extruder" label="Hotend" :temp="machine.hotend.temp" :target="machine.hotend.target" :editable="printHead" :locked-reason="hotendLock" />
      <TempCell v-else-if="r === 'body'" heater="extruder" label="Body temperature" :temp="machine.hotend.temp" :target="null" :editable="false" locked-reason="No heater on this tool" />
      <TempCell
        v-else-if="r === 'hotend-on'"
        heater="extruder"
        :label="(machine.hotend.target ?? 0) > 0 ? 'Hotend heater on' : 'Hotend still hot'"
        :alert="(machine.hotend.target ?? 0) > 0"
        :temp="machine.hotend.temp"
        :target="machine.hotend.target"
        :editable="true"
        off-only
      />
      <TempCell v-else-if="r === 'bed'" heater="heater_bed" label="Bed" :temp="machine.bed.temp" :target="machine.bed.target" :editable="true" />
      <TempCell
        v-else-if="r === 'bed-warm'"
        heater="heater_bed"
        :label="(machine.bed.target ?? 0) > 0 ? 'Bed heating' : 'Bed still warm'"
        :alert="(machine.bed.target ?? 0) > 0"
        :temp="machine.bed.temp"
        :target="machine.bed.target"
        :editable="true"
        off-only
      />
      <OutputCell v-else-if="r === 'fan'" label="Part fan" :percent="pct(out.fan)" sub="Cooling" />
      <OutputCell
        v-else-if="r === 'laser' && out.laser"
        label="Laser"
        :state="out.laser.armed ? (out.laser.power > 0 ? 'Firing' : 'Armed') : 'Off'"
        :live="out.laser.armed"
        :percent="out.laser.armed ? pct(out.laser.power) : 0"
        :sub="out.laser.armed ? 'Power' : 'Rail off'"
      />
      <OutputCell
        v-else-if="r === 'spindle' && out.spindle"
        label="Spindle"
        :state="out.spindle.on ? 'Running' : 'Off'"
        :live="out.spindle.on"
        :percent="out.spindle.on ? pct(out.spindle.throttle) : 0"
        :sub="out.spindle.on ? 'Throttle' : 'Relay open'"
      />
      <OutputCell
        v-else-if="r === 'power' && out.toolPower"
        label="Tool power"
        :state="out.toolPower.active ? (out.toolPower.suspended ? 'Paused' : 'On') : 'Off'"
        :live="out.toolPower.active && !out.toolPower.suspended"
        :percent="out.toolPower.active ? pct(out.toolPower.level) : 0"
        sub="Output"
      />
    </div>

    <!-- Position: work coordinates first for tools that cut from a work zero -->
    <div class="seg position">
      <span class="k">{{ work ? 'Work position' : 'Position' }} <em>{{ homed ? `homed ${homed.toUpperCase()}` : 'not homed' }}</em></span>
      <div class="xyz">
        <span v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" :class="{ unhomed: !homed.includes(a.toLowerCase()) }">
          <b>{{ a }}</b><span class="rs-num" :class="{ empty: pos?.[i] == null }">{{ f2(pos?.[i]) }}</span>
        </span>
      </div>
      <span v-if="work" class="sub machine">
        {{ machine.hasWorkOffset ? `Machine ${machine.position.xyz?.map((v) => f1(v)).join('  ') ?? '—'}` : 'No work zero set: same as machine' }}
      </span>
    </div>

    <!-- Job -->
    <div class="seg job">
      <span class="k">Job <em>{{ job.state ? jobLabel[job.state] ?? job.state : '—' }}</em></span>
      <span class="big rs-num" :class="{ empty: !jobActive }">{{ jobActive ? jobPct : '—' }}<small v-if="jobActive">%</small></span>
      <span class="sub file">{{ job.filename || 'No file loaded' }}</span>
      <span v-if="jobActive" class="bar" role="progressbar" :aria-valuenow="jobPct" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${jobPct}%` }" /></span>
    </div>
  </section>
</template>

<style scoped>
.strip {
  display: grid;
  grid-template-columns: var(--cols);
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
.tool-text .sub { white-space: normal; }
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
.machine { font-family: var(--rs-font-code); font-size: 11px; }

/* job */
.file { margin-top: 2px; }
.bar { display: block; height: 6px; border-radius: 2px; background: var(--rs-dither-faint); box-shadow: inset 0 0 0 1px var(--rs-line); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--rs-ink); }

@media (max-width: 1180px) {
  .strip { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
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
