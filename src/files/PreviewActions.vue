<script setup lang="ts">
/**
 * The buttons beside a preview. Nothing here starts or sends by its own route: a
 * file on the Rhino goes through control.startJob, the same check, confirmation and
 * wizard as the Start button in Files, and a new file through Job setup's own send.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import { jobCareNote } from '@/maintenance/summary'
import { fetchFileToolhead } from '@/moonraker/gcodeHeader'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { usePrepareStore } from '@/stores/prepare'

const props = defineProps<{ filePath: string | null }>()
const router = useRouter()
const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()
const prep = usePrepareStore()

/** Which toolhead the file says it's for: undefined while reading, null if it doesn't say */
const fileTool = ref<string | null | undefined>(undefined)
const starting = ref(false)

watch(
  [() => props.filePath, () => machine.online],
  async ([path]) => {
    fileTool.value = undefined
    const url = path ? machine.rootUrl('gcodes', path) : null
    if (!path || !url) return
    const found = await fetchFileToolhead(url).catch(() => null)
    if (props.filePath === path) fileTool.value = found
  },
  { immediate: true },
)

const check = computed(() => (props.filePath ? control.startCheck(props.filePath, fileTool.value ?? null) : null))
const reading = computed(() => !!props.filePath && fileTool.value === undefined)
const needsSwap = computed(() => check.value?.swapTo != null && !!fileTool.value)
const reason = computed(() => {
  if (reading.value) return 'Reading which toolhead this file is for'
  if (needsSwap.value) return control.jobActive ? 'Not while a job is running' : null
  return check.value?.ok ? null : (check.value?.block ?? null)
})

async function start() {
  const path = props.filePath
  if (!path) return
  starting.value = true
  try {
    const tool = fileTool.value ?? machine.mountedName
    await control.startJob(path, fileTool.value ?? null, jobCareNote(tool ? care.forTool(tool) : null, tool))
  } finally {
    starting.value = false
  }
}
function swap() {
  if (check.value?.swapTo != null && fileTool.value) void control.swapTo(check.value.swapTo, fileTool.value)
}
function downloadFile() {
  const path = props.filePath
  const url = path ? machine.rootUrl('gcodes', path) : null
  if (!path || !url) return
  const a = document.createElement('a')
  a.href = url
  a.download = path.split('/').pop() ?? path
  document.body.appendChild(a)
  a.click()
  a.remove()
}
const firstProblem = computed(() => prep.blocked[0]?.label ?? null)
function openInFiles() {
  if (prep.sentPath) void router.push({ path: '/files', query: { file: prep.sentPath } })
}
</script>

<template>
  <div class="actions">
    <template v-if="filePath">
      <RsButton v-if="needsSwap" variant="primary" :disabled="control.jobActive || !machine.klippyReady" @click="swap">Swap to {{ fileTool }}</RsButton>
      <RsButton v-else variant="primary" :disabled="reading || starting || !check?.ok" @click="start">Start job</RsButton>
      <RsButton @click="downloadFile">Download</RsButton>
      <span v-if="reason" class="why">{{ reason }}</span>
    </template>
    <template v-else-if="prep.result">
      <RsButton variant="primary" :disabled="!!prep.blocked.length || !machine.online || prep.sending != null" @click="prep.send()">
        {{ prep.sending != null ? `Sending ${Math.round(prep.sending * 100)}%` : 'Send to Rhino' }}
      </RsButton>
      <RsButton v-if="!prep.uploaded" :disabled="!!prep.blocked.length" @click="prep.download()">Download</RsButton>
      <span v-if="firstProblem" class="why">Job setup found a problem, so this can't be sent: {{ firstProblem }}</span>
      <span v-else-if="!machine.online" class="why">Connect to send.</span>
      <p v-if="prep.sendError" class="problem" role="alert">{{ prep.sendError }}</p>
      <p v-if="prep.sentPath" class="sent" role="status">
        Sent as <strong>{{ prep.sentPath }}</strong>. Nothing has started.
        <RsButton size="sm" @click="openInFiles">Start it from Files</RsButton>
      </p>
    </template>
  </div>
</template>

<style scoped>
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); margin-bottom: var(--rs-space-3); }
.why { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.problem, .sent { flex-basis: 100%; margin: 0; font-size: var(--rs-text-sm); }
.sent { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); overflow-wrap: anywhere; }
</style>
