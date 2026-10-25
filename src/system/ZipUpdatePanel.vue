<script setup lang="ts">
/**
 * Settings > Software: install a Rhino Tool Manager release zip from here,
 * like the tooling tracker's "point at the zip, install". Drop the zip, check
 * what it is, press Install. The Portal keeps the zip; the root-owned updater
 * on the Rhino backs up, installs and restarts Klipper (src/system/zipUpdate.ts).
 * The Portal restarts during the install, so this keeps polling through it,
 * then reloads Studio so the new version (in the same zip) is the one running.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import Icon from '@/icons/Icon.vue'
import RunLog from '@/components/RunLog.vue'
import type { UpdateState } from '@/portal/client'
import { useMaintenanceStore } from '@/stores/maintenance'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { compareText, goBackZip, installBlock, stepMarks, ZIP_NAME } from './zipUpdate'

const care = useMaintenanceStore()
const machine = useMachineStore()
const control = useControlStore()

const st = ref<UpdateState | null>(null)
const reachable = ref(true)
const tooOld = ref(false)
const uploading = ref(false)
const msg = ref<{ text: string; bad: boolean } | null>(null)
const picked = ref<{ zip: string; version: string } | null>(null)
const dragging = ref(false)
const picker = ref<HTMLInputElement | null>(null)
const reloadIn = ref<number | null>(null)
let watchedRun = false
let timer: ReturnType<typeof setTimeout> | null = null

async function poll() {
  const c = care.portal()
  if (!c) return schedule(5000)
  try {
    const s = await c.updateState()
    st.value = s
    reachable.value = true
    tooOld.value = false
    if (s.status.state === 'running') watchedRun = true
    else if (watchedRun && s.status.state === 'done' && reloadIn.value == null) startReload()
    else if (watchedRun && s.status.state === 'failed') {
      watchedRun = false
      window.dispatchEvent(new CustomEvent('rhino:update-ended')) // Update in Packages stops saying Updating…
    }
  } catch (e) {
    reachable.value = false
    // An older Portal has no /api/update; a restarting one just doesn't answer for a bit
    if (/404|not found/i.test((e as Error).message)) tooOld.value = true
  }
  schedule(st.value?.status.state === 'running' || watchedRun ? 2000 : 15000)
}
function schedule(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void poll(), ms)
}
// Update (GitHub) in the Packages table starts the same run: follow it here at once
const onStarted = () => {
  watchedRun = true
  void poll()
}
onMounted(() => {
  void poll()
  window.addEventListener('rhino:update-started', onStarted)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  window.removeEventListener('rhino:update-started', onStarted)
})

function startReload() {
  watchedRun = false
  reloadIn.value = 5
  const tick = () => {
    if (reloadIn.value == null) return
    if (reloadIn.value <= 0) return location.reload()
    reloadIn.value -= 1
    setTimeout(tick, 1000)
  }
  setTimeout(tick, 1000)
}

const run = computed(() => st.value?.status ?? { state: 'idle' as const })
const running = computed(() => run.value.state === 'running')
const block = computed(() =>
  installBlock({ helper: !!st.value?.helper, busy: !!st.value?.busy, jobState: machine.job.state ?? null, portalOnline: reachable.value && !!st.value }),
)
const back = computed(() => (st.value ? goBackZip(st.value) : null))
const steps = computed(() => stepMarks(run.value))

/** The status bar between the log and the drop area: what's happening, in one line */
const status = computed<{ tone: 'ok' | 'busy' | 'bad' | 'idle'; text: string; detail: string; frac: number | null }>(() => {
  const r = run.value
  const total = r.steps?.length ?? 0
  const at = Math.min((r.step ?? 0) + 1, total || 1)
  if (uploading.value) return { tone: 'busy', text: 'Uploading and checking the zip…', detail: '', frac: null }
  if (r.state === 'running') {
    return { tone: 'busy', text: `Installing ${r.version ?? ''}`.trim() + (total ? ` · step ${at} of ${total}: ${r.step_name ?? ''}` : '…'),
      detail: reachable.value ? '' : 'Portal restarting (expected)', frac: total ? (at - 0.5) / total : null }
  }
  if (reloadIn.value != null) return { tone: 'ok', text: `Installed ${r.version}`, detail: `reloading in ${reloadIn.value} s`, frac: 1 }
  if (r.state === 'failed') {
    return { tone: 'bad', text: `Install of ${r.version ?? 'the zip'} stopped` + (total ? ` at step ${at} of ${total}: ${r.step_name ?? ''}` : ''),
      detail: ago(r.finished), frac: null }
  }
  if (picked.value) return { tone: 'idle', text: `${picked.value.zip} checked, ready to install`, detail: '', frac: null }
  if (r.state === 'done') return { tone: 'ok', text: `Up to date · Tool Manager ${st.value?.installed ?? r.version}`, detail: `installed ${ago(r.finished)}`, frac: null }
  return { tone: 'idle', text: `Ready · Tool Manager ${st.value?.installed ?? '?'} installed`, detail: '', frac: null }
})

