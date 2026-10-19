<script setup lang="ts">
/**
 * Settings / Logs: read klippy.log, moonraker.log and the other logs Moonraker
 * serves (its read-only "logs" root). Shows the end of the file only
 * (TAIL_BYTES) so a phone doesn't pull megabytes; Download gets the whole file.
 * "Copy last error" finds the newest error block (src/system/logs.ts).
 */
import './settings.css'
import { computed, nextTick, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import type { FileEntry } from '@/moonraker/client'
import { useMachineStore } from '@/stores/machine'
import { cleanTail, lastError, sortLogs, TAIL_BYTES } from '@/system/logs'

const machine = useMachineStore()
const logs = ref<FileEntry[]>([])
const picked = ref<string>('')
const text = ref('')
const cut = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const note = ref<string | null>(null)
const pre = ref<HTMLElement | null>(null)

async function list() {
  error.value = null
  try {
    logs.value = sortLogs(await machine.listLogs())
    if (!picked.value || !logs.value.some((l) => l.path === picked.value)) picked.value = logs.value[0]?.path ?? ''
  } catch (e) {
    error.value = `Couldn't list the logs: ${(e as Error).message}`
  }
}

async function read() {
  const url = picked.value ? machine.logUrl(picked.value) : null
  if (!url) return
  loading.value = true
  note.value = null
  try {
    const size = logs.value.find((l) => l.path === picked.value)?.size ?? 0
    const ranged = size > TAIL_BYTES
    const r = await fetch(url, ranged ? { headers: { Range: `bytes=-${TAIL_BYTES}` } } : undefined)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const body = await r.text()
    // A server that ignores Range sends the whole file: keep only its end
    const tail = body.length > TAIL_BYTES ? body.slice(-TAIL_BYTES) : body
    cut.value = ranged || body.length > TAIL_BYTES
    text.value = cleanTail(tail, cut.value)
    error.value = null
    await nextTick()
    if (pre.value) pre.value.scrollTop = pre.value.scrollHeight
  } catch (e) {
    error.value = `Couldn't read ${picked.value}: ${(e as Error).message}`
  } finally {
    loading.value = false
  }
}

watch(() => machine.online, (on) => on && list().then(read), { immediate: true })
watch(picked, (p, old) => old && p && read())

const lastErr = computed(() => lastError(text.value))
async function copyError() {
  if (!lastErr.value) return
  try {
    await navigator.clipboard.writeText(lastErr.value)
    note.value = 'Last error copied.'
  } catch {
    note.value = 'This browser blocked copying. Select the highlighted error and copy it by hand.'
  }
}
const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
</script>

<template>
  <div class="set-page">
    <RsPanel title="Logs" index="01" panel-id="settings.logs">
      <template #actions>
        <RsButton variant="quiet" size="sm" :disabled="loading || !picked" @click="read">Reload</RsButton>
      </template>
      <p v-if="!machine.online" class="muted">Connect to read the Rhino's logs.</p>
      <template v-else>
        <div class="row bar">
          <select v-model="picked" class="inline" aria-label="Log file">
            <option v-for="l in logs" :key="l.path" :value="l.path">{{ l.path }} ({{ fmtSize(l.size) }})</option>
          </select>
          <RsButton size="sm" :disabled="!lastErr" :title="lastErr ? 'Copy the newest error block' : 'No error in the part shown'" @click="copyError">Copy last error</RsButton>
          <a v-if="picked" class="dl" :href="machine.logUrl(picked) ?? undefined" :download="picked">Download whole file</a>
        </div>
        <p v-if="note" class="msg" role="status">{{ note }}</p>
        <p v-if="error" class="msg bad">{{ error }}</p>
        <p v-else-if="cut" class="muted small">Showing the last {{ Math.round(TAIL_BYTES / 1024) }} KB. Download gets the whole file.</p>
        <details v-if="lastErr" class="err" open>
          <summary>Last error in this part</summary>
          <pre>{{ lastErr }}</pre>
        </details>
        <pre ref="pre" class="log" tabindex="0" aria-label="Log text">{{ loading && !text ? 'Reading…' : text || (logs.length ? '' : 'Moonraker serves no logs.') }}</pre>
      </template>
    </RsPanel>
  </div>
</template>

<style scoped>
.bar { margin-bottom: var(--rs-space-3); }
.bar select { min-width: 220px; max-width: 100%; }
.dl { font-size: var(--rs-text-sm); color: var(--rs-text-strong); text-underline-offset: 3px; }
.log, .err pre {
  margin: 0; padding: 12px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2);
  font-family: var(--rs-font-code); font-size: 12px; line-height: 1.5; color: var(--rs-text);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.log { height: min(60vh, 640px); overflow: auto; margin-top: var(--rs-space-3); }
.err { margin-top: var(--rs-space-3); }
.err summary { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); cursor: pointer; margin-bottom: 6px; }
.err pre { border-left: 3px solid var(--rs-danger); color: var(--rs-text-strong); }
</style>
