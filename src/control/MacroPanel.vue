<script setup lang="ts">
/**
 * Macro buttons, grouped by what you're doing (see macroGroups.ts).
 * Each one goes through the same safety check as the console.
 */
import { computed } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { macroGroups } from './macroGroups'

const control = useControlStore()
const machine = useMachineStore()

const groups = computed(() =>
  macroGroups(new Set(control.macros.keys()), {
    toolType: machine.toolState.kind === 'mounted' ? machine.toolState.type : null,
    toolName: machine.mountedName,
    needsRestore: machine.toolState.kind === 'none-confirmed' && !!machine.toolState.lastSavedSlot,
  }),
)
const runMacro = (name: string, label: string) => control.send(name, { label })
</script>

<template>
  <RsPanel title="Macros" index="05">
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
    <p class="note">Wizard macros ask their own questions. Macros that move the machine or power a tool ask first.</p>
  </RsPanel>
</template>

<style scoped>
.macros { display: flex; flex-direction: column; gap: var(--rs-space-4); }
h3 { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); margin-bottom: var(--rs-space-2); }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.macro {
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line-strong);
  background: transparent;
  color: var(--rs-text-strong);
  font-size: var(--rs-text-sm);
  font-weight: var(--rs-weight-medium);
  cursor: pointer;
}
.macro:hover:not(:disabled) { border-color: var(--rs-text-strong); }
.macro.suggested { background: var(--rs-warn-fill); border-color: transparent; color: var(--th-ink); }
.macro:disabled { opacity: 0.4; cursor: not-allowed; }
.dense .macro { min-height: 30px; font-family: var(--rs-font-code); font-size: var(--rs-text-xs); font-weight: 400; }
.note { margin-top: var(--rs-space-4); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.small { font-size: var(--rs-text-sm); }
</style>