async function upload(files: FileList | null) {
  const f = files?.[0]
  if (picker.value) picker.value.value = ''
  if (!f) return
  if (!/\.zip$/i.test(f.name)) return void (msg.value = { text: `${f.name} isn't a zip. Pick rhino-config-<version>.zip.`, bad: true })
  const c = care.portal()
  if (!c) return
  uploading.value = true
  msg.value = null
  picked.value = null
  try {
    const r = await c.uploadUpdate(f)
    picked.value = { zip: r.zip, version: r.version }
    await poll()
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    uploading.value = false
  }
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void upload(e.dataTransfer?.files ?? null)
}

async function install(zip: string, version: string, goingBack = false) {
  if (block.value || !ZIP_NAME.test(zip)) return
  const ok = await control.confirm({
    title: goingBack ? `Go back to Tool Manager ${version}?` : `Install Tool Manager ${version}?`,
    body:
      'Your config folder is backed up first (rhino.sh option 4 undoes it), and BACKUP_CFG runs if you have it. ' +
      'The Portal and Klipper restart, so the heaters turn off and the axes need homing. Studio follows along and reloads itself when it is done.',
    confirmLabel: goingBack ? 'Go back' : 'Install',
    tone: 'normal',
  })
  if (!ok) return
  const c = care.portal()
  if (!c) return
  msg.value = null
  try {
    await c.installUpdate(zip)
    watchedRun = true
    picked.value = null
    await poll()
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  }
}

