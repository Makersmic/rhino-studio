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

    <!-- Hero: the palette as solid blocks, like a colour reference card -->
    <div class="palette">
      <div
        v-for="(t, i) in allTools"
        :key="t.name"
        class="swatch"
        :class="{ wide: i === 0 }"
        :style="{ background: `var(${t.accentVar})` }"
      >
        <span class="sw-name">{{ t.name }}</span>
        <span class="sw-hex">{{ values[t.accentVar] }}</span>
      </div>
      <div class="swatch danger">
        <span class="sw-name">Stop</span>
        <span class="sw-hex">{{ values['--rs-danger'] }}</span>
      </div>
    </div>

    <SectionRule label="Mounted-tool accent" />
    <RsPanel>
      <p class="muted lead">The app takes on the colour of the toolhead Klipper reports as mounted: the band under the top bar, primary buttons and the active nav item. When the tool isn't verified, the band is hatched and nothing borrows a tool colour. Pick a tool to preview (this doesn't change the machine state).</p>
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
        <div v-for="t in allTools" :key="t.name" class="size-row" :style="{ color: `var(${t.accentVar})` }">
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
      <Readout label="Hotend" value="215" unit="°" detail="Target 215°" />
      <Readout label="Spindle" value="12k" detail="rpm" />
      <Readout label="Laser power" value="40" unit="%" detail="Capped at s_max" />
    </div>
    <p class="muted note pad">Sample values. On live screens a readout with no data shows "—", never a made-up number.</p>

    <SectionRule label="Type" />
    <RsPanel>
      <div class="type">
        <div class="type-big">19:53</div>
        <div class="type-stack">
          <p class="t-xl">Prepare a job</p>
          <p class="t-lg">Mounted toolhead</p>
          <p>Body text. The laser fires only after you confirm the job.</p>
          <p class="t-sm muted">Secondary. Slots come from Klipper once connected.</p>
          <code class="t-code">SWAP_TOOL TOOL=3</code>
        </div>
      </div>
      <p class="muted note">One family, Archivo, with a width axis: light and large for numbers, medium for labels, extra-wide for the wordmark. JetBrains Mono for G-code and index numbers only. Both are bundled, so the app works offline on the shop network.</p>
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
          <RsButton variant="danger">Cancel job</RsButton>
          <RsButton disabled>Disabled</RsButton>
        </div>
        <p class="muted note">One primary per screen; it takes the mounted tool's accent. Danger is for stopping or deleting, and always says what it stops.</p>
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

.palette {
  display: grid;
  gap: var(--rs-gap);
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 132px;
}
.swatch {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--rs-space-4) var(--rs-space-5);
  border-radius: var(--rs-radius-xl);
  color: var(--th-ink);
}
.swatch.wide { grid-column: span 2; grid-row: span 2; }
.swatch.wide .sw-name { font-size: var(--rs-text-2xl); font-weight: var(--rs-weight-light); letter-spacing: -0.04em; line-height: 1; }
.swatch.danger { grid-column: span 2; background: var(--rs-danger); color: var(--rs-on-danger); }
.sw-name { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); }
.sw-hex { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); }
@media (max-width: 720px) {
  .palette { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 110px; }
}

.picker { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); margin-bottom: var(--rs-space-4); }
.pick {
  display: inline-flex; align-items: center; gap: 6px;
  height: 38px; padding: 0 var(--rs-space-4) 0 var(--rs-space-3);
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text);
  cursor: pointer;
}
.pick :deep(svg) { color: var(--accent); }
.pick[aria-checked='true'] { background: var(--accent); border-color: transparent; color: var(--th-ink); }
.pick[aria-checked='true'] :deep(svg) { color: var(--th-ink); }

.demo { border-radius: var(--rs-radius-lg); overflow: hidden; background: var(--rs-bg); }
.demo-bar { display: flex; align-items: center; gap: var(--rs-space-5); height: 60px; padding: 0 var(--rs-space-5); border-bottom: 4px solid var(--rs-active); }
.demo.unverified .demo-bar { border-bottom-color: transparent; border-image: repeating-linear-gradient(135deg, var(--rs-line-strong) 0 6px, transparent 6px 12px) 4; }
.demo-body { display: flex; gap: var(--rs-space-3); padding: var(--rs-space-5); }

.tiles { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }

.sizes { display: grid; gap: var(--rs-space-4) var(--rs-space-6); grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.size-row { display: flex; align-items: flex-end; gap: var(--rs-space-3); }

.navset { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--rs-space-5); grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
.navset li { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-2); color: var(--rs-text-strong); font-size: var(--rs-text-sm); }

.readouts { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }

.type { display: grid; grid-template-columns: auto 1fr; gap: var(--rs-space-7); align-items: center; }
.type-big { font-size: 7.5rem; font-weight: var(--rs-weight-light); letter-spacing: -0.05em; line-height: 0.85; color: var(--rs-text-strong); }
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

.rules { margin: 0; padding-left: 1.4em; display: flex; flex-direction: column; gap: var(--rs-space-2); max-width: 80ch; }
</style>
