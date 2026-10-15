<script setup lang="ts">
/**
 * Make or edit a Task Book: a name, a line about it, and the library tasks
 * in it (searchable, grouped by where they can go). Where the book is
 * assigned, new tasks are added and removed ones archived (history kept).
 */
import { computed, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsDialog from '@/components/RsDialog.vue'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import type { TaskBook } from './types'
import '@/toolmgr/forms.css'

/** null = closed, 'new' = a new book */
const props = defineProps<{ book: TaskBook | 'new' | null }>()
const emit = defineEmits<{ close: []; saved: [msg: string] }>()
const care = useMaintenanceStore()
const control = useControlStore()

const name = ref('')
const description = ref('')
const picked = ref<string[]>([])
const find = ref('')
const error = ref<string | null>(null)
const saving = ref(false)
const existing = computed(() => (props.book && props.book !== 'new' ? props.book : null))

watch(
  () => props.book,
  (b) => {
    if (!b) return
    const x = b === 'new' ? null : b
    name.value = x?.name ?? ''
    description.value = x?.description ?? ''
    picked.value = [...(x?.templates ?? [])]
    find.value = ''
    error.value = null
  },
  { immediate: true },
)

const groups = computed(() => {
  const q = find.value.trim().toLowerCase()
  const all = (care.library?.templates ?? []).filter((t) => !q || t.title.toLowerCase().includes(q) || t.schedule.toLowerCase().includes(q))
  return [
    { id: 'any', label: 'Goes on anything', items: all.filter((t) => t.applies === 'any') },
    { id: 'tool', label: "Toolheads only (counts the tool's own use)", items: all.filter((t) => t.applies === 'tool') },
  ].filter((g) => g.items.length)
})
const toggle = (id: string, on: boolean) => (picked.value = on ? [...picked.value.filter((x) => x !== id), id] : picked.value.filter((x) => x !== id))

async function save() {
  saving.value = true
  error.value = null
  try {
    const r = await care.write((c) => c.saveBook(existing.value?.id ?? null, { name: name.value.trim(), description: description.value.trim(), templates: picked.value }))
    const n = Number(r.added ?? 0)
    emit('saved', `Task Book saved${n ? `, ${n} task${n === 1 ? '' : 's'} added where it's assigned` : ''}`)
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  const b = existing.value!
  const ok = await control.confirm({
    title: `Delete ${b.name}?`,
    body: b.assigned.length ? `Its tasks are archived on ${b.assigned_labels.join(', ')}; their work log is kept. The library tasks stay in the library.` : 'The library tasks in it stay in the library.',
    confirmLabel: 'Delete book',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await care.write((c) => c.deleteBook(b.id))
    emit('saved', `${b.name} deleted`)
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <RsDialog :open="!!book" wide :title="existing ? existing.name : 'New Task Book'" :kicker="existing ? 'Edit Task Book' : 'Task Library'" :error="error" @close="emit('close')" @submit="save">
    <div class="tm-row">
      <label class="tm-fld"><span class="tm-lbl">Book name</span><input v-model="name" class="tm-in" maxlength="60" placeholder="Wide-nozzle print head" required /></label>
      <label class="tm-fld"><span class="tm-lbl">Description (optional)</span><input v-model="description" class="tm-in" maxlength="200" placeholder="What the book covers" /></label>
    </div>
    <p v-if="existing?.assigned.length" class="tm-warn">On {{ existing.assigned_labels.join(', ') }}. Tasks you add are added there too; tasks you take out are archived there (their work log is kept).</p>

    <fieldset class="tm-set">
      <legend>Tasks in the book</legend>
      <div class="findrow">
        <input v-model="find" class="tm-in" type="search" placeholder="Find a library task…" aria-label="Find a library task" />
        <span class="sx-count" :class="{ strong: picked.length > 0 }">{{ picked.length }}</span><span class="tm-hint">selected</span>
      </div>
      <div class="pick">
        <template v-for="g in groups" :key="g.id">
          <span class="tm-lbl gl">{{ g.label }}</span>
          <label v-for="t in g.items" :key="t.id" class="tm-check it">
            <input type="checkbox" :checked="picked.includes(t.id)" @change="toggle(t.id, ($event.target as HTMLInputElement).checked)" />
            <span>{{ t.title }}<br /><span class="tm-hint">{{ t.schedule }}</span></span>
          </label>
        </template>
        <p v-if="!groups.length" class="tm-hint">Nothing matches.</p>
      </div>
      <span class="tm-hint">Need a task that isn't here? Add it as a library task first.</span>
    </fieldset>
    <template #actions>
      <RsButton type="submit" variant="primary" :disabled="saving || !name.trim() || !picked.length">Save book</RsButton>
      <RsButton variant="quiet" @click="emit('close')">Cancel</RsButton>
      <span class="grow" />
      <RsButton v-if="existing" variant="danger-outline" @click="remove">Delete book</RsButton>
    </template>
  </RsDialog>
</template>

<style scoped>
.findrow { display: flex; align-items: center; gap: var(--rs-space-2); }
.findrow .tm-in { flex: 1; }
.pick { display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow: auto; padding: 4px 2px; }
.gl { margin-top: 6px; }
.it { padding: 2px 0; }
.grow { flex: 1; }
.sx-count { min-width: 22px; height: 22px; padding: 0 7px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); font-size: 11px; font-weight: var(--rs-weight-bold); line-height: 22px; text-align: center; }
.sx-count.strong { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
</style>
