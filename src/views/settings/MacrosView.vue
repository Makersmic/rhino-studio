<script setup lang="ts">
/**
 * Settings › Macros: your macros, built from a list of steps (Tool Manager 1.9.13, docs/phase-macro-builder.md).
 * The steps show as a connected chain with each step's values small underneath (Mike, Nov 1), and stay a list that
 * works on a phone. Saved on the Rhino; run from Control › Macros or Test run here, both through the console's check.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import MacroStepFields from '@/control/MacroStepFields.vue'
import { STEP_TITLES, buildMacro, macroProblem, newStep, starterMacros, stepProblem, stepSummary, type MacroDraft, type StepKind, type UserMacro } from '@/control/userMacros'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { useToolMgrStore } from '@/stores/toolmgr'
import { useUserMacrosStore } from '@/stores/userMacros'
import './settings.css'

const store = useUserMacrosStore()
const machine = useMachineStore()
const control = useControlStore()
const tm = useToolMgrStore()
onMounted(() => {
  void store.load()
  if (!tm.state) void tm.refresh() // the toolhead names, for "For toolheads"
})

const ADV_KEY = 'rhino-studio.macros.advanced'
const advanced = ref(false)
try { advanced.value = localStorage.getItem(ADV_KEY) === '1' } catch { /* not remembered */ }
function setAdvanced(v: boolean) {
  advanced.value = v
  try { localStorage.setItem(ADV_KEY, v ? '1' : '0') } catch { /* private window */ }
}
const KINDS = computed<StepKind[]>(() => ['home', 'moveTo', 'moveBy', 'temp', 'heatMaterial', 'fan', 'wait', 'macro', 'message', ...(advanced.value ? (['gcode'] as const) : [])])

const toolNames = computed(() => (tm.state?.tools ?? []).map((t) => t.name))
const klipperMacros = computed(() => [...control.macros.keys()].filter((n) => !n.startsWith('_')).sort())
const materialNames = computed(() => [...new Set(store.materials.map((m) => m.name))])

// ---- editing: a copy of the macro, saved as a whole
const editing = ref<{ id: string | null; rev: number } | null>(null)
const draft = reactive<MacroDraft>({ name: '', toolheads: [], steps: [], notes: '' })
const open = ref<number | null>(null)
const busy = ref(false)
const msg = ref<{ text: string; bad?: boolean } | null>(null)

function edit(m: UserMacro | null) {
  editing.value = m ? { id: m.id, rev: m.rev } : { id: null, rev: 0 }
  Object.assign(draft, JSON.parse(JSON.stringify(m ? { name: m.name, toolheads: m.toolheads, steps: m.steps, notes: m.notes } : { name: '', toolheads: [], steps: [newStep('home')], notes: '' })))
  open.value = m ? null : 0
  msg.value = null
}
function close() {
  editing.value = null
  open.value = null
}
const addKind = ref<StepKind | ''>('')
function addStep() {
  if (!addKind.value) return
  draft.steps.push(newStep(addKind.value))
  open.value = draft.steps.length - 1
  addKind.value = ''
}
function move(i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= draft.steps.length) return
  const [s] = draft.steps.splice(i, 1)
  draft.steps.splice(j, 0, s!)
  open.value = j
}
function removeStep(i: number) {
  draft.steps.splice(i, 1)
  open.value = null
}
const problem = computed(() => macroProblem(draft))
/** what it would send now, or why it can't run now (the machine as it is) */
const preview = computed(() => (machine.online ? buildMacro(draft, store.context()) : null))

