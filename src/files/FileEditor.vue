<script setup lang="ts">
/**
 * Full-screen text editor for Files (CodeMirror 6, MIT): line numbers,
 * G-code / Klipper highlighting, search (Ctrl+F), Ctrl+S to save, and a
 * warning before closing with unsaved changes. It only edits text in the
 * browser; saving (backup first for config files) is the parent's job, and
 * nothing here ever restarts Klipper.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import RsButton from '@/components/RsButton.vue'
import { gcodeLanguage, klipperLanguage } from './highlight'
import { extOf, isGcode } from './fileOps'

const props = defineProps<{
  path: string // e.g. "config/printer.cfg"
  text: string
  readOnly: boolean
  why: string | null // why it's read-only
  saving: boolean
  savedNote: string | null
  /** e.g. "Restart Klipper to apply"; shown after a save */
  restartLabel: string | null
  restartBlock: string | null
}>()
const emit = defineEmits<{ save: [text: string]; close: []; restart: []; dirty: [boolean] }>()

const host = ref<HTMLDivElement | null>(null)
const view = shallowRef<EditorView | null>(null)
const dirty = ref(false)
let saved = props.text

const style = HighlightStyle.define([
  { tag: t.comment, color: 'var(--rs-text-muted)', fontStyle: 'italic' },
  { tag: t.heading, color: 'var(--rs-text-strong)', fontWeight: '700' },
  { tag: t.keyword, color: 'var(--rs-code-keyword, var(--rs-text-strong))', fontWeight: '700' },
  { tag: t.propertyName, color: 'var(--rs-code-property, var(--rs-text-strong))' },
  { tag: t.number, color: 'var(--rs-code-number, var(--rs-text))' },
  { tag: t.string, color: 'var(--rs-code-string, var(--rs-text-muted))' },
  { tag: t.meta, color: 'var(--rs-text-muted)' },
  { tag: t.atom, color: 'var(--rs-code-number, var(--rs-text))' },
])

function save() {
  if (props.readOnly || props.saving || !view.value) return true
  emit('save', view.value.state.doc.toString())
  return true
}

onMounted(() => {
  const lang = extOf(props.path) === 'cfg' || extOf(props.path) === 'conf' ? [klipperLanguage] : isGcode(props.path) ? [gcodeLanguage] : []
  view.value = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        highlightSelectionMatches(),
        ...lang,
        syntaxHighlighting(style),
        EditorState.readOnly.of(props.readOnly),
        EditorView.editable.of(!props.readOnly),
        keymap.of([{ key: 'Mod-s', run: save, preventDefault: true }, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            dirty.value = u.state.doc.toString() !== saved
            emit('dirty', dirty.value)
          }
        }),
        EditorView.contentAttributes.of({ 'aria-label': `Contents of ${props.path}` }),
      ],
    }),
  })
  view.value.focus()
  window.addEventListener('beforeunload', guard)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  view.value?.destroy()
  window.removeEventListener('beforeunload', guard)
  window.removeEventListener('keydown', onKey)
})
function guard(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}
// Ctrl+S anywhere on the page saves (the browser's own "save page" never runs)
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}
// After the parent saves, what's in the editor is the saved text
watch(
  () => props.savedNote,
  (n) => {
    if (n && view.value) {
      saved = view.value.state.doc.toString()
      dirty.value = false
      emit('dirty', false)
    }
  },
)

const confirmClose = ref(false)
function close() {
  if (dirty.value) confirmClose.value = true
  else emit('close')
}
</script>

<template>
  <div class="editor" role="dialog" aria-modal="true" :aria-label="`Edit ${path}`" @keydown.esc.stop="close">
    <header class="bar">
      <div class="title">
        <span class="path">{{ path }}</span>
        <span v-if="readOnly" class="chip">Read-only</span>
        <span v-else-if="dirty" class="chip ink">Unsaved</span>
        <span v-if="readOnly && why" class="why">{{ why }}</span>
      </div>
      <div class="actions">
        <RsButton v-if="!readOnly" variant="primary" :disabled="!dirty || saving" title="Save (Ctrl+S)" @click="save">{{ saving ? 'Saving…' : 'Save' }}</RsButton>
        <RsButton @click="close">Close</RsButton>
      </div>
    </header>
    <div v-if="savedNote" class="saved" role="status">
      <span>{{ savedNote }}</span>
      <RsButton v-if="restartLabel" :disabled="!!restartBlock" :title="restartBlock ?? undefined" @click="emit('restart')">{{ restartLabel }}</RsButton>
    </div>
    <div ref="host" class="cm" />
    <div v-if="confirmClose" class="ask" role="alertdialog" aria-label="Unsaved changes">
      <p><strong>Close without saving?</strong> Your changes to {{ path }} will be lost.</p>
      <div class="actions">
        <RsButton variant="danger-outline" @click="emit('close')">Discard changes</RsButton>
        <RsButton variant="primary" @click="confirmClose = false">Keep editing</RsButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; background: var(--rs-paper, var(--rs-surface)); color: var(--rs-text); }
.bar { display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-3); padding: 10px 16px; border-bottom: 1px solid var(--rs-line); }
.title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.path { font-family: var(--rs-font-code); font-size: var(--rs-text-sm); color: var(--rs-text-strong); overflow-wrap: anywhere; }
.chip { font-size: var(--rs-text-xs); padding: 2px 8px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-pill); color: var(--rs-text-muted); }
.chip.ink { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.why { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.saved { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 16px; font-size: var(--rs-text-sm); border-bottom: 1px solid var(--rs-line); background: var(--rs-dither-faint, var(--rs-surface-2)); }
.cm { flex: 1; min-height: 0; overflow: hidden; }
.cm :deep(.cm-editor) { height: 100%; font-family: var(--rs-font-code); font-size: 13px; background: var(--rs-paper, var(--rs-surface)); color: var(--rs-text); }
.cm :deep(.cm-editor.cm-focused) { outline: none; }
.cm :deep(.cm-scroller) { font-family: var(--rs-font-code); line-height: 1.55; }
.cm :deep(.cm-gutters) { background: var(--rs-surface-2, var(--rs-surface)); color: var(--rs-text-muted); border-right: 1px solid var(--rs-line); }
.cm :deep(.cm-activeLine), .cm :deep(.cm-activeLineGutter) { background: color-mix(in srgb, var(--rs-ink) 6%, transparent); }
.cm :deep(.cm-cursor) { border-left-color: var(--rs-ink); }
.cm :deep(.cm-selectionBackground), .cm :deep(.cm-content ::selection) { background: color-mix(in srgb, var(--rs-ink) 22%, transparent) !important; }
.cm :deep(.cm-panels) { background: var(--rs-surface-2); color: var(--rs-text); border-top: 1px solid var(--rs-line); }
.cm :deep(.cm-searchMatch) { background: color-mix(in srgb, var(--rs-ink) 18%, transparent); }
.ask { position: absolute; left: 50%; top: 80px; transform: translateX(-50%); width: min(460px, calc(100% - 32px)); padding: 16px 18px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-paper, var(--rs-surface)); box-shadow: 0 12px 40px rgb(0 0 0 / 0.25); }
.ask p { margin: 0 0 12px; font-size: var(--rs-text-sm); }
.ask .actions { justify-content: flex-end; }
@media (max-width: 720px) {
  .bar { padding: 8px 10px; }
  .cm :deep(.cm-editor) { font-size: 12px; }
}
</style>
