<script setup lang="ts">
/**
 * Tune a laser or a drag knife (Assets › Toolheads › the tool › Tune): its tests in order (cutTests.ts CUT_WIZARDS),
 * what each found for the chosen material, and the one being run.
 */
import { computed, onMounted, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import '@/toolmgr/forms.css'
import CutTestWizard from './CutTestWizard.vue'
import { cutWizardsFor, lastCut, type CutProcess, type CutTest, type CutValue } from './cutTests'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'

const props = defineProps<{ tool: string; process: CutProcess }>()
const prep = usePrepareStore()
const tuning = useTuningStore()
onMounted(() => void tuning.load())

const mats = computed(() => prep.materialsOf(props.tool))
const matKey = ref('')
watch(mats, (m) => { if (!matKey.value && m[0]) matKey.value = m[0].key }, { immediate: true })
const mat = computed(() => mats.value.find((m) => m.key === matKey.value) ?? mats.value[0] ?? null)
const tests = computed(() => cutWizardsFor(props.process))
const running = ref<CutTest | null>(null)
const runningTitle = computed(() => tests.value.find((w) => w.test === running.value)?.title ?? '')
const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const found = (v: CutValue) => lastCut(tuning.state?.runs, props.tool, v, mat.value?.name)
const show = (v: CutValue, n: number) => (v.endsWith('_power') ? `${Math.round(n * 100)} %` : v.endsWith('_speed') ? `${n} mm/min` : v === 'laser_passes' ? `${n}` : v === 'knife_pressure' ? `${n} g` : `${n} mm`)
</script>

<template>
  <p v-if="!tuning.supported" class="muted">Tuning needs Tool Manager 1.9.16 on the Rhino; laser and knife values need 1.9.23.</p>
  <template v-else>
    <RsPanel title="Material" panel-id="tune.material">
      <label class="fld">
        <span>Tests that depend on the material use</span>
        <select v-model="matKey" class="tm-sel">
          <option v-for="m in mats" :key="m.key" :value="m.key">{{ m.name }}</option>
        </select>
      </label>
      <p v-if="!mats.length" class="muted small">{{ tool }} has no materials yet: add them with Edit tool, then tune each one.</p>
    </RsPanel>

    <RsPanel v-if="running && mat" :title="`${runningTitle}${tests.find((w) => w.test === running)?.scope === 'stock' ? `: ${mat.name}` : ''}`" panel-id="tune.cut">
      <CutTestWizard :key="`${running}-${mat.key}`" :tool="tool" :test="running" :mat="mat" @done="running = null; tuning.load()" />
    </RsPanel>

    <RsPanel v-else title="Tests, in order" panel-id="tune.list">
      <ol class="list">
        <li v-for="(w, i) in tests" :key="w.test">
          <span class="n">{{ i + 1 }}</span>
          <div class="main">
            <strong>{{ w.title }}<span v-if="w.scope === 'head'" class="muted"> · once per {{ process === 'laser' ? 'lens' : 'blade' }}</span></strong>
            <small>{{ w.why }}</small>
            <small v-for="v in w.saves.filter((s) => found(s))" :key="v" class="done">✓ {{ date(found(v)!.time) }} · {{ show(v, found(v)!.value) }}</small>
          </div>
          <RsButton size="sm" variant="primary" :disabled="!mat" @click="running = w.test">Start</RsButton>
        </li>
      </ol>
    </RsPanel>
  </template>
</template>

<style scoped>
.fld { display: flex; flex-direction: column; gap: 6px; font-size: var(--rs-text-sm); max-width: 480px; }

.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); font-weight: 400; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; align-items: flex-start; gap: var(--rs-space-3); padding: var(--rs-space-3) 0; border-top: 1px solid var(--rs-line); }
.list li:first-child { border-top: 0; }
.n { width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: var(--rs-text-xs); background: var(--rs-text-strong); color: var(--rs-surface); }
.main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.main small { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.main .done { color: var(--rs-text-strong); }
</style>
