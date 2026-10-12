<script setup lang="ts">
/**
 * Macro buttons (see macroGroups.ts for what goes where).
 *
 *   kind="tool"    macros for the mounted toolhead; changes with the tool and
 *                  wears the tool's accent tab, like the status box tile
 *   kind="shared"  system macros; the same whatever is mounted
 *
 * Each button goes through the same safety check as the console.
 */
import { computed } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import type { MacroGroup } from './macroGroups'
import { useToolMacros } from './useToolMacros'

const props = defineProps<{ kind: 'tool' | 'shared' }>()

const control = useControlStore()
const machine = useMachineStore()
const { showAll, toolName, panels, hidden } = useToolMacros()

const groups = computed<MacroGroup[]>(() => {
  if (props.kind === 'shared') return panels.value.shared
  const g: MacroGroup[] = []
  if (panels.value.tool.length) g.push({ title: '', buttons: panels.value.tool })
  if (panels.value.toolMore.length) g.push({ title: showAll.value ? 'More, including other tools' : 'More for this tool', buttons: panels.value.toolMore.map((b) => ({ ...b, label: b.name })), dense: true })
  return g
})

const title = computed(() => (props.kind === 'shared' ? 'System' : toolName.value ? `For ${toolName.value}` : 'Tool macros'))
const status = computed(() => (props.kind === 'tool' && toolName.value ? 'Changes with the tool' : undefined))
const accent = computed(() => (props.kind === 'tool' && machine.mountedVerified ? `var(${machine.mountedLook.accentVar})` : undefined))

const runMacro = (name: string, label: string) => control.send(name, { label })
</script>

<template>
  <RsPanel :title="title" :status="status" class="macro-panel" :class="[kind, { tabbed: !!accent }]" :style="accent ? { '--accent': accent } : undefined">
    <div class="macros">
      <section v-for="g in groups" :key="g.title" class="group">
        <h3 v-if="g.title">{{ g.title }}</h3>
        <div class="buttons" :class="{ dense: g.dense }">
          <button
            v-for="b in g.buttons"
            :key="b.name"
            type="button"
            class="macro"
            :class="{ suggested: b.suggested }"
            :disabled="!machine.klippyReady"
            :title="control.macros.get(b.name) || b.name"
            @click="runMacro(b.name, b.label)"
          >
            {{ b.label }}
          </button>
        </div>
      </section>

      <p v-if="!machine.klippyReady && !groups.length" class="muted small">Macros appear when Klipper is connected.</p>
      <p v-else-if="kind === 'tool' && !toolName" class="muted small">
        No tool confirmed. Swap or confirm the tool in the top bar; its macros appear once Klipper confirms it.
      </p>
      <p v-else-if="kind === 'tool' && !groups.length" class="muted small">This tool has no macros of its own.</p>
    </div>

    <p class="note">
      <template v-if="kind === 'tool'">
        Wizard macros ask their own questions. Macros that move the machine or power a tool ask first.
        <button v-if="hidden" type="button" class="more" @click="showAll = !showAll">{{ showAll ? 'Hide' : 'Show' }} {{ hidden }} for other tools</button>
      </template>
      <template v-else>Swap (with the list of toolheads) and Confirm tool are in the top bar. Pause and Cancel are with the job.</template>
    </p>
  </RsPanel>
</template>

<style scoped>
/* The mounted tool's tab on the tool panel, the same tab as the status box tile */
.tabbed :deep(.head) { position: relative; }
.tabbed :deep(.head)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 5px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
}
.macros { display: flex; flex-direction: column; gap: var(--rs-space-4); }
h3 { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); margin-bottom: var(--rs-space-2); }
.buttons { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 6px; }
.macro {
  min-height: 38px;
  padding: 0 12px;
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line);
  background: var(--rs-surface-2);
  color: var(--rs-text-strong);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.macro:hover:not(:disabled) { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.macro.suggested { border: 2px solid var(--rs-ink); }
.macro:disabled { opacity: 0.35; cursor: not-allowed; }
.dense .macro { min-height: 32px; font-family: var(--rs-font-code); font-size: 11px; font-weight: 400; background: transparent; }
.note { margin-top: var(--rs-space-4); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.small { font-size: var(--rs-text-sm); }
.more { margin-left: 4px; padding: 0; border: 0; background: none; color: var(--rs-text-strong); font: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
