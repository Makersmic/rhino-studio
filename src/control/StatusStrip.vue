<script setup lang="ts">
/**
 * The machine at a glance, as one e-paper display:
 *   toolhead | what this tool uses | job (with Pause / Resume / Cancel)
 * Position lives in the Motion panel, under the jog keys.
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
import { useToolMacros } from './useToolMacros'
import PanelMenu from '@/components/PanelMenu.vue'
import { usePanelThemeStore } from '@/stores/panelTheme'

const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()
const toolMacros = useToolMacros()
const themes = usePanelThemeStore()


// Only a confirmed print head can heat the hotend; other tools show their
// body temperature from the same T0 input.
const printHead = computed(() => machine.toolKind === 'print')
const hotendLock = computed(() => (printHead.value ? undefined : 'Confirm a print head to heat it'))
const readouts = computed(() => machine.plan.readouts)
const out = computed(() => machine.outputs)
const pct = (v: number | null | undefined) => (v == null ? null : v * 100)


const columns = computed(() => `minmax(250px, 1.2fr) ${'auto '.repeat(readouts.value.length)}minmax(230px, 1.3fr)`)

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
  <section class="strip" aria-label="Machine status" :style="[{ '--cols': columns }, themes.styleFor('control.status')]">
    <!-- ⋮ settings, in the right-hand gutter so it never sits on Cancel print -->
    <PanelMenu panel-id="control.status" title="Status box" class="strip-menu" />
    <!-- Toolhead -->
    <div class="seg tool" :style="{ '--accent': `var(${machine.mountedLook.accentVar})` }" :class="{ unverified: !machine.mountedVerified }">
      <!-- The tile spans the same height as the other cells (label line to
           detail line); the three text lines sit on their three lines. -->
      <span class="emblem"><Icon :tool="machine.mountedLook.icon" :size="62" /></span>
      <div class="tool-text">
        <span class="k">Toolhead</span>
        <strong class="tool-name">{{ machine.mountedVerified ? machine.mountedName : 'Unknown' }}</strong>
        <span class="tool-detail">
          <span class="sub">{{ toolState }}</span>
          <RouterLink v-if="care.mountedCare && (care.mountedCare.overdue || care.mountedCare.dueSoon)" to="/care" class="care" :class="{ overdue: care.mountedCare.overdue }">
            Care: {{ careText(care.mountedCare) }}
          </RouterLink>
        </span>
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

    <!-- Job: progress on the left, its controls stacked in the top-right corner -->
    <div class="seg job">
      <div class="job-main">
        <span class="k">Job <em>{{ job.state ? jobLabel[job.state] ?? job.state : '—' }}</em></span>
        <span class="big rs-num" :class="{ empty: !jobActive }">{{ jobActive ? jobPct : '—' }}<small v-if="jobActive">%</small></span>
      </div>
      <div v-if="jobActive" class="job-acts">
        <button type="button" class="mini cancel" @click="control.cancelJob()">{{ machine.toolKind === 'print' ? 'Cancel print' : 'Cancel job' }}</button>
        <button v-if="job.state === 'printing'" type="button" class="mini" @click="control.pauseJob()">Pause</button>
        <button v-else type="button" class="mini primary" @click="control.resumeJob()">Resume</button>
      </div>
      <div class="job-foot">
        <span class="sub file">{{ job.filename || 'No file loaded' }}</span>
        <span v-if="jobActive" class="bar" role="progressbar" :aria-valuenow="jobPct" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${jobPct}%` }" /></span>
        <RouterLink v-else to="/files" class="sub start">Start a job from Files</RouterLink>
      </div>
    </div>

    <!-- The mounted tool's macros along the bottom (desktop only; on smaller
         screens they're in their own panel). Same safety check as the console. -->
    <div class="tool-macros" :aria-label="toolMacros.toolName.value ? `Macros for ${toolMacros.toolName.value}` : 'Tool macros'" role="group">
      <template v-if="toolMacros.toolName.value">
        <button
          v-for="b in toolMacros.panels.value.tool"
          :key="b.name"
          type="button"
          class="tm"
          :disabled="!toolMacros.ready.value"
          :title="toolMacros.describe(b.name)"
          @click="toolMacros.run(b.name, b.label)"
        >
          {{ b.label }}
        </button>
        <button
          v-for="b in toolMacros.panels.value.toolMore"
          :key="b.name"
          type="button"
          class="tm dense"
          :disabled="!toolMacros.ready.value"
          :title="toolMacros.describe(b.name)"
          @click="toolMacros.run(b.name, b.name)"
        >
          {{ b.name }}
        </button>
        <button v-if="toolMacros.hidden.value" type="button" class="tm-more" @click="toolMacros.showAll.value = !toolMacros.showAll.value">
          {{ toolMacros.showAll.value ? 'Hide' : 'Show' }} {{ toolMacros.hidden.value }} for other tools
        </button>
      </template>
      <span v-else class="tm-none">Tool macros appear once Klipper confirms the mounted tool.</span>
    </div>
  </section>
</template>

<style scoped>
.strip {
  position: relative;
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
  padding: var(--rs-space-3) var(--rs-space-5);
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
.k { font-size: var(--rs-text-xs); line-height: 18px; height: 18px; color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); }
.k em { font-style: normal; margin-left: 6px; color: var(--rs-text); }
.big { font-size: 3rem; line-height: 0.85; margin-top: 15px; }
.big small { font-family: var(--rs-font-ui); font-size: 0.32em; color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.sub { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* toolhead */
.tool { --tile: 96px; flex-direction: row; align-items: flex-start; gap: var(--rs-space-4); } /* label on the same top line as the others */
.emblem {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--tile);
  height: var(--tile);
  flex: none;
  border-radius: var(--rs-radius-md);
  background: var(--rs-surface-2);
  color: var(--rs-text-strong);
  overflow: hidden;
}
.emblem::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--accent); }
.unverified .emblem { background: var(--rs-dither-faint), var(--rs-surface-2); color: var(--rs-text-muted); }
.unverified .emblem::after { display: none; }
.tool-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
/* Three lines matched to the readout cells: label line, value line (name's
   capitals level with the tops of the digits), detail line (level with "215°"). */