async function save() {
  if (!editing.value || problem.value) return
  busy.value = true
  try {
    const m = await store.save(editing.value.id, JSON.parse(JSON.stringify(draft)), editing.value.rev)
    editing.value = { id: m.id, rev: m.rev }
    msg.value = { text: `Saved ${m.name}.` }
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
async function testRun() {
  if (problem.value) return
  await store.run(JSON.parse(JSON.stringify(draft)))
  msg.value = { text: 'Sent through the console: see Control for what happened.' }
}
async function remove(m: UserMacro) {
  try {
    await store.remove(m.id)
    if (editing.value?.id === m.id) close()
    msg.value = { text: `Deleted ${m.name}. You can bring it back below for 30 days.` }
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  }
}
async function addStarters() {
  const pos = machine.status['gcode_macro RHINO_POSITIONS'] as Record<string, unknown> | undefined
  const park = typeof pos?.park_x === 'number' && typeof pos?.park_y === 'number' ? { x: pos.park_x, y: pos.park_y } : null
  const mat = materialNames.value.includes('PLA') ? 'PLA' : (materialNames.value[0] ?? null)
  busy.value = true
  try {
    for (const m of starterMacros(park, mat)) await store.save(null, m, 0)
    msg.value = { text: park ? 'Added the starter macros.' : 'Added the starter macros. Park only lifts Z: the park spot (myrhino/positions.cfg) wasn’t readable.' }
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
const forTools = (m: MacroDraft) => (m.toolheads.length ? m.toolheads.join(', ') + ' only' : 'Any toolhead')
</script>

<template>
  <div class="set-page">
    <div class="grid">
      <RsPanel title="Your macros" panel-id="settings.macros" class="wide" :status="store.supported && store.loaded ? `${store.list.length} on the Rhino` : undefined">
        <p v-if="!machine.online" class="muted small">Your macros show once the machine is connected.</p>
        <p v-else-if="!store.supported" class="msg">Your macros need Tool Manager 1.9.13 on the Rhino.</p>
        <p v-else-if="store.error" class="msg bad" role="alert">{{ store.error }}</p>
        <template v-else>
          <div class="bar">
            <p class="muted small lead">
              Short routines you do by hand, saved as a button in Control › Macros. They run through the console’s own check: moves and power ask first. Saved on the Rhino in
              <code>config/myrhino/user_macros.json</code>, so backups include them.
            </p>
            <div class="row">
              <RsButton size="sm" variant="primary" :disabled="!!editing" @click="edit(null)">New macro</RsButton>
            </div>
          </div>
          <p v-if="msg" class="msg" :class="{ bad: msg.bad }" :role="msg.bad ? 'alert' : 'status'">{{ msg.text }}</p>

          <div v-if="!store.list.length && store.loaded" class="empty">
            <p>No macros yet. Start from the three most people use (park the head, heat for a material, cool down), or make your own.</p>
            <RsButton size="sm" :disabled="busy" @click="addStarters">Add the starter macros</RsButton>
          </div>

          <ul class="list">
            <li v-for="m in store.list" :key="m.id">
              <div class="main">
                <span class="name">{{ m.name }}</span>
                <span class="meta">{{ forTools(m) }} · {{ m.steps.length }} step{{ m.steps.length === 1 ? '' : 's' }}</span>
              </div>
              <div class="acts">
                <RsButton size="sm" :disabled="!!editing" @click="edit(m)">Edit</RsButton>
                <RsButton size="sm" variant="quiet" @click="store.run(m)">Run</RsButton>
                <RsButton size="sm" variant="danger-outline" @click="remove(m)">Delete</RsButton>
              </div>
            </li>
          </ul>

          <section v-if="store.deleted.length" class="grp">
            <h3 class="sub-h">Recently deleted <span class="count">{{ store.deleted.length }}</span></h3>
            <ul class="list">
              <li v-for="d in store.deleted" :key="d.id">
                <div class="main"><span class="name">{{ d.name }}</span></div>
                <RsButton size="sm" variant="quiet" @click="store.undelete(d.id)">Bring back</RsButton>
              </li>
            </ul>
          </section>
        </template>
      </RsPanel>

      <RsPanel v-if="editing" :title="editing.id ? `Edit ${draft.name || 'macro'}` : 'New macro'" panel-id="settings.macros.edit" class="wide">
        <div class="head">
          <label class="fld">
            <span>Name</span>
            <input v-model="draft.name" maxlength="60" placeholder="Park the head" />
          </label>
          <fieldset class="fld tools">
            <legend>For toolheads</legend>
            <label class="check"><input type="checkbox" :checked="!draft.toolheads.length" @change="draft.toolheads = []" /> Any</label>
            <label v-for="t in toolNames" :key="t" class="check">
              <input type="checkbox" :checked="draft.toolheads.includes(t)" @change="draft.toolheads = draft.toolheads.includes(t) ? draft.toolheads.filter((x) => x !== t) : [...draft.toolheads, t]" /> {{ t }}
            </label>
          </fieldset>
        </div>

        <ol class="chain" aria-label="Steps, in order">
          <li v-for="(s, i) in draft.steps" :key="i" class="node" :class="{ open: open === i, bad: !!stepProblem(s) }">
            <span class="dot" aria-hidden="true">{{ i + 1 }}</span>
            <div class="card">
              <div class="top">
                <button type="button" class="title" :aria-expanded="open === i" @click="open = open === i ? null : i">
                  <strong>{{ STEP_TITLES[s.kind] }}</strong>
                  <small>{{ stepProblem(s) ?? stepSummary(s) }}</small>
                </button>
                <span class="tools">
                  <button type="button" :disabled="i === 0" :aria-label="`Move step ${i + 1} up`" @click="move(i, -1)">↑</button>
                  <button type="button" :disabled="i === draft.steps.length - 1" :aria-label="`Move step ${i + 1} down`" @click="move(i, 1)">↓</button>
                  <button type="button" :aria-label="`Remove step ${i + 1}`" @click="removeStep(i)">×</button>
                </span>
              </div>
              <MacroStepFields v-if="open === i" :step="s" :macros="klipperMacros" :materials="materialNames" />
            </div>
          </li>
        </ol>

        <div class="add">
          <label class="visually-hidden" for="macro-add">Add a step</label>
          <select id="macro-add" v-model="addKind" :disabled="draft.steps.length >= 30" @change="addStep">
            <option value="" disabled>+ Add step</option>
            <option v-for="k in KINDS" :key="k" :value="k">{{ STEP_TITLES[k] }}</option>
          </select>
          <label class="check small"><input type="checkbox" :checked="advanced" @change="setAdvanced(($event.target as HTMLInputElement).checked)" /> Offer the advanced G-code line</label>
        </div>

        <label class="fld">
          <span>Notes</span>
          <textarea v-model="draft.notes" rows="2" maxlength="2000" />
        </label>

        <div class="preview">
          <h3 class="sub-h">What it sends now</h3>
          <p v-if="problem" class="msg bad">{{ problem }}</p>
          <p v-else-if="!preview" class="muted small">Connect the machine to see the G-code.</p>
          <p v-else-if="'error' in preview" class="msg">It can’t run right now: {{ preview.error }}</p>
          <pre v-else class="code">{{ preview.script }}</pre>
        </div>

        <div class="acts end">
          <RsButton variant="primary" :disabled="!!problem || busy" @click="save">{{ busy ? 'Saving…' : 'Save' }}</RsButton>
          <RsButton :disabled="!!problem || !machine.klippyReady" @click="testRun">Test run</RsButton>
          <RsButton variant="quiet" @click="close">Close</RsButton>
        </div>
      </RsPanel>
    </div>
  </div>
</template>

<style scoped>
.bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--rs-space-3); margin-bottom: var(--rs-space-3); }
.lead { margin: 0; max-width: 640px; }
.grp { margin-top: var(--rs-space-4); }
.count { font-weight: 400; color: var(--rs-text-muted); font-size: var(--rs-text-sm); margin-left: 4px; }
.list { list-style: none; margin: 0; padding: 0; }
.list > li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) 0; border-top: 1px solid var(--rs-line); }
.main { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
.name { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.meta { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); }
.acts.end { margin-top: var(--rs-space-4); }
.empty { color: var(--rs-text-muted); font-size: var(--rs-text-sm); display: flex; flex-direction: column; align-items: flex-start; gap: var(--rs-space-2); }
.empty p { margin: 0; }
.head { display: flex; flex-wrap: wrap; gap: var(--rs-space-4); margin-bottom: var(--rs-space-4); }
.fld { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.fld input:not([type='checkbox']), .fld textarea { padding: 8px 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); font: inherit; min-width: 220px; }
.tools { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--rs-space-2) var(--rs-space-3); }
.tools legend { margin-bottom: 4px; }
.check { display: inline-flex; align-items: center; gap: 6px; color: var(--rs-text); }
.small { font-size: var(--rs-text-sm); }

