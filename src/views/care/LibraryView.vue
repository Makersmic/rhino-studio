<script setup lang="ts">
/**
 * The Task Library: Task Books (ready-made sets of tasks to put on a
 * toolhead, a machine area or the whole machine) and the library tasks they
 * are made of. Tasks added from the library stay linked: editing a library
 * task updates every copy.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import AssignDialog from '@/maintenance/AssignDialog.vue'
import BookDialog from '@/maintenance/BookDialog.vue'
import type { LibTask, TaskBook } from '@/maintenance/types'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const care = useMaintenanceStore()
const control = useControlStore()
const route = useRoute()
const router = useRouter()

const tab = computed(() => (route.query.tab === 'tasks' ? 'tasks' : 'books'))
const L = computed(() => care.library)
const error = ref<string | null>(null)
onMounted(() => care.loadLibrary().catch((e) => (error.value = (e as Error).message)))

const flash = ref<string | null>(null)
function say(m: string) {
  flash.value = m
  setTimeout(() => (flash.value = null), 5000)
}
watch(() => route.query.saved, (m) => {
  if (typeof m === 'string' && m) {
    say(m)
    router.replace({ query: { ...route.query, saved: undefined } })
  }
}, { immediate: true })

const titleOf = (id: string) => L.value?.templates.find((t) => t.id === id)?.title ?? id
/** tools the book is the Portal's suggestion for and isn't on yet */
const fits = (b: TaskBook) => Object.entries(L.value?.suggested ?? {}).filter(([tool, bid]) => bid === b.id && !b.assigned.includes(`tool:${tool}`)).map(([t]) => t)
const showAll = ref<Record<string, boolean>>({})

const editing = ref<TaskBook | 'new' | null>(null)
const assignBook = ref<TaskBook | null>(null)
const assignTask = ref<LibTask | null>(null)
const preset = ref<string | undefined>(undefined)
const assign = (b: TaskBook, asset?: string) => {
  preset.value = asset
  assignBook.value = b
}

async function unassign(b: TaskBook, asset: string, label: string) {
  const ok = await control.confirm({
    title: `Take ${b.name} off ${label}?`,
    body: `Its tasks on ${label} are archived. Their work log is kept, and putting the book back brings them back.`,
    confirmLabel: 'Take it off',
    tone: 'normal',
  })
  if (!ok) return
  try {
    await care.write((c) => c.assignBook(b.id, asset, false))
    say(`${b.name} taken off ${label}`)
  } catch (e) {
    say((e as Error).message)
  }
}