.tool-name { font-size: 1.35rem; line-height: 1; margin-top: 21px; font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tool-detail { display: flex; align-items: center; gap: 8px; margin-top: 23px; min-width: 0; height: 14px; }
.tool-detail .sub { font-size: 11px; font-weight: var(--rs-weight-medium); }
.care { flex: none; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); text-decoration: none; padding: 0 6px; line-height: 16px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); }
.care.overdue { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.mini { height: 26px; padding: 0 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); cursor: pointer; }
.mini.primary { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.mini:disabled { opacity: 0.35; cursor: not-allowed; }


/* job */
.job { display: grid; grid-template-columns: 1fr auto; grid-template-rows: 1fr auto; column-gap: var(--rs-space-3); row-gap: 6px; }
.job-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
/* Cancel in the top-right corner, Pause/Resume under it, both right-aligned */
.job-acts { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.job-foot { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.job-acts .cancel { border-color: var(--rs-danger); color: var(--rs-danger); }
.job-acts .cancel:hover { background: var(--rs-danger); color: var(--rs-on-danger); }
.start { color: var(--rs-text-strong); text-decoration: underline; text-underline-offset: 3px; }
.file { margin-top: 0; }
.bar { display: block; height: 5px; border-radius: 2px; background: var(--rs-dither-faint); box-shadow: inset 0 0 0 1px var(--rs-line); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--rs-ink); }

/* ⋮ in the top-right corner, in the 20px gutter right of the job's buttons */
.strip-menu { position: absolute; top: 6px; right: 0; z-index: 2; }
.strip-menu :deep(.dots) { width: 18px; }

/* Tool macro row: spans the box under the readouts, buttons two thirds the
   size of the macro panel's (38 -> 25px tall, 132 -> 88px wide), from the left. */
.tool-macros {
  grid-column: 1 / -1;
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 10px var(--rs-space-5) 12px;
}
.tool-macros::before { /* dotted rule, like the dividers between sections */
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  top: 0;
  height: 2px;
  background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 50% / 5px 2px repeat-x;
}
.tm {
  min-width: 88px;
  height: 25px;
  padding: 0 8px;
  border-radius: var(--rs-radius-sm);
  border: 1px solid var(--rs-line);
  background: var(--rs-surface-2);
  color: var(--rs-text-strong);
  font-size: 11px;
  font-weight: var(--rs-weight-medium);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.tm:hover:not(:disabled) { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.tm:disabled { opacity: 0.35; cursor: not-allowed; }
.tm.dense { font-family: var(--rs-font-code); font-weight: 400; font-size: 10px; background: transparent; }
.tm-more { margin-left: 6px; padding: 0; border: 0; background: none; color: var(--rs-text-muted); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.tm-more:hover { color: var(--rs-text-strong); }
.tm-none { font-size: 11px; color: var(--rs-text-muted); line-height: 25px; }

@media (max-width: 1180px) {
  .tool-macros { display: none; } /* the tool macro panel takes over below the desktop layout */
  .strip { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  .tool { grid-column: 1 / -1; }
  .seg + .seg::before { display: none; }
  .seg { border-top: 1px solid var(--rs-line); }
  .tool { border-top: 0; }
  /* the job needs room for its number and the two buttons beside it */
  .job { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .strip { grid-template-columns: 1fr 1fr; }
  .big { font-size: 2.6rem; }
}
</style>
