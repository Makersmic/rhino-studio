<script setup lang="ts">
/**
 * A toolhead's start and end G-code, picked from your macros (Settings › Macros). The macro's steps are copied into this
 * tool's job hooks (after_start: once START_JOB has homed and heated, just before the file; before_end: before END_PRINT
 * cools and parks). A copy: editing the macro later changes nothing here until Update (Mike, Nov 7). Lines written
 * by hand in Job hooks are kept, and only replaced after asking. Live after a Klipper restart (the banner offers it).
 */
import { computed, onMounted, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { copyMacroTo, type HookSources, type HooksState } from '@/hardware/hooks'
import { sourceState, type UserMacro } from '@/control/userMacros'
import { useControlStore } from '@/stores/control'
import { useToolMgrStore } from '@/stores/toolmgr'
import { useUserMacrosStore } from '@/stores/userMacros'

const props = defineProps<{ tool: string }>()
const tm = useToolMgrStore()
const control = useControlStore()
const macros = useUserMacrosStore()

const state = ref<HooksState | null>(null)
const error = ref<string | null>(null)
const note = ref<string | null>(null)
const busy = ref(false)
async function load() {
  error.value = null
  try {
    state.value = await tm.client().hooksState()
    if (!macros.loaded) await macros.load()
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(load)
watch(() => props.tool, load)

const SLOTS = [
  { slot: 'after_start' as const, label: 'Start G-code', when: 'After START_JOB has homed and heated, just before the file' },
  { slot: 'before_end' as const, label: 'End G-code', when: 'Before END_PRINT cools down and parks' },
]
const scope = computed(() => `tool:${props.tool}`)
const offered = computed(() => macros.list.filter((m) => !m.toolheads.length || m.toolheads.includes(props.tool)))
function row(slot: 'after_start' | 'before_end') {
  const lines = state.value?.hooks[scope.value]?.[slot] ?? []
  const src = state.value?.sources?.[scope.value]?.[slot]
  const st = sourceState(src, macros.list)
  return { lines, src, st, macro: src ? macros.list.find((m) => m.id === src.macro) ?? null : null }
}

async function apply(slot: 'after_start' | 'before_end', m: UserMacro | null) {
  if (!state.value) return
  if (control.jobActive) return (error.value = 'Not while a job is running: it changes how jobs start and end.')
  const r = row(slot)
  const label = SLOTS.find((x) => x.slot === slot)!.label
  if (r.lines.length && !r.src && m) {
    const ok = await control.confirm({
      title: `Replace ${props.tool}'s ${label.toLowerCase()}?`,
      body: `It has lines written in Job hooks. ${m.name} replaces them; the old ones stay in the hooks history.`,
      lines: r.lines.map((t) => ({ text: t, reason: 'written by hand' })),
      confirmLabel: 'Replace',
      tone: 'motion',
    })
    if (!ok) return
  }
  const next = copyMacroTo(state.value.hooks, (state.value.sources ?? {}) as HookSources, props.tool, slot, m)
  if ('error' in next) return (error.value = next.error)
  busy.value = true
  error.value = null
  try {
    await tm.client().saveHooks({ rev: state.value.rev, hooks: next.hooks, sources: next.sources })
    await tm.changed()
    await load()
    note.value = `${label} ${m ? `is now ${m.name}` : 'cleared'}. Restart Klipper to make it live.`
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
function pick(slot: 'after_start' | 'before_end', id: string) {
  void apply(slot, id ? (macros.list.find((m) => m.id === id) ?? null) : null)
}
</script>

<template>
  <div class="se">
    <p v-if="!macros.supported" class="muted">Start and end G-code from your macros need Tool Manager 1.9.13.</p>
    <p v-else-if="error" class="msg bad" role="alert">{{ error }}</p>
    <template v-if="state && macros.supported">
      <div v-for="s in SLOTS" :key="s.slot" class="row">
        <label :for="`se-${s.slot}`" class="lab">
          <strong>{{ s.label }}</strong>
          <small>{{ s.when }}</small>
        </label>
        <div class="pick">
          <select :id="`se-${s.slot}`" :value="row(s.slot).src?.macro ?? (row(s.slot).lines.length ? '__hand' : '')" :disabled="busy || control.jobActive" @change="pick(s.slot, ($event.target as HTMLSelectElement).value)">
            <option value="">None</option>
            <option v-if="row(s.slot).lines.length && !row(s.slot).src" value="__hand" disabled>Lines written in Job hooks</option>
            <option v-if="row(s.slot).st === 'gone'" :value="row(s.slot).src!.macro" disabled>{{ row(s.slot).src!.name }} (deleted)</option>
            <option v-for="m in offered" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <span v-if="row(s.slot).st === 'changed'" class="changed">
            {{ row(s.slot).src!.name }} changed since it was copied.
            <RsButton size="sm" :disabled="busy" @click="apply(s.slot, row(s.slot).macro)">Update</RsButton>
          </span>
          <span v-else-if="row(s.slot).st === 'gone'" class="changed">That macro was deleted; the copied lines still run.</span>
        </div>
        <pre v-if="row(s.slot).lines.length" class="lines">{{ row(s.slot).lines.join('\n') }}</pre>
      </div>
      <p v-if="note" class="msg" role="status">{{ note }}</p>
      <p class="sub">Copied from <RouterLink to="/settings/macros">your macros</RouterLink>; edit the lines themselves in <RouterLink to="/assets/hooks">Job hooks</RouterLink>.</p>
    </template>
  </div>
</template>

<style scoped>
.row { padding: var(--rs-space-2) 0; border-top: 1px solid var(--rs-line); }
.row:first-child { border-top: 0; }
.lab { display: flex; flex-direction: column; gap: 1px; margin-bottom: 6px; }
.lab strong { font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.lab small { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.pick { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2) var(--rs-space-3); }
.pick select { min-width: 200px; padding: 6px 8px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.changed { font-size: var(--rs-text-sm); color: var(--rs-text-strong); display: inline-flex; align-items: center; gap: var(--rs-space-2); }
.lines { margin: 6px 0 0; padding: 6px 10px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); font-family: var(--rs-font-code); font-size: var(--rs-text-xs); white-space: pre-wrap; overflow-wrap: anywhere; }
.sub { font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin: var(--rs-space-2) 0 0; }
</style>
