<script setup lang="ts">
/**
 * Job hooks (Assets > Hardware > Job hooks, Tool Manager 1.9+): G-code lines Klipper runs at seven moments of
 * every job, for the whole machine, a kind of tool or one tool, e.g. dust collection on for subtractive jobs.
 *
 * The Portal owns every rule and checks each line again on save; it writes job_hooks.cfg (_RHINO_HOOKS), which
 * START_JOB, END_PRINT, cancel, pause and resume call, live after a Klipper restart. Save is offered only after
 * the Portal has checked exactly what's on screen (the Check button), like the hardware wizard's Check step.
 * Saves are revision-checked: if the hooks changed elsewhere since this page loaded, the save is refused.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import { MAX_LINES, SLOT_HELP, SLOT_LABEL, linesOf, sameHooks, scopeList, setSlot, type Hooks, type HooksState, type Slot } from '@/hardware/hooks'
import { useToolMgrStore } from '@/stores/toolmgr'
import '@/maintenance/care.css'
import '@/toolmgr/forms.css'

const tm = useToolMgrStore()
onBeforeUnmount(tm.use())

const state = ref<HooksState | null>(null)
const error = ref<string | null>(null)
const scope = ref('machine')
/** What's typed, per scope and slot, kept raw so blank lines stay while typing. */
const raw = reactive<Record<string, Partial<Record<Slot, string>>>>({})

async function load() {
  error.value = null
  const s = await tm.client().hooksState()
  state.value = s
  for (const k of Object.keys(raw)) delete raw[k]
  for (const [sc, slots] of Object.entries(s.hooks)) raw[sc] = Object.fromEntries(Object.entries(slots).map(([sl, l]) => [sl, (l ?? []).join('\n')]))
  checked.value = null
}
onMounted(() => load().catch((e) => (error.value = (e as Error).message)))

const draft = computed<Hooks>(() => {
  let h: Hooks = {}
  for (const [sc, slots] of Object.entries(raw)) for (const [sl, text] of Object.entries(slots)) h = setSlot(h, sc, sl as Slot, linesOf(text ?? ''))
  return h
})
const changed = computed(() => !!state.value && !sameHooks(draft.value, state.value.hooks))
const scopes = computed(() => (state.value ? scopeList(state.value, draft.value) : []))
const scopeLabel = computed(() => scopes.value.find((s) => s.id === scope.value)?.label ?? scope.value)

function text(slot: Slot) {
  return raw[scope.value]?.[slot] ?? ''
}
function setText(slot: Slot, v: string) {
  raw[scope.value] = { ...(raw[scope.value] ?? {}), [slot]: v }
}
const count = (slot: Slot) => linesOf(text(slot)).length

// ---------------------------------------------------------------- check, then save
const checked = ref<{ hooks: Hooks; result: HooksState } | null>(null)
const busy = ref(false)
const flash = ref<string | null>(null)
const checkedNow = computed(() => !!checked.value && sameHooks(checked.value.hooks, draft.value))
watch(draft, () => {
  if (checked.value && !checkedNow.value) checked.value = null
})

