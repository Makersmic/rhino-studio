<script setup lang="ts">
/**
 * Control: one status display, then the modules you drive the machine with.
 *
 *   [ status: toolhead | what the tool uses | job + its controls ]
 *     (temperatures are set right there, with their graphs)
 *   [ motion + position         ] [ camera                     ]
 *   [ macros         ] [ console                               ]
 *
 * Every command goes through the control store's safety check.
 */
import Icon from '@/icons/Icon.vue'
import StatusStrip from '@/control/StatusStrip.vue'
import MotionPanel from '@/control/MotionPanel.vue'
import WebcamPanel from '@/control/WebcamPanel.vue'
import MacroPanel from '@/control/MacroPanel.vue'
import ConsolePanel from '@/control/ConsolePanel.vue'
</script>

<template>
  <div class="view">
    <div class="head">
      <h1>Control</h1>
      <RouterLink to="/pendant" class="pendant-link"><Icon nav="pendant" :size="18" />Pendant mode</RouterLink>
    </div>

    <StatusStrip />

    <div class="grid-a">
      <MotionPanel class="motion" />
      <WebcamPanel />
    </div>

    <!-- Macros: the mounted tool's own (changes with the tool) above the
         system ones (always the same), beside the console. -->
    <div class="grid-b">
      <div class="stack macros-col">
        <MacroPanel kind="tool" />
        <MacroPanel kind="shared" />
      </div>
      <ConsolePanel />
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-4); padding: 0 var(--rs-space-1) var(--rs-space-1); }
h1 { font-size: var(--rs-text-xl); }
.pendant-link {
  display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px 0 10px;
  border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong);
  color: var(--rs-text-strong); text-decoration: none; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium);
}
.pendant-link:hover { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.grid-a { display: grid; gap: var(--rs-gap); grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: stretch; }
.stack { display: flex; flex-direction: column; gap: var(--rs-gap); min-width: 0; }
.stack > :last-child { flex: 1; }
.grid-b { display: grid; gap: var(--rs-gap); grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: stretch; }
@media (max-width: 1100px) { .grid-a, .grid-b { grid-template-columns: 1fr; } }
</style>
