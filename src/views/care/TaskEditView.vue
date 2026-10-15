<script setup lang="ts">
/**
 * Add or edit a maintenance task, or a Task Library task (route meta.mode
 * 'template'). The form is in five parts, the long ones folding away; the
 * card on the right says the schedule in plain words as you change it and,
 * for an existing task, where each rule stands now.
 *
 * A task that comes from the Task Library only keeps its own pause switch:
 * its steps and schedule are the library task's (edit that to change every
 * copy, or detach this one to make it your own).
 */
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import RsButton from '@/components/RsButton.vue'
import CareBar from '@/maintenance/CareBar.vue'
import LogWorkDialog from '@/maintenance/LogWorkDialog.vue'
import RuleRow from '@/maintenance/RuleRow.vue'
import StatusDialog from '@/maintenance/StatusDialog.vue'
import TaskState from '@/maintenance/TaskState.vue'
import {
  assetChoices, blankForm, blankRule, describeSchedule, fitRules, formProblem, formToDef, grouped, isTool, meterOf, taskToForm, today, toolOf,
  type TaskForm,
} from '@/maintenance/edit'
import { fmtMeter } from '@/maintenance/summary'
import type { LibTask, MaintTask } from '@/maintenance/types'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const care = useMaintenanceStore()
const control = useControlStore()
const route = useRoute()
const router = useRouter()

const mode = computed(() => (route.meta.mode === 'template' ? 'template' : 'task'))
const tmpl = computed(() => mode.value === 'template')
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const back = computed(() => (tmpl.value ? '/care/library?tab=tasks' : '/care/tasks'))

const task = computed<MaintTask | null>(() => (!tmpl.value && id.value ? (care.overview?.tasks.find((t) => t.id === id.value) ?? null) : null))
const lib = computed<LibTask | null>(() => (tmpl.value && id.value ? (care.library?.templates.find((t) => t.id === id.value) ?? null) : null))
const linked = computed(() => !!task.value?.link)
const missing = ref(false)

const f = reactive<TaskForm>(blankForm(null, ''))
const dirty = ref(false)
const ready = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const open = reactive({ how: true, more: false })

