<script setup lang="ts">
/**
 * Assets › Parts › Bits: the spindle's bits, kept on the Rhino (Tool Manager 1.9.26). Job setup's CNC tool comes from
 * here, and spindle tuning (Tune HotJoe) is kept per bit. Logic in src/toolmgr/bits.ts.
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useToolMgrStore } from '@/stores/toolmgr'
import { BIT_TYPES, bitsProblem, newBit, type Bit } from '@/toolmgr/bits'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const tm = useToolMgrStore()
const bits = ref<Bit[]>([])
const ready = ref(false)
const supported = ref(true)
const loadError = ref<string | null>(null)
const msg = ref<{ ok: boolean; text: string } | null>(null)
const busy = ref(false)

function reset() {
  const l = tm.lists
  supported.value = !!l && Array.isArray(l.bits)
  bits.value = (l?.bits ?? []).map((b) => ({ ...b, note: b.note ?? '' }))
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
const problem = computed(() => bitsProblem(bits.value))
function add() {
  let n = bits.value.length + 1
  while (bits.value.some((b) => b.name === `bit${n}`)) n++
  bits.value.push(newBit(n))
}
async function save() {
  if (problem.value) return
  busy.value = true
  msg.value = null
  try {
    await tm.saveLists({ bits: bits.value.map((b) => ({ ...b, name: b.name.trim() })) })
    reset()
    msg.value = { ok: true, text: 'Bits saved' }
  } catch (e) {
    msg.value = { ok: false, text: (e as Error).message }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Bits</h1>
        <p>The spindle’s bits. Job setup offers them for a CNC job, and Tune HotJoe keeps its results for each one.</p>
      </div>
    </div>
    <p v-if="loadError" class="tm-err">{{ loadError }}</p>
    <p v-else-if="!ready" class="muted">Loading…</p>
    <p v-else-if="!supported" class="muted">Bits need Tool Manager 1.9.26 on the Rhino.</p>

    <section v-else class="card">
      <h2>Your bits</h2>
      <p v-if="!bits.length" class="muted small">No bits yet. Add the ones you use: a name you’ll recognise (no spaces), and the size from the packet or measured.</p>
      <div v-else class="bits">
        <div class="row head" aria-hidden="true"><span>Name</span><span>Type</span><span>Diameter (mm)</span><span>Flutes</span><span>Cutting length (mm)</span><span>Note</span><span /></div>
        <div v-for="(b, i) in bits" :key="i" class="row">
          <label><span class="ph">Name</span><input v-model="b.name" class="tm-in" aria-label="Name" maxlength="40" /></label>
          <label><span class="ph">Type</span><select v-model="b.type" class="tm-sel" aria-label="Type"><option v-for="t in BIT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option></select></label>
          <label><span class="ph">Diameter (mm)</span><input v-model.number="b.diameter" class="tm-in" type="number" step="0.001" min="0.1" aria-label="Diameter (mm)" /></label>
          <label><span class="ph">Flutes</span><input v-model.number="b.flutes" class="tm-in" type="number" step="1" min="1" max="8" aria-label="Flutes" /></label>
          <label><span class="ph">Cutting length (mm)</span><input v-model.number="b.length" class="tm-in" type="number" step="0.5" min="0.5" aria-label="Cutting length (mm)" /></label>
          <label><span class="ph">Note</span><input v-model="b.note" class="tm-in" maxlength="80" aria-label="Note" placeholder="Up-cut, for MDF…" /></label>
          <RsButton size="sm" variant="quiet" :aria-label="`Remove ${b.name}`" @click="bits.splice(i, 1)">Remove</RsButton>
        </div>
      </div>
      <p v-if="problem" class="tm-err">{{ problem }}</p>
      <div class="acts">
        <RsButton @click="add">Add a bit</RsButton>
        <RsButton variant="primary" :disabled="!!problem || busy" @click="save">{{ busy ? 'Saving…' : 'Save bits' }}</RsButton>
        <span v-if="msg" :class="msg.ok ? 'muted' : 'tm-err'" role="status">{{ msg.text }}</span>
      </div>
      <p class="muted small">Removing a bit keeps its tuning on the Rhino; add it back with the same name to use it again.</p>
    </section>
  </div>
</template>

<style scoped>
.bits { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: minmax(90px, 1.2fr) minmax(100px, 1fr) repeat(3, minmax(70px, 0.8fr)) minmax(100px, 1.6fr) 84px; gap: 8px; align-items: center; }
.row > * { min-width: 0; }
.row label { display: flex; flex-direction: column; gap: 4px; }
.row input, .row select { width: 100%; box-sizing: border-box; }
.row.head span, .ph { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.ph { display: none; }
.acts { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); align-items: center; margin-top: var(--rs-space-3); }
.small { font-size: var(--rs-text-xs); }
@media (max-width: 760px) {
  .row { grid-template-columns: 1fr 1fr; padding-bottom: 10px; border-bottom: 1px solid var(--rs-line); }
  .row.head { display: none; }
  .ph { display: block; }
}
</style>
