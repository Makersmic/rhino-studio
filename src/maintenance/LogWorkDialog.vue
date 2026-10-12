<script setup lang="ts">
/**
 * Log work on a maintenance task: what happened, when, and a note.
 * Saving writes to the Portal's work log and restarts the task's schedule
 * from the current meter readings (the Portal does that part).
 */
import { computed, nextTick, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { lookFor } from '@/toolheads/registry'
import { useMaintenanceStore } from '@/stores/maintenance'
import type { MaintTask } from './types'

const props = defineProps<{ task: MaintTask | null }>()
const emit = defineEmits<{ close: []; saved: [title: string] }>()

const care = useMaintenanceStore()
const dialog = ref<HTMLDialogElement | null>(null)
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const action = ref('done')
const date = ref(today())
const notes = ref('')
const checked = ref<boolean[]>([])
const saving = ref(false)
const error = ref<string | null>(null)

const tool = computed(() => (props.task?.asset.startsWith('tool:') ? props.task.asset.slice(5) : null))
const options = computed(() => [
  { id: 'done', label: 'Done' },
  { id: 'skipped', label: 'Skipped, not needed this time' },
  ...care.statusOptions,
])

watch(
  () => props.task,
  async (t) => {
    if (!t) {
      dialog.value?.close()
      return
    }
    action.value = 'done'
    date.value = today()
    notes.value = ''
    error.value = null
    checked.value = (t.steps ?? []).map(() => false)
    await nextTick()
    if (!dialog.value?.open) dialog.value?.showModal()
  },
)

async function save() {
  if (!props.task) return
  saving.value = true
  error.value = null
  try {
    await care.logWork(props.task.id, { action: action.value, date: date.value, notes: notes.value.trim() })
    emit('saved', props.task.title)
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="dlg" aria-labelledby="log-title" @close="$emit('close')" @cancel="$emit('close')">
    <form v-if="task" class="body" @submit.prevent="save">
      <header class="head">
        <ToolheadBadge v-if="tool" :look="lookFor(tool)" size="sm" />
        <span v-else class="area">{{ task.asset_label }}</span>
        <button type="button" class="x" aria-label="Close" @click="$emit('close')">×</button>
      </header>
      <h2 id="log-title">{{ task.title }}</h2>

      <p v-if="task.safety" class="safety"><strong>Safety.</strong> {{ task.safety }}</p>

      <div v-if="task.steps?.length" class="steps">
        <h3>Steps</h3>
        <label v-for="(s, i) in task.steps" :key="i" class="step">
          <input v-model="checked[i]" type="checkbox" />
          <span>{{ s }}</span>
        </label>
      </div>
      <p v-if="task.parts?.length || task.tools_needed" class="muted small">
        <template v-if="task.parts?.length">Parts: {{ task.parts.join(', ') }}. </template>
        <template v-if="task.tools_needed">Tools: {{ task.tools_needed }}.</template>
      </p>

      <fieldset class="what">
        <legend>What happened</legend>
        <label v-for="o in options" :key="o.id" class="opt">
          <input v-model="action" type="radio" name="action" :value="o.id" />
          <span>{{ o.label }}</span>
        </label>
      </fieldset>

      <div class="row2">
        <label class="field">
          <span>Date</span>
          <input v-model="date" type="date" :max="today()" required />
        </label>
      </div>
      <label class="field">
        <span>Notes</span>
        <textarea v-model="notes" rows="3" maxlength="1000" placeholder="What you found or replaced" />
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <footer class="actions">
        <RsButton type="submit" variant="primary" :disabled="saving">{{ saving ? 'Saving…' : 'Log work' }}</RsButton>
        <RsButton variant="quiet" @click="$emit('close')">Cancel</RsButton>
        <span class="muted small note">Saved to the Portal's work log. The schedule restarts from today's meter readings.</span>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(560px, calc(100vw - 24px));
  max-height: calc(100vh - 48px);
  padding: 0;
  border: 0;
  border-radius: var(--rs-radius-xl);
  background: var(--rs-surface);
  color: var(--rs-text);
}
.dlg::backdrop { background: rgb(0 0 0 / 0.6); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5) var(--rs-space-5) var(--rs-space-5); }
.head { display: flex; align-items: center; justify-content: space-between; }
.area { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.x { width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid var(--rs-line-strong); background: transparent; font-size: 20px; line-height: 1; cursor: pointer; }
h2 { font-size: var(--rs-text-xl); font-weight: var(--rs-weight-body); letter-spacing: -0.02em; }
h3 { font-size: var(--rs-text-sm); color: var(--rs-text-muted); margin-bottom: var(--rs-space-2); }
.safety { padding: var(--rs-space-3) var(--rs-space-4); border-radius: var(--rs-radius-md); background: var(--rs-paper); color: var(--rs-paper-ink); font-size: var(--rs-text-sm); }
.steps { display: flex; flex-direction: column; gap: 6px; }
.step, .opt { display: flex; align-items: flex-start; gap: var(--rs-space-2); cursor: pointer; }
.step input, .opt input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--rs-text-strong); flex: none; }
.step input:checked + span { color: var(--rs-text-muted); text-decoration: line-through; }
.what { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.what legend { font-size: var(--rs-text-sm); color: var(--rs-text-muted); margin-bottom: var(--rs-space-2); }
.field { display: flex; flex-direction: column; gap: var(--rs-space-1); font-size: var(--rs-text-sm); }
.field input, .field textarea {
  padding: 10px var(--rs-space-4);
  border-radius: var(--rs-radius-md);
  border: 1.5px solid var(--rs-line-strong);
  background: var(--rs-bg);
  color: var(--rs-text-strong);
}
.field input { height: 42px; border-radius: var(--rs-radius-pill); max-width: 200px; color-scheme: inherit; }
.field textarea { resize: vertical; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-2); }
.note { flex-basis: 100%; }
.small { font-size: var(--rs-text-sm); }
.error { color: var(--rs-danger); }
</style>
