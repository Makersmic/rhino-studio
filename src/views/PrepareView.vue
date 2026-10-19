<script setup lang="ts">
/**
 * Job setup: model in, Rhino job file out, in three steps (the flow online
 * manufacturing services use: upload, confirm the process, configure):
 *
 *   File      drop a model or drawing, or start from a toolhead card
 *   Process   Studio says what kind of file it is and which processes fit;
 *             you confirm one (skipped when you started from a card that fits)
 *   Set up    place it, set the process, check the file, send it
 *
 * The slicing runs in this browser (src/slicer/), so the Pi only ever receives
 * the finished file. See src/stores/prepare.ts.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import Icon from '@/icons/Icon.vue'
import BedView from '@/prepare/BedView.vue'
import NumField from '@/prepare/NumField.vue'
import StepBar from '@/prepare/StepBar.vue'
import FdmAdvanced from '@/prepare/FdmAdvanced.vue'
import FoldGroup from '@/prepare/FoldGroup.vue'
import PrusaPanel from '@/prepare/PrusaPanel.vue'
import { rhinoBase, firstOf } from '@/slicer/prusa/config'
import CncOps from '@/prepare/CncOps.vue'
import ToolCard from '@/prepare/ToolCard.vue'
import { PROCESS_ACTION, PROCESS_LABEL, prettyMaterial, toolFacts } from '@/prepare/facts'
import { usePrepareStore } from '@/stores/prepare'
import { useMachineStore } from '@/stores/machine'
import { MODEL_TYPES } from '@/slicer/model'
import { GCODE_TYPES } from '@/slicer/gcodeFile'

const prep = usePrepareStore()
const machine = useMachineStore()
const router = useRouter()

const picker = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
function pick(list: FileList | null) {
  const f = list?.[0]
  if (f) void prep.load(f)
  if (picker.value) picker.value.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  pick(e.dataTransfer?.files ?? null)
}

const job = computed(() => prep.job)
const proc = computed(() => prep.job?.process ?? null)
const mat = computed(() => prep.materials.list.find((m) => m.key === prep.job?.material) ?? null)
const accepts = [...MODEL_TYPES, ...GCODE_TYPES].map((t) => `.${t}`).join(',')
const up = computed(() => prep.uploaded)
const suits = computed(() => {
  if (!prep.part) return null
  if ((proc.value === 'fdm' || proc.value === 'cnc') && prep.flat) return 'This is a flat drawing (extruded 5 mm by the loader). For printing or milling, load a 3D model (STL, 3MF, OBJ).'
  return null
})

const processWord = PROCESS_LABEL

const cards = computed(() =>
  prep.tools.map((t) => ({ t, facts: toolFacts(t, prep.materialsOf(t.name), prep.machineInfo), mounted: t.name === machine.mountedName })),
)

/** Tool card: with no file yet, remember the tool and ask for the file */
function startWith(tool: string) {
  prep.startWith(tool)
  if (prep.step === 'file') picker.value?.click()
}

