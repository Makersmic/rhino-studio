<script setup lang="ts">
/**
 * Set a status code on a task (Pending - Waiting on parts, In progress...),
 * change it, or clear it. What each code does is set up in Care setup →
 * Status codes; this says it in a line before you choose.
 */
import { computed, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsDialog from '@/components/RsDialog.vue'
import { useMaintenanceStore } from '@/stores/maintenance'
import { statusSummary } from './edit'
import type { MaintTask } from './types'
import '@/toolmgr/forms.css'

const props = defineProps<{ task: MaintTask | null }>()
const emit = defineEmits<{ close: []; saved: [msg: string] }>()
const care = useMaintenanceStore()

const status = ref('')
const note = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

const codes = computed(() => care.lists?.statuses.custom ?? [])
const held = computed(() => props.task?.status?.hold ?? null)
const chosen = computed(() => codes.value.find((c) => c.id === status.value) ?? null)

watch(
  () => props.task,
  async (t) => {
    if (!t) return
    error.value = null
    if (!care.lists) await care.loadLists().catch((e) => (error.value = (e as Error).message))
    status.value = t.status?.hold?.id ?? codes.value[0]?.id ?? ''
    note.value = t.status?.hold?.note ?? ''
  },
  { immediate: true },
)

async function save() {
  if (!props.task) return
  saving.value = true
  error.value = null
  try {
    await care.write((c) => c.setTaskStatus(props.task!.id, { status: status.value, note: note.value.trim() }))
    emit('saved', status.value ? `Status set: ${chosen.value?.label ?? status.value}` : 'Status cleared')
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <RsDialog :open="!!task" :title="task?.title ?? ''" :kicker="`Status · ${task?.asset_label ?? ''}`" :error="error" @close="emit('close')" @submit="save">
    <p v-if="!codes.length" class="tm-lead">No status codes yet. Add them in Care setup → Status codes.</p>
    <template v-else>
      <fieldset class="tm-set">
        <legend>Status</legend>
        <label v-for="c in codes" :key="c.id" class="tm-radio" :class="{ on: status === c.id }">
          <input v-model="status" type="radio" name="st" :value="c.id" />
          <span class="sw" :style="{ background: care.lists?.colors[c.color] }" />
          <span><strong>{{ c.label }}</strong><br /><span class="tm-hint">{{ c.help || statusSummary(c) }}</span></span>
        </label>
        <label v-if="held" class="tm-radio" :class="{ on: status === '' }">
          <input v-model="status" type="radio" name="st" value="" />
          <span><strong>Clear the status</strong><br /><span class="tm-hint">Back to what the schedule says.</span></span>
        </label>
      </fieldset>
      <label class="tm-fld">
        <span class="tm-lbl">{{ chosen?.note_required ? 'Note (required)' : 'Note (optional)' }}</span>
        <input v-model="note" class="tm-in" maxlength="300" placeholder="GT2 belt ordered, arrives Friday" />
        <span v-if="chosen" class="tm-hint">{{ statusSummary(chosen) }}.</span>
      </label>
    </template>
    <template #actions>
      <RsButton type="submit" variant="primary" :disabled="saving || !codes.length || (chosen?.note_required && !note.trim())">{{ status ? 'Set status' : 'Clear status' }}</RsButton>
      <RsButton variant="quiet" @click="emit('close')">Cancel</RsButton>
    </template>
  </RsDialog>
</template>

<style scoped>
.sw { width: 5px; align-self: stretch; border-radius: 2px; flex: none; }
</style>
