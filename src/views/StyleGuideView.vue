<script setup lang="ts">
/**
 * Living style guide. Everything on this page is drawn from the real tokens
 * and components, so it can't drift from the app.
 */
import { onMounted, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import Readout from '@/components/Readout.vue'
import SectionRule from '@/components/SectionRule.vue'
import BrandMark from '@/brand/BrandMark.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import ToolTile from '@/toolheads/ToolTile.vue'
import Icon from '@/icons/Icon.vue'
import CareBar from '@/maintenance/CareBar.vue'
import { NAV_ICONS, type NavIconId } from '@/icons/nav'
import { BUILT_IN_TOOLHEADS, UNKNOWN_LOOK, lookFor, type ToolheadLook } from '@/toolheads/registry'
import { brand } from '@/brand/brand'
import { useThemeStore } from '@/stores/theme'

const customLook = { ...lookFor('HotWire', 'CNC'), summary: 'Stand-in for any user-added tool' }
const allTools: ToolheadLook[] = [...BUILT_IN_TOOLHEADS, customLook, UNKNOWN_LOOK]
const navIds = Object.keys(NAV_ICONS) as NavIconId[]

const frame = [
  { v: '--rs-bg', name: 'Frame' },
  { v: '--rs-surface', name: 'Panel' },
  { v: '--rs-surface-2', name: 'Raised' },
  { v: '--rs-paper', name: 'Paper' },
]
const signal = [
  { v: '--rs-ok', name: 'OK' },
  { v: '--rs-warn', name: 'Caution' },
  { v: '--rs-danger', name: 'Danger / stop' },
]

// Read live values so hex labels always match tokens.css and the current theme
const values = ref<Record<string, string>>({})
function readValues() {
  const cs = getComputedStyle(document.documentElement)
  const all = [...frame, ...signal].map((s) => s.v).concat(allTools.map((t) => t.accentVar))
  values.value = Object.fromEntries(all.map((v) => [v, cs.getPropertyValue(v).trim()]))
}
onMounted(readValues)
const theme = useThemeStore()
watch(() => theme.pref, () => requestAnimationFrame(readValues))

// Accent preview is local to this page. It never touches the mounted-tool state.
const previewTool = ref<ToolheadLook>(BUILT_IN_TOOLHEADS[0]!)
const isUnknown = (t: ToolheadLook) => t.icon === 'unknown'
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Style guide</h1>
      <p>The parts every screen is built from. Colours live in <code>src/styles/tokens.css</code>, icons in <code>src/icons/</code>, name and logo in <code>src/brand/brand.ts</code>.</p>
    </div>

    <!-- Hero: the whole palette is ink, paper and one signal colour -->
    <div class="palette">
      <div class="swatch paper">
        <span class="sw-name">Paper</span>
        <span class="sw-big rs-num">24<small>°</small></span>
        <span class="sw-hex">Every card. Matte, no shadows.</span>
      </div>
      <div class="swatch ink">
        <span class="sw-name">Ink</span>
        <span class="sw-big rs-num">80<small>%</small></span>
        <span class="sw-hex">Text, lines, and inverted when live or selected.</span>
      </div>
      <div class="swatch dither">
        <span class="sw-name">Dither</span>
        <span class="sw-hex">E-ink shading: progress and care. Dead keys are solid grey. No extra colours.</span>
      </div>
      <div class="swatch signal">
        <span class="sw-name">Signal</span>
        <span class="sw-hex">Red means stop. Only graph lines and the Dashboard's alerts share it.</span>
      </div>
      <div class="tabs-row">
        <span class="sw-name">Toolhead tabs</span>
        <div class="tabs">
          <span v-for="t in allTools" :key="t.name" class="tab" :style="{ '--accent': `var(${t.accentVar})` }">{{ t.name }}</span>
        </div>
        <span class="sw-hex">A tool's colour appears only as a small tab and the band under the top bar.</span>
      </div>
    </div>

    <SectionRule label="Mounted-tool accent" />
    <RsPanel>
      <p class="muted lead">The mounted toolhead's colour shows only as a thin band under the top bar and a tab on its tile. When Klipper hasn't confirmed the tool, the band turns into a dotted line. Pick a tool to preview (this doesn't change the machine state).</p>
      <div class="picker" role="radiogroup" aria-label="Preview toolhead accent">
        <button
          v-for="t in allTools"
          :key="t.name"
          type="button"
          role="radio"
          :aria-checked="previewTool.name === t.name"
          class="pick"
          :style="{ '--accent': `var(${t.accentVar})` }"
          @click="previewTool = t"
        >
          <Icon :tool="t.icon" :size="20" />
          {{ t.name }}
        </button>
      </div>
      <div class="demo" :class="{ unverified: isUnknown(previewTool) }" :style="{ '--rs-active': `var(${previewTool.accentVar})` }">
        <div class="demo-bar">
          <BrandMark :size="26" />
          <ToolheadBadge :look="previewTool" size="sm" :verified="!isUnknown(previewTool)" />
        </div>
        <div class="demo-body">
          <RsButton variant="primary">Send to Rhino</RsButton>
          <RsButton>Preview</RsButton>
        </div>
      </div>
    </RsPanel>

    <SectionRule label="Toolhead emblems" />
    <div class="tiles">
      <ToolTile v-for="t in allTools" :key="t.name" :look="t" :slot="t.defaultSlot ?? null" :caption="t.type" />
    </div>
    <RsPanel title="One drawing, every size" index="A">
      <div class="sizes">
        <div v-for="t in allTools" :key="t.name" class="size-row">
          <Icon :tool="t.icon" :size="64" />
          <Icon :tool="t.icon" :size="32" />
          <Icon :tool="t.icon" :size="20" />
        </div>
      </div>
      <p class="muted note">Drawn on a 48-unit grid like a technical drawing. Dashed construction lines (tool axis, motion, planned path) show at 32px and up and drop away below that. Each silhouette is unique, so tools read in greyscale.</p>
    </RsPanel>

    <SectionRule label="Interface icons" />
    <RsPanel>
      <ul class="navset">
        <li v-for="id in navIds" :key="id">
          <Icon :nav="id" :size="40" />
          <span>{{ NAV_ICONS[id].title }}</span>
        </li>
      </ul>
    </RsPanel>

    <SectionRule label="Readouts" />
    <div class="readouts">
      <Readout label="Hotend" value="215" unit="°" detail="215°" />
      <Readout label="Spindle" note="Running" value="60" unit="%" detail="Throttle" />
      <Readout label="Laser" note="Armed" value="40" unit="%" detail="Power" />
      <Readout label="Job" note="Running" value="42" unit="%" detail="benchy_PLA_0.4.gcode" />
    </div>
    <p class="muted note pad">Sample values. Label on top, number right under it, small line under that, all left-aligned, and every label in a row on one top line. On live screens a readout with no data shows "—", never a made-up number.</p>

    <SectionRule label="Layout rules" />
    <RsPanel>
      <ol class="rules">
        <li><strong>Read like the Control status box.</strong> A 12px muted label on one 18px line, the value right under it, an 11px muted line under that. Left-aligned. Labels across a row share one top line, and so do the values.</li>
        <li><strong>One biggest number per box.</strong> On Control the job % leads (3rem), temperatures and tool outputs next (2.4rem), positions smallest (mono). Units (°, %) are small, top-aligned and tight to the number.</li>
        <li><strong>Positions are plain monospace</strong>, never seven-segment, and live under the jog keys in Motion. Work position comes first for tools that cut from a work zero.</li>
        <li><strong>Show what the mounted tool uses.</strong> Print heads: hotend, bed, part fan. Laser: rail and power. Spindle: relay and throttle. A warm bed or a hotend heater left on always shows, so it can be switched off.</li>
        <li><strong>Edit in place.</strong> Click a temperature, type, Enter. The set temperature sits small under the reading; the graph sits beside it with its dots above.</li>
        <li><strong>Tool actions live in the top bar.</strong> Swap (or Confirm tool) sits next to the mounted tool, on every screen but the look-only Dashboard.</li>
        <li><strong>Keys:</strong> solid light grey when dead, inverted ink when live. Pendant keys are squares.</li>
        <li><strong>Dashboard:</strong> white over the camera, red for what needs you, no clock; the job % only while a job runs.</li>
      </ol>
    </RsPanel>

    <SectionRule label="Type" />
    <RsPanel>
      <div class="type">
        <div class="type-big rs-num">215</div>
        <div class="type-stack">
          <p class="t-xl">Prepare a job</p>
          <p class="t-lg">Mounted toolhead</p>
          <p>Body text. The laser fires only after you confirm the job.</p>
          <p class="t-sm muted">Secondary. Slots come from Klipper once connected.</p>
          <code class="t-code">X 120.00  Y 85.50  Z 12.30</code>
          <code class="t-code">SWAP_TOOL TOOL=3</code>
        </div>
      </div>
      <p class="muted note">Archivo for the interface; DSEG7 Classic (seven-segment, alarm-clock) only for big readouts: temperatures, tool outputs and job %; JetBrains Mono for positions (read to two decimals), G-code and the console. All bundled, so the app works offline on the shop network.</p>
    </RsPanel>

    <SectionRule label="Surfaces and signals" />
    <div class="chips">
      <div v-for="s in [...frame, ...signal]" :key="s.v" class="chipsw">
        <span class="dot" :style="{ background: `var(${s.v})` }" />
        <span>{{ s.name }}</span>
        <code>{{ values[s.v] }}</code>
      </div>
    </div>

    <SectionRule label="Controls" />
    <div class="grid two">
      <RsPanel title="Buttons" index="B">
        <div class="row">
          <RsButton variant="primary">Primary</RsButton>
          <RsButton>Default</RsButton>
          <RsButton variant="quiet">Quiet</RsButton>
          <RsButton variant="danger">Stop</RsButton>
          <RsButton variant="danger-outline">Cancel print</RsButton>
          <RsButton disabled>Disabled</RsButton>
        </div>
        <p class="muted note">Outlined for actions, filled ink for the one primary on a module, quiet text for minor ones, filled tiles only for macro keys. Red is for stopping or destroying and says what it stops; next to everyday buttons it's outlined (Cancel print sits top-right of the job, Pause under it).</p>
      </RsPanel>
      <RsPanel title="Status" index="C">
        <div class="row">
          <StatusChip tone="ok">Connected</StatusChip>
          <StatusChip tone="warn">Heating</StatusChip>
          <StatusChip tone="danger">Shutdown</StatusChip>
          <StatusChip>Not connected</StatusChip>
        </div>
        <p class="muted note">The dot changes shape with the tone (circle, diamond, square, ring) so status reads without colour.</p>
      </RsPanel>
    </div>

    <SectionRule label="Care states" />
    <RsPanel>
      <div class="carestates">
        <div v-for="c in [
          { level: 'ok', f: 0.45, label: 'Scheduled', text: 'Bar fills as the interval is used' },
          { level: 'due_soon', f: 0.88, label: 'Due soon', text: 'Inside the early alarm: solid mustard' },
          { level: 'overdue', f: 1, label: 'Overdue', text: 'Full and hatched, chip gets a ring' },
          { level: 'held', f: 0.3, label: 'On hold', text: 'Waiting on parts, faded' },
        ]" :key="c.level" class="carestate">
          <strong>{{ c.label }}</strong>
          <CareBar :fraction="c.f" :level="c.level" :label="c.label" />
          <span class="muted">{{ c.text }}</span>
        </div>
      </div>
      <p class="muted note">Care states are shades of ink (dither density, then solid), never red: overdue care is a reminder, not a stop. Nothing is blocked by maintenance.</p>
    </RsPanel>

    <SectionRule label="Brand" />
    <RsPanel>
      <div class="row brandrow">
        <BrandMark :size="56" />
        <BrandMark :size="30" />
        <BrandMark :size="22" :show-name="false" />
      </div>
      <p class="muted note">A rhino horn rising over a horizon, with a low sun, inside a dial ring. {{ brand.name }} is a working title; change the name and logo in <code>src/brand/brand.ts</code>.</p>
    </RsPanel>

    <SectionRule label="Safety conventions" />
    <RsPanel>
      <ol class="rules">
        <li>Anything that moves the machine or powers the laser or spindle asks for confirmation first, and says what will happen.</li>
        <li>The E-stop never asks. It acts on the first press and sits in the top bar on every screen.</li>
        <li>The mounted toolhead shows "Unknown" until Klipper reports it. The app never guesses it or keeps it after a disconnect.</li>
        <li>Generated jobs call your existing macros (START_JOB, SWAP_TOOL, END_PRINT) rather than raw tool-change or power G-code.</li>
      </ol>
    </RsPanel>
  </div>
</template>

<style scoped>
.lead { margin-bottom: var(--rs-space-4); }
.note { margin-top: var(--rs-space-4); font-size: var(--rs-text-sm); }
.note.pad { margin-top: 0; padding: 0 var(--rs-space-1); }
.two { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.row { display: flex; flex-wrap: wrap; gap: var(--rs-space-3); align-items: center; }
.brandrow { gap: var(--rs-space-7); }

.palette { display: grid; gap: var(--rs-gap); grid-template-columns: 1.3fr 1fr 1fr 1fr; }
.swatch { display: flex; flex-direction: column; gap: var(--rs-space-2); min-height: 200px; padding: var(--rs-space-4) var(--rs-space-5); border-radius: var(--rs-radius-lg); border: 1px solid var(--rs-line); }
.sw-name { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); }
.sw-big { font-size: 4.5rem; margin-top: auto; color: inherit; }
.sw-big small { font-family: var(--rs-font-ui); font-size: 0.3em; }
.sw-hex { font-size: var(--rs-text-xs); opacity: 0.75; }
.swatch .sw-hex:only-of-type { margin-top: auto; }
.paper { background: var(--rs-surface); color: var(--rs-text-strong); }
.ink { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.ink .rs-num { color: var(--rs-on-ink); }
.dither { background: var(--rs-dither), var(--rs-surface); color: var(--rs-text-strong); }
.dither .sw-name, .dither .sw-hex { background: var(--rs-surface); align-self: flex-start; padding: 2px 6px; border-radius: 4px; }
.dither .sw-hex { margin-top: auto; }
.signal { background: var(--rs-danger); color: var(--rs-on-danger); border-color: var(--rs-danger); }
.signal .sw-hex { margin-top: auto; }
.tabs-row { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-3) var(--rs-space-5); padding: var(--rs-space-4) var(--rs-space-5); border-radius: var(--rs-radius-lg); border: 1px solid var(--rs-line); background: var(--rs-surface); }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.tab { position: relative; padding: 6px 12px 6px 16px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); font-size: var(--rs-text-sm); color: var(--rs-text-strong); overflow: hidden; }
.tab::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
@media (max-width: 900px) { .palette { grid-template-columns: 1fr 1fr; } }

