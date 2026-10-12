<script setup lang="ts">
/**
 * Macro buttons, grouped by what you're doing (see macroGroups.ts).
 * Each one goes through the same safety check as the console.
 */
import { computed, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { hiddenForOtherTools, macroGroups } from './macroGroups'

const control = useControlStore()
const machine = useMachineStore()

// Macros for other tools are left out unless you ask for them (they'd be refused anyway)
const showAll = ref(false)
const toolType = computed(() => (machine.toolState.kind === 'mounted' ? machine.toolState.type : null))
const available = computed(() => new Set(control.macros.keys()))
const hidden = computed(() => hiddenForOtherTools(available.value, toolType.value, machine.mountedName))
const groups = computed(() =>
  macroGroups(available.value, {
    toolType: toolType.value,
    toolName: machine.mountedName,
    needsRestore: machine.toolState.kind === 'none-confirmed' && !!machine.toolState.lastSavedSlot,
    showAll: showAll.value,
  }),
)
const runMacro = (name: string, label: string) => control.send(name, { label })
</script>

<template>
  <RsPanel title="Macros" :status="machine.mountedName ? `for ${machine.mountedName}` : undefined">
    <div class="macros">
      <section v-for="g in groups" :key="g.title" class="group">
        <h3>{{ g.title }}</h3>
        <div class="buttons" :class="{ dense: g.title === 'Other macros' }">
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
      <p v-if="!groups.length" class="muted small">Macros appear when Klipper is connected.</p>
    </div>
    <p class="note">
      Wizard macros ask their own questions. Macros that move the machine or power a tool ask first.
      <template v-if="hidden">
        <button type="button" class="more" @click="showAll = !showAll">{{ showAll ? 'Hide' : 'Show' }} {{ hidden }} for other tools</button>
      </template>
    </p>
  </RsPanel>
</template>

<style scoped>
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
