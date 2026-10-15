<script setup lang="ts">
/**
 * Put a Task Book, or one library task, on a toolhead, a machine area, system
 * hardware or the whole machine. The tasks it adds stay linked to the
 * library: editing a library task updates every copy.
 */
import { computed, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsDialog from '@/components/RsDialog.vue'
import { useMaintenanceStore } from '@/stores/maintenance'
import { assetChoices, grouped } from './edit'
import type { LibTask, TaskBook } from './types'
import '@/toolmgr/forms.css'

const props = defineProps<{ book?: TaskBook | null; task?: LibTask | null; preset?: string }>()
const emit = defineEmits<{ close: []; saved: [msg: string] }>()
const care = useMaintenanceStore()
const asset = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

const item = computed(() => props.book ?? props.task ?? null)
const toolOnly = computed(() => !!(props.book?.needs_tool || props.task?.applies === 'tool'))
const choices = computed(() => assetChoices(care.overview, true).filter((c) => !toolOnly.value || c.value.startsWith('tool:')))
const taken = computed(() => new Set(props.book?.assigned ?? []))

watch(item, (it) => {
  if (!it) return
  error.value = null
  asset.value = props.preset ?? choices.value.find((c) => !taken.value.has(c.value))?.value ?? ''
}, { immediate: true })

async function save() {
  saving.value = true
  error.value = null
  try {
    const r = props.book ? await care.write((c) => c.assignBook(props.book!.id, asset.value, true)) : await care.write((c) => c.assignTemplate(props.task!.id, asset.value))
    const n = Number(r.added ?? 0)
    emit('saved', n ? `${n} task${n === 1 ? '' : 's'} added` : 'Already there, nothing added')
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <RsDialog :open="!!item" :title="book ? book.name : (task?.title ?? '')" :kicker="book ? 'Assign Task Book' : 'Add library task'" :error="error" @close="emit('close')" @submit="save">
    <label class="tm-fld">
      <span class="tm-lbl">{{ book ? 'Assign it to' : 'Add it to' }}</span>
      <select v-model="asset" class="tm-sel" required>
        <optgroup v-for="[g, cs] in grouped(choices)" :key="g" :label="g">
          <option v-for="c in cs" :key="c.value" :value="c.value" :disabled="taken.has(c.value)">{{ c.label }}{{ taken.has(c.value) ? ' (already on)' : '' }}</option>
        </optgroup>
      </select>
      <span class="tm-hint">
        {{ book ? `Adds its ${book.templates.length} tasks, linked to the library.` : 'Adds one task, linked to the library task.' }}
        "Whole machine" puts each task in its own area.
        <template v-if="toolOnly"> Only toolheads are listed: these tasks count a tool's own use.</template>
      </span>
    </label>
    <template #actions>
      <RsButton type="submit" variant="primary" :disabled="saving || !asset">{{ book ? 'Assign book' : 'Add task' }}</RsButton>
      <RsButton variant="quiet" @click="emit('close')">Cancel</RsButton>
    </template>
  </RsDialog>
</template>
