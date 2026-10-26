<script setup lang="ts">
/**
 * Prepare: which slice profile these settings come from, whether they're saved
 * on the Rhino, and Save to profile / Save as new / Reset (Phase 1, Tool Manager 1.8).
 * Profiles live on the Rhino; nothing durable stays in this browser.
 */
import { computed, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsDialog from '@/components/RsDialog.vue'
import { usePrepareStore } from '@/stores/prepare'
import { useSliceProfilesStore } from '@/stores/sliceProfiles'
import { builtinProfile, engineOf, profilesFor, statusText } from '@/slicer/sliceProfiles'

const prep = usePrepareStore()
const store = useSliceProfilesStore()

const job = computed(() => prep.job)
const choices = computed(() => {
  const j = job.value
  if (!j) return []
  const engine = engineOf(j)
  return profilesFor([builtinProfile(j.process, engine), ...store.profiles], { process: j.process, engine, toolhead: j.toolhead, material: j.material || null })
})
const state = computed(() => prep.profileState)
const text = computed(() => (state.value ? statusText(state.value) : ''))
const changed = computed(() => !!state.value && (state.value.kind === 'changed' || (state.value.kind === 'builtin' && state.value.count > 0)))

const busy = ref(false)
const err = ref<string | null>(null)
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  err.value = null
  try {
    await fn()
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

// Save as new
const naming = ref(false)
const newName = ref('')
const onlyThisTool = ref(false)
function startNew() {
  const j = job.value
  newName.value = j ? `${j.material || j.toolhead} ${j.process === 'fdm' ? `${j.fdm.layerHeight} mm` : ''}`.trim().slice(0, 60) : ''
  onlyThisTool.value = false
  naming.value = true
}
const saveNew = () => run(async () => {
  await prep.saveAsNew(newName.value.trim(), onlyThisTool.value)
  naming.value = false
})
const keepMine = () => {
  if (job.value && prep.profile) job.value.profileRev = prep.profile.rev
}
// The one-time import asks in a prompt. Not now: never again on this browser. × or Esc: ask again next visit.
const askedThisVisit = ref(false)
const showImport = computed(() => store.online && !!store.importOffer && !askedThisVisit.value)
const importing = ref(false)
const imported = ref<number | null>(null)
const runImport = () => run(async () => {
  importing.value = true
  try {
    imported.value = await store.runImport()
    askedThisVisit.value = true
  } finally {
    importing.value = false
  }
})
</script>

<template>
  <div v-if="job" class="pbar">
    <!-- the one-time offer: settings this browser saved before profiles existed -->
    <RsDialog :open="showImport" title="Unsaved settings in this browser" :error="importing ? null : err" @close="askedThisVisit = true" @submit="runImport">
      <p class="dlg">Import them to the Rhino for future setups.</p>
      <template #actions>
        <RsButton variant="quiet" :disabled="busy" @click="store.dismissImport()">Not now</RsButton>
        <RsButton type="submit" variant="primary" :disabled="busy">{{ importing ? 'Importing…' : 'Import' }}</RsButton>
      </template>
    </RsDialog>
    <p v-if="imported != null" class="note" role="status">Imported: {{ imported }} profile{{ imported === 1 ? '' : 's' }} on the Rhino, named “Imported …”.</p>

    <div class="row top">
      <label class="pick">
        <span class="k">Profile</span>
        <select :value="job.profileId ?? ''" :disabled="busy || !store.online" aria-label="Slice profile" @change="prep.useProfile(($event.target as HTMLSelectElement).value)">
          <option v-for="p in choices" :key="p.id" :value="p.id">{{ p.name }}{{ p.toolhead ? ` · ${p.toolhead} only` : '' }}</option>
        </select>
      </label>
      <div class="acts">
        <RsButton v-if="changed && prep.profile" size="sm" variant="primary" :disabled="busy" @click="run(prep.saveToProfile)">Save to profile</RsButton>
        <RsButton v-if="store.online && (changed || state?.kind === 'saved')" size="sm" :disabled="busy" @click="startNew">Save as new</RsButton>
        <RsButton v-if="changed" size="sm" variant="quiet" :disabled="busy" @click="prep.resetToProfile()">Reset</RsButton>
      </div>
    </div>

    <p class="status" :class="state?.kind">
      <span class="dot" aria-hidden="true" />{{ text }}
      <template v-if="store.available === false"> · Profiles on the Rhino need Tool Manager 1.8.</template>
    </p>
    <div v-if="state?.kind === 'stale'" class="row">
      <RsButton size="sm" :disabled="busy" @click="prep.takeNewRevision()">Use the new revision</RsButton>
      <RsButton size="sm" variant="quiet" :disabled="busy" @click="keepMine">Keep these settings</RsButton>
    </div>

    <form v-if="naming" class="row namer" @submit.prevent="saveNew">
      <input v-model="newName" class="name" maxlength="60" aria-label="New profile name" />
      <label class="chk"><input v-model="onlyThisTool" type="checkbox" /> Only for {{ job.toolhead }}</label>
      <RsButton size="sm" variant="primary" type="submit" :disabled="busy || !newName.trim()">Save</RsButton>
      <RsButton size="sm" variant="quiet" @click="naming = false">Cancel</RsButton>
    </form>
    <p v-if="err || store.error" class="err" role="alert">{{ err ?? store.error }}</p>
  </div>
</template>

<style scoped>
.pbar { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--rs-space-3); padding-bottom: var(--rs-space-3); border-bottom: 1px dotted var(--rs-line-strong); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); }
.top { justify-content: space-between; align-items: flex-end; }
.pick { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 200px; max-width: 420px; }
.k { font-size: var(--rs-text-xs); color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); }
select, .name { height: 34px; padding: 0 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface-2); color: var(--rs-text-strong); font: inherit; }
.name { flex: 1; min-width: 160px; }
.acts { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); }
.status { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid currentColor; flex: none; }
.status.saved { color: var(--rs-text-strong); }
.status.saved .dot { background: currentColor; }
.status.changed, .status.stale { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: var(--rs-text-sm); }
.dlg { margin: 0; }
.note { margin: 0; font-size: var(--rs-text-sm); }
.err { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-danger-strong); font-weight: var(--rs-weight-medium); }
</style>
