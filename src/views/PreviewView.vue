<script setup lang="ts">
/**
 * Preview: a file on the machine (from Files) or the file just made in Job setup.
 * It only reads. While a job runs it asks first, because reading a big file adds
 * work for the host.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import PreviewActions from '@/files/PreviewActions.vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import type { ParsedGcode } from '@/gcode/parse'
import { parseInWorker, type ParseJob } from '@/gcode/parseInWorker'
import Icon from '@/icons/Icon.vue'
import { useMachineStore } from '@/stores/machine'
import { usePrepareStore } from '@/stores/prepare'

const GcodeViewer = defineAsyncComponent(() => import('@/viewer/GcodeViewer.vue'))

const route = useRoute()
const router = useRouter()
const machine = useMachineStore()
const prep = usePrepareStore()

const filePath = computed(() => (typeof route.query.file === 'string' ? route.query.file : null))
const fromSetup = computed(() => route.query.from === 'setup')
const setupFile = computed(() => (fromSetup.value ? (prep.result?.file ?? null) : null))
const title = computed(() => filePath.value ?? setupFile.value?.name ?? '')

const parsed = shallowRef<ParsedGcode | null>(null)
/** Each new read gets a fresh viewer, even for a file with the same name */
const parseId = ref(0)
const error = ref<string | null>(null)
const loading = ref(false)
const done = ref(0)
const total = ref<number | null>(null)
const askedAndOk = ref(false)
let job: ParseJob | null = null

const jobRunning = computed(() => {
  const st = machine.status.print_stats as { state?: string } | undefined
  return st?.state === 'printing' || st?.state === 'paused'
})
const needsAsk = computed(() => !!filePath.value && jobRunning.value && !askedAndOk.value && !parsed.value && !loading.value)
const mb = (n: number) => (n / 1048576).toFixed(1)
const bed = computed(() => {
  const m = prep.machineInfo
  return { x: m.workArea.x, y: m.workArea.y, keepOut: m.keepOut }
})

function start() {
  job?.cancel()
  job = null
  parsed.value = null
  error.value = null
  done.value = 0
  total.value = null
  let source: { url: string } | { text: string }
  if (filePath.value) {
    const url = machine.fileUrl(filePath.value)
    if (!url) {
      error.value = 'Not connected to the Rhino yet, so the file can\'t be read.'
      return
    }
    source = { url }
  } else if (setupFile.value) source = { text: setupFile.value.text }
  else return
  loading.value = true
  const mine = parseInWorker(source, (d, t) => {
    done.value = d
    total.value = t
  })
  job = mine
  mine.result.then(
    (p) => {
      if (job !== mine) return
      parsed.value = p
      parseId.value++
      loading.value = false
      job = null
    },
    (e: Error) => {
      if (job !== mine) return
      error.value = e.message
      loading.value = false
      job = null
    },
  )
}
function cancel() {
  job?.cancel()
  job = null
  loading.value = false
  error.value = 'Stopped reading the file.'
}

// What's on screen must always be the file named above it: a different file clears the old drawing first
let shown: unknown = null
watch(
  [filePath, () => setupFile.value?.text, () => machine.online],
  () => {
    // Compared by content: Job setup can rebuild its result with the same file inside
    const wanted = filePath.value ?? setupFile.value?.text ?? null
    if (wanted !== shown) {
      shown = wanted
      job?.cancel()
      job = null
      parsed.value = null
      error.value = null
      loading.value = false
      askedAndOk.value = false
    }
    // A reconnect with the same file keeps what's already drawn or being read
    if (!wanted || parsed.value || loading.value) return
    if (filePath.value && !machine.fileUrl(filePath.value)) return
    if (filePath.value && jobRunning.value && !askedAndOk.value) return
    start()
  },
  { immediate: true },
)
onBeforeUnmount(() => job?.cancel())

function readAnyway() {
  askedAndOk.value = true
  start()
}
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Preview</h1>
      <p>Step through every layer and move before anything reaches the machine.</p>
    </div>

    <EmptyState v-if="!filePath && !setupFile" title="Nothing to preview yet">
      <template #art><Icon nav="preview" :size="64" /></template>
      In Files, open a G-code file's ⋯ menu and choose Preview, or prepare a job in Job setup.
      <template v-if="fromSetup"> The job from Job setup is no longer here, so prepare it again.</template>
      <span class="start">
        <RsButton size="sm" @click="router.push('/files')">Open Files</RsButton>
        <RsButton size="sm" @click="router.push('/setup')">Job setup</RsButton>
      </span>
    </EmptyState>

    <RsPanel v-else panel-id="preview.file" title="Toolpath">
      <p class="name">{{ title }}</p>
      <PreviewActions :file-path="filePath" />
      <div v-if="needsAsk" class="ask">
        <p>A job is running. Reading this file adds work for the Rhino while it runs, and a slow host can feel that.</p>
        <RsButton variant="primary" @click="readAnyway">Read it anyway</RsButton>
        <span class="muted small">Or come back when the job is done.</span>
      </div>
      <p v-else-if="error" class="error" role="alert">
        {{ error }}
        <RsButton v-if="filePath || setupFile" size="sm" @click="start">Try again</RsButton>
      </p>
      <div v-else-if="loading" class="reading" role="status">
        <span>Reading the file<template v-if="done"> · {{ mb(done) }}<template v-if="total"> of {{ mb(total) }}</template> MB</template></span>
        <span class="bar" :class="{ indet: !total }"><span :style="{ width: total ? `${(done / total) * 100}%` : '30%' }" /></span>
        <RsButton size="sm" @click="cancel">Stop</RsButton>
      </div>
      <p v-else-if="parsed && !parsed.moveCount" class="muted">This file has no moves to draw.</p>
      <GcodeViewer v-else-if="parsed" :key="parseId" :parsed="parsed" :bed="bed" />
    </RsPanel>
  </div>
</template>

<style scoped>
.name { margin: 0 0 var(--rs-space-2); font-size: var(--rs-text-sm); overflow-wrap: anywhere; }
.start { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-3); }
.ask { display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-2); }
.ask p { margin: 0; }
.reading { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); font-size: var(--rs-text-sm); }
.bar { flex: 1 1 160px; height: 6px; overflow: hidden; background: var(--rs-surface-2); border-radius: 3px; }
.bar > span { display: block; height: 100%; background: var(--rs-text-strong); }
.muted { color: var(--rs-text-muted); }
.small { font-size: var(--rs-text-xs); }
.error { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); margin: 0; }
</style>
