<script setup lang="ts">
/**
 * The lists a task chooses from: machine areas (the "For" list), kinds of
 * work, and the four priorities (rename only). Each saves on its own; the
 * Portal refuses to remove anything tasks still use.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import type { PortalClient } from '@/portal/client'
import { useMaintenanceStore } from '@/stores/maintenance'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const care = useMaintenanceStore()
const L = computed(() => care.lists)
const areas = ref<{ id: string; label: string }[]>([])
const types = ref<{ id: string; label: string }[]>([])
const prio = reactive<Record<string, string>>({})
const msg = reactive<Record<string, { ok: boolean; text: string } | null>>({ areas: null, types: null, prio: null })
const busy = ref('')
const loadError = ref<string | null>(null)

function reset() {
  if (!L.value) return
  areas.value = L.value.areas.map((a) => ({ ...a }))
  types.value = Object.entries(L.value.types).map(([id, label]) => ({ id, label }))
  Object.assign(prio, L.value.priorities)
}
onMounted(async () => {
  try {
    await care.loadLists()
    reset()
  } catch (e) {
    loadError.value = (e as Error).message
  }
})

// how many tasks are in each area (from the overview)
const areaUse = computed(() => {
  const n: Record<string, number> = {}
  for (const t of care.overview?.tasks ?? []) if (t.asset.startsWith('machine:') && !t.archived) n[t.asset.slice(8)] = (n[t.asset.slice(8)] ?? 0) + 1
  return n
})

async function run(key: 'areas' | 'types' | 'prio', fn: (c: PortalClient) => Promise<unknown>, ok: string) {
  busy.value = key
  msg[key] = null
  try {
    await care.write(fn)
    reset()
    msg[key] = { ok: true, text: ok }
  } catch (e) {
    msg[key] = { ok: false, text: (e as Error).message }
  } finally {
    busy.value = ''
  }
}
const saveAreas = () => run('areas', (c) => c.saveAreas(areas.value.filter((a) => a.label.trim())), 'Areas saved')
const saveTypes = () => run('types', (c) => c.saveMaintLists({ types: types.value.filter((t) => t.label.trim()) }), 'Kinds of work saved')
const savePrio = () => run('prio', (c) => c.saveMaintLists({ priorities: { ...prio } }), 'Priorities saved')
const plural = (n: number) => `${n} task${n === 1 ? '' : 's'}`
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Areas, kinds and priorities</h1>
        <p>The lists a task chooses from. Rename anything; remove only what no task uses.</p>
      </div>
    </div>
    <p v-if="loadError" class="tm-err">{{ loadError }}</p>
    <p v-else-if="!L" class="muted">Loading…</p>

    <div v-else class="cards">
      <section class="card">
        <h2>Machine areas</h2>
        <p class="tm-hint">Machine tasks are grouped by area: the “For” list of a task. An area with tasks can't be removed.</p>
        <ul class="ed">
          <li v-for="(a, i) in areas" :key="i">
            <input v-model="a.label" class="tm-in" maxlength="40" :aria-label="`Area ${i + 1}`" placeholder="New area" />
            <span class="use">{{ areaUse[a.id] ? plural(areaUse[a.id]!) : '' }}</span>
            <button type="button" class="tm-link danger" :disabled="!!areaUse[a.id]" :title="areaUse[a.id] ? 'Move or delete its tasks first' : ''" @click="areas.splice(i, 1)">Remove</button>
          </li>
        </ul>
        <footer class="tm-actions">
          <button type="button" class="tm-link" @click="areas.push({ id: '', label: '' })">+ Add an area</button>
          <span class="grow" />
          <span v-if="msg.areas" :class="msg.areas.ok ? 'tm-ok' : 'bad'">{{ msg.areas.text }}</span>
          <RsButton size="sm" variant="primary" :disabled="busy === 'areas'" @click="saveAreas">Save areas</RsButton>
        </footer>
      </section>

      <section class="card">
        <h2>Kinds of work</h2>
        <p class="tm-hint">Inspect, clean, lubricate…: the “Kind of work” list of a task.</p>
        <ul class="ed">
          <li v-for="(t, i) in types" :key="i">
            <input v-model="t.label" class="tm-in" maxlength="30" :aria-label="`Kind of work ${i + 1}`" placeholder="New kind of work" />
            <span class="use">{{ L.type_use[t.id] ? plural(L.type_use[t.id]!) : '' }}</span>
            <button type="button" class="tm-link danger" :disabled="!!L.type_use[t.id]" :title="L.type_use[t.id] ? 'Tasks use it: rename it instead' : ''" @click="types.splice(i, 1)">Remove</button>
          </li>
        </ul>
        <footer class="tm-actions">
          <button type="button" class="tm-link" @click="types.push({ id: '', label: '' })">+ Add a kind of work</button>
          <span class="grow" />
          <span v-if="msg.types" :class="msg.types.ok ? 'tm-ok' : 'bad'">{{ msg.types.text }}</span>
          <RsButton size="sm" variant="primary" :disabled="busy === 'types'" @click="saveTypes">Save kinds of work</RsButton>
        </footer>
      </section>

      <section class="card">
        <h2>Priorities</h2>
        <p class="tm-hint">Four levels, most urgent last. They order the Mainsail reminder; rename them to suit you.</p>
        <div class="prio">
          <label v-for="(k, i) in Object.keys(prio)" :key="k" class="tm-fld">
            <span class="tm-lbl"><span class="lvl" :style="{ '--n': i + 1 }" />{{ k.charAt(0).toUpperCase() + k.slice(1) }}</span>
            <input v-model="prio[k]" class="tm-in" maxlength="20" />
          </label>
        </div>
        <footer class="tm-actions">
          <span class="grow" />
          <span v-if="msg.prio" :class="msg.prio.ok ? 'tm-ok' : 'bad'">{{ msg.prio.text }}</span>
          <RsButton size="sm" variant="primary" :disabled="busy === 'prio'" @click="savePrio">Save priorities</RsButton>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cards { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: start; }
.card { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-4) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.card h2 { margin: 0; font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.ed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ed li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--rs-space-3); align-items: center; }
.use { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.grow { flex: 1; }
.bad { color: var(--rs-danger); font-size: var(--rs-text-sm); }
.tm-link:disabled { color: var(--rs-text-muted); text-decoration: none; cursor: not-allowed; opacity: 0.6; }
.prio { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--rs-space-3); }
/* priority level as 1-4 filled bars: a visual rank without colour */
.lvl { display: inline-block; width: 18px; height: 10px; margin-right: 6px; vertical-align: -1px; background: linear-gradient(90deg, var(--rs-ink) calc(var(--n) * 25%), var(--rs-line) 0); border-radius: 2px; }
</style>
