<script setup lang="ts">
/**
 * Kinds of tool: what step 1 of Add a toolhead offers under Additive,
 * Subtractive and Passive, and the starting values a new tool of each kind
 * gets (power cap, longest time on, materials, pre-job checklist).
 * What a kind needs is fixed once it exists; everything else can change.
 * Built-in kinds can be renamed but not removed; kinds in use stay.
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { BEHAVIOUR_TEXT, editToKind, kindToEdit, newKind, type KindEdit } from '@/toolmgr/form'
import { useToolMgrStore } from '@/stores/toolmgr'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const tm = useToolMgrStore()
const L = computed(() => tm.lists)
const edit = ref<KindEdit[]>([])
const open = ref<Record<number, boolean>>({})
const error = ref<string | null>(null)
const saving = ref(false)
const flash = ref<string | null>(null)

function reset() {
  edit.value = (L.value?.kinds ?? []).map(kindToEdit)
  open.value = {}
  error.value = null
}
onMounted(async () => {
  try {
    await tm.loadLists()
    reset()
  } catch (e) {
    error.value = (e as Error).message
  }
})
const dirty = computed(() => !!L.value && JSON.stringify(edit.value.map(editToKind)) !== JSON.stringify(L.value.kinds.map((k) => editToKind(kindToEdit(k)))))
const builtin = (k: KindEdit) => !!k.id && (L.value?.builtin_kinds ?? []).includes(k.id)
const users = (k: KindEdit) => (k.id ? (L.value?.in_use.kinds[k.id] ?? []) : [])
const inCat = (cat: string) => edit.value.map((k, i) => ({ k, i })).filter(({ k }) => k.category === cat)

function add(cat: string) {
  edit.value.push(newKind(cat, L.value?.category_behaviours[cat]?.[0] ?? 'PASSIVE'))
  open.value = { ...open.value, [edit.value.length - 1]: true }
}
function remove(i: number) {
  edit.value.splice(i, 1)
  open.value = {}
}
async function save() {
  saving.value = true
  error.value = null
  try {
    await tm.saveLists({ kinds: edit.value.map(editToKind) })
    reset()
    flash.value = 'Kinds of tool saved. Add a toolhead uses them straight away.'
    setTimeout(() => (flash.value = null), 6000)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
const starting = (k: KindEdit) =>
  k.behaviour === 'PRINT_HEAD'
    ? 'Copies an existing print head'
    : [k.behaviour === 'POWERED' && `cap ${k.cap}%`, k.mats.length && `${k.mats.length} material${k.mats.length === 1 ? '' : 's'}`, k.checklist && `${k.checklist.split('\n').filter(Boolean).length} checks`].filter(Boolean).join(' · ') || 'No starting values'
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Kinds of tool</h1>
        <p>Step 1 of Add a toolhead asks Additive, Subtractive or Passive, then offers the kinds listed under it. Each kind's starting values fill in a new tool's power cap, materials and pre-job checklist.</p>
      </div>
      <div class="acts">
        <RsButton variant="primary" :disabled="!dirty || saving" @click="save">{{ saving ? 'Saving…' : 'Save kinds of tool' }}</RsButton>
        <RsButton :disabled="!dirty" @click="reset">Undo changes</RsButton>
      </div>
    </div>
    <p v-if="flash" class="sx-flash" role="status">{{ flash }}</p>
    <p v-if="error" class="tm-err" role="alert">{{ error }}</p>
    <p v-if="!L" class="muted">{{ error ? '' : 'Loading…' }}</p>

    <template v-else>
    <template v-for="cat in L.categories" :key="cat.value">
      <h2 class="gh"><span>{{ cat.label }}</span><span class="rs-rule leader" /></h2>
      <p class="tm-hint cath">{{ cat.help }}</p>
      <section v-for="{ k, i } in inCat(cat.value)" :key="i" class="sx-fold" :class="{ open: open[i] }">
        <button type="button" class="fh" :aria-expanded="!!open[i]" @click="open = { ...open, [i]: !open[i] }">
          <span class="sx-chev" />
          <span class="who"><span class="ft">{{ k.label || 'New kind' }}</span><span class="fm">{{ BEHAVIOUR_TEXT[k.behaviour] }} · {{ starting(k) }}</span></span>
          <span class="fr">
            <span v-if="builtin(k)" class="sx-tag plain">Built in</span>
            <span v-if="users(k).length" class="fm">{{ users(k).join(', ') }}</span>
          </span>
        </button>
        <div v-show="open[i]" class="fb">
          <div class="tm-row">
            <label class="tm-fld"><span class="tm-lbl">Name</span><input v-model="k.label" class="tm-in" maxlength="60" placeholder="Paste or glue dispenser" /></label>
            <label class="tm-fld">
              <span class="tm-lbl">It needs</span>
              <select v-if="k.isNew" v-model="k.behaviour" class="tm-sel"><option v-for="b in L!.category_behaviours[cat.value]" :key="b" :value="b">{{ BEHAVIOUR_TEXT[b] }}</option></select>
              <input v-else class="tm-in" :value="BEHAVIOUR_TEXT[k.behaviour]" disabled />
            </label>
          </div>
          <label class="tm-fld"><span class="tm-lbl">Help shown in the wizard</span><input v-model="k.help" class="tm-in" maxlength="200" /></label>

          <fieldset v-if="k.behaviour !== 'PRINT_HEAD'" class="tm-set">
            <legend>Starting values for new tools of this kind</legend>
            <div v-if="k.behaviour === 'POWERED'" class="tm-row">
              <label class="tm-fld"><span class="tm-lbl">Power cap %</span><input v-model="k.cap" class="tm-in" type="number" min="5" max="100" /></label>
              <label class="tm-fld"><span class="tm-lbl">Longest time on (s)</span><input v-model="k.max_on_s" class="tm-in" type="number" min="1" max="3600" /><span class="tm-hint">Switched off after this long without a new command.</span></label>
            </div>
            <span class="tm-lbl">Materials</span>
            <table class="mats">
              <thead><tr><th>Material</th><th v-if="k.behaviour === 'POWERED'">Power %</th><th>Feed mm/min</th><th /></tr></thead>
              <tbody>
                <tr v-for="(m, j) in k.mats" :key="j">
                  <td><input v-model="m.name" class="tm-in code" maxlength="32" placeholder="PLYWOOD" :aria-label="`Material ${j + 1}`" @input="m.name = m.name.toUpperCase()" /></td>
                  <td v-if="k.behaviour === 'POWERED'"><input v-model="m.power" class="tm-in num" type="number" min="0" max="100" :aria-label="`${m.name || 'material'} power`" /></td>
                  <td><input v-model="m.feed" class="tm-in num" type="number" min="1" :aria-label="`${m.name || 'material'} feed`" /></td>
                  <td><button type="button" class="tm-link danger" @click="k.mats.splice(j, 1)">Remove</button></td>
                </tr>
                <tr v-if="!k.mats.length"><td colspan="4" class="tm-hint">No materials: a new tool starts with an empty table.</td></tr>
              </tbody>
            </table>
            <button type="button" class="tm-link add" @click="k.mats.push({ name: '', power: 50, feed: 600 })">+ Add a material</button>
            <label class="tm-fld"><span class="tm-lbl">Pre-job checklist, one per line</span><textarea v-model="k.checklist" class="tm-ta" rows="3" /><span class="tm-hint">Asked before every job with the tool.</span></label>
          </fieldset>

          <div class="tm-actions">
            <span class="tm-hint">{{ builtin(k) ? 'Built-in kinds can be renamed, not removed.' : users(k).length ? `Used by ${users(k).join(', ')}: change those tools first to remove it.` : 'Not used by any tool yet.' }}</span>
            <span class="grow" />
            <button type="button" class="tm-link danger" :disabled="builtin(k) || users(k).length > 0" @click="remove(i)">Remove</button>
          </div>
        </div>
      </section>
      <button type="button" class="tm-link add" @click="add(cat.value)">+ Add {{ cat.value === 'additive' ? 'an' : 'a' }} {{ cat.label.toLowerCase() }} kind</button>
    </template>
    </template>
  </div>
</template>

<style scoped>
.gh { display: flex; align-items: center; gap: var(--rs-space-3); margin: var(--rs-space-4) 0 0; padding: 0 var(--rs-space-1); font-size: var(--rs-text-md); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.leader { flex: 1; }
.cath { margin: -6px 0 0; padding: 0 var(--rs-space-1); }
.who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.add { align-self: flex-start; }
.grow { flex: 1; }
.mats { border-collapse: collapse; width: auto; }
.mats th { text-align: left; font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 0 6px 6px 0; }
.mats td { padding: 3px 6px 3px 0; }
.mats .code { width: 200px; }
.mats .num { width: 110px; text-align: right; }
.tm-link:disabled { color: var(--rs-text-muted); text-decoration: none; cursor: not-allowed; opacity: 0.6; }
@media (max-width: 560px) {
  .mats .code { width: 130px; }
  .mats .num { width: 80px; }
}
</style>
