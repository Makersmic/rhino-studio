<script setup lang="ts">
/**
 * Status codes: the built-in ones the schedule works out by itself (rename
 * them, change their colour) and your own, set by hand on a task
 * (Pending - Waiting on parts). Each of yours answers four questions; folded,
 * its card says the answers in a line.
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { blankStatus, statusSummary } from '@/maintenance/edit'
import type { CustomStatus, StatusEdit } from '@/maintenance/types'
import { useMaintenanceStore } from '@/stores/maintenance'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const care = useMaintenanceStore()
const L = computed(() => care.lists)
const E = ref<StatusEdit | null>(null)
const open = ref<Record<number, boolean>>({})
const error = ref<string | null>(null)
const saving = ref(false)
const flash = ref<string | null>(null)

function reset() {
  if (!L.value) return
  E.value = JSON.parse(JSON.stringify(L.value.statuses)) as StatusEdit
  open.value = {}
  error.value = null
}
onMounted(async () => {
  try {
    await care.loadLists()
    reset()
  } catch (e) {
    error.value = (e as Error).message
  }
})
const dirty = computed(() => !!E.value && !!L.value && JSON.stringify(E.value) !== JSON.stringify(L.value.statuses))
const hex = (c: string) => L.value?.colors[c] ?? '#8d8f99'
const colours = computed(() => Object.keys(L.value?.colors ?? {}))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function add() {
  E.value!.custom.push(blankStatus())
  open.value = { ...open.value, [E.value!.custom.length - 1]: true }
}
function remove(i: number) {
  E.value!.custom.splice(i, 1)
  open.value = {}
}

async function save() {
  saving.value = true
  error.value = null
  try {
    await care.write((c) => c.saveStatuses(E.value!))
    reset()
    flash.value = 'Status codes saved'
    setTimeout(() => (flash.value = null), 5000)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
const use = (s: CustomStatus) => L.value?.status_use[s.id] ?? 0
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Status codes</h1>
        <p>A status code is set by hand on a task, like “Pending - Waiting on parts”. Answer four questions and the Portal applies the rules: where the task is listed, what happens to its schedule, when the status ends, and the extras.</p>
      </div>
      <div class="acts">
        <RsButton variant="primary" :disabled="!dirty || saving" @click="save">{{ saving ? 'Saving…' : 'Save status codes' }}</RsButton>
        <RsButton :disabled="!dirty" @click="reset">Undo changes</RsButton>
      </div>
    </div>
    <p v-if="flash" class="sx-flash" role="status">{{ flash }}</p>
    <p v-if="error" class="tm-err" role="alert">{{ error }}</p>
    <p v-if="!E" class="muted">Loading…</p>

    <template v-else>
      <h2 class="h2">Yours</h2>
      <section v-for="(s, i) in E.custom" :key="i" class="sx-fold sc" :class="{ open: open[i] }">
        <span class="tab" :style="{ background: hex(s.color) }" />
        <button type="button" class="fh" :aria-expanded="!!open[i]" @click="open = { ...open, [i]: !open[i] }">
          <span class="sx-chev" />
          <span class="who"><span class="ft">{{ s.label || 'New status code' }}</span><span class="fm">{{ statusSummary(s) }}</span></span>
          <span class="fr"><span v-if="use(s)" class="sx-count">{{ use(s) }}</span></span>
        </button>
        <div v-show="open[i]" class="fb">
          <div class="tm-row">
            <label class="tm-fld"><span class="tm-lbl">Name</span><input v-model="s.label" class="tm-in" maxlength="40" placeholder="Pending - Waiting on parts" /></label>
            <label class="tm-fld"><span class="tm-lbl">Colour</span><span class="cp"><span class="sw" :style="{ background: hex(s.color) }" /><select v-model="s.color" class="tm-sel"><option v-for="c in colours" :key="c" :value="c">{{ cap(c) }}</option></select></span></label>
          </div>
          <label class="tm-fld"><span class="tm-lbl">Description, shown when it's chosen</span><input v-model="s.help" class="tm-in" maxlength="200" /></label>
          <div class="q4">
            <fieldset class="tm-set">
              <legend>1. Where does the task show?</legend>
              <label v-for="(t, v) in L!.status_lists" :key="v" class="tm-radio" :class="{ on: s.list === v }"><input v-model="s.list" type="radio" :name="`list${i}`" :value="v" />{{ t }}</label>
            </fieldset>
            <fieldset class="tm-set">
              <legend>2. What happens to its schedule?</legend>
              <label v-for="(t, v) in L!.status_clock" :key="v" class="tm-radio" :class="{ on: s.clock === v }"><input v-model="s.clock" type="radio" :name="`clock${i}`" :value="v" />{{ t }}</label>
            </fieldset>
            <fieldset class="tm-set">
              <legend>3. When does it end by itself?</legend>
              <label v-for="(t, v) in L!.status_expiry" :key="v" class="tm-radio" :class="{ on: s.expiry === v }"><input v-model="s.expiry" type="radio" :name="`exp${i}`" :value="v" />{{ t }}</label>
              <label v-if="s.expiry === 'days'" class="tm-fld days"><span class="tm-lbl">Days</span><input v-model="s.expiry_days" class="tm-in" type="number" min="1" max="365" /></label>
              <span class="tm-hint">When it ends, the task goes back to its built-in status. Logging the task done also ends it.</span>
            </fieldset>
          </div>
          <fieldset class="tm-set">
            <legend>4. Also</legend>
            <div class="tm-row">
              <label class="tm-check"><input v-model="s.boot_prompt" type="checkbox" /><span>Keep it in the Mainsail reminder<br /><span class="tm-hint">The task still shows after a Klipper start when it's due.</span></span></label>
              <label class="tm-check"><input v-model="s.note_required" type="checkbox" /><span>A note is required<br /><span class="tm-hint">Whoever sets it says why: which parts, who, when.</span></span></label>
              <label class="tm-check"><input v-model="s.log_option" type="checkbox" /><span>Offer it in Log work<br /><span class="tm-hint">Next to Done and Skipped.</span></span></label>
            </div>
          </fieldset>
          <div class="tm-actions">
            <span class="tm-hint">{{ use(s) ? `Set on ${use(s)} task${use(s) === 1 ? '' : 's'} now: clear it from those first to remove it.` : 'Not set on any task.' }}</span>
            <span class="grow" />
            <button type="button" class="tm-link danger" :disabled="use(s) > 0" @click="remove(i)">Remove</button>
          </div>
        </div>
      </section>
      <button v-if="E.custom.length < 20" type="button" class="tm-link add" @click="add">+ Add a status code</button>

      <h2 class="h2">Built in</h2>
      <section class="card">
        <p class="tm-hint">Worked out from each task's schedule, the snooze and the pause switch. Rename them or change their colour; they can't be removed.</p>
        <ul class="sx-rows">
          <li v-for="(v, id) in E.builtin" :key="id" class="brow">
            <span class="sw" :style="{ background: hex(v.color) }" />
            <span class="code">{{ id }}</span>
            <input v-model="v.label" class="tm-in" maxlength="30" :aria-label="`Name shown for ${id}`" />
            <select v-model="v.color" class="tm-sel" :aria-label="`Colour for ${id}`"><option v-for="c in colours" :key="c" :value="c">{{ cap(c) }}</option></select>
            <span class="tm-hint">{{ L!.builtin_status_help[id] }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.h2 { margin: var(--rs-space-3) 0 0; padding: 0 var(--rs-space-1); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.sc { position: relative; overflow: hidden; }
.sc > .tab { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; }
.who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cp { display: flex; align-items: center; gap: 8px; }
.sw { width: 14px; height: 14px; border-radius: 3px; flex: none; }
.q4 { display: grid; gap: var(--rs-space-3); grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.days { max-width: 120px; }
.grow { flex: 1; }
.add { align-self: flex-start; }
.card { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-4) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.brow { display: grid; grid-template-columns: 14px 80px minmax(140px, 220px) 130px minmax(0, 1fr); gap: var(--rs-space-3); align-items: center; padding: var(--rs-space-2) 0; }
.code { font-family: var(--rs-font-code); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.tm-link:disabled { color: var(--rs-text-muted); text-decoration: none; cursor: not-allowed; }
@media (max-width: 760px) {
  .brow { grid-template-columns: 14px 1fr 1fr; }
  .brow .code { grid-column: 2 / span 2; }
  .brow .tm-hint { grid-column: 1 / -1; }
}
</style>