/** Step 2: the process picked in the list (the first option until you choose) */
const choice = ref<string | null>(null)
const chosen = computed(() => choice.value ?? prep.options[0]?.tool.name ?? null)
function confirm() {
  if (chosen.value) prep.confirmProcess(chosen.value)
  choice.value = null
}
function goStep(s: 'file' | 'process') {
  if (s === 'file') prep.clearPart()
  else prep.changeProcess()
}
/** small drawing of an uploaded file's toolpath for the Process step */
const pathPreview = computed(() => {
  const u = prep.uploaded
  const b = u?.info.bounds
  if (!u || !b) return null
  const w = Math.max(b.max[0] - b.min[0], 1)
  const h = Math.max(b.max[1] - b.min[1], 1)
  const pad = Math.max(w, h) * 0.06
  const step = Math.max(1, Math.ceil(u.info.paths.length / 3000))
  const lines = u.info.paths.filter((_, i) => i % step === 0).map((pl) => pl.map(([x, y]) => `${(x - b.min[0]).toFixed(1)},${(b.max[1] - y).toFixed(1)}`).join(' '))
  return { view: `${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`, lines, w, h }
})
const footprintPath = computed(() => {
  const p = prep.part
  if (!p || !p.footprint.length) return { d: '', view: '0 0 10 10' }
  const w = Math.max(p.size.x, 1)
  const h = Math.max(p.size.y, 1)
  const pad = Math.max(w, h) * 0.06
  const d = p.footprint.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + w / 2).toFixed(2)} ${(h / 2 - y).toFixed(2)}`).join(' ') + ' Z'
  return { d, view: `${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}` }
})

const fmtTime = (s: number) => {
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${Math.max(1, m)} min`
}
const fmtLen = (mm: number) => (mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`)
const fmt = (v: number) => (Math.round(v * 10) / 10).toString()

const summary = computed(() => {
  const r = prep.result
  if (!r || !proc.value) return []
  const time = r.kiriSeconds ?? r.stats.seconds
  const rows: Array<{ label: string; value: string; note?: string }> = [{ label: 'Time', value: fmtTime(time), note: r.kiriSeconds ? (prep.uploaded ? `from ${r.kiri}` : 'estimate') : 'from feeds, no acceleration' }]
  if (proc.value === 'fdm') {
    rows.push({ label: 'Filament', value: fmtLen(r.kiriFilament ?? r.stats.filament), note: '1.75 mm' })
    rows.push({ label: 'Layers', value: String(r.stats.layers) })
  } else {
    rows.push({ label: proc.value === 'cnc' ? 'Cutting' : 'Cut length', value: fmtLen(r.stats.workLength) })
  }
  const b = r.file.bounds
  if (b) rows.push({ label: proc.value === 'cnc' ? 'Work area' : 'On the bed', value: `X ${fmt(b.min[0])}–${fmt(b.max[0])}`, note: `Y ${fmt(b.min[1])}–${fmt(b.max[1])}${proc.value === 'cnc' || proc.value === 'dragknife' ? ` · Z ${fmt(b.min[2])}–${fmt(b.max[2])}` : ''}` })
  return rows
})

function rotate(by: number) {
  if (!prep.job) return
  prep.job.placement.rotate = (((prep.job.placement.rotate + by) % 360) + 360) % 360
}

function openInFiles() {
  if (prep.sentPath) void router.push({ path: '/files', query: { file: prep.sentPath } })
}

// ---- PrusaSlicer options: keep only what differs from the Rhino profile -------------
function setPrusa(key: string, value: string | null) {
  const j = prep.job
  const sch = prep.schema
  const ctx = prep.rhinoCtx
  if (!j || !sch || !ctx) return
  const next = { ...(j.prusa ?? {}) }
  delete next[key]
  if (value !== null) {
    const base = rhinoBase(ctx)[key] ?? firstOf(sch.options[key]?.default ?? '', sch.options[key]?.type)
    if (value !== base) next[key] = value
  }
  j.prusa = next
}
function resetPrusa() {
  if (prep.job) prep.job.prusa = {}
}
const engineNote = computed(() => {
  const st = prep.slicer
  if (prep.slicerError) return prep.slicerError
  if (!st) return 'Asking the Rhino Portal…'
  if (!st.engine.installed) return 'Not installed on the Rhino yet: Settings > Software > PrusaSlicer engine.'
  if (st.refuse) return st.refuse
  return `PrusaSlicer ${st.engine.installed} on the Rhino${st.host.small ? ' (a small host: no slicing during a print)' : ''}.`
})
</script>

<template>
  <div class="view" @dragover.prevent="prep.step !== 'setup' && (dragging = true)" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <div class="view-head">
      <h1>Job setup</h1>
      <p>Drop in a model or drawing, confirm what the Rhino should do with it, then place it, set it up and send it. 3D models can be sliced by PrusaSlicer on the Rhino or by Kiri:Moto in this browser; everything else is worked out on this computer. Every file is checked before it goes to the Rhino.</p>
    </div>

    <input ref="picker" type="file" :accept="accepts" class="visually-hidden" aria-label="Choose a model file" @change="pick(($event.target as HTMLInputElement).files)" />
    <StepBar :step="prep.step" @go="goStep" />

    <!-- ============ 1. File -->
    <template v-if="prep.step === 'file'">
      <button type="button" class="dropzone" :class="{ dragging }" @click="picker?.click()">
        <Icon nav="prepare" :size="56" />
        <span class="big">{{ prep.loading ? 'Reading the file…' : prep.preset ? `Drop a file for ${prep.preset}, or click to choose one` : 'Drop a model or drawing here, or click to choose one' }}</span>
        <span class="muted small">3D models: STL, 3MF, OBJ · 2D drawings: SVG, DXF · ready-made jobs: G-code from Orca, LightBurn and others</span>
        <span v-if="prep.loadError" class="error" role="alert">{{ prep.loadError }}</span>
      </button>

      <h2 class="section">Or start from a toolhead</h2>
      <div class="cards">
        <ToolCard
          v-for="c in cards"
          :key="c.t.name"
          :look="c.t.look"
          :slot="c.t.slot"
          :process="processWord[c.t.process]"
          :facts="c.facts"
          :mounted="c.mounted"
          :action="PROCESS_ACTION[c.t.process]"
          @pick="startWith(c.t.name)"
        />
      </div>
    </template>

    <!-- ============ 2. Process -->
    <RsPanel v-else-if="prep.step === 'process' && up" panel-id="prepare.process" :title="`Which toolhead is ${up.name} for?`">
      <template #actions>
        <RsButton size="sm" variant="quiet" @click="prep.clearPart()">Use another file</RsButton>
      </template>
      <div class="procgrid">
        <figure class="detect">
          <svg v-if="pathPreview" :viewBox="pathPreview.view" class="fp" role="img" :aria-label="`What ${up.name} prints or cuts, seen from above`">
            <polyline v-for="(pts, i) in pathPreview.lines" :key="i" :points="pts" class="tp" />
          </svg>
          <figcaption>
            <span><strong>{{ prep.fileKind }}</strong></span>
            <span v-if="up.info.madeBy">Made by {{ up.info.madeBy }}</span>
            <span v-if="pathPreview">{{ fmt(pathPreview.w) }} × {{ fmt(pathPreview.h) }} mm of moves</span>
            <span class="muted small">{{ up.info.toolhead ? `The file says it's for ${up.info.toolhead}.` : "The file doesn't say which toolhead it's for: pick the one it was made for." }} It's sent as it is; nothing is sliced again.</span>
          </figcaption>
        </figure>

        <div class="options" role="radiogroup" aria-label="Toolhead">
          <button
            v-for="o in prep.options"
            :key="o.tool.name"
            type="button"
            role="radio"
            class="option"
            :aria-checked="chosen === o.tool.name"
            :style="{ '--accent': `var(${o.tool.look.accentVar})` }"
            @click="choice = o.tool.name"
            @dblclick="choice = o.tool.name; confirm()"
          >
            <span class="oicon"><Icon :tool="o.tool.look.icon" :size="32" /></span>
            <span class="otext">
              <span class="oname">{{ processWord[o.tool.process] }} · {{ o.tool.name }}</span>
              <span class="osub">{{ o.recommended ? 'The file says it is for this tool' : 'Not named in the file' }}<template v-if="o.mounted"> · mounted now</template></span>
            </span>
          </button>
          <p v-if="up.info.toolhead && !prep.options.length" class="error">The file says it's for {{ up.info.toolhead }}, which this machine doesn't have.</p>
          <div class="ogo">
            <RsButton variant="primary" :disabled="!chosen" @click="confirm">Continue</RsButton>
          </div>
        </div>
      </div>
    </RsPanel>

    <RsPanel v-else-if="prep.step === 'process' && prep.part" panel-id="prepare.process" :title="`What should the Rhino do with ${prep.part.name}?`">
      <template #actions>
        <RsButton size="sm" variant="quiet" @click="prep.clearPart()">Use another file</RsButton>
      </template>
      <div class="procgrid">
        <figure class="detect">
          <svg :viewBox="footprintPath.view" class="fp" role="img" :aria-label="`${prep.part.name} seen from above`">
            <path :d="footprintPath.d" />
          </svg>
          <figcaption>
            <span><strong>{{ prep.fileKind }}</strong> · {{ prep.part.name.split('.').pop()?.toUpperCase() }}</span>
            <span>{{ fmt(prep.part.size.x) }} × {{ fmt(prep.part.size.y) }}<template v-if="!prep.flat"> × {{ fmt(prep.part.size.z) }}</template> mm</span>
            <span class="muted small">{{ prep.flat ? 'A flat outline: it can be cut, not printed or milled.' : 'A solid: it can be printed or milled, or cut along its outline.' }}</span>
          </figcaption>
        </figure>

        <div class="options" role="radiogroup" aria-label="Process">
          <button
            v-for="o in prep.options"
            :key="o.tool.name"
            type="button"
            role="radio"
            class="option"
            :aria-checked="chosen === o.tool.name"
            :style="{ '--accent': `var(${o.tool.look.accentVar})` }"
            @click="choice = o.tool.name"
            @dblclick="choice = o.tool.name; confirm()"
          >
            <span class="oicon"><Icon :tool="o.tool.look.icon" :size="32" /></span>
            <span class="otext">
              <span class="oname">{{ processWord[o.tool.process] }} · {{ o.tool.name }}</span>
              <span class="osub">{{ o.recommended ? 'Suits this file' : 'Also possible: cuts the outline at one height' }}<template v-if="o.mounted"> · mounted now</template></span>
            </span>
          </button>
          <div class="ogo">
            <RsButton variant="primary" :disabled="!chosen" @click="confirm">Continue</RsButton>
          </div>
        </div>
      </div>
    </RsPanel>

    <!-- ============ 3. Set up & send -->
    <div v-else-if="prep.step === 'setup'" class="layout">
      <!-- the bed -->
      <RsPanel
        panel-id="prepare.bed"
        :title="up ? up.name : prep.part ? prep.part.name : 'Model'"
        :status="up ? (up.info.madeBy ? `Made by ${up.info.madeBy}` : 'G-code') : prep.part ? `${fmt(prep.part.size.x)} × ${fmt(prep.part.size.y)} × ${fmt(prep.part.size.z)} mm` : undefined"
        class="bedpanel drop"
        :class="{ dragging }"
        @dragover.prevent.stop="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent.stop="onDrop"
      >
        <template #actions>
          <RsButton size="sm" :disabled="prep.loading" @click="picker?.click()">Replace</RsButton>
        </template>

        <template v-if="job && up">
          <BedView :machine="prep.machineInfo" :job="job" :part="null" :result="prep.result?.file.bounds ?? null" :paths="up.info.paths" />
          <p class="muted small">Shown as it is in the file{{ proc === 'cnc' ? ', around the work zero' : ', on the bed' }}. It isn't sliced again: to change it, change it in {{ up.info.madeBy ?? 'the program that made it' }} and drop it here again.</p>
          <p v-if="prep.loadError" class="error" role="alert">{{ prep.loadError }}</p>
        </template>
        <template v-else-if="job && prep.part">
          <BedView :machine="prep.machineInfo" :job="job" :part="prep.part" :result="prep.result?.file.bounds ?? null" />
          <p v-if="suits" class="notice small" role="status">{{ suits }}</p>
          <div class="place">
            <template v-if="proc !== 'cnc'">
              <NumField v-model="job.placement.x" label="Centre X" unit="mm" :min="0" :max="prep.machineInfo.workArea.x" :step="1" />
              <NumField v-model="job.placement.y" label="Centre Y" unit="mm" :min="0" :max="prep.machineInfo.workArea.y" :step="1" />
            </template>
            <NumField v-model="job.placement.rotate" label="Turn" unit="°" :min="0" :max="359.9" :step="1" />
            <NumField v-model="job.placement.scale" label="Scale" unit="%" :min="0.01" :max="10" :step="0.01" percent />
            <div class="placebtns">
              <RsButton size="sm" variant="quiet" @click="rotate(90)">Turn 90°</RsButton>
              <RsButton v-if="proc !== 'cnc'" size="sm" variant="quiet" @click="prep.centre()">Centre</RsButton>
            </div>
          </div>
          <p class="muted small">{{ prep.part.triangles.toLocaleString() }} triangles<template v-if="proc !== 'cnc'"> · drag the part or use the arrow keys (Shift = 10 mm)</template></p>
          <p v-if="prep.loadError" class="error" role="alert">{{ prep.loadError }}</p>
        </template>
      </RsPanel>

      <div class="side">
        <!-- process and material -->
        <RsPanel v-if="prep.tool" panel-id="prepare.tool" :title="processWord[prep.tool.process]" :status="prep.tool.name === machine.mountedName ? 'Mounted' : machine.online ? `${machine.mountedName ?? 'No tool'} mounted` : undefined">
          <template #actions>
            <RsButton size="sm" variant="quiet" @click="prep.changeProcess()">Change</RsButton>
          </template>
          <div class="chosen" :style="{ '--accent': `var(${prep.tool.look.accentVar})` }">
            <span class="oicon"><Icon :tool="prep.tool.look.icon" :size="32" /></span>
            <span class="otext">
              <span class="oname">{{ prep.tool.name }}</span>
              <span class="osub">Slot {{ prep.tool.slot ?? '–' }}<template v-if="prep.tool.name !== machine.mountedName && machine.online"> · swap to it before starting</template></span>
            </span>
          </div>

          <div v-if="job && !up" class="mat">
            <label for="prep-mat">Material</label>
            <select id="prep-mat" :value="job.material" @change="prep.pickMaterial(($event.target as HTMLSelectElement).value)">
              <option v-for="m in prep.materials.list" :key="m.key" :value="m.key">{{ prettyMaterial(m.name) }}{{ m.nozzle ? ` · ${m.nozzle} mm nozzle` : '' }}{{ m.path !== undefined ? ` · path ${m.path + 1}` : '' }}</option>
            </select>
            <p class="muted small">
              <template v-if="mat && proc === 'fdm'">Nozzle {{ mat.extruderTemp ?? '–' }}°, bed {{ mat.bedTemp ?? '–' }}°: START_JOB heats from this table, the file never sets a temperature.</template>
              <template v-else-if="mat && proc === 'cnc'">Spindle {{ mat.spindleSpeed ? `${mat.spindleSpeed} rpm` : 'speed' }} is set by CNC_JOB_SETUP when the job starts.</template>
              <template v-else>From the tool's materials table.</template>
              {{ prep.materials.live ? '(Read from Klipper.)' : '(Built-in copy; connect to read your own.)' }}
            </p>
          </div>
        </RsPanel>

        <!-- settings -->
        <RsPanel v-if="job && !up" panel-id="prepare.settings" title="Settings" :status="proc ? processWord[proc] : undefined">
          <!-- FDM: which engine slices -->
          <div v-if="proc === 'fdm'" class="engine">
            <fieldset class="eng-seg" aria-label="Slicing engine">
              <label><input v-model="job.engine" type="radio" name="prep-engine" value="prusa" class="visually-hidden" /><span>PrusaSlicer <small>on the Rhino</small></span></label>
              <label><input v-model="job.engine" type="radio" name="prep-engine" value="kiri" class="visually-hidden" /><span>Kiri:Moto <small>in this browser</small></span></label>
            </fieldset>
            <p v-if="job.engine === 'prusa'" class="muted small">{{ engineNote }}<template v-if="prep.slicer && !prep.slicer.engine.installed"> <RouterLink to="/settings/software">Open Software</RouterLink></template></p>
          </div>
          <template v-if="proc === 'fdm' && job.engine === 'prusa'">
            <PrusaPanel v-if="prep.schema && prep.rhinoCtx" :schema="prep.schema" :ctx="prep.rhinoCtx" @set="setPrusa" @reset-all="resetPrusa" />
            <p v-else-if="prep.schemaError" class="error">{{ prep.schemaError }}</p>
            <p v-else class="muted small">Loading PrusaSlicer’s options…</p>
          </template>
          <div v-if="proc === 'fdm' && job.engine !== 'prusa'" class="grid">
            <NumField v-model="job.fdm.layerHeight" label="Layer height" unit="mm" :min="0.04" :max="job.fdm.nozzle * 0.8" :step="0.04" />
            <NumField v-model="job.fdm.firstLayer" label="First layer" unit="mm" :min="0.08" :max="job.fdm.nozzle" :step="0.04" />
            <NumField v-model="job.fdm.walls" label="Walls" :min="1" :max="20" />
            <NumField v-model="job.fdm.infill" label="Infill" unit="%" :min="0" :max="1" :step="0.05" percent />
            <NumField v-model="job.fdm.topLayers" label="Top layers" :min="0" :max="50" />
            <NumField v-model="job.fdm.bottomLayers" label="Bottom layers" :min="0" :max="50" />
            <NumField v-model="job.fdm.speed" label="Speed" unit="mm/s" :min="5" :max="300" />
            <NumField v-model="job.fdm.firstLayerSpeed" label="First layer speed" unit="mm/s" :min="5" :max="100" />
            <NumField v-model="job.fdm.retract" label="Retract" unit="mm" :min="0" :max="8" :step="0.1" />
            <NumField v-model="job.fdm.fan" label="Part fan" unit="%" :min="0" :max="1" :step="0.05" percent hint="From layer 2" />
            <div class="field">
              <label for="prep-fill">Infill pattern</label>
              <select id="prep-fill" v-model="job.fdm.infillType">
                <option value="grid">Grid</option>
                <option value="gyroid">Gyroid</option>
                <option value="hex">Hex</option>
                <option value="triangle">Triangle</option>
                <option value="linear">Lines</option>
              </select>
            </div>
            <label class="check"><input v-model="job.fdm.supports" type="checkbox" /> Supports</label>
            <p v-if="job.toolhead === 'SwitchFly'" class="muted small wide">Filament path {{ job.fdm.path === 1 ? '2 (T1)' : '1 (T0)' }}, from the material.</p>
          </div>
          <FdmAdvanced v-if="proc === 'fdm' && job.engine !== 'prusa'" :fdm="job.fdm" />

          <div v-else-if="proc === 'laser'" class="grid">
            <NumField v-model="job.laser.power" label="Power" unit="%" :min="0.01" :max="1" :step="0.05" percent :hint="`S ${Math.round(job.laser.power * prep.machineInfo.laserSMax)} of ${prep.machineInfo.laserSMax}`" />
            <NumField v-model="job.laser.feed" label="Speed" unit="mm/min" :min="10" :max="6000" :step="10" />
            <NumField v-model="job.laser.passes" label="Passes" :min="1" :max="20" hint="The whole cut, repeated" />
            <NumField v-model="job.laser.kerf" label="Kerf" unit="mm" :min="0" :max="1" :step="0.05" hint="Beam width allowance" />
            <NumField v-if="!prep.flat" v-model="job.laser.cutHeight" label="Cut outline at" unit="mm" :min="0.01" :max="prep.part?.size.z ?? 1000" :step="0.5" hint="Height above the bed" />
          </div>
          <div v-if="proc === 'laser'" class="adv">
            <FoldGroup title="Advanced" note="smoothing, outer outline only">
              <NumField v-model="job.laser.smooth" label="Smoothing" unit="mm" :min="0" :max="2" :step="0.05" hint="Merges tiny segments; 0 = off" />
              <label class="check"><input v-model="job.laser.outerOnly" type="checkbox" /> Outer outline only (no holes)</label>
            </FoldGroup>
          </div>

          <div v-else-if="proc === 'dragknife'" class="grid">
            <NumField v-model="job.knife.feed" label="Speed" unit="mm/min" :min="50" :max="6000" :step="50" />
            <NumField v-model="job.knife.depth" label="Depth per pass" unit="mm" :min="0.05" :max="1.5" :step="0.05" />
            <NumField v-model="job.knife.passes" label="Passes" :min="1" :max="5" />
            <NumField v-model="job.knife.tip" label="Blade offset" unit="mm" :min="0" :max="3" :step="0.05" hint="Axis to blade tip" />
            <NumField v-model="job.knife.plunge" label="Plunge speed" unit="mm/min" :min="10" :max="1000" :step="10" />
            <NumField v-if="!prep.flat" v-model="job.knife.cutHeight" label="Cut outline at" unit="mm" :min="0.01" :max="prep.part?.size.z ?? 1000" :step="0.5" />
          </div>
          <div v-if="proc === 'dragknife'" class="adv">
            <FoldGroup title="Advanced" note="smoothing, outer outline only">
              <NumField v-model="job.knife.smooth" label="Smoothing" unit="mm" :min="0" :max="2" :step="0.05" hint="Merges tiny segments; 0 = off" />
              <label class="check"><input v-model="job.knife.outerOnly" type="checkbox" /> Outer outline only (no holes)</label>
            </FoldGroup>
          </div>

          <div v-else-if="proc === 'cnc'" class="grid">
            <div class="field">
              <label for="prep-tool">Tool</label>
              <select id="prep-tool" v-model="job.cnc.toolType">
                <option value="endmill">Flat end mill</option>
                <option value="ballmill">Ball end mill</option>
              </select>
            </div>
            <NumField v-model="job.cnc.toolDiameter" label="Diameter" unit="mm" :min="0.5" :max="12.7" :step="0.025" />
            <NumField v-model="job.cnc.fluteLength" label="Cutting length" unit="mm" :min="1" :max="60" :step="0.5" hint="Nothing cuts deeper" />
            <NumField v-model="job.cnc.feed" label="Feed" unit="mm/min" :min="10" :max="5000" :step="10" />
            <NumField v-model="job.cnc.plunge" label="Plunge" unit="mm/min" :min="10" :max="1000" :step="10" />
            <NumField v-model="job.cnc.clearance" label="Clearance" unit="mm" :min="1" :max="30" hint="Above the stock between cuts" />
            <CncOps :cnc="job.cnc" />
            <NumField v-model="job.cnc.margin" label="Stock margin" unit="mm" :min="0" :max="100" hint="Each side of the part" />
            <NumField v-model="job.cnc.extraTop" label="Stock above the part" unit="mm" :min="0" :max="50" :step="0.5" hint="0 = stock as thick as the part" />
            <p class="muted small wide">One tool per job: the Rhino has no tool changer. Clamp the stock, then CNC_JOB_SETUP sets X0 Y0 on its front-left corner and Z0 on its top.</p>
          </div>
        </RsPanel>

        <!-- the job file -->
        <RsPanel v-if="job" panel-id="prepare.file" title="Job file" :status="prep.result ? prep.result.file.name : undefined">
          <div v-if="!up" class="go">
            <RsButton variant="primary" :disabled="!prep.part || !!prep.phase || !!suits || (proc === 'cnc' && !job.cnc.ops.some((o) => o.on))" @click="prep.prepare()">{{ prep.phase ? 'Preparing…' : prep.result ? 'Prepare again' : 'Prepare' }}</RsButton>
            <span v-if="prep.phase" class="phase" role="status">
              {{ prep.phase }}<template v-if="prep.progress != null"> {{ Math.round(prep.progress * 100) }}%</template>
              <span class="bar" :class="{ indet: prep.progress == null }"><span :style="{ width: `${(prep.progress ?? 0.3) * 100}%` }" /></span>
            </span>
            <span v-else-if="!prep.part" class="muted small">Open a model first.</span>
          </div>
          <p v-if="prep.prepError" class="error" role="alert">Couldn't prepare: {{ prep.prepError }}</p>

          <template v-if="prep.result">
            <dl class="sum">
              <div v-for="s in summary" :key="s.label" class="cell">
                <dt>{{ s.label }}</dt>
                <dd>{{ s.value }}</dd>
                <dd v-if="s.note" class="note">{{ s.note }}</dd>
              </div>
            </dl>

            <ul class="checks" aria-label="Checks">
              <li v-for="c in prep.result.checks" :key="c.id" :class="`lvl-${c.level}`">
                <span class="mark" aria-hidden="true">{{ c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕' }}</span>
                <span class="ctext">
                  <span class="visually-hidden">{{ c.level === 'ok' ? 'Pass:' : c.level === 'warn' ? 'Note:' : 'Problem:' }}</span>
                  {{ c.label }}
                  <span v-if="c.detail" class="cdetail">{{ c.detail }}</span>
                </span>
              </li>
            </ul>

            <p v-if="prep.blocked.length" class="error" role="alert">{{ prep.blocked.length === 1 ? 'One problem stops' : `${prep.blocked.length} problems stop` }} this file going to the Rhino. Change the settings or the placement, then Prepare again.</p>

            <div class="send">
              <RsButton variant="primary" :disabled="!!prep.blocked.length || !machine.online || prep.sending != null" @click="prep.send()">
                {{ prep.sending != null ? `Sending ${Math.round(prep.sending * 100)}%` : 'Send to Rhino' }}
              </RsButton>
              <RsButton v-if="!up" :disabled="!!prep.blocked.length" @click="prep.download()">Download</RsButton>
              <span v-if="!machine.online" class="muted small">Connect to send.<template v-if="!up"> Download works offline.</template></span>
            </div>
            <p v-if="prep.sendError" class="error" role="alert">{{ prep.sendError }}</p>
            <p v-if="prep.sentPath" class="sent" role="status">
              Sent as <strong>{{ prep.sentPath }}</strong>. Nothing has started.
              <RsButton size="sm" @click="openInFiles">Start it from Files</RsButton>
            </p>
            <p class="muted small">{{ prep.result.stats.moves.toLocaleString() }} moves. Files checks the mounted toolhead again before anything runs<template v-if="proc !== 'fdm'">, and starts this through the {{ proc === 'laser' ? 'laser' : proc === 'cnc' ? 'CNC' : 'knife' }} setup wizard</template>.</p>
          </template>
        </RsPanel>
      </div>
    </div>
  </div>
</template>

<style scoped>
.engine { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--rs-space-3); }
.eng-seg { display: flex; margin: 0; padding: 0; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; }
.eng-seg label { flex: 1; }
.eng-seg label + label span { border-left: 1px solid var(--rs-line-strong); }
.eng-seg span { display: flex; flex-direction: column; justify-content: center; height: 44px; padding: 0 12px; cursor: pointer; font-weight: var(--rs-weight-medium); font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.eng-seg small { font-size: 11px; font-weight: 400; }
.eng-seg input:checked + span { background: var(--rs-ink); color: var(--rs-on-ink); }
.eng-seg input:focus-visible + span { box-shadow: var(--rs-focus); }
.layout { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr); gap: var(--rs-gap); align-items: start; }
.side { display: flex; flex-direction: column; gap: var(--rs-gap); min-width: 0; }
@media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }

.drop.dragging { outline: 2px dashed var(--rs-ink); outline-offset: -6px; }

/* 1. File */
.dropzone { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--rs-space-2); min-height: 260px; padding: var(--rs-space-6); border: 1.5px dashed var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text-muted); font: inherit; cursor: pointer; text-align: center; }
.dropzone:hover, .dropzone.dragging { border-color: var(--rs-ink); color: var(--rs-text-strong); background: var(--rs-surface-2); }
.dropzone .big { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.section { margin: var(--rs-space-6) 0 var(--rs-space-3); font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: var(--rs-gap); }

/* 2. Process */
.procgrid { display: grid; grid-template-columns: minmax(200px, 300px) minmax(0, 1fr); gap: var(--rs-space-6); align-items: start; }
@media (max-width: 720px) { .procgrid { grid-template-columns: minmax(0, 1fr); } }
.detect { margin: 0; display: flex; flex-direction: column; gap: var(--rs-space-3); }
.fp { width: 100%; max-height: 220px; background: var(--rs-dither-faint); border-radius: var(--rs-radius-md); }
.fp .tp { fill: none; stroke: var(--rs-text-strong); stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.8; }
.fp path { fill: var(--rs-surface); stroke: var(--rs-text-strong); stroke-width: 1.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.detect figcaption { display: flex; flex-direction: column; gap: 2px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.options { display: flex; flex-direction: column; gap: 6px; }
.option, .chosen { position: relative; display: flex; align-items: center; gap: var(--rs-space-3); padding: 10px 14px 10px 18px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: transparent; color: var(--rs-text-strong); font: inherit; text-align: left; }
.option { cursor: pointer; }
.option::before, .chosen::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 4px; border-radius: 0 2px 2px 0; background: var(--accent); }
.option:hover { border-color: var(--rs-line-strong); }
.option[aria-checked='true'] { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.option[aria-checked='true'] .osub { color: inherit; opacity: 0.8; }
.chosen { border: 0; padding-left: 18px; }
.oicon { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: var(--rs-radius-md); background: var(--rs-dither-faint); color: var(--rs-text-strong); }
.option[aria-checked='true'] .oicon { background: transparent; color: inherit; }
.otext { display: flex; flex-direction: column; min-width: 0; }
.oname { font-weight: var(--rs-weight-medium); font-size: var(--rs-text-sm); }
.osub { font-size: 11px; color: var(--rs-text-muted); }
.ogo { margin-top: var(--rs-space-3); }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--rs-space-2); min-height: 340px; border: 1px dashed var(--rs-line-strong); border-radius: var(--rs-radius-md); cursor: pointer; text-align: center; padding: var(--rs-space-5); color: var(--rs-text-muted); }
.empty .big { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.small { font-size: var(--rs-text-xs); }
.error { color: var(--rs-danger); font-size: var(--rs-text-sm); margin-top: var(--rs-space-3); }
.notice { color: var(--rs-text-strong); border: 1px solid var(--rs-line-strong); background: var(--rs-surface-2); padding: 8px 12px; border-radius: var(--rs-radius-md); margin-top: var(--rs-space-3); }

.place { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: var(--rs-space-3); align-items: end; margin: var(--rs-space-4) 0 var(--rs-space-2); }
.placebtns { display: flex; gap: 4px; }
@media (max-width: 720px) { .place { grid-template-columns: repeat(2, minmax(0, 1fr)); } .placebtns { grid-column: 1 / -1; } }

.tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.tool { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px 10px 16px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: transparent; color: var(--rs-text-strong); text-align: left; cursor: pointer; }
.tool::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 4px; border-radius: 0 2px 2px 0; background: var(--accent); }
.tool[aria-checked='true'] { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.tool[aria-checked='true'] .tsub { color: inherit; opacity: 0.8; }
.tname { font-weight: var(--rs-weight-medium); font-size: var(--rs-text-sm); }
.tsub { font-size: 11px; color: var(--rs-text-muted); }

.mat { margin-top: var(--rs-space-4); display: flex; flex-direction: column; gap: 4px; }
.mat label, .field label { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
select { height: 38px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.mat p { margin-top: 4px; }

.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--rs-space-3) var(--rs-space-4); }
.field { display: flex; flex-direction: column; gap: 4px; }
.wide { grid-column: 1 / -1; }
.adv { margin-top: var(--rs-space-4); }
.check { display: flex; align-items: center; gap: 8px; font-size: var(--rs-text-sm); align-self: end; min-height: 38px; }
.check input { width: 16px; height: 16px; accent-color: var(--rs-text-strong); }

.go { display: flex; align-items: center; gap: var(--rs-space-4); flex-wrap: wrap; }
.phase { display: flex; flex-direction: column; gap: 4px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); flex: 1; min-width: 160px; }
.bar { display: block; height: 6px; border-radius: 3px; background: var(--rs-dither-faint); overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--rs-ink); transition: width 0.2s; }
.bar.indet > span { animation: slide 1.2s ease-in-out infinite; }
@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(330%); } }
@media (prefers-reduced-motion: reduce) { .bar.indet > span { animation: none; } }

.sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: var(--rs-space-3); margin: var(--rs-space-5) 0 var(--rs-space-4); }
.cell dt { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); line-height: 18px; }
.cell dd { margin: 0; font-family: var(--rs-font-code); font-size: var(--rs-text-md); color: var(--rs-text-strong); }
.cell dd.note { font-family: var(--rs-font-ui); font-size: 11px; color: var(--rs-text-muted); }

.checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.checks li { display: flex; gap: 10px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.mark { flex: none; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: var(--rs-weight-bold); border: 1px solid var(--rs-line-strong); }
.checks li.lvl-ok .mark { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.checks li.lvl-warn .mark { background: transparent; border-width: 2px; border-color: var(--rs-text-strong); }
.checks li.lvl-error .mark { background: var(--rs-danger); color: var(--rs-on-danger); border-color: var(--rs-danger); }
.ctext { display: flex; flex-direction: column; }
.cdetail { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.checks li.lvl-error .cdetail { color: var(--rs-danger); }

.send { display: flex; align-items: center; gap: var(--rs-space-3); flex-wrap: wrap; margin-top: var(--rs-space-5); }
.sent { display: flex; align-items: center; gap: var(--rs-space-3); flex-wrap: wrap; margin-top: var(--rs-space-3); font-size: var(--rs-text-sm); }
.send + .muted, .sent + .muted { margin-top: var(--rs-space-3); }
</style>
