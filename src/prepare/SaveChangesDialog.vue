<script setup lang="ts">
/**
 * Asked when Preview is about to open with settings changed from their profile (Mike, Nov 21): save them to the profile in
 * use, save them as a new profile, or neither and carry on. Closing (× or Esc) stays in Setup. The saving is Prepare's own
 * (prep.saveToProfile / prep.saveAsNew), the same as the Settings panel's buttons.
 */
import { ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsDialog from '@/components/RsDialog.vue'
import { usePrepareStore } from '@/stores/prepare'

const props = defineProps<{ open: boolean }>()
/** proceed: open Preview now; saved: whether the changes were saved first (false: carry on with them unsaved) */
const emit = defineEmits<{ close: []; proceed: [saved: boolean] }>()
const prep = usePrepareStore()

const naming = ref(false)
const name = ref('')
const onlyThisTool = ref(false)
const busy = ref(false)
const err = ref<string | null>(null)
watch(
  () => props.open,
  (o) => {
    if (!o) return
    naming.value = false
    err.value = null
    const j = prep.job
    name.value = j ? `${j.material || j.toolhead} ${j.process === 'fdm' ? `${j.fdm.layerHeight} mm` : ''}`.trim().slice(0, 60) : ''
    onlyThisTool.value = false
  },
)
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  err.value = null
  try {
    await fn()
    emit('proceed', true)
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
const toProfile = () => run(prep.saveToProfile)
const asNew = () => run(() => prep.saveAsNew(name.value.trim(), onlyThisTool.value))
</script>

<template>
  <RsDialog :open="open" title="Save your changes before Preview?" :error="err" @close="emit('close')" @submit="naming ? asNew() : prep.profile ? toProfile() : (naming = true)">
    <p class="dlg">
      You changed {{ prep.profileState && 'count' in prep.profileState ? prep.profileState.count : 'some' }} setting{{ prep.profileState && 'count' in prep.profileState && prep.profileState.count === 1 ? '' : 's' }}
      from {{ prep.profile ? `the profile “${prep.profile.name}”` : 'the built-in defaults' }}. They slice either way; saving keeps them for next time.
    </p>
    <div v-if="naming" class="namer">
      <input v-model="name" class="name" maxlength="60" aria-label="New profile name" />
      <label class="chk"><input v-model="onlyThisTool" type="checkbox" /> Only for {{ prep.job?.toolhead }}</label>
    </div>
    <template #actions>
      <template v-if="naming">
        <RsButton type="submit" variant="primary" :disabled="busy || !name.trim()">{{ busy ? 'Saving…' : 'Save and continue' }}</RsButton>
        <RsButton variant="quiet" :disabled="busy" @click="naming = false">Back</RsButton>
      </template>
      <template v-else>
        <RsButton v-if="prep.profile" type="submit" variant="primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save to profile' }}</RsButton>
        <RsButton :variant="prep.profile ? undefined : 'primary'" :disabled="busy" @click="naming = true">Save as new profile…</RsButton>
        <RsButton variant="quiet" :disabled="busy" @click="emit('proceed', false)">Continue without saving</RsButton>
      </template>
    </template>
  </RsDialog>
</template>

<style scoped>
.dlg { margin: 0 0 var(--rs-space-3); font-size: var(--rs-text-sm); }
.namer { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); }
.name { flex: 1; min-width: 160px; height: 34px; padding: 0 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface-2); color: var(--rs-text-strong); font: inherit; }
.chk { display: inline-flex; align-items: center; gap: 6px; font-size: var(--rs-text-sm); }
</style>