const ago = (t?: number | null) => (t ? new Date(t * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
</script>

<template>
  <RsPanel title="Install from zip" index="02" panel-id="settings.zipupdate" class="wide">
    <p v-if="tooOld" class="muted small">
      The Rhino's Tool Manager is older than 1.5.3, which brings this. Install rhino-config-1.5.3.zip once the usual way
      (upload it in Mainsail, <code>rhino.sh</code> option 3); after that, the next zips install from here.
    </p>
    <p v-else-if="!st && !reachable" class="muted small">Can't reach the Rhino Portal right now.</p>
    <template v-else-if="st">
      <p class="muted small lead">
        Installed: <strong class="mono">{{ st.installed }}</strong>.
        For a zip you downloaded (or no internet on the Rhino): drop <span class="mono">rhino-config-1.5.x.zip</span> here; it's checked before anything happens, and nothing installs until you press Install. Update in the table above fetches the newest one from GitHub instead.
      </p>

      <!-- running / finished -->
      <div v-if="run.state !== 'idle' && (running || run.finished && Date.now() / 1000 - run.finished < 6 * 3600)" class="runbox" :class="run.state">
        <div class="runhead">
          <strong v-if="running">Installing {{ run.version }}<template v-if="run.from_version"> (from {{ run.from_version }})</template>…</strong>
          <strong v-else-if="run.state === 'done'">Installed {{ run.version }} · {{ ago(run.finished) }}</strong>
          <strong v-else>Install of {{ run.version }} stopped · {{ ago(run.finished) }}</strong>
          <span v-if="running && !reachable" class="muted small">The Portal is restarting, which is expected. Still watching…</span>
        </div>
        <ol v-if="steps.length" class="steps">
          <li v-for="s in steps" :key="s.name" :class="s.mark">
            <span class="mk" aria-hidden="true">{{ s.mark === 'done' ? '✓' : s.mark === 'now' ? '•' : s.mark === 'failed' ? '✕' : '' }}</span>{{ s.name }}
          </li>
        </ol>
        <p v-else-if="running" class="muted small">{{ run.step_name ?? 'Starting…' }}</p>
        <p v-if="run.error" class="err">{{ run.error }}</p>
        <RunLog v-if="run.log?.length" :lines="run.log" label="Install log" />
        <p v-if="reloadIn != null" class="small strong">Done. Reloading Studio in {{ reloadIn }} s so the new version is the one running…</p>
      </div>

      <!-- status bar: between the log and the drop area -->
      <div class="statusbar" :class="status.tone" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        <span class="stxt">{{ status.text }}</span>
        <span v-if="status.detail" class="sdet">{{ status.detail }}</span>
        <span v-if="status.frac != null" class="sprog" aria-hidden="true"><span :style="{ width: `${Math.round(status.frac * 100)}%` }"></span></span>
      </div>

      <!-- drop area -->
      <button
        v-if="!running"
        type="button"
        class="dropzone"
        :class="{ dragging }"
        :disabled="uploading"
        @click="picker?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <Icon nav="files" :size="26" />
        <span class="big">{{ uploading ? 'Uploading and checking…' : 'Drop the release zip here, or click to choose' }}</span>
        <span class="small">rhino-config-1.5.x.zip · checked before anything happens</span>
      </button>
      <input ref="picker" type="file" accept=".zip" class="visually-hidden" @change="upload(($event.target as HTMLInputElement).files)" />

      <div v-if="picked && !running" class="picked">
        <span class="txt">
          <strong class="mono">{{ picked.zip }}</strong>
          <span class="muted small">{{ compareText(picked.version, st.installed) }}</span>
        </span>
        <RsButton variant="primary" :disabled="!!block" :title="block ?? ''" @click="install(picked.zip, picked.version)">Install {{ picked.version }}</RsButton>
      </div>
      <p v-if="block && (picked || back) && !running" class="muted small">{{ block }}.</p>
      <p v-if="msg" class="msg" :class="{ bad: msg.bad }" role="status">{{ msg.text }}</p>

      <div v-if="back && !running && !picked" class="goback">
        <RsButton variant="quiet" size="sm" :disabled="!!block" :title="block ?? ''" @click="install(back.zip, back.version, true)">Go back to {{ back.version }}</RsButton>
        <span class="muted small">Installs the {{ back.version }} zip kept from before.</span>
      </div>
    </template>
  </RsPanel>
</template>

<style scoped>
.lead { margin: 0 0 var(--rs-space-3); }
.lead strong { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.mono { font-family: var(--rs-font-code); }
.dropzone { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 110px; padding: var(--rs-space-4); border: 1.5px dashed var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text-muted); font: inherit; cursor: pointer; text-align: center; }
.dropzone:hover:not(:disabled), .dropzone.dragging { border-color: var(--rs-ink); color: var(--rs-text-strong); background: var(--rs-surface-2); }
.dropzone .big { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.picked { display: flex; align-items: center; gap: var(--rs-space-3); margin-top: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.picked .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.picked strong { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); overflow-wrap: anywhere; }
.runbox { margin-bottom: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); border-left: 3px solid var(--rs-ink); }
.runbox.failed { border-left-color: var(--rs-danger); }
.runhead { display: flex; flex-direction: column; gap: 2px; margin-bottom: var(--rs-space-2); }
.runhead strong { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: var(--rs-text-sm); }
.steps li { color: var(--rs-text-muted); }
.steps li.done, .steps li.now { color: var(--rs-text-strong); }
.steps li.now { font-weight: var(--rs-weight-medium); }
.steps li.failed { color: var(--rs-danger); font-weight: var(--rs-weight-medium); }
.mk { display: inline-block; width: 1.3em; }
.err { margin: var(--rs-space-2) 0 0; color: var(--rs-danger); font-size: var(--rs-text-sm); }
.statusbar { display: flex; align-items: center; gap: var(--rs-space-2); min-height: 34px; margin-bottom: var(--rs-space-3); padding: 6px 12px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.statusbar .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--rs-text-muted); }
.statusbar.ok .dot { background: var(--rs-ink); }
.statusbar.busy .dot { background: var(--rs-ink); animation: rs-blink 1s steps(2, start) infinite; }
.statusbar.bad { border-color: var(--rs-danger); }
.statusbar.bad .dot { background: var(--rs-danger); }
.statusbar .stxt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--rs-weight-medium); }
.statusbar .sdet { flex: none; color: var(--rs-text-muted); font-size: var(--rs-text-xs); }
.statusbar .sprog { flex: none; width: 90px; height: 6px; border-radius: 3px; background: var(--rs-surface-2); box-shadow: inset 0 0 0 1px var(--rs-line-strong); overflow: hidden; }
.statusbar .sprog span { display: block; height: 100%; background: var(--rs-ink); transition: width 0.4s; }
@keyframes rs-blink { to { visibility: hidden; } }
@media (prefers-reduced-motion: reduce) { .statusbar.busy .dot { animation: none; } }
.strong { color: var(--rs-text-strong); margin: var(--rs-space-2) 0 0; }
.goback { display: flex; align-items: center; gap: var(--rs-space-2); margin-top: var(--rs-space-3); flex-wrap: wrap; }
.goback :deep(.btn) { margin-left: -12px; }
.msg { margin-top: var(--rs-space-3); padding: 8px 12px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.msg.bad { border-left: 4px solid var(--rs-danger); }
@media (max-width: 720px) { .picked { flex-direction: column; align-items: stretch; } }
</style>
