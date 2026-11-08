<script setup lang="ts">
/**
 * Tune a print head (Assets › Toolheads › a print head › Tune): the wizards in Ellis' order, each with why it comes
 * there and when it was last run, and the one being run. 3D printing first (Mike, Nov 8); other heads later.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import ExtruderCalWizard from '@/tuning/ExtruderCalWizard.vue'
import FirstLayerWizard from '@/tuning/FirstLayerWizard.vue'
import PressureAdvanceWizard from '@/tuning/PressureAdvanceWizard.vue'
import ExtrusionWizard from '@/tuning/ExtrusionWizard.vue'
import { WIZARDS, lastRun, type TuningTest } from '@/tuning/tuning'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'

const route = useRoute()
const tool = computed(() => String(route.params.name ?? ''))
const prep = usePrepareStore()
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
const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Tune {{ tool }}</h1>
      <p>Guided tests after Ellis’ Print Tuning Guide. Each one prints or pushes a little filament, asks what you see, and keeps the result on the Rhino, in the backup.</p>
    </div>

    <RsPanel title="Material" panel-id="tune.material">
      <label class="fld">
        <span>Tests that depend on the material use</span>
        <select v-model="matKey">
          <option v-for="m in mats" :key="m.key" :value="m.key">{{ m.name }} · {{ m.nozzle ?? 0.4 }} mm nozzle · {{ m.extruderTemp ?? '–' }}°</option>
        </select>
      </label>
    </RsPanel>

    <RsPanel v-if="running === 'extruder_calibration'" title="Extruder calibration" panel-id="tune.extruder">
      <ExtruderCalWizard :tool="tool" :temp="temp" @done="running = null" />
    </RsPanel>

    <RsPanel v-else-if="running === 'first_layer' && mat" :title="`First-layer squish: ${mat.name} ${mat.nozzle ?? 0.4} mm`" panel-id="tune.squish">
      <FirstLayerWizard :tool="tool" :mat="mat" @done="running = null" />
    </RsPanel>

    <RsPanel v-else-if="running === 'pressure_advance' && mat" :title="`Pressure advance: ${mat.name} ${mat.nozzle ?? 0.4} mm`" panel-id="tune.pa">
      <PressureAdvanceWizard :tool="tool" :mat="mat" @done="running = null" />
    </RsPanel>

    <RsPanel v-else-if="running === 'extrusion_multiplier' && mat" :title="`Extrusion multiplier: ${mat.name} ${mat.nozzle ?? 0.4} mm`" panel-id="tune.em">
      <ExtrusionWizard :tool="tool" :mat="mat" @done="running = null" />
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
  </div>
</template>

<style scoped>
.fld { display: flex; flex-direction: column; gap: 6px; font-size: var(--rs-text-sm); max-width: 480px; }
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
