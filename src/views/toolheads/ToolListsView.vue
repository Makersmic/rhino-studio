<script setup lang="ts">
/**
 * The other lists Add a toolhead offers: material names (suggested in the
 * materials tables, by category; any other name can still be typed), the
 * nozzle sizes for a new print head, and how system hardware is grouped.
 * Each saves on its own.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import TagInput from '@/components/TagInput.vue'
import { useToolMgrStore } from '@/stores/toolmgr'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const tm = useToolMgrStore()
const L = computed(() => tm.lists)
const mats = reactive<Record<string, string[]>>({})
const nozzles = ref<string[]>([])
const cats = ref<{ id: string; label: string }[]>([])
const msg = reactive<Record<string, { ok: boolean; text: string } | null>>({ mats: null, nz: null, cats: null })
const busy = ref('')
const loadError = ref<string | null>(null)
const ready = ref(false)

function reset() {
  if (!L.value) return
  for (const c of L.value.categories) mats[c.value] = [...(L.value.materials[c.value] ?? [])]
  nozzles.value = L.value.nozzles.map(String)
  cats.value = L.value.hw_categories.map((c) => ({ ...c }))
  ready.value = true
}
onMounted(async () => {
  try {
    await tm.loadLists()
    reset()
  } catch (e) {
    loadError.value = (e as Error).message
  }
})

async function run(key: 'mats' | 'nz' | 'cats', body: Record<string, unknown>, ok: string) {
  busy.value = key
  msg[key] = null
  try {
    await tm.saveLists(body)
    reset()
    msg[key] = { ok: true, text: ok }
  } catch (e) {
    msg[key] = { ok: false, text: (e as Error).message }
  } finally {
    busy.value = ''
  }
}
const saveMats = () => run('mats', { materials: Object.fromEntries(Object.entries(mats).map(([k, v]) => [k, v.join(', ')])) }, 'Material names saved')
const saveNz = () => run('nz', { nozzles: [...nozzles.value].sort((a, b) => Number(a) - Number(b)).join(', ') }, 'Nozzle sizes saved')
const saveCats = () => run('cats', { hw_categories: cats.value.filter((c) => c.label.trim()) }, 'Categories saved')
const catUse = (id: string) => (id ? (L.value?.in_use.hw_categories[id] ?? []) : [])
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Materials, nozzles, categories</h1>
        <p>The other lists Add a toolhead and System hardware choose from.</p>
      </div>
    </div>
    <p v-if="loadError" class="tm-err">{{ loadError }}</p>
    <p v-else-if="!L || !ready" class="muted">Loading…</p>

    <template v-else>
      <section class="card">
        <h2>Material names</h2>
        <p class="tm-hint">Suggested in the materials tables of Add a toolhead and Edit, by category. Any other name can still be typed. Letters, digits and _; spaces become _.</p>
        <div class="mrow">
          <div v-for="c in L.categories" :key="c.value" class="tm-fld">
            <span class="tm-lbl">{{ c.label }} <span class="n">{{ mats[c.value]?.length ?? 0 }}</span></span>
            <TagInput v-model="mats[c.value]!" :label="`${c.label} material names`" upper placeholder="Add a material" />
          </div>
        </div>
        <footer class="tm-actions">
          <span class="grow" />
          <span v-if="msg.mats" :class="msg.mats.ok ? 'tm-ok' : 'bad'">{{ msg.mats.text }}</span>
          <RsButton size="sm" variant="primary" :disabled="busy === 'mats'" @click="saveMats">Save material names</RsButton>
        </footer>
      </section>

      <div class="two">
        <section class="card">
          <h2>Nozzle sizes</h2>
          <p class="tm-hint">Offered as tick boxes when you add a print head, in mm ({{ L.limits.nozzle?.[0] }} to {{ L.limits.nozzle?.[1] }}).</p>
          <TagInput v-model="nozzles" label="nozzle sizes" numeric placeholder="0.4" />
          <footer class="tm-actions">
            <span class="grow" />
            <span v-if="msg.nz" :class="msg.nz.ok ? 'tm-ok' : 'bad'">{{ msg.nz.text }}</span>
            <RsButton size="sm" variant="primary" :disabled="busy === 'nz'" @click="saveNz">Save nozzle sizes</RsButton>
          </footer>
        </section>

        <section class="card">
          <h2>System hardware categories</h2>
          <p class="tm-hint">How System hardware is grouped. A category with hardware in it can't be removed.</p>
          <ul class="ed">
            <li v-for="(c, i) in cats" :key="i">
              <input v-model="c.label" class="tm-in" maxlength="40" :aria-label="`Category ${i + 1}`" placeholder="New category" />
              <span class="use">{{ catUse(c.id).length ? `${catUse(c.id).length} in use` : '' }}</span>
              <button type="button" class="tm-link danger" :disabled="catUse(c.id).length > 0" @click="cats.splice(i, 1)">Remove</button>
            </li>
          </ul>
          <footer class="tm-actions">
            <button type="button" class="tm-link" @click="cats.push({ id: '', label: '' })">+ Add a category</button>
            <span class="grow" />
            <span v-if="msg.cats" :class="msg.cats.ok ? 'tm-ok' : 'bad'">{{ msg.cats.text }}</span>
            <RsButton size="sm" variant="primary" :disabled="busy === 'cats'" @click="saveCats">Save categories</RsButton>
          </footer>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.card { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-4) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); min-width: 0; }
.card h2 { margin: 0; font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.mrow { display: grid; gap: var(--rs-space-4); grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.n { margin-left: 4px; font-variant-numeric: tabular-nums; color: var(--rs-text-muted); font-weight: var(--rs-weight-body); }
.two { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
.ed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ed li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--rs-space-3); align-items: center; }
.use { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; }
.grow { flex: 1; }
.bad { color: var(--rs-danger); font-size: var(--rs-text-sm); }
.tm-link:disabled { color: var(--rs-text-muted); text-decoration: none; cursor: not-allowed; opacity: 0.6; }
</style>