const groups = computed(() => [
  { id: 'any', label: 'Goes on anything', items: (L.value?.templates ?? []).filter((t) => t.applies === 'any') },
  { id: 'tool', label: "Toolheads only: counts the tool's own use", items: (L.value?.templates ?? []).filter((t) => t.applies === 'tool') },
])
const shut = ref<Record<string, boolean>>({})
const setTab = (t: string) => router.replace({ query: { ...route.query, tab: t === 'books' ? undefined : t } })
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Task Library</h1>
        <p>Task Books are ready-made sets of tasks. Put one on a toolhead, a machine area or the whole machine and its tasks are added, still linked here, so editing a library task updates every copy.</p>
      </div>
      <div class="acts">
        <RsButton :variant="tab === 'books' ? 'primary' : 'default'" @click="editing = 'new'">New Task Book</RsButton>
        <RsButton :variant="tab === 'tasks' ? 'primary' : 'default'" @click="router.push('/care/library/new')">New library task</RsButton>
      </div>
    </div>

    <div class="sx-tabs" role="tablist">
      <button type="button" role="tab" :class="{ on: tab === 'books' }" :aria-selected="tab === 'books'" @click="setTab('books')">Task Books {{ L ? `(${L.books.length})` : '' }}</button>
      <button type="button" role="tab" :class="{ on: tab === 'tasks' }" :aria-selected="tab === 'tasks'" @click="setTab('tasks')">Library tasks {{ L ? `(${L.templates.length})` : '' }}</button>
    </div>

    <p v-if="flash" class="sx-flash" role="status">{{ flash }}</p>
    <p v-if="error" class="tm-err">{{ error }}</p>
    <p v-else-if="!L" class="muted">Loading the Task Library…</p>

    <!-- ===== books ===== -->
    <div v-else-if="tab === 'books'" class="books">
      <article v-for="b in L.books" :key="b.id" class="book">
        <header class="bh">
          <h2>{{ b.name }}</h2>
          <span class="sx-tag plain">{{ b.origin === 'starter' ? 'Starter' : 'Yours' }}</span>
        </header>
        <p v-if="b.description" class="desc">{{ b.description }}</p>

        <ol class="list">
          <li v-for="tid in (showAll[b.id] ? b.templates : b.templates.slice(0, 4))" :key="tid">{{ titleOf(tid) }}</li>
        </ol>
        <button v-if="b.templates.length > 4" type="button" class="sx-link more" @click="showAll = { ...showAll, [b.id]: !showAll[b.id] }">
          {{ showAll[b.id] ? 'Show fewer' : `+ ${b.templates.length - 4} more` }}
        </button>

        <div class="on">
          <span class="tm-lbl">On{{ b.needs_tool ? ' (toolheads only)' : '' }}</span>
          <div class="sx-tags">
            <span v-for="(a, i) in b.assigned" :key="a" class="sx-tag">{{ b.assigned_labels[i] }}<button type="button" class="x" :aria-label="`Take ${b.name} off ${b.assigned_labels[i]}`" @click="unassign(b, a, b.assigned_labels[i] ?? a)">×</button></span>
            <span v-if="!b.assigned.length" class="tm-hint">Not on anything yet</span>
          </div>
          <span v-if="fits(b).length" class="tm-hint">Fits {{ fits(b).join(', ') }}: <button v-for="t in fits(b)" :key="t" type="button" class="sx-link sm" @click="assign(b, `tool:${t}`)">add to {{ t }}</button></span>
        </div>

        <footer class="tm-actions">
          <RsButton size="sm" @click="assign(b)">Assign…</RsButton>
          <RsButton size="sm" variant="quiet" @click="editing = b">Edit</RsButton>
          <span class="n">{{ b.templates.length }} task{{ b.templates.length === 1 ? '' : 's' }}</span>
        </footer>
      </article>
      <div v-if="!L.books.length" class="sx-empty">No Task Books yet. <RsButton @click="editing = 'new'">New Task Book</RsButton></div>
    </div>

    <!-- ===== library tasks ===== -->
    <template v-else>
      <section v-for="g in groups" :key="g.id" class="sx-fold" :class="{ open: !shut[g.id] }">
        <button type="button" class="fh" :aria-expanded="!shut[g.id]" @click="shut = { ...shut, [g.id]: !shut[g.id] }">
          <span class="sx-chev" /><span class="ft">{{ g.label }}</span>
          <span class="fr"><span class="sx-count">{{ g.items.length }}</span></span>
        </button>
        <div v-show="!shut[g.id]" class="fb">
          <div class="sx-colhead cols"><span>Library task</span><span>Schedule</span><span>In books</span><span>Used by</span><span /></div>
          <ul class="sx-rows">
            <li v-for="t in g.items" :key="t.id" class="row cols">
              <span class="tt">
                <RouterLink :to="`/care/library/${encodeURIComponent(t.id)}`">{{ t.title }}</RouterLink>
                <span class="tm-hint">{{ L.types[t.type] ?? t.type }}{{ t.origin === 'starter' ? ' · starter' : '' }}{{ t.area_label ? ` · machine: ${t.area_label}` : '' }}</span>
              </span>
              <span class="sm">{{ t.schedule }}</span>
              <span class="sm muted">{{ t.books.join(', ') || '—' }}</span>
              <span class="sm muted">{{ t.uses.length ? t.uses.join(', ') : '—' }}</span>
              <span class="acts"><RsButton size="sm" variant="quiet" @click="assignTask = t">Add to…</RsButton></span>
            </li>
          </ul>
          <p v-if="!g.items.length" class="tm-hint">None.</p>
        </div>
      </section>
    </template>

    <BookDialog :book="editing" @close="editing = null" @saved="say" />
    <AssignDialog :book="assignBook" :preset="preset" @close="assignBook = null" @saved="say" />
    <AssignDialog :task="assignTask" @close="assignTask = null" @saved="say" />
  </div>
</template>

<style scoped>
.books { display: grid; gap: var(--rs-gap); grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); align-items: start; }
.book { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-4) var(--rs-space-5) var(--rs-space-4); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); min-width: 0; }
.bh { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--rs-space-3); }
.bh h2 { margin: 0; font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); line-height: 1.25; }
.desc { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.list { margin: 0; padding: var(--rs-space-3) 0 0 20px; border-top: 1px dotted var(--rs-line-strong); font-size: var(--rs-text-sm); color: var(--rs-text); display: flex; flex-direction: column; gap: 3px; }
.more { align-self: flex-start; font-size: var(--rs-text-xs); }
.on { display: flex; flex-direction: column; gap: 6px; padding: var(--rs-space-3); border-radius: var(--rs-radius-md); background: var(--rs-dither-faint), var(--rs-bg); }
.sx-link.sm { font-size: var(--rs-text-xs); margin-left: 4px; }
.n { margin-left: auto; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.cols { grid-template-columns: minmax(220px, 1.6fr) minmax(160px, 1.3fr) minmax(120px, 1fr) minmax(120px, 1fr) auto; align-items: start; }
.row { display: grid; gap: var(--rs-space-4); padding: var(--rs-space-3) 0; }
.tt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tt a { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); font-size: var(--rs-text-sm); text-decoration: none; }
.tt a:hover { text-decoration: underline; text-underline-offset: 3px; }
.sm { font-size: var(--rs-text-sm); }
@media (max-width: 1000px) {
  .sx-colhead { display: none; }
  .cols { grid-template-columns: 1fr auto; }
  .row > .sm { grid-column: 1; }
  .acts { grid-column: 2; grid-row: 1; }
}
</style>
