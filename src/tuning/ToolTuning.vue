<script setup lang="ts">
/** The tool page's Tuning panel: which wizards have been run for this print head, per material, and Tune. */
import { computed, onMounted } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import { WIZARDS, lastRun, materialKey } from './tuning'

const props = defineProps<{ tool: string }>()
const tuning = useTuningStore()
const prep = usePrepareStore()
onMounted(() => void tuning.load())
const mats = computed(() => prep.materialsOf(props.tool).map((m) => ({ key: m.key, name: m.name, nozzle: m.nozzle ?? 0.4 })))
const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const head = computed(() => lastRun(tuning.state, props.tool, 'extruder_calibration'))
const perMat = WIZARDS.filter((w) => w.scope === 'material')
const seen = computed(() => {
  const out = new Map<string, { name: string; nozzle: number }>()
  for (const m of mats.value) out.set(materialKey(props.tool, m.nozzle, m.name), { name: m.name, nozzle: m.nozzle })
  return [...out.values()]
})
</script>

<template>
  <div class="tt">
    <p v-if="!tuning.supported" class="muted">Tuning needs Tool Manager 1.9.16 on the Rhino.</p>
    <template v-else>
      <p class="row" :class="{ done: head }">
        <span class="mark" aria-hidden="true">{{ head ? '✓' : '○' }}</span>
        <span>Extruder calibration</span>
        <span class="when">{{ head ? `${date(head.time)} · ${head.value}` : 'Not run' }}</span>
      </p>
      <table class="tgrid">
        <thead>
          <tr><th>Material</th><th v-for="w in perMat" :key="w.test">{{ w.title }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in seen" :key="`${m.name}${m.nozzle}`">
            <th>{{ m.name }} <span class="muted">{{ m.nozzle }} mm</span></th>
            <td v-for="w in perMat" :key="w.test">
              <template v-if="lastRun(tuning.state, tool, w.test, m.nozzle, m.name)">✓ {{ date(lastRun(tuning.state, tool, w.test, m.nozzle, m.name)!.time) }}</template>
              <span v-else class="muted">–</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="acts"><RsButton size="sm" variant="primary" @click="$router.push(`/assets/toolheads/${encodeURIComponent(tool)}/tune`)">Tune {{ tool }}</RsButton></div>
    </template>
  </div>
</template>

<style scoped>
.tt { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.row { display: flex; gap: var(--rs-space-2); align-items: baseline; margin: 0; font-size: var(--rs-text-sm); }
.row .when { margin-left: auto; color: var(--rs-text-muted); font-size: var(--rs-text-xs); }
.row.done .mark { color: var(--rs-text-strong); }
.tgrid { width: 100%; border-collapse: collapse; font-size: var(--rs-text-xs); }
.tgrid th, .tgrid td { text-align: left; padding: 4px 6px; border-top: 1px solid var(--rs-line); }
.tgrid thead th { color: var(--rs-text-muted); font-weight: 400; border-top: 0; }
.muted { color: var(--rs-text-muted); }
.acts { display: flex; }
</style>