async function check() {
  if (!state.value) return
  busy.value = true
  error.value = null
  try {
    const body = { rev: state.value.rev, hooks: draft.value }
    checked.value = { hooks: body.hooks, result: await tm.client().previewHooks(body) }
  } catch (e) {
    checked.value = null
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function save() {
  if (!state.value || !checkedNow.value) return
  busy.value = true
  error.value = null
  try {
    const r = await tm.client().saveHooks({ rev: state.value.rev, hooks: draft.value })
    await tm.changed()
    await load()
    flash.value = r.restart_needed ? 'Job hooks saved. Restart Klipper to make them live.' : 'Job hooks saved.'
    setTimeout(() => (flash.value = null), 6000)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function undo() {
  await load().catch((e) => (error.value = (e as Error).message))
}
const slots = computed<Slot[]>(() => state.value?.slots ?? [])
</script>

<template>
  <div class="view">
    <div class="sx-head">
      <div>
        <h1>Job hooks</h1>
        <p>
          Lines Klipper runs at set moments of every job: switch the dust collector on for subtractive jobs, a light while
          printing, air for the laser. One command or macro per line. The Portal checks every line: nothing may move before
          the job starts, only commands and macros your config has, heaters under their limit.
        </p>
      </div>
    </div>
    <RestartBanner />
    <p v-if="flash" class="sx-flash" role="status">{{ flash }}</p>
    <p v-if="!state && !error" class="muted">Loading the job hooks from the Portal…</p>
    <p v-if="state && state.live === false" class="tm-warn">This Tool Manager doesn't run job hooks yet: they're saved but nothing calls them.</p>

    <div v-if="state" class="hk">
      <nav class="scopes" aria-label="Hooks for">
        <button
          v-for="s in scopes"
          :key="s.id"
          type="button"
          class="sc"
          :class="{ on: s.id === scope, gone: s.gone }"
          :aria-pressed="s.id === scope"
          @click="scope = s.id"
        >
          <span class="lab">{{ s.label }}</span>
          <span v-if="s.count" class="sx-count">{{ s.count }}</span>
        </button>
      </nav>

      <RsPanel :title="`For ${scopeLabel.toLowerCase().startsWith('whole') ? 'the whole machine' : scopeLabel}`" panel-id="hooks.scope">
        <div class="slots">
          <label v-for="sl in slots" :key="sl" class="tm-fld slot">
            <span class="sl-head"><span class="sl-lab">{{ SLOT_LABEL[sl] }}</span><span class="tm-hint">{{ count(sl) ? `${count(sl)} of ${MAX_LINES}` : '' }}</span></span>
            <textarea
              class="tm-in code"
              :rows="Math.min(6, Math.max(2, count(sl) + 1))"
              spellcheck="false"
              autocapitalize="off"
              :placeholder="sl === 'after_start' ? 'e.g. DUST_ON' : sl === 'after_end' ? 'e.g. DUST_OFF' : ''"
              :value="text(sl)"
              @input="setText(sl, ($event.target as HTMLTextAreaElement).value)"
            />
            <span class="tm-hint">{{ SLOT_HELP[sl] }}</span>
          </label>
        </div>
      </RsPanel>
    </div>

    <template v-if="checked && checkedNow">
      <div v-for="(w, i) in checked.result.warnings" :key="i" class="tm-warn">{{ w }}</div>
      <p class="tm-ok">Checked: every line is allowed. Save writes job_hooks.cfg; it's live after the next Klipper restart.</p>
      <details v-if="checked.result.macro" class="gen">
        <summary>What gets written (_RHINO_HOOKS)</summary>
        <pre class="tm-pre">{{ checked.result.macro }}</pre>
      </details>
    </template>
    <p v-if="error" class="tm-err" role="alert">{{ error }}</p>

    <footer v-if="state" class="bar">
      <RsButton :disabled="busy || !changed" @click="check">Check</RsButton>
      <RsButton variant="primary" :disabled="busy || !changed || !checkedNow" @click="save">{{ busy ? 'Working…' : 'Save' }}</RsButton>
      <span class="tm-hint">{{ !changed ? 'No changes.' : checkedNow ? 'Checked. Ready to save.' : 'Check your changes before saving.' }}</span>
      <RsButton v-if="changed" class="undo" variant="quiet" :disabled="busy" @click="undo">Undo changes</RsButton>
    </footer>
  </div>
</template>

<style scoped>
.hk { display: grid; grid-template-columns: minmax(180px, 240px) 1fr; gap: var(--rs-gap); align-items: start; }
.scopes { display: flex; flex-direction: column; gap: 2px; padding: var(--rs-space-2); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.sc { display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-2); min-height: 40px; padding: 6px 12px; border: 0; border-radius: var(--rs-radius-md); background: none; color: var(--rs-text); font: inherit; font-size: var(--rs-text-sm); text-align: left; cursor: pointer; }
.sc:hover { background: var(--rs-bg); }
.sc.on { background: var(--rs-paper); color: var(--rs-paper-ink); }
.sc.gone .lab { text-decoration: line-through; }
.slots { display: grid; gap: var(--rs-space-4); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.slot { margin: 0; }
.sl-head { display: flex; justify-content: space-between; gap: var(--rs-space-2); }
.sl-lab { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.code { font-family: var(--rs-font-code); font-size: 13px; resize: vertical; }
.gen summary { cursor: pointer; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; gap: var(--rs-space-3); flex-wrap: wrap; padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
.undo { margin-left: auto; }
/* above the phone's bottom bar, as in the hardware wizard */
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
@media (max-width: 760px) {
  .hk { grid-template-columns: 1fr; }
  .scopes { flex-direction: row; overflow-x: auto; }
  .sc { flex: none; }
}
</style>
