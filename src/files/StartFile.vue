<script setup lang="ts">
/**
 * Start (or swap for) one file that's already on the Rhino. Used beside a preview and
 * under Job setup's "Sent as …". Starting goes through control.startJob: the same check,
 * confirmation and wizard as Files. After a start it opens Control, where the job's
 * prompts and live tuning (Z offset for the first layer) are.
 * While a job runs there's no Start button at all: nothing queues, because a queued
 * job would start on top of the part still on the bed.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import { jobCareNote } from '@/maintenance/summary'
import { fetchFileToolhead } from '@/moonraker/gcodeHeader'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'

const props = defineProps<{ filePath: string; download?: boolean; filesLink?: boolean }>()
const router = useRouter()
const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()

/** Which toolhead the file says it's for: undefined while reading, null if it doesn't say */
const fileTool = ref<string | null | undefined>(undefined)
const starting = ref(false)

watch(
  [() => props.filePath, () => machine.online],
  async ([path]) => {
    fileTool.value = undefined
    const url = machine.rootUrl('gcodes', path)
    if (!url) return
    const found = await fetchFileToolhead(url).catch(() => null)
    if (props.filePath === path) fileTool.value = found
  },
  { immediate: true },
)

const check = computed(() => control.startCheck(props.filePath, fileTool.value ?? null))
const reading = computed(() => fileTool.value === undefined)
const needsSwap = computed(() => check.value.swapTo != null && !!fileTool.value)
const reason = computed(() => {
  if (reading.value) return 'Reading which toolhead this file is for'
  return needsSwap.value || check.value.ok ? null : (check.value.block ?? null)
})

async function start() {
  starting.value = true
  try {
    const tool = fileTool.value ?? machine.mountedName
    const ok = await control.startJob(props.filePath, fileTool.value ?? null, jobCareNote(tool ? care.forTool(tool) : null, tool))
    if (ok) void router.push('/control')
  } finally {
    starting.value = false
  }
}
function swap() {
  if (check.value.swapTo != null && fileTool.value) void control.swapTo(check.value.swapTo, fileTool.value)
}
function downloadFile() {
  const url = machine.rootUrl('gcodes', props.filePath)
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = props.filePath.split('/').pop() ?? props.filePath
  document.body.appendChild(a)
  a.click()
  a.remove()
}
function openInFiles() {
  void router.push({ path: '/files', query: { file: props.filePath } })
}
</script>

<template>
  <span class="start-file">
    <template v-if="control.jobActive">
      <span class="why">A job is running. Start this one from Files when it's done and the bed is clear.</span>
      <RsButton v-if="filesLink" size="sm" @click="openInFiles">Open in Files</RsButton>
    </template>
    <template v-else>
      <RsButton v-if="needsSwap" variant="primary" :disabled="!machine.klippyReady" @click="swap">Swap to {{ fileTool }}</RsButton>
      <RsButton v-else variant="primary" :disabled="reading || starting || !check.ok" @click="start">Start job</RsButton>
      <span v-if="reason" class="why">{{ reason }}</span>
    </template>
    <RsButton v-if="download" @click="downloadFile">Download</RsButton>
  </span>
</template>

<style scoped>
.start-file { display: contents; }
.why { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
</style>