async function load() {
  ready.value = false
  missing.value = false
  error.value = null
  try {
    if (tmpl.value && !care.library) await care.loadLibrary()
    if (!care.overview) await care.refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
  const src = tmpl.value ? lib.value : task.value
  if (id.value && !src) {
    missing.value = !!care.overview
    return
  }
  const preset = typeof route.query.for === 'string' ? route.query.for : `machine:${care.overview?.areas[0]?.id ?? 'other'}`
  Object.assign(f, src ? taskToForm(src) : blankForm(care.overview, tmpl.value ? '' : preset, tmpl.value))
  if (!f.rules.length) f.rules = [blankRule('time', f.asset, tmpl.value)]
  open.how = !src || !!(f.steps || f.parts || f.safety)
  open.more = !!(f.notes || f.links)
  await Promise.resolve()
  dirty.value = false
  ready.value = true
}
watch([id, mode, () => !!care.overview, () => !!care.library], () => !ready.value && void load(), { immediate: true })
watch(id, () => void load())
watch(f, () => ready.value && (dirty.value = true), { deep: true })
watch(() => f.asset, (a) => ready.value && (f.rules = fitRules(f.rules, a)))

onBeforeRouteLeave(async () => {
  if (!dirty.value || saving.value) return true
  return control.confirm({ title: 'Leave without saving?', body: 'Your changes to this task are not saved.', confirmLabel: 'Leave', tone: 'normal' })
})

const choices = computed(() => assetChoices(care.overview))
const types = computed(() => Object.entries(care.overview?.types ?? care.library?.types ?? {}))
const priorities = computed(() => Object.entries(care.overview?.priorities ?? care.library?.priorities ?? { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' }))
const asset = computed(() => (tmpl.value ? null : f.asset))
const plain = computed(() => describeSchedule(care.overview, f, asset.value, tmpl.value))
const problem = computed(() => (linked.value ? '' : formProblem(f, mode.value)))
const hasTime = computed(() => f.rules.some((r) => r.kind === 'time'))
const meterRules = computed(() => f.rules.filter((r) => r.kind === 'meter'))
const toolOnly = computed(() => tmpl.value && f.rules.some((r) => (r.kind === 'meter' || r.kind === 'event') && r.scope === 'tool'))
const heading = computed(() => (id.value ? (tmpl.value ? lib.value?.title : task.value?.title) || 'Task' : tmpl.value ? 'New library task' : 'New task'))

// "last done on a date": start each usage rule from what its meter read then
watch(
  () => [f.last_done.when, meterRules.value.map((r) => `${r.scope}.${r.meter}`).join()],
  () => {
    if (f.last_done.when !== 'date') return
    for (const r of meterRules.value) {
      const k = `${r.scope}.${r.meter}`
      const m = meterOf(care.overview, r, f.asset)
      if (f.last_done.readings[k] === undefined && m) f.last_done.readings[k] = m.unit ? Math.round(m.value * 10) / 10 : Math.round(m.value)
    }
  },
)

async function save() {
  if (problem.value) return void (error.value = problem.value)
  saving.value = true
  error.value = null
  try {
    if (linked.value) {
      await care.write((c) => c.updateTask(task.value!.id, { ...formToDef(f, 'task', false), enabled: f.enabled }))
      dirty.value = false
      return void router.push(back.value)
    }
    const def = formToDef(f, mode.value, !id.value)
    if (tmpl.value) {
      const r = await care.write((c) => c.saveTemplate(id.value, def))
      dirty.value = false
      const n = Number(r.updated_tasks ?? 0)
      router.push({ path: back.value, query: { tab: 'tasks', saved: n ? `Library task saved, ${n} linked task${n === 1 ? '' : 's'} updated` : 'Library task saved' } })
    } else {
      if (id.value) {
        await care.write((c) => c.updateTask(id.value!, def))
        await load()
        flash('Task saved')
      } else {
        const r = await care.write((c) => c.createTask(def))
        dirty.value = false
        ready.value = false
        await router.push(`/care/tasks/${encodeURIComponent(String(r.id))}`)
      }
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  const what = tmpl.value ? 'library task' : 'task'
  const uses = lib.value?.uses.length ?? 0
  const ok = await control.confirm({
    title: `Delete this ${what}?`,
    body: tmpl.value
      ? uses
        ? `The ${uses} task${uses === 1 ? '' : 's'} made from it stay, as ordinary tasks you can edit. It's taken out of every Task Book.`
        : "It's taken out of every Task Book."
      : 'Its work-log entries are kept. To keep a task but stop tracking it, pause it instead.',
    feature: heading.value,
    confirmLabel: `Delete ${what}`,
    tone: 'danger',
  })
  if (!ok) return
  try {
    if (tmpl.value) await care.write((c) => c.deleteTemplate(id.value!))
    else await care.write((c) => c.deleteTask(id.value!))
    dirty.value = false
    router.push(back.value)
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function detach() {
  try {
    await care.write((c) => c.updateTask(task.value!.id, { detach: true }))
    ready.value = false
    await load()
    flash('Detached: this task is now yours to edit')
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function toLibrary() {
  if (dirty.value) return void (error.value = 'Save your changes first.')
  try {
    await care.write((c) => c.taskToLibrary(task.value!.id))
    flash('Added to the Task Library and linked')
  } catch (e) {
    error.value = (e as Error).message
  }
}

const editLibrary = () => router.push(`/care/library/${encodeURIComponent(task.value!.link!.template)}`)
const logging = ref<MaintTask | null>(null)
const statusFor = ref<MaintTask | null>(null)
const note = ref<string | null>(null)
function flash(m: string) {
  note.value = m
  setTimeout(() => (note.value = null), 5000)
}
const fmtDay = (s: number) => new Date(s * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const rulesNow = computed(() => task.value?.status?.rules ?? [])
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <RouterLink :to="back" class="crumb">{{ tmpl ? 'Task Library' : 'Tasks' }}</RouterLink>
        <h1>{{ heading }}</h1>
        <p v-if="task" class="for">{{ task.asset_label }}<template v-if="task.link_info?.book_name"> · from Task Book {{ task.link_info.book_name }}</template></p>
      </div>
      <div class="acts">
        <RsButton variant="primary" :disabled="saving || !ready || (!!id && !dirty)" @click="save">{{ saving ? 'Saving…' : lib?.uses.length ? `Save and update ${lib.uses.length}` : 'Save' }}</RsButton>
        <RsButton @click="router.push(back)">{{ dirty ? 'Cancel' : 'Back' }}</RsButton>
      </div>
    </div>

    <p v-if="note" class="sx-flash" role="status">{{ note }}</p>
    <p v-if="error" class="tm-err" role="alert">{{ error }}</p>
    <div v-if="missing" class="sx-empty">This {{ tmpl ? 'library task' : 'task' }} isn't in the Portal any more. <RouterLink :to="back">Back to the list</RouterLink></div>
    <p v-else-if="!ready" class="muted">Loading…</p>

    <div v-else class="cols">
      <!-- ===== the form ===== -->
      <div class="form">
        <!-- linked to the library: only its own pause switch -->
        <section v-if="linked" class="tm-set linkbox">
          <strong>This task comes from the Task Library</strong>
          <p class="tm-hint">
            Library task “{{ task!.link_info?.template_title }}”<template v-if="task!.link_info?.book_name">, Task Book “{{ task!.link_info.book_name }}”</template>,
            used by {{ task!.link_info?.uses ?? 1 }} task{{ task!.link_info?.uses === 1 ? '' : 's' }}. Its steps and schedule are the library's:
            edit the library task to change every copy, or detach this one to make it your own.
          </p>
          <div class="tm-actions">
            <RsButton @click="editLibrary">Edit the library task</RsButton>
            <RsButton variant="quiet" @click="detach">Detach to customise</RsButton>
          </div>
          <dl class="review">
            <dt>Kind of work</dt><dd>{{ care.overview?.types?.[task!.type ?? ''] ?? task!.type }}</dd>
            <dt>Priority</dt><dd>{{ care.overview?.priorities?.[task!.priority ?? 'normal'] }}</dd>
            <template v-if="task!.steps?.length"><dt>Steps</dt><dd><ol><li v-for="(s, i) in task!.steps" :key="i">{{ s }}</li></ol></dd></template>
            <template v-if="task!.parts?.length"><dt>Parts</dt><dd>{{ task!.parts.join(', ') }}</dd></template>
            <template v-if="task!.safety"><dt>Safety</dt><dd>{{ task!.safety }}</dd></template>
          </dl>
          <label class="tm-check"><input v-model="f.enabled" type="checkbox" :true-value="false" :false-value="true" /><span>Paused<br /><span class="tm-hint">Keeps the task but stops tracking it.</span></span></label>
        </section>

        <template v-else>
          <fieldset class="tm-set">
            <legend>1. What and for</legend>
            <div class="tm-row">
              <label class="tm-fld title"><span class="tm-lbl">Task</span><input v-model="f.title" class="tm-in" maxlength="80" placeholder="Tension the X/Y belts" required /><span class="tm-hint">Short: it's also the Mainsail reminder line.</span></label>
              <label v-if="!tmpl" class="tm-fld">
                <span class="tm-lbl">For</span>
                <select v-model="f.asset" class="tm-sel">
                  <optgroup v-for="[g, cs] in grouped(choices)" :key="g" :label="g"><option v-for="c in cs" :key="c.value" :value="c.value">{{ c.label }}</option></optgroup>
                </select>
                <span v-if="id && task && f.asset !== task.asset" class="tm-hint">Moving it starts its counting again from today.</span>
              </label>
              <label v-else class="tm-fld">
                <span class="tm-lbl">Area, when a book goes on the whole machine</span>
                <select v-model="f.area" class="tm-sel"><option value="">Choose when assigned</option><option v-for="a in care.overview?.areas ?? []" :key="a.id" :value="a.id">{{ a.label }}</option></select>
                <span class="tm-hint">Ignored on a toolhead or system hardware.</span>
              </label>
            </div>
            <div class="tm-row">
              <label class="tm-fld"><span class="tm-lbl">Kind of work</span><select v-model="f.type" class="tm-sel"><option v-for="[k, l] in types" :key="k" :value="k">{{ l }}</option></select></label>
              <label class="tm-fld"><span class="tm-lbl">Priority</span><select v-model="f.priority" class="tm-sel"><option v-for="[k, l] in priorities" :key="k" :value="k">{{ l }}</option></select></label>
              <label class="tm-fld"><span class="tm-lbl">Time needed (minutes)</span><input v-model="f.minutes" class="tm-in" type="number" min="0" max="1440" /></label>
            </div>
            <p v-if="lib?.uses.length" class="tm-warn">Used by {{ lib.uses.length }} task{{ lib.uses.length === 1 ? '' : 's' }} ({{ lib.uses.join(', ') }}). Saving updates every one; their schedules carry on from where they are.</p>
          </fieldset>

          <fieldset class="tm-set">
            <legend>2. When is it due? Whichever rule comes first</legend>
            <RuleRow
              v-for="(r, i) in f.rules" :key="i" :rule="r" :n="i + 1" :asset="asset" :template="tmpl" :removable="f.rules.length > 1"
              @replace="(x) => f.rules.splice(i, 1, x)" @remove="f.rules.splice(i, 1)"
            />
            <button v-if="f.rules.length < 4" type="button" class="tm-link add" @click="f.rules.push(blankRule(isTool(asset) || tmpl ? 'meter' : 'time', asset, tmpl))">+ Add another rule</button>
            <p v-if="tmpl" class="tm-hint">A rule that counts the tool's own use makes this a toolhead-only task{{ toolOnly ? ' (it is now)' : '' }}.</p>
            <template v-if="hasTime">
              <span class="tm-lbl">Time rules count</span>
              <div class="tm-row">
                <label class="tm-radio" :class="{ on: f.anchor === 'completion' }"><input v-model="f.anchor" type="radio" value="completion" /><span><strong>From when it was last done</strong><br /><span class="tm-hint">Done late? The next one moves later too.</span></span></label>
                <label class="tm-radio" :class="{ on: f.anchor === 'calendar' }"><input v-model="f.anchor" type="radio" value="calendar" /><span><strong>On a fixed calendar</strong><br /><span class="tm-hint">Same dates every time, like the 1st of each month.</span></span></label>
              </div>
              <label v-if="f.anchor === 'calendar'" class="tm-fld narrow"><span class="tm-lbl">First due on</span><input v-model="f.first_due" class="tm-in" type="date" /></label>
            </template>
          </fieldset>

          <fieldset v-if="!id && !tmpl" class="tm-set">
            <legend>3. Start counting from</legend>
            <div class="tm-row">
              <label class="tm-radio" :class="{ on: f.last_done.when === 'now' }"><input v-model="f.last_done.when" type="radio" value="now" /><span><strong>Now</strong><br /><span class="tm-hint">Treat it as just done.</span></span></label>
              <label class="tm-radio" :class="{ on: f.last_done.when === 'date' }"><input v-model="f.last_done.when" type="radio" value="date" /><span><strong>The last time it was done</strong><br /><span class="tm-hint">So it comes due when it really should.</span></span></label>
            </div>
            <div v-if="f.last_done.when === 'date'" class="tm-row">
              <label class="tm-fld"><span class="tm-lbl">Last done on</span><input v-model="f.last_done.date" class="tm-in" type="date" :max="today()" /></label>
              <label v-for="r in meterRules" :key="`${r.scope}.${r.meter}`" class="tm-fld">
                <span class="tm-lbl">{{ meterOf(care.overview, r, f.asset)?.label }} then</span>
                <input v-model="f.last_done.readings[`${r.scope}.${r.meter}`]" class="tm-in" type="number" min="0" step="any" />
                <span class="tm-hint">Now {{ fmtMeter(meterOf(care.overview, r, f.asset)?.value ?? 0, meterOf(care.overview, r, f.asset)?.unit ?? '') }}.</span>
              </label>
            </div>
          </fieldset>

          <section class="sx-fold" :class="{ open: open.how }">
            <button type="button" class="fh" :aria-expanded="open.how" @click="open.how = !open.how">
              <span class="sx-chev" /><span class="ft">{{ !id && !tmpl ? 4 : 3 }}. How to do it</span>
              <span class="fr fm">{{ [f.steps && `${f.steps.split('\n').filter(Boolean).length} steps`, f.parts && 'parts', f.safety && 'safety note'].filter(Boolean).join(' · ') || 'Steps, parts, tools, safety' }}</span>
            </button>
            <div v-show="open.how" class="fb">
              <label class="tm-fld"><span class="tm-lbl">Steps, one per line</span><textarea v-model="f.steps" class="tm-ta" rows="5" /><span class="tm-hint">Ticked off one by one in Log work.</span></label>
              <div class="tm-row">
                <label class="tm-fld"><span class="tm-lbl">Parts and consumables, one per line</span><textarea v-model="f.parts" class="tm-ta" rows="3" /><span class="tm-hint">Shown as “Have ready” once the early alarm goes off.</span></label>
                <label class="tm-fld"><span class="tm-lbl">Tools needed</span><input v-model="f.tools_needed" class="tm-in" maxlength="200" placeholder="2.5 mm hex key, belt tension gauge" /></label>
              </div>
              <label class="tm-fld"><span class="tm-lbl">Safety notes</span><textarea v-model="f.safety" class="tm-ta" rows="2" placeholder="Power off and let the hotend cool first" /></label>
            </div>
          </section>

          <section class="sx-fold" :class="{ open: open.more }">
            <button type="button" class="fh" :aria-expanded="open.more" @click="open.more = !open.more">
              <span class="sx-chev" /><span class="ft">{{ !id && !tmpl ? 5 : 4 }}. Reminders, notes and links</span>
              <span class="fr fm">{{ f.remind_boot ? 'Reminded in Mainsail' : 'No Mainsail reminder' }}{{ !tmpl && !f.enabled ? ' · paused' : '' }}</span>
            </button>
            <div v-show="open.more" class="fb">
              <label class="tm-check"><input v-model="f.remind_boot" type="checkbox" /><span>Remind me in Mainsail when Klipper starts and this is due</span></label>
              <label v-if="!tmpl" class="tm-check"><input v-model="f.enabled" type="checkbox" :true-value="false" :false-value="true" /><span>Paused<br /><span class="tm-hint">Keeps the task but stops tracking it.</span></span></label>
              <label class="tm-fld"><span class="tm-lbl">Notes</span><textarea v-model="f.notes" class="tm-ta" rows="2" /></label>
              <label class="tm-fld"><span class="tm-lbl">Links: manuals, videos, one per line</span><textarea v-model="f.links" class="tm-ta code" rows="2" placeholder="https://…" /></label>
            </div>
          </section>
        </template>

        <div class="tm-actions bottom">
          <RsButton variant="primary" :disabled="saving || (!!id && !dirty)" @click="save">{{ saving ? 'Saving…' : 'Save' }}</RsButton>
          <RsButton @click="router.push(back)">{{ dirty ? 'Cancel' : 'Back' }}</RsButton>
          <span v-if="problem && dirty" class="tm-hint">{{ problem }}</span>
          <span class="grow" />
          <RsButton v-if="id" variant="danger-outline" @click="remove">Delete {{ tmpl ? 'library task' : 'task' }}</RsButton>
        </div>
      </div>

      <!-- ===== the summary ===== -->
      <aside class="side">
        <div class="card">
          <span class="tm-lbl">In plain words</span>
          <p class="plain">{{ plain }}</p>
          <p v-if="tmpl" class="tm-hint">{{ toolOnly ? 'Goes on toolheads only.' : 'Goes on anything.' }}</p>
        </div>

        <div v-if="task" class="card">
          <div class="sh"><span class="tm-lbl">Now</span><TaskState :task="task" /></div>
          <div v-for="(r, i) in rulesNow" :key="i" class="now">
            <span class="rs">{{ r.summary }}</span>
            <CareBar v-if="!r.event && r.state !== 'done'" :fraction="r.fraction ?? 0" :level="r.state ?? 'ok'" :label="r.summary ?? 'rule'" />
            <span class="tm-hint">{{ r.text }}</span>
          </div>
          <p class="tm-hint">Last {{ task.last?.action === 'skipped' ? 'skipped' : 'done' }}: {{ task.last?.at ? fmtDay(task.last.at) : 'never' }}</p>
          <div class="tm-actions">
            <RsButton v-if="task.status" size="sm" @click="logging = task">Log work</RsButton>
            <RsButton v-if="task.status" size="sm" variant="quiet" @click="statusFor = task">{{ task.status.hold ? 'Change status' : 'Set status' }}</RsButton>
          </div>
          <button v-if="!linked" type="button" class="sx-link" @click="toLibrary">Add this task to the Task Library</button>
          <RouterLink v-if="toolOf(task.asset)" class="sx-link" :to="`/toolheads/${encodeURIComponent(toolOf(task.asset)!)}`">{{ toolOf(task.asset) }}'s page</RouterLink>
        </div>

        <div v-if="lib" class="card">
          <span class="tm-lbl">In the library</span>
          <p class="tm-hint">In books: {{ lib.books.join(', ') || 'none' }}</p>
          <p class="tm-hint">Used by: {{ lib.uses.join(', ') || 'nothing yet' }}</p>
          <p class="tm-hint">{{ lib.origin === 'starter' ? 'A starter task that came with the Portal.' : 'One of yours.' }}</p>
        </div>
      </aside>
    </div>

    <LogWorkDialog :task="logging" @close="logging = null" @saved="(t) => flash(`Logged: ${t}`)" />
    <StatusDialog :task="statusFor" @close="statusFor = null" @saved="flash" />
  </div>
</template>

<style scoped>
.crumb { font-size: var(--rs-text-sm); color: var(--rs-text-muted); text-decoration: none; }
.crumb::before { content: '‹ '; }
.crumb:hover { color: var(--rs-text-strong); }
.for { margin-top: 2px !important; }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--rs-gap); align-items: start; }
.form { display: flex; flex-direction: column; gap: var(--rs-space-4); min-width: 0; }
.title { grid-column: span 2; }
.narrow { max-width: 220px; }
.add { align-self: flex-start; }
.linkbox { background: var(--rs-dither-faint), var(--rs-surface); }
.linkbox strong { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.review { display: grid; grid-template-columns: auto 1fr; gap: 6px var(--rs-space-4); margin: 0; font-size: var(--rs-text-sm); }
.review dt { color: var(--rs-text-muted); }
.review dd { margin: 0; color: var(--rs-text-strong); }
.review ol { margin: 0; padding-left: 18px; }
.bottom { padding-top: var(--rs-space-2); }
.grow { flex: 1; }
.side { position: sticky; top: calc(var(--rs-topbar-h) + var(--rs-space-4)); display: flex; flex-direction: column; gap: var(--rs-gap); }
.card { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-4) var(--rs-space-5); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.plain { margin: 0; font-size: var(--rs-text-md); color: var(--rs-text-strong); line-height: 1.45; }
.sh { display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-2); }
.now { display: flex; flex-direction: column; gap: 4px; }
.rs { font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.card .sx-link { align-self: flex-start; }
@media (max-width: 1100px) {
  .cols { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; order: -1; }
  .title { grid-column: auto; }
}
</style>
