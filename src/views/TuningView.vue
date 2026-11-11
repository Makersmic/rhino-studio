<script setup lang="ts">
/**
 * Tune a print head (Assets › Toolheads › a print head › Tune): the wizards in Ellis' order, each with why it comes
 * there and when it was last run, and the one being run. 3D printing first (Mike, Nov 8); the laser and the drag knife
 * have their own tests (CutTuning.vue, Nov 10). Every running wizard sits beside the mascot.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import ExtruderCalWizard from '@/tuning/ExtruderCalWizard.vue'
import FirstLayerWizard from '@/tuning/FirstLayerWizard.vue'
import PressureAdvanceWizard from '@/tuning/PressureAdvanceWizard.vue'
import ExtrusionWizard from '@/tuning/ExtrusionWizard.vue'
import CutTuning from '@/tuning/CutTuning.vue'
import MascotRow from '@/components/MascotRow.vue'
import { TUNING_POSE } from '@/brand/mascot'
import { WIZARDS, lastRun, unstored, type TuningTest } from '@/tuning/tuning'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'

const route = useRoute()
const tool = computed(() => String(route.params.name ?? ''))
const prep = usePrepareStore()
// a laser, a drag knife or the spindle gets its own tests; everything else here is for print heads
const cut = computed(() => {
  const p = prep.tools.find((t) => t.name === tool.value)?.process
  return p === 'laser' || p === 'dragknife' || p === 'cnc' ? p : null
})
const tuning = useTuningStore()
onMounted(() => void tuning.load())

const mats = computed(() => prep.materialsOf(tool.value))
const matKey = ref<string>('')
// start on the head's first material
watch(mats, (m) => { if (!matKey.value && m[0]) matKey.value = m[0].key }, { immediate: true })
const mat = computed(() => mats.value.find((m) => m.key === matKey.value) ?? mats.value[0] ?? null)
const temp = computed(() => mat.value?.extruderTemp ?? 210)
const running = ref<TuningTest | null>(null)
const BUILT: TuningTest[] = ['extruder_calibration', 'first_layer', 'pressure_advance', 'extrusion_multiplier']
// Results the Portal has but Klipper doesn't apply yet (saved before Tool Manager 1.9.17, or a store that failed)
const machine = useMachineStore()
const control = useControlStore()
const sv = computed(() => (machine.status.save_variables?.variables ?? {}) as Record<string, unknown>)
const missing = computed(() => (machine.klippyReady ? unstored(tuning.state, tool.value, sv.value) : []))
const storing = ref(false)
async function storeAll() {
  storing.value = true
  await control.send(missing.value.map((m) => m.script).join('\n'), { label: `Store ${tool.value}'s tuning on the Rhino` })
  storing.value = false
}
const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Tune {{ tool }}</h1>
      <p v-if="cut === 'laser'">Guided tests that each cut or mark a little scrap: focus, power and speed, passes, kerf. Each asks what you see and keeps the result on the Rhino, in the backup, for Job setup to start from.</p>
      <p v-else-if="cut === 'cnc'">Guided tests that each cut a few slots in scrap: the bit’s true diameter, then feed, then depth per pass. Each asks what you see and keeps the result on the Rhino for that bit and material, for Job setup to start from.</p>
      <p v-else-if="cut">Guided tests that each cut a little scrap: depth, then blade offset. Each asks what you see and keeps the result on the Rhino, in the backup, for Job setup to start from.</p>
      <p v-else>Guided tests after Ellis’ Print Tuning Guide. Each one prints or pushes a little filament, asks what you see, and keeps the result on the Rhino, in the backup.</p>
    </div>

    <CutTuning v-if="cut" :tool="tool" :process="cut" />
    <template v-else>

    <RsPanel title="Material" panel-id="tune.material">
      <label class="fld">
        <span>Tests that depend on the material use</span>
        <select v-model="matKey">
          <option v-for="m in mats" :key="m.key" :value="m.key">{{ m.name }} · {{ m.nozzle ?? 0.4 }} mm nozzle · {{ m.extruderTemp ?? '–' }}°</option>
        </select>
      </label>
      <p v-if="mat" class="muted small keyline">
        Jobs use what's tuned here when they start with <code>TOOLHEAD={{ tool }} MATERIAL={{ mat.name }} NOZZLE_SIZE={{ mat.nozzle ?? 0.4 }}</code>:
        files Studio prepares always do. A file from another slicer must name the material the same way, or it gets the estimate
        (the console says which it used).
      </p>
    </RsPanel>

    <RsPanel v-if="missing.length" title="Not on the Rhino yet" panel-id="tune.unstored" :status="`${missing.length}`">
      <p class="small">Studio has these results, but Klipper doesn't apply them at job start yet:</p>
      <ul class="small"><li v-for="m in missing" :key="m.variable">{{ m.label }} <code class="muted">{{ m.variable }}</code></li></ul>
      <RsButton size="sm" variant="primary" :disabled="storing || !machine.klippyReady" @click="storeAll">Store on the Rhino</RsButton>
    </RsPanel>

    <RsPanel v-if="running === 'extruder_calibration'" title="Extruder calibration" panel-id="tune.extruder">
      <MascotRow :pose="TUNING_POSE[running!]!"><ExtruderCalWizard :tool="tool" :temp="temp" @done="running = null" /></MascotRow>
    </RsPanel>

    <RsPanel v-else-if="running === 'first_layer' && mat" :title="`First-layer squish: ${mat.name} ${mat.nozzle ?? 0.4} mm`" panel-id="tune.squish">
      <MascotRow :pose="TUNING_POSE[running!]!"><FirstLayerWizard :tool="tool" :mat="mat" @done="running = null" /></MascotRow>
    </RsPanel>

    <RsPanel v-else-if="running === 'pressure_advance' && mat" :title="`Pressure advance: ${mat.name} ${mat.nozzle ?? 0.4} mm`" panel-id="tune.pa">
      <MascotRow :pose="TUNING_POSE[running!]!"><PressureAdvanceWizard :tool="tool" :mat="mat" @done="running = null" /></MascotRow>
    </RsPanel>

    <RsPanel v-else-if="running === 'extrusion_multiplier' && mat" :title="`Extrusion multiplier: ${mat.name} ${mat.nozzle ?? 0.4} mm`" panel-id="tune.em">
      <MascotRow :pose="TUNING_POSE[running!]!"><ExtrusionWizard :tool="tool" :mat="mat" @done="running = null" /></MascotRow>
    </RsPanel>

    <RsPanel v-else title="Tests, in order" panel-id="tune.list">
      <ol class="list">
        <li v-for="(w, i) in WIZARDS" :key="w.test">
          <span class="n">{{ i + 1 }}</span>
          <div class="main">
            <strong>{{ w.title }}</strong>
            <small>{{ w.why }}</small>
            <small v-if="lastRun(tuning.state, tool, w.test, mat?.nozzle ?? 0.4, mat?.name)" class="done">
              ✓ {{ date(lastRun(tuning.state, tool, w.test, mat?.nozzle ?? 0.4, mat?.name)!.time) }} · {{ lastRun(tuning.state, tool, w.test, mat?.nozzle ?? 0.4, mat?.name)!.value }}
            </small>
          </div>
          <RsButton v-if="BUILT.includes(w.test)" size="sm" variant="primary" @click="running = w.test">Start</RsButton>
          <span v-else class="soon">Coming next</span>
        </li>
      </ol>
    </RsPanel>
    </template>
  </div>
</template>

<style scoped>
.fld { display: flex; flex-direction: column; gap: 6px; font-size: var(--rs-text-sm); max-width: 480px; }
.keyline { margin: var(--rs-space-3) 0 0; max-width: 72ch; }
.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); }
.fld select { padding: 8px 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; align-items: flex-start; gap: var(--rs-space-3); padding: var(--rs-space-3) 0; border-top: 1px solid var(--rs-line); }
.list li:first-child { border-top: 0; }
.n { width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: var(--rs-text-xs); background: var(--rs-text-strong); color: var(--rs-surface); }
.main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.main small { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.main .done { color: var(--rs-text-strong); }
.soon { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
</style>
