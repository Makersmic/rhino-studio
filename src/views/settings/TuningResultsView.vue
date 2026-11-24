<script setup lang="ts">
/** Wizards > Tuning results: what the wizards found, per print head and for the machine, with a way to run each again. */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useTuningStore } from '@/stores/tuning'
import { useMaintenanceStore } from '@/stores/maintenance'
import type { TunedState } from '@/portal/client'
import { ago, headGroups, machineGroup } from '@/checks/results'

const tuning = useTuningStore()
const maint = useMaintenanceStore()
const tuned = ref<TunedState | null>(null)
const error = ref<string | null>(null)
onMounted(async () => {
  await tuning.load()
  try {
    tuned.value = (await maint.portal()?.tunedState()) ?? null
  } catch (e) {
    error.value = `Heater and shaper results can't be read (${(e as Error).message}); install the latest release.`
  }
})
const groups = computed(() => [machineGroup(tuned.value), ...headGroups(tuning.state, tuned.value)].filter((g) => g.rows.length))
</script>

<template>
  <div class="set-page">
    <p v-if="error" class="tm-err">{{ error }}</p>
    <EmptyState v-if="!groups.length" title="Nothing has been tuned yet">
      Run a wizard from the Wizards overview (Extruder calibration and the other print head tests are on the Assets page). What each one finds shows up here, per print head, with when.
    </EmptyState>
    <RsPanel v-for="g in groups" :key="g.title" :title="g.title" :panel-id="`results.${g.title}`">
      <ul class="rows">
        <li v-for="(r, i) in g.rows" :key="i">
          <span class="what">{{ r.what }}</span>
          <span class="val mono">{{ r.value }}</span>
          <span class="when">{{ ago(r.at) }}</span>
          <RouterLink v-if="r.wizard" :to="r.wizard" class="again">Run again</RouterLink>
        </li>
      </ul>
    </RsPanel>
    <p class="note">Every head weighs something different, so the shaper, rotation distance and pressure advance are kept per print head. Heater values belong to the machine.</p>
  </div>
</template>

<style scoped>
.set-page { display: flex; flex-direction: column; gap: var(--rs-space-4); }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rows li { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(0, 2fr) 90px auto; gap: var(--rs-space-3); align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--rs-line); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.rows li:last-child { border-bottom: 0; }
.mono { font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.when { color: var(--rs-text-muted); }
.again { color: var(--rs-text-strong); text-underline-offset: 3px; }
.note { margin: 0; color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
@media (max-width: 720px) { .rows li { grid-template-columns: 1fr auto; } .val { grid-column: 1 / -1; } }
</style>
