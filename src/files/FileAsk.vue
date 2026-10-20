<script setup lang="ts">
/**
 * The questions Files asks, one at a time:
 * - name:    a name for a new file or folder, a rename or a copy (checked as you type)
 * - replace: a file with that name is already there: Replace, Keep both, or Cancel
 * - move:    pick a folder of the same root to move into
 * Call open() and await the answer; null = cancelled.
 */
import { computed, nextTick, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { nameProblem, join } from './fileOps'
import { useMachineStore } from '@/stores/machine'

type NameReq = { kind: 'name'; title: string; label: string; value: string; ok: string; taken: ReadonlySet<string>; hint?: string }
type ReplaceReq = { kind: 'replace'; name: string; folder: string }
type MoveReq = { kind: 'move'; title: string; root: string; from: string; forbid: string | null }
export type AskReq = NameReq | ReplaceReq | MoveReq
export type AskAnswer = { name: string } | { choice: 'replace' | 'keep' } | { folder: string }

const machine = useMachineStore()
const dlg = ref<HTMLDialogElement | null>(null)
const req = ref<AskReq | null>(null)
let resolve: ((a: AskAnswer | null) => void) | null = null

// name
const value = ref('')
const problem = computed(() => {
  if (req.value?.kind !== 'name') return null
  return nameProblem(value.value) ?? (req.value.taken.has(value.value) ? 'Something here already has that name' : null)
})
// move
const at = ref('') // folder inside the root being browsed
const dirs = ref<string[]>([])
const moveErr = ref<string | null>(null)
async function browse(folder: string) {
  if (req.value?.kind !== 'move') return
  at.value = folder
  moveErr.value = null
  try {
    const l = await machine.getDirectory(join(req.value.root, folder))
    dirs.value = l.dirs.map((d) => d.dirname).filter((d) => !d.startsWith('.')).sort((a, b) => a.localeCompare(b))
  } catch (e) {
    dirs.value = []
    moveErr.value = (e as Error).message
  }
}
const crumbs = computed(() => (at.value ? at.value.split('/') : []))
/** Can't move a folder into itself, or a thing to where it already is */
const moveBlock = computed(() => {
  if (req.value?.kind !== 'move') return null
  if (at.value === req.value.from) return 'It is already in this folder'
  const f = req.value.forbid
  if (f && (at.value === f || at.value.startsWith(`${f}/`))) return "A folder can't go inside itself"
  return null
})

async function open(r: AskReq): Promise<AskAnswer | null> {
  resolve?.(null)
  req.value = r
  if (r.kind === 'name') value.value = r.value
  if (r.kind === 'move') await browse(r.from)
  await nextTick()
  dlg.value?.showModal()
  if (r.kind === 'name') {
    const inp = dlg.value?.querySelector('input')
    inp?.focus()
    // select the name without its extension, like a desktop rename
    const dot = r.value.lastIndexOf('.')
    inp?.setSelectionRange(0, dot > 0 ? dot : r.value.length)
  }
  return new Promise((res) => (resolve = res))
}
function done(a: AskAnswer | null) {
  dlg.value?.close()
  req.value = null
  const r = resolve
  resolve = null
  r?.(a)
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dlg" class="ask" @cancel.prevent="done(null)">
    <form v-if="req?.kind === 'name'" @submit.prevent="!problem && done({ name: value })">
      <h2>{{ req.title }}</h2>
      <label class="fld">
        <span class="lbl">{{ req.label }}</span>
        <input v-model="value" class="in" spellcheck="false" autocomplete="off" :aria-invalid="!!problem" />
        <span class="hint" :class="{ bad: problem && value !== req.value }">{{ problem && value !== req.value ? problem : req.hint ?? ' ' }}</span>
      </label>
      <div class="actions">
        <RsButton @click="done(null)">Cancel</RsButton>
        <RsButton variant="primary" type="submit" :disabled="!!problem">{{ req.ok }}</RsButton>
      </div>
    </form>

    <div v-else-if="req?.kind === 'replace'">
      <h2>{{ req.name }} is already here</h2>
      <p class="text">{{ req.folder ? `The folder ${req.folder}` : 'This folder' }} already has a file called <strong>{{ req.name }}</strong>. Replace it, or keep both (the new one gets a number)?</p>
      <div class="actions">
        <RsButton @click="done(null)">Cancel</RsButton>
        <RsButton @click="done({ choice: 'keep' })">Keep both</RsButton>
        <RsButton variant="danger-outline" @click="done({ choice: 'replace' })">Replace</RsButton>
      </div>
    </div>

    <div v-else-if="req?.kind === 'move'">
      <h2>{{ req.title }}</h2>
      <nav class="crumbs" aria-label="Folder">
        <button type="button" :class="{ on: !at }" @click="browse('')">{{ req.root === 'gcodes' ? 'Gcode files' : 'Config' }}</button>
        <template v-for="(c, i) in crumbs" :key="i">
          <span class="sep">›</span>
          <button type="button" :class="{ on: i === crumbs.length - 1 }" @click="browse(crumbs.slice(0, i + 1).join('/'))">{{ c }}</button>
        </template>
      </nav>
      <ul class="dirs">
        <li v-for="d in dirs" :key="d"><button type="button" @click="browse(join(at, d))"><span class="fold" aria-hidden="true" />{{ d }}</button></li>
        <li v-if="!dirs.length" class="muted">{{ moveErr ?? 'No folders inside this one.' }}</li>
      </ul>
      <div class="actions">
        <span class="hint">{{ moveBlock ?? ' ' }}</span>
        <RsButton @click="done(null)">Cancel</RsButton>
        <RsButton variant="primary" :disabled="!!moveBlock" @click="done({ folder: at })">Move here</RsButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.ask { width: min(480px, calc(100vw - 32px)); padding: 20px 22px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text); }
.ask::backdrop { background: rgb(0 0 0 / 0.35); }
h2 { margin: 0 0 12px; font-size: 1.05rem; font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); overflow-wrap: anywhere; }
.text { margin: 0 0 16px; font-size: var(--rs-text-sm); }
.fld { display: flex; flex-direction: column; gap: 6px; }
.lbl { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.in { padding: 9px 11px; border: 1px solid var(--rs-line-strong); border-radius: 8px; background: var(--rs-surface); color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: var(--rs-text-sm); }
.in:focus { outline: 2px solid var(--rs-ink); outline-offset: 1px; }
.hint { min-height: 1.2em; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.hint.bad { color: var(--rs-danger); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.actions .hint { margin-right: auto; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 8px; font-size: var(--rs-text-sm); }
.crumbs button { border: 0; background: none; padding: 2px 4px; color: var(--rs-text-muted); font: inherit; cursor: pointer; border-radius: 4px; }
.crumbs button.on { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.crumbs .sep { color: var(--rs-text-muted); }
.dirs { list-style: none; margin: 0; padding: 0; max-height: 260px; overflow: auto; border: 1px solid var(--rs-line); border-radius: 8px; }
.dirs li + li { border-top: 1px solid var(--rs-line); }
.dirs button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; border: 0; background: none; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); text-align: left; cursor: pointer; }
.dirs button:hover { background: var(--rs-surface-2); }
.dirs .muted { padding: 10px 12px; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.fold { width: 16px; height: 12px; border: 1.5px solid var(--rs-text-muted); border-radius: 2px 2px 3px 3px; position: relative; }
.fold::before { content: ''; position: absolute; left: -1.5px; top: -4px; width: 7px; height: 3px; border: 1.5px solid var(--rs-text-muted); border-bottom: 0; border-radius: 2px 2px 0 0; }
</style>
