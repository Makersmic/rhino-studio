<script setup lang="ts">
/**
 * Prepare a job: model in, Rhino job file out.
 * The slicing is Kiri:Moto's engine running in this browser (src/slicer/), so
 * the Pi only ever receives the finished file. See src/stores/prepare.ts.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import Icon from '@/icons/Icon.vue'
import BedView from '@/prepare/BedView.vue'
import NumField from '@/prepare/NumField.vue'
import { usePrepareStore } from '@/stores/prepare'
import { useMachineStore } from '@/stores/machine'
import { MODEL_TYPES } from '@/slicer/model'

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
const accepts = MODEL_TYPES.map((t) => `.${t}`).join(',')
const suits = computed(() => {
  if (!prep.part) return null
  if ((proc.value === 'fdm' || proc.value === 'cnc') && prep.flat) return 'This is a flat drawing (extruded 5 mm by the loader). For printing or milling, load a 3D model (STL, 3MF, OBJ).'
  return null
})

const processWord = { fdm: 'Print', laser: 'Laser cut', dragknife: 'Knife cut', cnc: 'Mill' } as const

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
  const rows: Array<{ label: string; value: string; note?: string }> = [{ label: 'Time', value: fmtTime(time), note: r.kiriSeconds ? 'Kiri:Moto estimate' : 'from feeds, no acceleration' }]
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
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Prepare a job</h1>
      <p>Bring in a model or drawing, pick the toolhead, and turn it into a Rhino job file. Slicing runs in this browser with the Kiri:Moto engine, so the Pi stays free for Klipper.</p>
    </div>

    <div class="layout">
      <!-- ============ the bed -->
      <RsPanel
        panel-id="prepare.bed"
        :title="prep.part ? prep.part.name : 'Model'"
        :status="prep.part ? `${fmt(prep.part.size.x)} × ${fmt(prep.part.size.y)} × ${fmt(prep.part.size.z)} mm` : undefined"
        class="bedpanel drop"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <template #actions>
          <input ref="picker" type="file" :accept="accepts" class="visually-hidden" aria-label="Choose a model file" @change="pick(($event.target as HTMLInputElement).files)" />
          <RsButton size="sm" :disabled="prep.loading" @click="picker?.click()">{{ prep.part ? 'Replace' : 'Open' }}</RsButton>
          <RsButton v-if="prep.part" size="sm" variant="quiet" @click="prep.clearPart()">Clear</RsButton>
        </template>

        <div v-if="!prep.part" class="empty" @click="picker?.click()">
          <Icon nav="prepare" :size="56" />
          <p class="big">{{ prep.loading ? 'Reading the file…' : 'Drop a model here, or click to choose one' }}</p>
          <p class="muted small">STL, 3MF or OBJ to print or mill · SVG or DXF to laser or knife cut</p>
          <p v-if="prep.loadError" class="error" role="alert">{{ prep.loadError }}</p>
        </div>

        <template v-else-if="job">
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
        </template>
      </RsPanel>

      <div class="side">
        <!-- ============ toolhead and material -->
        <RsPanel panel-id="prepare.tool" title="Toolhead" :status="machine.mountedName ? `${machine.mountedName} mounted` : machine.online ? 'No tool confirmed' : 'Offline'">
          <div class="tools" role="radiogroup" aria-label="Toolhead">
            <button
              v-for="t in prep.tools"
              :key="t.name"
              type="button"
              role="radio"
              class="tool"
              :aria-checked="job?.toolhead === t.name"
              :style="{ '--accent': `var(${t.look.accentVar})` }"
              @click="prep.pickTool(t.name)"
            >
              <span class="tname">{{ t.name }}</span>
              <span class="tsub">{{ processWord[t.process] }}<template v-if="t.name === machine.mountedName"> · mounted</template></span>
            </button>
          </div>

          <div v-if="job" class="mat">
            <label for="prep-mat">Material</label>
            <select id="prep-mat" :value="job.material" @change="prep.pickMaterial(($event.target as HTMLSelectElement).value)">
              <option v-for="m in prep.materials.list" :key="m.key" :value="m.key">{{ m.key }}</option>
            </select>
            <p class="muted small">
              <template v-if="mat && proc === 'fdm'">Nozzle {{ mat.extruderTemp ?? '–' }}°, bed {{ mat.bedTemp ?? '–' }}°: START_JOB heats from this table, the file never sets a temperature.</template>
              <template v-else-if="mat && proc === 'cnc'">Spindle {{ mat.spindleSpeed ? `${mat.spindleSpeed} rpm` : 'speed' }} is set by CNC_JOB_SETUP when the job starts.</template>
              <template v-else>From the tool's materials table.</template>
              {{ prep.materials.live ? '(Read from Klipper.)' : '(Built-in copy; connect to read your own.)' }}
            </p>
          </div>
        </RsPanel>

        <!-- ============ settings -->
        <RsPanel v-if="job" panel-id="prepare.settings" title="Settings" :status="proc ? processWord[proc] : undefined">
          <div v-if="proc === 'fdm'" class="grid">
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
            <NumField v-model="job.fdm.brim" label="Brim" unit="loops" :min="0" :max="30" />
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

          <div v-else-if="proc === 'laser'" class="grid">
            <NumField v-model="job.laser.power" label="Power" unit="%" :min="0.01" :max="1" :step="0.05" percent :hint="`S ${Math.round(job.laser.power * prep.machineInfo.laserSMax)} of ${prep.machineInfo.laserSMax}`" />
            <NumField v-model="job.laser.feed" label="Speed" unit="mm/min" :min="10" :max="6000" :step="10" />
            <NumField v-model="job.laser.passes" label="Passes" :min="1" :max="20" hint="The whole cut, repeated" />
            <NumField v-model="job.laser.kerf" label="Kerf" unit="mm" :min="0" :max="1" :step="0.05" hint="Beam width allowance" />
            <NumField v-if="!prep.flat" v-model="job.laser.cutHeight" label="Cut outline at" unit="mm" :min="0.01" :max="prep.part?.size.z ?? 1000" :step="0.5" hint="Height above the bed" />
          </div>

          <div v-else-if="proc === 'dragknife'" class="grid">
            <NumField v-model="job.knife.feed" label="Speed" unit="mm/min" :min="50" :max="6000" :step="50" />
            <NumField v-model="job.knife.depth" label="Depth per pass" unit="mm" :min="0.05" :max="1.5" :step="0.05" />
            <NumField v-model="job.knife.passes" label="Passes" :min="1" :max="5" />
            <NumField v-model="job.knife.tip" label="Blade offset" unit="mm" :min="0" :max="3" :step="0.05" hint="Axis to blade tip" />
            <NumField v-model="job.knife.plunge" label="Plunge speed" unit="mm/min" :min="10" :max="1000" :step="10" />
            <NumField v-if="!prep.flat" v-model="job.knife.cutHeight" label="Cut outline at" unit="mm" :min="0.01" :max="prep.part?.size.z ?? 1000" :step="0.5" />
          </div>

          <div v-else-if="proc === 'cnc'" class="grid">
            <div class="field wide">
              <label for="prep-op">Operation</label>
              <select id="prep-op" v-model="job.cnc.operation">
                <option value="cutout">Cut out (outline, outside the part)</option>
                <option value="clear-and-cutout">Clear pockets and around, then cut out</option>
              </select>
            </div>
            <NumField v-model="job.cnc.toolDiameter" label="End mill" unit="mm" :min="0.5" :max="12.7" :step="0.025" />
            <NumField v-model="job.cnc.stepDown" label="Step down" unit="mm" :min="0.1" :max="10" :step="0.1" />
            <NumField v-if="job.cnc.operation !== 'cutout'" v-model="job.cnc.stepOver" label="Step over" unit="%" :min="0.05" :max="0.9" :step="0.05" percent />
            <NumField v-model="job.cnc.feed" label="Feed" unit="mm/min" :min="10" :max="5000" :step="10" />
            <NumField v-model="job.cnc.plunge" label="Plunge" unit="mm/min" :min="10" :max="1000" :step="10" />
            <NumField v-model="job.cnc.margin" label="Stock margin" unit="mm" :min="0" :max="100" hint="Each side of the part" />
            <NumField v-model="job.cnc.clearance" label="Clearance" unit="mm" :min="1" :max="30" hint="Above the stock between cuts" />
            <p class="muted small wide">Stock is as thick as the model. Clamp it, then CNC_JOB_SETUP sets X0 Y0 on its front-left corner and Z0 on its top.</p>
          </div>
        </RsPanel>

        <!-- ============ the job file -->
        <RsPanel v-if="job" panel-id="prepare.file" title="Job file" :status="prep.result ? prep.result.file.name : undefined">
          <div class="go">
            <RsButton variant="primary" :disabled="!prep.part || !!prep.phase || !!suits" @click="prep.prepare()">{{ prep.phase ? 'Preparing…' : prep.result ? 'Prepare again' : 'Prepare' }}</RsButton>
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
              <RsButton :disabled="!!prep.blocked.length" @click="prep.download()">Download</RsButton>
              <span v-if="!machine.online" class="muted small">Connect to send. Download works offline.</span>
            </div>
            <p v-if="prep.sendError" class="error" role="alert">{{ prep.sendError }}</p>
            <p v-if="prep.sentPath" class="sent" role="status">
              Sent as <strong>{{ prep.sentPath }}</strong>. Nothing has started.
              <RsButton size="sm" @click="openInFiles">Start it from Files</RsButton>
            </p>
            <p class="muted small">Kiri:Moto {{ prep.result.kiri }} · {{ prep.result.stats.moves.toLocaleString() }} moves. Files checks the mounted toolhead again before anything runs<template v-if="proc !== 'fdm'">, and starts this through the {{ proc === 'laser' ? 'laser' : proc === 'cnc' ? 'CNC' : 'knife' }} setup wizard</template>.</p>
          </template>
        </RsPanel>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr); gap: var(--rs-gap); align-items: start; }
.side { display: flex; flex-direction: column; gap: var(--rs-gap); min-width: 0; }
@media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }

.drop.dragging { outline: 2px dashed var(--rs-ink); outline-offset: -6px; }
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
.check { display: flex; align-items: center; gap: 8px; font-size: var(--rs-text-sm); align-self: end; min-height: 38px; }

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
