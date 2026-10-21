<script setup lang="ts">
/**
 * Settings → Cameras: add, edit, switch off and delete cameras.
 *
 * The list lives in Moonraker (the same list Mainsail and Fluidd show), so
 * a change here shows there too. Cameras written in moonraker.conf can only
 * be changed in that file. Nothing here reaches Klipper or the machine.
 */
import { computed, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import Icon from '@/icons/Icon.vue'
import WebcamView from './WebcamView.vue'
import { SERVICES, blankForm, formFrom, serviceLabel, validateForm, viewMode, type Webcam, type WebcamForm } from './webcams'
import { useWebcamsStore } from '@/stores/webcams'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'

const webcams = useWebcamsStore()
const machine = useMachineStore()
const control = useControlStore()

const form = ref<WebcamForm | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
const tried = ref(false)

const errors = computed(() => (form.value ? validateForm(form.value, webcams.all) : []))
const preview = computed<Webcam | null>(() => {
  const f = form.value
  if (!f || (!f.streamUrl.trim() && !f.snapshotUrl.trim())) return null
  return { ...f, uid: f.uid ?? 'preview', name: f.name || 'Preview', streamUrl: f.streamUrl.trim(), snapshotUrl: f.snapshotUrl.trim(), source: 'database' }
})
const help = computed(() => SERVICES.find((s) => s.id === form.value?.service)?.help ?? '')
const needsSnapshot = computed(() => form.value && viewMode(form.value.service) === 'snapshot')

function add() {
  form.value = blankForm(webcams.all.length + 1)
  tried.value = false
  error.value = null
}
function edit(cam: Webcam) {
  form.value = formFrom(cam)
  tried.value = false
  error.value = null
}
function cancel() {
  form.value = null
}

async function save() {
  tried.value = true
  if (!form.value || errors.value.length) return
  busy.value = true
  error.value = null
  try {
    await webcams.save(form.value)
    form.value = null
  } catch (e) {
    error.value = `Couldn't save: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

async function remove(cam: Webcam) {
  const ok = await control.confirm({
    title: `Delete the camera "${cam.name}"?`,
    body: 'It disappears from Studio, Mainsail and Fluidd. The camera and crowsnest are not changed, so you can add it again later.',
    confirmLabel: 'Delete camera',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await webcams.remove(cam.uid)
    if (form.value?.uid === cam.uid) form.value = null
  } catch (e) {
    error.value = `Couldn't delete: ${(e as Error).message}`
  }
}

async function toggle(cam: Webcam) {
  try {
    await webcams.save({ ...formFrom(cam), enabled: !cam.enabled })
  } catch (e) {
    error.value = `Couldn't change it: ${(e as Error).message}`
  }
}
</script>

<template>
  <RsPanel title="Cameras" panel-id="settings.cameras" :status="machine.online ? `${webcams.all.length} set up` : 'Not connected'">
    <template #actions>
      <RsButton v-if="!form" size="sm" :disabled="!machine.online" @click="add">Add camera</RsButton>
    </template>

    <p v-if="!machine.online" class="muted small">Cameras are kept by Moonraker on the Pi. Connect to see and change them.</p>

    <ul v-else-if="webcams.all.length" class="list">
      <li v-for="cam in webcams.all" :key="cam.uid" :class="{ off: !cam.enabled, editing: form?.uid === cam.uid }">
        <span class="ic"><Icon nav="camera" :size="20" /></span>
        <div class="txt">
          <strong>{{ cam.name }}<em v-if="!cam.enabled">Off</em><em v-if="cam.source === 'config'">moonraker.conf</em></strong>
          <span>{{ serviceLabel(cam.service) }} · <code>{{ viewMode(cam.service) === 'snapshot' ? cam.snapshotUrl : cam.streamUrl }}</code></span>
        </div>
        <!-- a small live picture, left of Turn off: one still a second, only while on screen (easy on a Pi 3B) -->
        <div class="thumb" :class="{ blank: !cam.enabled }" :aria-label="cam.enabled ? `Live picture from ${cam.name}` : `${cam.name} is off`">
          <WebcamView v-if="cam.enabled && form?.uid !== cam.uid" :key="`${cam.uid}|${cam.service}|${cam.streamUrl}|${cam.snapshotUrl}`" :cam="cam" fit="cover" fill thumb />
          <span v-else-if="!cam.enabled" class="muted">Off</span>
        </div>
        <div v-if="cam.source !== 'config'" class="acts">
          <RsButton size="sm" variant="quiet" @click="toggle(cam)">{{ cam.enabled ? 'Turn off' : 'Turn on' }}</RsButton>
          <RsButton size="sm" @click="edit(cam)">Edit</RsButton>
          <RsButton size="sm" variant="quiet" :aria-label="`Delete ${cam.name}`" @click="remove(cam)">Delete</RsButton>
        </div>
        <span v-else class="muted small">Change it in moonraker.conf</span>
      </li>
    </ul>
    <p v-else-if="!form" class="muted small">
      No cameras yet. If crowsnest is running on the Pi, the first camera is usually at <code>/webcam/?action=stream</code>: press Add camera and check the preview.
    </p>

    <form v-if="form" class="editor" @submit.prevent="save">
      <div class="fields">
        <h3>{{ form.uid ? `Edit ${form.name}` : 'New camera' }}</h3>
        <label class="field">
          <span>Name</span>
          <input v-model="form.name" type="text" autocomplete="off" />
        </label>
        <label class="field">
          <span>Stream type</span>
          <select v-model="form.service">
            <option v-for="s in SERVICES" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
          <small>{{ help }}</small>
        </label>
        <label class="field">
          <span>Stream address</span>
          <input v-model="form.streamUrl" type="text" spellcheck="false" autocomplete="off" placeholder="/webcam/?action=stream" />
        </label>
        <label class="field">
          <span>Snapshot address{{ needsSnapshot ? '' : ' (optional)' }}</span>
          <input v-model="form.snapshotUrl" type="text" spellcheck="false" autocomplete="off" placeholder="/webcam/?action=snapshot" />
        </label>
        <div class="row3">
          <label class="field">
            <span>Frame rate</span>
            <input v-model.number="form.targetFps" type="number" min="1" max="30" step="1" />
          </label>
          <label class="field">
            <span>Turn</span>
            <select v-model.number="form.rotation">
              <option :value="0">0°</option>
              <option :value="90">90°</option>
              <option :value="180">180°</option>
              <option :value="270">270°</option>
            </select>
          </label>
          <label class="field">
            <span>Shape</span>
            <select v-model="form.aspectRatio">
              <option value="16:9">16:9</option>
              <option value="4:3">4:3</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
        </div>
        <div class="checks">
          <label class="check"><input v-model="form.flipH" type="checkbox" /> Mirror left-right</label>
          <label class="check"><input v-model="form.flipV" type="checkbox" /> Flip upside down</label>
          <label class="check"><input v-model="form.enabled" type="checkbox" /> Show this camera</label>
        </div>
        <ul v-if="tried && errors.length" class="errors" role="alert">
          <li v-for="e in errors" :key="e">{{ e }}</li>
        </ul>
        <p v-if="error" class="errors" role="alert">{{ error }}</p>
        <div class="row">
          <RsButton type="submit" variant="primary" :disabled="busy">{{ busy ? 'Saving…' : form.uid ? 'Save camera' : 'Add camera' }}</RsButton>
          <RsButton variant="quiet" @click="cancel">Cancel</RsButton>
        </div>
      </div>
      <div class="preview">
        <span class="k">Preview</span>
        <WebcamView v-if="preview" :key="`${preview.service}|${preview.streamUrl}|${preview.snapshotUrl}`" :cam="preview" />
        <div v-else class="nopreview">Enter an address to see the picture</div>
        <small class="muted">Paths starting with / are on the Pi (crowsnest serves /webcam/, /webcam2/ …).</small>
      </div>
    </form>

    <p v-if="error && !form" class="errors" role="alert">{{ error }}</p>
  </RsPanel>
</template>

<style scoped>
.small { font-size: var(--rs-text-sm); }
code { font-family: var(--rs-font-mono); font-size: 0.92em; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.list li { display: flex; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) 0; }
.list li + li { background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 0 / 5px 2px repeat-x; }
.list li.off .txt { opacity: 0.55; }
.list li.editing .ic { background: var(--rs-ink); color: var(--rs-on-ink); }
.ic { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); color: var(--rs-text-strong); }
.txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.txt strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); display: flex; gap: 8px; align-items: center; }
.txt em { font-style: normal; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 0 6px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); color: var(--rs-text-muted); }
.txt > span { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acts { display: flex; gap: 4px; flex: none; }
.thumb { position: relative; flex: none; width: 112px; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--rs-radius-sm, 6px); background: var(--rs-surface-2); box-shadow: inset 0 0 0 1px var(--rs-line); display: grid; place-items: center; }
.thumb > :deep(*) { width: 100%; height: 100%; }
.thumb.blank .muted { font-size: var(--rs-text-xs); }
@media (max-width: 720px) {
  .list li { flex-wrap: wrap; }
  .thumb { width: 96px; }
}

.editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--rs-space-5); margin-top: var(--rs-space-3); padding-top: var(--rs-space-4); background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 0 / 5px 2px repeat-x; }
h3 { font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); margin: 0 0 var(--rs-space-2); }
.fields { display: flex; flex-direction: column; gap: var(--rs-space-3); min-width: 0; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: var(--rs-text-sm); min-width: 0; }
.field > span { color: var(--rs-text-muted); font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); }
.field small { color: var(--rs-text-muted); font-size: var(--rs-text-xs); }
.field input, .field select {
  height: 38px; padding: 0 12px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong);
  background: transparent; color: var(--rs-text-strong); font: inherit; min-width: 0;
}
.field select { background: var(--rs-surface); }
.field input:focus-visible, .field select:focus-visible { outline: none; border-color: var(--rs-text-strong); box-shadow: var(--rs-focus); }
.row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--rs-space-3); }
.checks { display: flex; flex-wrap: wrap; gap: var(--rs-space-2) var(--rs-space-4); }
.check { display: flex; align-items: center; gap: 8px; font-size: var(--rs-text-sm); cursor: pointer; }
.check input { width: 16px; height: 16px; accent-color: var(--rs-text-strong); }
.errors { margin: 0; padding: 8px 12px; list-style: none; font-size: var(--rs-text-sm); color: var(--rs-text-strong); border-left: 3px solid var(--rs-ink); background: var(--rs-dither-faint); }
.row { display: flex; gap: var(--rs-space-2); }
.preview { display: flex; flex-direction: column; gap: var(--rs-space-2); min-width: 0; }
.preview :deep(.cam) { border-radius: var(--rs-radius-md); }
.k { font-size: var(--rs-text-xs); color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); }
.nopreview { aspect-ratio: 16 / 9; display: grid; place-items: center; border-radius: var(--rs-radius-md); background: var(--rs-dither-faint); color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
@media (max-width: 900px) {
  .editor { grid-template-columns: 1fr; }
  .list li { flex-wrap: wrap; }
  .acts { width: 100%; justify-content: flex-end; }
}
</style>