.picker { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); margin-bottom: var(--rs-space-4); }
.pick {
  display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 var(--rs-space-3);
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text);
  cursor: pointer;
}

.pick[aria-checked='true'] { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }


.demo { border-radius: var(--rs-radius-lg); overflow: hidden; background: var(--rs-bg); }
.demo-bar { display: flex; align-items: center; gap: var(--rs-space-5); height: 60px; padding: 0 var(--rs-space-5); box-shadow: inset 0 -3px 0 var(--rs-active); }
.demo.unverified .demo-bar { box-shadow: none; background: radial-gradient(var(--rs-dot) 0.9px, transparent 1.15px) 0 100% / 4px 3px repeat-x; }
.demo-body { display: flex; gap: var(--rs-space-3); padding: var(--rs-space-5); }

.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }

.sizes { display: grid; gap: var(--rs-space-4) var(--rs-space-6); grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.size-row { display: flex; align-items: flex-end; gap: var(--rs-space-3); }

.navset { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--rs-space-5); grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
.navset li { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-2); color: var(--rs-text-strong); font-size: var(--rs-text-sm); }

.readouts {
  /* four samples across */ display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }

.type { display: grid; grid-template-columns: auto 1fr; gap: var(--rs-space-7); align-items: center; }
.type-big { font-size: 7rem; }
.type-stack { display: flex; flex-direction: column; gap: var(--rs-space-2); }
.t-xl { font-size: var(--rs-text-xl); letter-spacing: -0.025em; color: var(--rs-text-strong); }
.t-lg { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.t-sm { font-size: var(--rs-text-sm); }
.t-code { color: var(--rs-text-strong); }
@media (max-width: 720px) { .type { grid-template-columns: 1fr; gap: var(--rs-space-4); } .type-big { font-size: 5rem; } }

.chips { display: flex; flex-wrap: wrap; gap: var(--rs-gap); }
.chipsw { display: inline-flex; align-items: center; gap: var(--rs-space-2); height: 44px; padding: 0 var(--rs-space-4) 0 8px; border-radius: var(--rs-radius-pill); background: var(--rs-surface); font-size: var(--rs-text-sm); }
.chipsw .dot { width: 28px; height: 28px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--rs-line-strong); }
.chipsw code { color: var(--rs-text-muted); font-size: var(--rs-text-xs); }

.carestates { display: grid; gap: var(--rs-space-5); grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.carestate { display: flex; flex-direction: column; gap: var(--rs-space-2); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.rules { margin: 0; padding-left: 1.4em; display: flex; flex-direction: column; gap: var(--rs-space-2); max-width: 80ch; }
</style>