/* the steps as a connected chain: a numbered dot per step on one line, each step's values small underneath */
.chain { list-style: none; margin: 0; padding: 0; }
.node { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: var(--rs-space-3); padding-bottom: var(--rs-space-2); }
.node::before { content: ''; position: absolute; left: 13px; top: 28px; bottom: 0; width: 2px; background: var(--rs-line-strong); }
.node:last-child::before { display: none; }
.dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); background: var(--rs-text-strong); color: var(--rs-surface); }
.node.bad .dot { background: var(--rs-text-muted); }
.node.bad .card { border-style: dashed; border-color: var(--rs-line-strong); }
.card { border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); padding: 4px var(--rs-space-3); min-width: 0; }
.node.open .card { border-color: var(--rs-line-strong); }
.top { display: flex; align-items: flex-start; gap: var(--rs-space-2); }
.title { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 4px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.title strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.title small { font-size: var(--rs-text-xs); color: var(--rs-text-muted); overflow-wrap: anywhere; }
.node.bad .title small { color: var(--rs-text-strong); }
.top .tools { display: flex; gap: 2px; }
.top .tools button { width: 32px; height: 32px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm); background: none; color: var(--rs-text); cursor: pointer; }
.top .tools button:disabled { opacity: 0.35; cursor: default; }
.add { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); margin: var(--rs-space-3) 0 var(--rs-space-4) 40px; }
.add select { padding: 8px 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.preview { margin-top: var(--rs-space-4); }
.code { margin: 0; padding: var(--rs-space-3); border-radius: var(--rs-radius-md); background: var(--rs-surface-2); font-family: var(--rs-font-code); font-size: var(--rs-text-sm); white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 719px) { .add { margin-left: 0; } .fld input:not([type='checkbox']), .fld textarea { min-width: 0; width: 100%; } .head .fld { flex: 1 1 100%; } }
</style>
