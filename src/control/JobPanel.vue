<script setup lang="ts">
/** The running job (pause, resume, cancel), or where to start one. */
import { computed } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'

const control = useControlStore()
const machine = useMachineStore()

const state = computed(() => machine.job.state)
const active = computed(() => state.value === 'printing' || state.value === 'paused')
const pct = computed(() => Math.round((machine.job.progress ?? 0) * 100))
const label: Record<string, string> = { standby: 'Idle', printing: 'Running', paused: 'Paused', complete: 'Finished', cancelled: 'Cancelled', error: 'Stopped with an error' }
</script>

<template>
  <RsPanel title="Job" :status="state ? label[state] ?? state : '—'">
    <template v-if="active">
      <p class="file">{{ machine.job.filename }}</p>
      <div class="progress">
        <span class="bar" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${pct}%` }" /></span>
        <span class="rs-num pct">{{ pct }}<small>%</small></span>
      </div>
      <div class="row">
        <RsButton v-if="state === 'printing'" @click="control.pauseJob()">Pause</RsButton>
        <RsButton v-else variant="primary" @click="control.resumeJob()">Resume</RsButton>
        <RsButton class="cancel" variant="danger-outline" @click="control.cancelJob()">Cancel job</RsButton>
      </div>
    </template>
    <template v-else>
      <p class="muted small">
        <template v-if="machine.job.filename">Last: {{ machine.job.filename }}. </template>
        Start a job from <RouterLink to="/files">Files</RouterLink>: Studio checks the file's toolhead against the mounted one first.
      </p>
    </template>
  </RsPanel>
</template>

<style scoped>
.file { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); overflow-wrap: anywhere; }
.progress { display: flex; align-items: center; gap: var(--rs-space-4); margin: var(--rs-space-3) 0 var(--rs-space-4); }
.bar { flex: 1; height: 10px; border-radius: 2px; background: var(--rs-dither-faint); box-shadow: inset 0 0 0 1px var(--rs-line); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--rs-ink); }
.pct { font-size: 2rem; }
.pct small { font-family: var(--rs-font-ui); font-size: 0.4em; color: var(--rs-text-muted); }
.row { display: flex; gap: var(--rs-space-2); }
/* away from Pause/Resume, so it's never hit by habit */
.cancel { margin-left: auto; }
.small { font-size: var(--rs-text-sm); }
</style>
