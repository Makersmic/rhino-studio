<script setup lang="ts">
/**
 * Settings / Slice profiles (Phase 1, Tool Manager 1.8): every profile on the
 * Rhino. Rename, notes, delete (undo for 30 days), the last 5 revisions with
 * Go back, export and import. Settings themselves are edited in Prepare.
 */
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import { useSliceProfilesStore } from '@/stores/sliceProfiles'
import { useMachineStore } from '@/stores/machine'
import type { Process } from '@/slicer/types'
import type { SliceProfile } from '@/slicer/sliceProfiles'

const store = useSliceProfilesStore()
const machine = useMachineStore()
onMounted(() => void store.load())

const PROC: Record<Process, string> = { fdm: '3D print', laser: 'Laser', dragknife: 'Drag knife', cnc: 'CNC' }
const groups = computed(() =>
  (Object.keys(PROC) as Process[])
    .map((p) => ({ process: p, label: PROC[p], items: store.profiles.filter((x) => x.process === p).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length),
)
const when = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const summary = (h: Record<string, unknown>) =>
  Object.entries(h)
    .map(([k, v]) => {
      const lbl: Record<string, string> = { nozzle: 'nozzle', layerHeight: 'layer', walls: 'walls', infill: 'infill', speed: 'mm/s', power: 'power', feed: 'mm/min', passes: 'passes', depth: 'depth', toolDiameter: 'tool', stepDown: 'step down' }
      const n = typeof v === 'number' && (k === 'infill' || k === 'power') && v <= 1 ? `${Math.round(v * 100)}%` : String(v)
      return k === 'speed' ? `${n} mm/s` : k === 'feed' ? `${n} mm/min` : `${lbl[k] ?? k} ${n}`
    })
    .join(' · ')

const busy = ref<string | null>(null)
const err = ref<string | null>(null)
const note = ref<string | null>(null)
async function run(key: string, fn: () => Promise<unknown>) {
  busy.value = key
  err.value = null
  note.value = null
  try {
    await fn()
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = null
  }
}

// rename and notes
const editing = ref<string | null>(null)
const form = ref({ name: '', notes: '' })
function edit(p: (typeof store.profiles)[number]) {
  editing.value = p.id
  form.value = { name: p.name, notes: p.notes }
  open.value = null
}
const saveEdit = (p: (typeof store.profiles)[number]) =>
  run(p.id, async () => {
    if (!p.settings) throw new Error('Reload the page and try again')
    await store.save(p.id, { name: form.value.name.trim(), notes: form.value.notes, engine: p.engine, process: p.process, toolhead: p.toolhead, material: p.material, settings: p.settings }, p.rev)
    editing.value = null
  })

// history
const open = ref<string | null>(null)
const revs = ref<SliceProfile[]>([])
const showHistory = (id: string) =>
  run(id, async () => {
    if (open.value === id) return void (open.value = null)
    revs.value = await store.history(id)
    open.value = id
    editing.value = null
  })
const goBack = (id: string, rev: number) =>
  run(id, async () => {
    await store.revert(id, rev)
    revs.value = await store.history(id)
    note.value = `Revision ${rev} is the newest again; what it replaced is kept in the history.`
  })
const remove = (p: (typeof store.profiles)[number]) =>
  run(p.id, async () => {
    await store.remove(p.id)
    note.value = `${p.name} deleted. It stays below for 30 days if you want it back.`
  })

// import
const fileIn = ref<HTMLInputElement | null>(null)
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  await run('import', async () => {
    let data: object
    try {
      data = JSON.parse(await f.text()) as object
    } catch {
      throw new Error(`${f.name} isn’t a profiles export`)
    }
    const added = await store.importFile(data)
    note.value = `Imported ${added.length}: ${added.map((a) => a.name).join(', ')}.`
  })
}
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Slice profiles" panel-id="settings.profiles" class="wide" :status="store.online ? `${store.profiles.length} on the Rhino` : undefined">
        <p v-if="!machine.online" class="muted small">Profiles show once the machine is connected.</p>
        <p v-else-if="store.available === false" class="msg">Profiles on the Rhino need Tool Manager 1.8. Until then Prepare remembers settings for this session only.</p>
        <p v-else-if="store.error" class="msg bad" role="alert">{{ store.error }}</p>
        <template v-else>
          <div class="bar">
            <p class="muted small lead">Saved on the Rhino in <code>config/myrhino/slice_profiles.json</code>, so backups include them. Change the settings themselves in Job setup.</p>
            <div class="row">
              <a v-if="store.profiles.length && store.exportUrl()" class="btnlink" :href="store.exportUrl()!" download>Export all</a>
              <RsButton size="sm" :disabled="busy === 'import'" @click="fileIn?.click()">{{ busy === 'import' ? 'Importing…' : 'Import…' }}</RsButton>
              <input ref="fileIn" type="file" accept=".json,application/json" class="visually-hidden" @change="onFile" />
            </div>
          </div>
          <p v-if="note" class="msg" role="status">{{ note }}</p>
          <p v-if="err" class="msg bad" role="alert">{{ err }}</p>

          <p v-if="!store.profiles.length" class="empty">No profiles yet. In Job setup, change a few settings and press <strong>Save as new</strong>; it lands here.</p>

          <section v-for="g in groups" :key="g.process" class="grp">
            <h3 class="sub-h">{{ g.label }} <span class="count">{{ g.items.length }}</span></h3>
            <ul class="list">
              <li v-for="p in g.items" :key="p.id">
                <div class="main">
                  <template v-if="editing !== p.id">
                    <span class="name">{{ p.name }}</span>
                    <span class="meta">
                      {{ p.engine === 'prusa' ? 'PrusaSlicer' : 'Kiri:Moto' }}<template v-if="p.toolhead"> · {{ p.toolhead }} only</template><template v-if="p.material"> · {{ p.material }}</template>
                      · revision {{ p.rev }}, {{ when(p.updated) }}
                    </span>
                    <span v-if="summary(p.header)" class="meta mono">{{ summary(p.header) }}</span>
                    <span v-if="p.notes" class="meta notes">{{ p.notes }}</span>
                  </template>
                  <form v-else class="editf" @submit.prevent="saveEdit(p)">
                    <label class="field"><span>Name</span><input v-model="form.name" maxlength="60" /></label>
                    <label class="field"><span>Notes</span><textarea v-model="form.notes" rows="2" maxlength="2000" /></label>
                    <div class="row">
                      <RsButton size="sm" variant="primary" type="submit" :disabled="busy === p.id || !form.name.trim()">Save</RsButton>
                      <RsButton size="sm" variant="quiet" @click="editing = null">Cancel</RsButton>
                    </div>
                  </form>
                </div>
                <div v-if="editing !== p.id" class="acts">
                  <RsButton size="sm" variant="quiet" @click="edit(p)">Rename</RsButton>
                  <RsButton size="sm" variant="quiet" :aria-expanded="open === p.id" @click="showHistory(p.id)">History</RsButton>
                  <a class="quietlink" :href="store.exportUrl(p.id)!" download>Export</a>
                  <RsButton size="sm" variant="danger-outline" :disabled="busy === p.id" @click="remove(p)">Delete</RsButton>
                </div>
                <div v-if="open === p.id" class="hist">
                  <p v-if="!revs.length" class="muted small">No earlier revisions yet.</p>
                  <ul v-else>
                    <li v-for="r in revs" :key="r.rev">
                      <span class="mono">Revision {{ r.rev }}</span>
                      <span class="muted small">{{ when(r.updated) }} · {{ summary(r.header) }}</span>
                      <RsButton size="sm" variant="quiet" :disabled="busy === p.id" @click="goBack(p.id, r.rev)">Go back to this</RsButton>
                    </li>
                  </ul>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="store.deleted.length" class="grp">
            <h3 class="sub-h">Deleted in the last 30 days</h3>
            <ul class="list">
              <li v-for="d in store.deleted" :key="d.id">
                <div class="main">
                  <span class="name">{{ d.name }}</span>
                  <span class="meta">{{ PROC[d.process] }} · deleted {{ when(d.deleted_at) }}</span>
                </div>
                <div class="acts"><RsButton size="sm" :disabled="busy === d.id" @click="run(d.id, () => store.undelete(d.id))">Bring back</RsButton></div>
              </li>
            </ul>
          </section>
        </template>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--rs-space-3); margin-bottom: var(--rs-space-3); }
.lead { margin: 0; max-width: 640px; }
.grp { margin-top: var(--rs-space-4); }
.count { font-weight: 400; color: var(--rs-text-muted); font-size: var(--rs-text-sm); margin-left: 4px; }
.list { list-style: none; margin: 0; padding: 0; }
.list > li { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--rs-space-3); padding: var(--rs-space-3) 0; border-top: 1px solid var(--rs-line); }
.main { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.name { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.notes { font-style: italic; }
.mono { font-family: var(--rs-font-code); }
.acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); }
.hist { flex-basis: 100%; padding: var(--rs-space-2) var(--rs-space-3); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); }
.hist ul { list-style: none; margin: 0; padding: 0; }
.hist li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: 4px 0; }
.editf { display: flex; flex-direction: column; gap: 4px; max-width: 520px; }
.editf textarea { padding: 8px 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface-2); color: var(--rs-text-strong); font: inherit; }
.empty { color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.btnlink, .quietlink { font-size: var(--rs-text-sm); color: var(--rs-text-strong); text-decoration: underline; text-underline-offset: 3px; }
.btnlink { padding: 6px 12px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); text-decoration: none; }
</style>
