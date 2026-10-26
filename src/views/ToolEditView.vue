<script setup lang="ts">
/**
 * Edit an added tool: its name, power limits, materials, checklist, the
 * connector contacts it uses, notes and photos (Settings), and its controls
 * and macros. Built-in tools are read-only (variables.cfg).
 *
 * Save sends the changes to the Portal, which checks them against the whole
 * config and writes custom_tools.cfg; Klipper loads them at its next restart
 * (the banner offers it). Photos are saved straight away. Delete asks first;
 * the Portal won't remove the mounted tool, and keeps its maintenance history.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import ToolConnector from '@/toolmgr/ToolConnector.vue'
import MaterialsTable from '@/toolmgr/MaterialsTable.vue'
import ItemsPanel from '@/toolmgr/ItemsPanel.vue'
import { ctlMacroNames, editBody, editForm, NAME_RE, rowsFromTool, type EditForm, type MatRow } from '@/toolmgr/form'
import type { ToolControl, ToolDetail, ToolMacro, ToolOptions } from '@/toolmgr/types'
import { useToolMgrStore } from '@/stores/toolmgr'
import { useControlStore } from '@/stores/control'
import '@/toolmgr/forms.css'

const route = useRoute()
const router = useRouter()
const tm = useToolMgrStore()
const control = useControlStore()
onBeforeUnmount(tm.use())

const name = computed(() => String(route.params.name ?? ''))
const tool = ref<ToolDetail | null>(null)
const opt = ref<ToolOptions | null>(null)
const f = reactive<EditForm>({ new_name: '', notes: '', checklist: '', cap: 0, min: 0, idle: 0, max_on_s: '', s_max: '', contacts: [] })
const rows = ref<MatRow[]>([])
const removed = ref<string[]>([])
const controls = ref<ToolControl[]>([])
const macros = ref<ToolMacro[]>([])
const tab = ref<'settings' | 'controls' | 'macros'>('settings')
const error = ref<string | null>(null)
const saving = ref(false)
const photoBusy = ref(false)
let pristine = ''

const snapshot = () => JSON.stringify([f, rows.value, removed.value, controls.value, macros.value])
const dirty = computed(() => !!tool.value && snapshot() !== pristine)

async function load() {
  error.value = null
  try {
    const [t, o] = await Promise.all([tm.client().detail(name.value), tm.loadOptions(true)])
    tool.value = t
    opt.value = o
    Object.assign(f, editForm(t))
    rows.value = rowsFromTool(t)
    removed.value = []
    controls.value = JSON.parse(JSON.stringify(t.controls ?? []))
    macros.value = JSON.parse(JSON.stringify(t.macros ?? []))
    pristine = snapshot()
  } catch (e) {
    error.value = (e as Error).message
  }
}
watch(name, load, { immediate: true })

const t = computed(() => tool.value)
const locked = computed(() => (t.value?.outputs ?? []).map((o) => o.contact).filter((c): c is number => c != null))
const wiring = computed(() =>
  (t.value?.outputs ?? []).map((o) => `${o.role === 'power' ? 'power' : 'switch'}: ${o.output}${o.contact ? ` (contact ${o.contact})` : o.pin ? ` (${o.pin})` : ''}`).join(' · ') || t.value?.power_pin || '',
)
const names = computed(() => opt.value?.material_names[t.value?.category ?? ''] ?? [])
const photos = computed(() => (t.value?.images ?? []).map((fn) => ({ fn, url: tm.client().media(`/media/${encodeURIComponent(name.value)}/${encodeURIComponent(fn)}`)! })))
const savedPins = computed(() => (t.value?.controls ?? []).map((c) => c.pin))
const macroCount = computed(() => macros.value.length + ctlMacroNames(controls.value).length)

function addRow() {
  rows.value.push({ name: '', power: t.value?.type === 'POWERED' ? 50 : undefined, feed_rate: 600, z_offset: 0, existing: false })
}
function removeRow(i: number) {
  const [r] = rows.value.splice(i, 1)
  if (r?.existing) removed.value.push(r.name)
}

async function save() {
  if (!t.value) return
  error.value = null
  const newName = f.new_name.trim()
  if (!NAME_RE.test(newName)) return (error.value = 'The name must start with a letter, use only letters, digits and _, and be 2-24 characters.')
  if (Number(f.min) > Number(f.cap) && t.value.type === 'POWERED') return (error.value = 'Minimum power cannot be above the power cap.')
  saving.value = true
  let current = name.value
  try {
    if (newName !== current) {
      const r = await tm.client().renameTool(current, newName)
      current = String(r.name ?? newName)
    }
    await tm.client().editTool(current, editBody(t.value, f, rows.value, removed.value, controls.value, macros.value))
    await tm.changed()
    pristine = snapshot()
    router.push(`/assets/toolheads/${encodeURIComponent(current)}`)
  } catch (e) {
    error.value = (e as Error).message
    if (current !== name.value) router.replace(`/assets/toolheads/${encodeURIComponent(current)}/edit`)
    await tm.changed().catch(() => {})
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!t.value) return
  const ok = await control.confirm({
    title: `Delete ${name.value}?`,
    body: `Its section is taken out of custom_tools.cfg at the next Klipper restart, and its photos are deleted. Its maintenance tasks are archived; the work log keeps their history. This can't be undone here.`,
    feature: `${name.value} · slot ${t.value.slot}`,
    confirmLabel: `Delete ${name.value}`,
    tone: 'danger',
  })
  if (!ok) return
  error.value = null
  try {
    await tm.client().deleteTool(name.value)
    await tm.changed()
    router.push('/assets/toolheads')
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function addPhotos(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  photoBusy.value = true
  error.value = null
  try {
    for (const file of files) {
      const r = await tm.client().addPhoto(name.value, file, file.name)
      if (tool.value) tool.value = { ...tool.value, images: r.images ?? tool.value.images }
    }
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    photoBusy.value = false
    void tm.refresh()
  }
}

async function deletePhoto(fn: string) {
  error.value = null
  try {
    const r = await tm.client().deletePhoto(name.value, fn)
    if (tool.value) tool.value = { ...tool.value, images: r.images ?? [] }
    void tm.refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

function cancel() {
  router.push(`/assets/toolheads/${encodeURIComponent(name.value)}`)
}
</script>

<template>
  <div class="view">
    <RouterLink :to="`/assets/toolheads/${encodeURIComponent(name)}`" class="back">‹ {{ name }}</RouterLink>
    <div class="view-head">
      <h1>Edit {{ name }}</h1>
      <p>Changes are checked against your Klipper config when you save, and go live at the next Klipper restart.</p>
    </div>

    <RestartBanner />

    <p v-if="!t && !error" class="muted">Loading…</p>
    <template v-if="t && opt">
      <div class="tabs" role="tablist">
        <button v-for="[k, l] in ([['settings', 'Settings'], ['controls', `Controls (${controls.length})`], ['macros', `Macros (${macroCount})`]] as const)" :key="k" type="button" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="tab = k">{{ l }}</button>
      </div>

      <div v-show="tab === 'settings'" class="stack">
        <RsPanel title="Tool" panel-id="edit.tool">
          <div class="tm-row">
            <div class="tm-fld">
              <label for="ed-name">Name</label>
              <input id="ed-name" v-model="f.new_name" class="tm-in" maxlength="24" />
              <span class="tm-hint">Renaming changes the name used in G-code and slicers. Its photos and care tasks follow it.</span>
            </div>
            <div class="tm-fld">
              <label for="ed-kind">Kind</label>
              <input id="ed-kind" class="tm-in" :value="`${t.kind} (${String(t.type).toLowerCase()})`" disabled />
              <span class="tm-hint">Slot {{ t.slot }}. The kind can't change; add a new tool instead.</span>
            </div>
          </div>
          <div class="tm-fld">
            <label for="ed-notes">Notes</label>
            <textarea id="ed-notes" v-model="f.notes" class="tm-ta" maxlength="1000" placeholder="Wiring, supplier, settings that worked…" />
            <span class="tm-hint">Shown on the tool's page. Not sent to Klipper.</span>
          </div>
        </RsPanel>

        <RsPanel v-if="t.type === 'POWERED'" title="Power limits" panel-id="edit.limits">
          <p class="tm-hint">Outputs: {{ wiring }}. Percentages are of the output's full range. Start low and raise them while watching the tool.</p>
          <div class="tm-row">
            <label class="tm-fld"><span class="tm-lbl">Power cap %</span><input v-model="f.cap" class="tm-in" type="number" min="5" max="100" /><span class="tm-hint">Hard ceiling, whatever the G-code asks for.</span></label>
            <label class="tm-fld"><span class="tm-lbl">Minimum power %</span><input v-model="f.min" class="tm-in" type="number" min="0" max="100" /><span class="tm-hint">Output at the lowest non-zero request.</span></label>
            <label class="tm-fld"><span class="tm-lbl">Idle level %</span><input v-model="f.idle" class="tm-in" type="number" min="0" max="100" /><span class="tm-hint">Output when the tool is off. 0 unless the driver needs a neutral signal.</span></label>
            <label class="tm-fld"><span class="tm-lbl">Max time on (s)</span><input v-model="f.max_on_s" class="tm-in" type="number" min="1" max="3600" /><span class="tm-hint">Watchdog: cut after this long without a new power command.</span></label>
            <label class="tm-fld"><span class="tm-lbl">S value for full power</span><input v-model="f.s_max" class="tm-in" type="number" min="1" /><span class="tm-hint">M3 S is scaled against this (1000: S1000 is 100%).</span></label>
          </div>
        </RsPanel>

        <RsPanel title="Materials" panel-id="edit.materials">
          <p v-if="t.type === 'DEPOSITION'" class="tm-hint">Print-head materials come from the tool it copies. Adjust temperatures and offsets here.</p>
          <MaterialsTable :rows="rows" :type="String(t.type)" :names="names" :editable="t.type !== 'DEPOSITION'" @add="addRow" @remove="removeRow" />
          <div v-if="t.type !== 'DEPOSITION'" class="tm-fld">
            <label for="ed-check">Pre-job checklist (one item per line)</label>
            <textarea id="ed-check" v-model="f.checklist" class="tm-ta" />
            <span class="tm-hint">Shown as a list to confirm before every job with this tool.</span>
          </div>
        </RsPanel>

        <RsPanel title="Contacts this tool uses" panel-id="edit.contacts">
          <p class="tm-hint">Select every contact the tool connects to, so its page and the pin map are complete. The inked ones its outputs drive are fixed.</p>
          <ToolConnector v-model="f.contacts" :contacts="opt.contacts" :locked="locked" pickable />
          <p class="tm-hint">{{ [...new Set([...f.contacts, ...locked])].length }} of 21 contacts: {{ [...new Set([...f.contacts, ...locked])].sort((a, b) => a - b).join(', ') || 'none' }}</p>
        </RsPanel>

        <RsPanel title="Photos" panel-id="edit.photos">
          <div class="photos">
            <figure v-for="p in photos" :key="p.fn">
              <img :src="p.url" :alt="`${name} photo`" />
              <button type="button" class="tm-link danger" @click="deletePhoto(p.fn)">Delete</button>
            </figure>
            <label class="addphoto" :class="{ busy: photoBusy }">
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple :disabled="photoBusy || photos.length >= 6" @change="addPhotos" />
              <span>{{ photoBusy ? 'Uploading…' : photos.length >= 6 ? '6 photos is the most' : '+ Add photos' }}</span>
            </label>
          </div>
          <p class="tm-hint">Up to 6. Saved straight away, outside the config folder so backups stay small.</p>
        </RsPanel>
      </div>

      <RsPanel v-show="tab === 'controls'" title="Controls" panel-id="edit.controls">
        <ItemsPanel kind="control" :list="controls" :ctx="{ tool: name }" :tool-name="name" :options="opt" :pins-taken="[t.new_pin, t.new_enable_pin].filter((p): p is string => !!p)" :pins-mine="savedPins" />
      </RsPanel>
      <RsPanel v-show="tab === 'macros'" title="Macros" panel-id="edit.macros">
        <ItemsPanel kind="macro" :list="macros" :controls="controls" :ctx="{ tool: name }" :tool-name="name" :options="opt" />
      </RsPanel>

      <p v-if="error" class="tm-err" role="alert">{{ error }}</p>
      <footer class="bar">
        <RsButton variant="primary" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save changes' }}</RsButton>
        <RsButton @click="cancel">{{ dirty ? 'Discard changes' : 'Back' }}</RsButton>
        <span class="tm-hint">{{ dirty ? 'Not saved yet.' : 'No changes.' }}</span>
        <RsButton class="del" variant="danger-outline" @click="remove">Delete tool</RsButton>
      </footer>
    </template>
    <p v-else-if="error" class="tm-err">{{ error }}</p>
  </div>
</template>

<style scoped>
.back { align-self: flex-start; font-size: var(--rs-text-sm); color: var(--rs-text-strong); text-decoration: none; }
.back:hover { text-decoration: underline; text-underline-offset: 3px; }
.muted { color: var(--rs-text-muted); }
.stack { display: flex; flex-direction: column; gap: var(--rs-gap); }
.stack :deep(.body) > * + *, :deep(.rs-panel .body) > * + * { margin-top: var(--rs-space-3); }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--rs-line-strong); }
.tabs button { padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--rs-text-muted); font: inherit; font-size: var(--rs-text-sm); cursor: pointer; margin-bottom: -1px; }
.tabs button.on { color: var(--rs-text-strong); border-bottom-color: var(--rs-ink); font-weight: var(--rs-weight-medium); }
.photos { display: flex; flex-wrap: wrap; gap: var(--rs-space-3); }
.photos figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.photos img { width: 120px; height: 120px; object-fit: cover; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line); }
.addphoto { display: grid; place-items: center; width: 120px; height: 120px; border: 1.5px dashed var(--rs-line-strong); border-radius: var(--rs-radius-md); font-size: var(--rs-text-sm); color: var(--rs-text-strong); cursor: pointer; text-align: center; padding: 8px; }
.addphoto input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.addphoto:hover { border-color: var(--rs-ink); }
.addphoto:focus-within { outline: 2px solid var(--rs-ink); }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.del { margin-left: auto; }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
