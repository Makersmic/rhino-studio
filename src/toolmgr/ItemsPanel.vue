<script setup lang="ts">
/**
 * A tool's controls or macros as a list with Edit and Delete, plus Add.
 * Editing opens ItemDialog; the list itself is saved with the tool.
 */
import { computed, ref } from 'vue'
import ItemDialog from './ItemDialog.vue'
import { controlToDraft, ctlMacroNames, describeControl, newControl, newMacro, type ControlDraft } from './form'
import type { ToolControl, ToolMacro, ToolOptions } from './types'
import './forms.css'

const props = defineProps<{
  kind: 'control' | 'macro'
  list: (ToolControl | ToolMacro)[]
  controls?: ToolControl[]
  ctx: Record<string, unknown>
  toolName: string
  options: ToolOptions
  pinsTaken?: string[]
  pinsMine?: string[]
}>()

const editing = ref<{ index: number; item: ControlDraft | (ToolMacro & { original?: string }) } | null>(null)
const others = computed(() => props.list.filter((_, i) => i !== editing.value?.index))
const generated = computed(() => (props.kind === 'macro' ? ctlMacroNames(props.controls ?? []) : []))
const taken = computed(() => [...(props.pinsTaken ?? []), ...(props.kind === 'control' ? (others.value as ToolControl[]).map((c) => c.pin) : [])])

function open(i: number) {
  if (props.kind === 'control') {
    editing.value = { index: i, item: i >= 0 ? controlToDraft(props.list[i] as ToolControl) : newControl(props.options) }
  } else {
    editing.value = { index: i, item: i >= 0 ? { ...(props.list[i] as ToolMacro), original: props.list[i]!.name } : newMacro() }
  }
}
function save(item: ToolControl | ToolMacro) {
  const e = editing.value!
  if (e.index < 0) props.list.push(item)
  else props.list.splice(e.index, 1, item)
  editing.value = null
}
function remove(i: number) {
  props.list.splice(i, 1)
}
</script>

<template>
  <div class="ip">
    <p class="tm-lead">
      <template v-if="kind === 'control'">Extra outputs and inputs this tool brings: a vacuum relay, a cooling fan, a servo, a lid switch… Describe what each one does and the Portal works out the Klipper section for it. The tool's main power output is separate.</template>
      <template v-else>G-code macros that belong to this tool: a purge, a test cut, a park move… They're written to custom_tools.cfg with the tool and removed with it.</template>
    </p>
    <div class="tm-list">
      <div v-if="!list.length && !generated.length" class="tm-empty">No {{ kind === 'control' ? 'extra controls' : 'macros' }} yet.</div>
      <div v-for="(it, i) in list" :key="`${it.name}-${i}`" class="tm-item">
        <div class="main">
          <strong :class="{ mono: kind === 'macro' }">{{ it.name }}</strong>
          <span class="tm-hint">
            <template v-if="kind === 'control'">{{ (it as ToolControl).purpose ? `${(it as ToolControl).purpose} - ` : '' }}{{ describeControl(it as ToolControl, options.input_actions) }}</template>
            <template v-else>{{ (it as ToolMacro).purpose || 'no purpose given' }}{{ (it as ToolMacro).mounted_only ? ' · only while mounted' : '' }}</template>
          </span>
        </div>
        <button type="button" class="tm-link" @click="open(i)">Edit</button>
        <button type="button" class="tm-link danger" :aria-label="`Delete ${it.name}`" @click="remove(i)">Delete</button>
      </div>
      <div v-if="generated.length" class="tm-item gen">
        <div class="main">
          <strong>Made by your controls</strong>
          <span class="tm-hint mono">{{ generated.join('  ') }}</span>
          <span class="tm-hint">Change these on the Controls tab.</span>
        </div>
      </div>
    </div>
    <button type="button" class="tm-link add" @click="open(-1)">+ Add a {{ kind }}</button>

    <ItemDialog
      :kind="kind"
      :item="editing?.item ?? null"
      :others="others"
      :controls="controls"
      :ctx="ctx"
      :tool-name="toolName"
      :options="options"
      :pins-taken="taken"
      :pins-mine="pinsMine ?? []"
      @close="editing = null"
      @save="save"
    />
  </div>
</template>

<style scoped>
.ip { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.gen { background: var(--rs-dither-faint), var(--rs-surface); border-style: dashed; }
.add { align-self: flex-start; }
</style>
