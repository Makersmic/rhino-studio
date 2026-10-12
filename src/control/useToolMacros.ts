/**
 * The mounted tool's macros, shared by the two places they appear:
 * the bottom row of the status box (desktop) and the tool macro panel
 * (tablet and phone). Grouping rules live in macroGroups.ts.
 * Every button runs through control.send, so the same safety check applies.
 */
import { computed, ref } from 'vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { hiddenForOtherTools, macroPanels } from './macroGroups'

export function useToolMacros() {
  const control = useControlStore()
  const machine = useMachineStore()

  // Macros for other tools are left out unless you ask for them (they'd be refused anyway)
  const showAll = ref(false)
  const toolType = computed(() => (machine.toolState.kind === 'mounted' ? machine.toolState.type : null))
  const toolName = computed(() => (machine.toolState.kind === 'mounted' ? machine.mountedName : null))
  const available = computed(() => new Set(control.macros.keys()))
  const panels = computed(() =>
    macroPanels(available.value, { toolType: toolType.value, toolName: toolName.value, showAll: showAll.value }),
  )
  const hidden = computed(() => hiddenForOtherTools(available.value, toolType.value, toolName.value))
  const describe = (name: string) => control.macros.get(name) || name
  const run = (name: string, label: string) => control.send(name, { label })

  return { showAll, toolName, panels, hidden, describe, run, ready: computed(() => machine.klippyReady) }
}
