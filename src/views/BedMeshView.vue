<script setup lang="ts">
/**
 * Bed mesh: Mainsail's Heightmap, rebuilt around what people complain about
 * on the Klipper, Mainsail and Fluidd forums (see src/bedmesh/mesh.ts):
 *
 * - a top-down map, front at the bottom, instead of a 3D view you have to turn
 * - the range in mm and as a share of a first layer, on a colour scale that
 *   doesn't stretch a flat bed into a mountain
 * - tilt (level the gantry) told apart from warp (what the mesh carries)
 * - when, at what bed temperature and with which head each mesh was made
 * - "no mesh in use" and "not saved yet" said plainly
 * - making a mesh homes, heats and soaks first, and nothing changes during a job
 * - compare two meshes (cold against hot shows the heat warp on its own)
 *
 * Viewing a mesh here never changes the machine: "Use" loads it.
 */
import { computed, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import Readout from '@/components/Readout.vue'
import StatusChip from '@/components/StatusChip.vue'
import EmptyState from '@/components/EmptyState.vue'
import Icon from '@/icons/Icon.vue'
import MeshMap from '@/bedmesh/MeshMap.vue'
import { useMachineStore } from '@/stores/machine'
import { useBedMeshStore } from '@/stores/bedmesh'
import { age, difference, fmtMm, planeFit, profileNameProblem, readMesh, scaleFor, stats, tempLabel, tempMismatch, type MeshParams, type Profile } from '@/bedmesh/mesh'

const machine = useMachineStore()
const mesh = useBedMeshStore()
const FIRST_LAYER = 0.2

// ---- which mesh the map shows (viewing never loads anything) --------------------------
const viewName = ref<string | null>(null)
const profiles = computed(() => mesh.state.profiles)
watch(
  () => [mesh.state.loaded, profiles.value.map((p) => p.name).join()] as const,
  () => {
    if (viewName.value && (viewName.value === '__current' || profiles.value.some((p) => p.name === viewName.value))) return
    viewName.value = mesh.state.loaded ? (profiles.value.some((p) => p.name === mesh.state.loaded) ? mesh.state.loaded : '__current') : profiles.value[0]?.name ?? null
  },
  { immediate: true },
)
const viewed = computed<{ name: string; points: number[][]; params: MeshParams; profile: Profile | null } | null>(() => {
  if (viewName.value === '__current' && mesh.state.current) return { name: mesh.state.loaded, ...mesh.state.current, profile: null }
  const p = profiles.value.find((x) => x.name === viewName.value)
  return p ? { name: p.name, points: p.points, params: p.params, profile: p } : null
})

type Mode = 'shape' | 'warp' | 'compare'
const mode = ref<Mode>('shape')
const compareWith = ref<string>('')
const showValues = ref(true)
const compareOptions = computed(() => profiles.value.filter((p) => p.name !== viewed.value?.name))
const compareProfile = computed(() => profiles.value.find((p) => p.name === compareWith.value) ?? null)
watch(compareOptions, (o) => {
  if (!o.some((p) => p.name === compareWith.value)) compareWith.value = o[0]?.name ?? ''
}, { immediate: true })

const fit = computed(() => (viewed.value ? planeFit(viewed.value.points, viewed.value.params) : null))
const shown = computed<{ points: number[][]; note: string } | { error: string } | null>(() => {
  const v = viewed.value
  if (!v) return null
  if (mode.value === 'warp') return { points: fit.value!.residual, note: `${v.name} with its tilt taken out: the warp the mesh has to carry.` }
  if (mode.value === 'compare') {
    const c = compareProfile.value
    if (!c) return { error: 'Make or keep a second mesh to compare with.' }
    const d = difference(c, v)
    if (!d) return { error: `${c.name} was probed on different points, so they can't be compared point by point. Make both with the same mesh area.` }
    return { points: d, note: `${v.name} minus ${c.name}: how the bed moved between them${c.meta && v.profile?.meta ? ` (${tempLabel(c.meta.bed)} → ${tempLabel(v.profile.meta.bed)})` : ''}.` }
  }
  return { points: v.points, note: '' }
})
const shownStats = computed(() => (viewed.value && shown.value && 'points' in shown.value ? stats(shown.value.points, viewed.value.params) : null))
const half = computed(() => (shownStats.value ? scaleFor(shownStats.value.maxDev) : 0.25))
const legendTicks = computed(() => [-half.value, 0, half.value])
const tick = (t: number) => (t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}`)

const viewedStats = computed(() => (viewed.value ? stats(viewed.value.points, viewed.value.params) : null))
const reading = computed(() => (viewedStats.value && fit.value ? readMesh(viewedStats.value, fit.value, FIRST_LAYER) : null))
const n2 = (v: number) => v.toFixed(2)

const bedW = computed(() => (machine.limits.max?.[0] ?? 0) || 576)
const bedH = computed(() => (machine.limits.max?.[1] ?? 0) || 406)

// ---- descriptions ----------------------------------------------------------------
function madeLine(p: Profile | null): string {
  if (!p) return 'An adaptive mesh made for the running print.'
  const bits: string[] = []
  if (p.meta) bits.push(`${tempLabel(p.meta.bed, mesh.rhino.coldC)}${p.meta.tool ? ` · ${p.meta.tool}` : ''}`)
  else if (!p.adaptive) bits.push('bed temperature not recorded')
  const m = mesh.madeAt(p)
  if (m) bits.push(m.exact ? age(m.when) : `first seen ${age(m.when)}`)
  return bits.join(' · ')
}
const loadedMismatch = computed(() => {
  const t = machine.bed.target
  return mesh.loadedProfile && t != null ? tempMismatch(mesh.loadedProfile.meta, t, mesh.rhino.matchC, mesh.rhino.coldC) : null
})
const printLine = computed(() => {
  if (!mesh.state.rhino) return null
  const bed = mesh.suggestedBed
  const r = mesh.forPrint(bed)
  if (r.use) return `A print at ${tempLabel(bed, mesh.rhino.coldC)} loads ${r.use.name}.`
  return `No mesh for ${tempLabel(bed, mesh.rhino.coldC)}: a print at that temperature asks first (probe one, ${r.closest ? `use ${r.closest.name}, ` : ''}print without, or cancel).`
})
const rangeOf = (p: Profile) => stats(p.points, p.params).range

// ---- actions ------------------------------------------------------------------------
const msg = ref<{ text: string; bad: boolean } | null>(null)
async function act(fn: () => Promise<boolean>, done: string) {
  msg.value = null
  try {
    if (await fn()) msg.value = { text: done, bad: false }
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  }
}
const use = (p: Profile) => act(() => mesh.load(p.name), `Bed mesh ${p.name} is in use.`)
const remove = (p: Profile) => act(() => mesh.remove(p.name), `Bed mesh ${p.name} removed. Save to take it out of printer.cfg.`)
const switchOff = () => act(() => mesh.clear(), 'Bed mesh switched off.')
const save = () => act(() => mesh.save(), 'Saved. Klipper is restarting: confirm the mounted toolhead when it asks.')

// ---- make a mesh ---------------------------------------------------------------------
const bed = ref(mesh.suggestedBed)
const soak = ref(mesh.rhino.soakMin)
const level = ref(true)
const name = ref(mesh.defaultName(bed.value))
const nameTouched = ref(false)
watch(bed, (b) => {
  if (!nameTouched.value) name.value = mesh.defaultName(Number(b) || 0)
})
watch(() => mesh.suggestedBed, (b) => {
  if (!nameTouched.value) bed.value = b
})
const nameProblem = computed(() => profileNameProblem(name.value.trim()))
const bedProblem = computed(() => (!(Number(bed.value) >= 0 && Number(bed.value) <= 130) ? 'Bed 0 (cold) to 130°C' : null))
const replaces = computed(() => profiles.value.some((p) => p.name === name.value.trim()))
function make() {
  return act(
    () => mesh.calibrate({ name: name.value.trim(), bed: Number(bed.value), soakMin: Number(soak.value) || 0, levelFirst: level.value }),
    `Making ${name.value.trim()}: follow it on the console. It is in use when it finishes; save it to keep it.`,
  )
}
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Bed mesh</h1>
      <p>
        How flat the bed is, and the meshes Klipper uses to follow it. Seen from above, as you stand at the front.
        Looking at a mesh here changes nothing on the machine; <strong>Use</strong> does.
      </p>
    </div>

    <p v-if="!machine.klippyReady" class="note">Klipper is not ready, so the bed mesh can't be read.</p>

    <EmptyState v-else-if="!mesh.configured" title="Bed mesh is not set up">
      <template #art><Icon nav="mesh" :size="64" /></template>
      Klipper has no <code>[bed_mesh]</code> section, so nothing follows the bed's shape. Rhino Tool Manager 1.6.0 adds one
      (probe area X40 Y40 to X500 Y300, 5 × 3 points): install it in Settings › Software, then come back here to make the first mesh.
    </EmptyState>

    <template v-else>
      <!-- in use, and not saved -->
      <section class="strip" :class="{ none: !mesh.state.loaded }" aria-live="polite">
        <div class="strip-text">
          <template v-if="mesh.state.loaded">
            <strong>Bed mesh {{ mesh.state.loaded }} is in use.</strong>
            <span class="muted">{{ madeLine(mesh.loadedProfile) }}</span>
            <span v-if="loadedMismatch" class="warn">{{ loadedMismatch }}</span>
          </template>
          <template v-else>
            <strong>No bed mesh in use: moves don't follow the bed.</strong>
            <span class="muted">{{ mesh.state.rhino ? 'A print loads the mesh made at its bed temperature when it starts.' : 'Load one below, or add BED_MESH_PROFILE LOAD to your start G-code.' }}</span>
          </template>
        </div>
        <RsButton v-if="mesh.state.loaded" variant="quiet" size="sm" :disabled="!!mesh.changeBlock" :title="mesh.changeBlock ?? ''" @click="switchOff">Switch off</RsButton>
      </section>

      <section v-if="mesh.state.savePending" class="strip unsaved">
        <div class="strip-text">
          <strong>Not saved yet<template v-if="mesh.unsavedMeshes.length">: {{ mesh.unsavedMeshes.join(', ') }}</template>.</strong>
          <span class="muted">Klipper keeps new and removed meshes only until it restarts. Saving writes printer.cfg and restarts Klipper.</span>
          <span v-if="mesh.otherUnsaved.length" class="warn">Saving also writes {{ mesh.otherUnsaved.join(', ') }}, which is not a bed mesh.</span>
        </div>
        <RsButton variant="primary" size="sm" :disabled="!!mesh.changeBlock" :title="mesh.changeBlock ?? ''" @click="save">Save to printer.cfg</RsButton>
      </section>

      <p v-if="mesh.jobActive" class="note">A job is running. The page only shows meshes until it ends: a print loads its own mesh at the start.</p>
      <p v-if="msg" class="note" :class="{ bad: msg.bad }" role="status">{{ msg.text }}</p>

      <div class="mesh-wrap">
        <div class="mesh-grid">
          <div class="col main">
          <!-- the map -->
          <RsPanel class="map-panel" title="Map" :status="viewed ? `${viewed.name}${viewed.name === mesh.state.loaded ? ' · in use' : ''}` : undefined" panel-id="mesh.map">
            <template v-if="viewed">
              <div class="tools">
                <div class="seg" role="radiogroup" aria-label="What the map shows">
                  <button role="radio" :aria-checked="mode === 'shape'" :class="{ on: mode === 'shape' }" @click="mode = 'shape'">Shape</button>
                  <button role="radio" :aria-checked="mode === 'warp'" :class="{ on: mode === 'warp' }" @click="mode = 'warp'">Without tilt</button>
                  <button role="radio" :aria-checked="mode === 'compare'" :class="{ on: mode === 'compare' }" :disabled="!compareOptions.length" @click="mode = 'compare'">Compare</button>
                </div>
                <label v-if="mode === 'compare' && compareOptions.length" class="cmp">
                  <span class="muted small">minus</span>
                  <select v-model="compareWith">
                    <option v-for="p in compareOptions" :key="p.name" :value="p.name">{{ p.name }}{{ p.meta ? ` (${tempLabel(p.meta.bed)})` : '' }}</option>
                  </select>
                </label>
                <label class="tick"><input v-model="showValues" type="checkbox" /> Numbers</label>
              </div>
              <p v-if="shown && 'error' in shown" class="note">{{ shown.error }}</p>
              <template v-else-if="shown && shownStats">
                <p v-if="shown.note" class="muted small mode-note">{{ shown.note }}</p>
                <MeshMap
                  :points="shown.points"
                  :params="viewed.params"
                  :bed-w="bedW"
                  :bed-h="bedH"
                  :mean="shownStats.mean"
                  :half="half"
                  :values="showValues"
                  :label="`Bed mesh ${viewed.name}, seen from above, front at the bottom. Range ${fmtMm(shownStats.range)}.`"
                />
                <div class="legend" aria-hidden="true">
                  <div class="bar" />
                  <div class="ticks"><span v-for="t in legendTicks" :key="t">{{ tick(t) }}</span></div>
                </div>
                <p class="muted small scale-note">
                  Blue is lower than the average, amber higher. The scale stays at ±0.25 mm unless a mesh needs more ({{ half === 0.25 ? 'this one fits' : `this one needs ±${half} mm` }}), so a flat bed looks flat.
                  Numbers are the probed heights in mm, as Klipper measured them; shading between them is a straight-line blend.
                </p>
              </template>
            </template>
            <p v-else class="muted">No meshes yet. Make one below.</p>
          </RsPanel>

          </div>
          <div class="col side">
          <!-- what it means -->
          <RsPanel v-if="viewed && viewedStats && fit && reading" class="reading-panel" title="Reading" :status="reading.headline" panel-id="mesh.reading">
            <div class="readouts">
              <Readout label="Range" :value="n2(viewedStats.range)" unit="mm" :detail="`${reading.layers.toFixed(1)} of a ${FIRST_LAYER} mm first layer`" />
              <Readout label="Tilt" :value="n2(fit.tiltRange)" unit="mm" :detail="`${Math.abs(fit.slopeX).toFixed(2)} per 100 mm ${fit.slopeX >= 0 ? 'up' : 'down'} to the right\n${Math.abs(fit.slopeY).toFixed(2)} per 100 mm ${fit.slopeY >= 0 ? 'up' : 'down'} to the back`" />
              <Readout label="Warp" :value="n2(fit.warpRange)" unit="mm" detail="left with the tilt taken out" />
            </div>
            <p class="advice">{{ reading.advice }}</p>
            <dl class="facts">
              <dt>Highest</dt><dd><code>{{ n2(viewedStats.max.value) }}</code> at X{{ Math.round(viewedStats.max.x) }} Y{{ Math.round(viewedStats.max.y) }}</dd>
              <dt>Lowest</dt><dd><code>{{ n2(viewedStats.min.value) }}</code> at X{{ Math.round(viewedStats.min.x) }} Y{{ Math.round(viewedStats.min.y) }}</dd>
              <dt>Points</dt><dd>{{ viewed.params.xCount }} × {{ viewed.params.yCount }}, X{{ Math.round(viewed.params.minX) }}–{{ Math.round(viewed.params.maxX) }} Y{{ Math.round(viewed.params.minY) }}–{{ Math.round(viewed.params.maxY) }}</dd>
              <dt>Made</dt><dd>{{ madeLine(viewed.profile) || '—' }}</dd>
            </dl>
          </RsPanel>

          <!-- saved meshes -->
          <RsPanel class="list-panel" title="Meshes" :status="`${profiles.length}`" panel-id="mesh.list">
            <ul v-if="profiles.length" class="list">
              <li v-for="p in profiles" :key="p.name" :class="{ viewing: viewName === p.name }">
                <button class="pick" :aria-pressed="viewName === p.name" @click="viewName = p.name">
                  <span class="name">{{ p.adaptive ? 'Adaptive (one print)' : p.name }}</span>
                  <span class="muted small">{{ madeLine(p) }} · range {{ fmtMm(rangeOf(p)) }}</span>
                  <span class="chips">
                    <StatusChip v-if="p.name === mesh.state.loaded" tone="ok">In use</StatusChip>
                    <StatusChip v-if="mesh.unsavedMeshes.includes(p.name)" tone="warn">Not saved</StatusChip>
                  </span>
                </button>
                <span class="acts">
                  <RsButton v-if="p.name !== mesh.state.loaded && !p.adaptive" size="sm" :disabled="!!mesh.changeBlock" :title="mesh.changeBlock ?? ''" @click="use(p)">Use</RsButton>
                  <RsButton v-if="!p.adaptive" size="sm" variant="danger-outline" :disabled="!!mesh.changeBlock" :title="mesh.changeBlock ?? ''" @click="remove(p)">Remove</RsButton>
                </span>
              </li>
            </ul>
            <p v-else class="muted">None saved. Make one below.</p>
            <p v-if="printLine" class="muted small print-line">{{ printLine }}</p>
          </RsPanel>

          </div>
          <!-- make a mesh -->
          <RsPanel class="make-panel" title="Make a mesh" panel-id="mesh.make">
            <p class="muted small">
              Make it at the bed temperature you print at: the bed changes shape as it heats.
              The Rhino homes if needed, heats the bed and lets it soak, levels the gantry, then probes with the print head.
            </p>
            <div class="form">
              <label class="field">
                <span class="lab">Bed temperature</span>
                <span class="inp"><input v-model.number="bed" type="number" min="0" max="130" step="1" inputmode="numeric" /> <span class="unit">°C</span></span>
                <span class="hint" :class="{ bad: bedProblem }">{{ bedProblem ?? '0 for a cold bed' }}</span>
              </label>
              <label class="field">
                <span class="lab">Soak</span>
                <span class="inp"><input v-model.number="soak" type="number" min="0" max="60" step="1" inputmode="numeric" :disabled="Number(bed) === 0" /> <span class="unit">min</span></span>
                <span class="hint">time at temperature before probing</span>
              </label>
              <label class="field">
                <span class="lab">Name</span>
                <span class="inp"><input v-model="name" type="text" maxlength="32" spellcheck="false" autocomplete="off" @input="nameTouched = true" /></span>
                <span class="hint" :class="{ bad: nameProblem }">{{ nameProblem ?? (replaces ? `Replaces the mesh called ${name.trim()}` : 'Prints find it by its bed temperature') }}</span>
              </label>
              <label class="tick level"><input v-model="level" type="checkbox" /> Level the gantry first (Z_TILT_ADJUST)</label>
            </div>
            <div class="make-go">
              <RsButton variant="primary" :disabled="!!mesh.calibrateBlock || !!nameProblem || !!bedProblem" @click="make">Make the mesh</RsButton>
              <span v-if="mesh.calibrateBlock" class="muted small">{{ mesh.calibrateBlock }}</span>
            </div>
          </RsPanel>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.note { padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); }
.note.bad { border-color: var(--rs-danger); color: var(--rs-danger); }
.small { font-size: var(--rs-text-sm); }
code { font-family: var(--rs-font-code); }

/* status strips */
.strip {
  display: flex;
  align-items: center;
  gap: var(--rs-space-4);
  padding: var(--rs-space-3) var(--rs-space-5);
  border: 1px solid var(--rs-line);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
}
.strip.none { border: 1.5px solid var(--rs-line-strong); box-shadow: inset 6px 0 0 var(--rs-ink); }
.strip.unsaved { border: 1.5px solid var(--rs-ink); }
.strip-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.strip-text strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.warn { color: var(--rs-text-strong); font-size: var(--rs-text-sm); padding-left: 14px; position: relative; }
.warn::before { content: ''; position: absolute; left: 0; top: 0.42em; width: 8px; height: 8px; background: var(--rs-dither-dense); box-shadow: inset 0 0 0 1px var(--rs-ink); }

/* layout reflows by its own width, not the window's */
.mesh-wrap { container-type: inline-size; }
.mesh-grid { display: grid; gap: var(--rs-gap); grid-template-columns: minmax(0, 1fr); }
/* narrow: one column, in reading order (map, what it means, the list, making one) */
.col { display: contents; }
.map-panel { order: 1; }
.reading-panel { order: 2; }
.list-panel { order: 3; }
.make-panel { order: 4; }
@container (min-width: 900px) {
  /* wide: the map with Make below it on the left; what it means and the list on the right */
  .mesh-grid { grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); align-items: start; }
  .col { display: flex; flex-direction: column; gap: var(--rs-gap); min-width: 0; }
  .col.main { grid-column: 1; grid-row: 1 / span 2; }
  .col.side { grid-column: 2; grid-row: 1 / span 2; }
  .make-panel { grid-column: 1; grid-row: 2; }
  .col.main { grid-row: 1; }
}

.tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); margin-bottom: var(--rs-space-3); }
.seg { display: inline-flex; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; }
.seg button { border: 0; background: transparent; color: var(--rs-text); font: inherit; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); padding: 7px 12px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--rs-line); }
.seg button.on { background: var(--rs-ink); color: var(--rs-on-ink); }
.seg button:disabled { color: var(--rs-text-muted); cursor: default; }
.cmp { display: inline-flex; align-items: center; gap: var(--rs-space-2); }
select, input[type='text'], input[type='number'] {
  font: inherit; font-size: var(--rs-text-sm); color: var(--rs-text-strong); background: var(--rs-surface-2);
  border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); padding: 6px 8px; min-width: 0;
}
.tick { display: inline-flex; align-items: center; gap: 6px; font-size: var(--rs-text-sm); }
.tools .tick { margin-left: auto; }
.mode-note { margin: 0 0 var(--rs-space-2); }

.legend { margin-top: var(--rs-space-3); max-width: 420px; }
.bar { height: 10px; border-radius: 3px; border: 1px solid var(--rs-line); background: linear-gradient(90deg, var(--rs-mesh-low), transparent 50%, var(--rs-mesh-high)) var(--rs-surface-2); }
.ticks { display: flex; justify-content: space-between; font-family: var(--rs-font-code); font-size: 11px; color: var(--rs-text-muted); margin-top: 3px; }
.scale-note { margin: var(--rs-space-2) 0 0; max-width: 68ch; }

.readouts { display: grid; gap: var(--rs-space-2); grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.advice { margin: var(--rs-space-3) 0; color: var(--rs-text-strong); }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 4px var(--rs-space-3); margin: 0; font-size: var(--rs-text-sm); }
.facts dt { color: var(--rs-text-muted); }
.facts dd { margin: 0; }

.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; align-items: center; gap: var(--rs-space-2); padding: var(--rs-space-2) 0; border-top: 1px solid var(--rs-line); flex-wrap: wrap; }
.list li:first-child { border-top: 0; }
.pick { flex: 1 1 200px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; background: transparent; border: 0; color: inherit; font: inherit; padding: 6px 8px; border-radius: var(--rs-radius-md); cursor: pointer; min-width: 0; }
.pick:hover { background: var(--rs-surface-2); }
.viewing .pick { box-shadow: inset 3px 0 0 var(--rs-ink); background: var(--rs-surface-2); }
.name { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.chips { display: flex; gap: 6px; margin-top: 2px; }
.chips :deep(.chip) { height: 24px; font-size: 12px; }
.chips:empty { display: none; }
.acts { display: flex; gap: var(--rs-space-2); }
.print-line { margin: var(--rs-space-3) 0 0; }

.form { display: grid; gap: var(--rs-space-3); grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); margin-top: var(--rs-space-3); align-items: start; }
.field { display: flex; flex-direction: column; gap: 4px; }
.lab { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.inp { display: flex; align-items: center; gap: 6px; }
.inp input { width: 100%; }
.inp input[type='number'] { max-width: 90px; font-family: var(--rs-font-code); }
.unit { color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.hint { font-size: 11px; color: var(--rs-text-muted); }
.hint.bad { color: var(--rs-danger); }
.level { align-self: center; }
.make-go { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-3); margin-top: var(--rs-space-4); }
</style>
