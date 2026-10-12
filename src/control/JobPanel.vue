<script setup lang="ts">
/** The running job (pause, resume, cancel), or recent files ready to start. */
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
  <RsPanel title="Job" index="02">
    <template v-if="active">
      <div class="job">
        <span class="state" :class="state">{{ label[state!] }}</span>
        <strong class="file">{{ machine.job.filename }}</strong>
        <span class="pct">{{ pct }}<small>%</small></span>
        <div class="bar" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${pct}%` }" /></div>
      </div>
      <div class="row">
        <RsButton v-if="state === 'printing'" @click="control.pauseJob()">Pause</RsButton>
        <RsButton v-else variant="primary" @click="control.resumeJob()">Resume</RsButton>
        <RsButton variant="danger" @click="control.cancelJob()">Cancel job</RsButton>
      </div>
    </template>
    <template v-else>
      <p class="muted">{{ state ? label[state] ?? state : 'Waiting for Klipper' }}<template v-if="machine.job.filename">: {{ machine.job.filename }}</template>.</p>
      <p class="muted small">Start jobs from <RouterLink to="/files">Files</RouterLink>. Studio checks the file's toolhead against the mounted one, and laser, spindle and knife jobs start through their Rhino setup wizard.</p>
    </template>
  </RsPanel>
</template>

<style scoped>
.job { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--rs-space-2) var(--rs-space-3); margin-bottom: var(--rs-space-4); }
.state { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 3px 10px; border-radius: var(--rs-radius-pill); background: var(--rs-active); color: var(--th-ink); }
.state.paused { background: var(--rs-warn-fill); }
.file { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); overflow-wrap: anywhere; }
.bar { grid-column: 1 / -1; height: 8px; border-radius: var(--rs-radius-pill); background: var(--rs-surface-2); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--rs-active); border-radius: inherit; }
.pct small { font-size: 0.5em; }
.pct { font-size: var(--rs-text-xl); font-weight: var(--rs-weight-light); color: var(--rs-text-strong); }
.row { display: flex; gap: var(--rs-space-2); }
.small { font-size: var(--rs-text-sm); margin-top: var(--rs-space-2); }
</style>
