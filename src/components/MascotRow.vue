<script setup lang="ts">
/**
 * A wizard step: the mascot pose on the left (sticky while the step scrolls), the step's content on the right.
 * Narrow panels put a smaller rhino above the content. Every wizard uses this, so they read as one family.
 */
import RsMascot from './RsMascot.vue'
import type { Pose } from '@/brand/mascot'

defineProps<{ pose: Pose }>()
</script>

<template>
  <div class="qa">
    <div class="qa-in">
      <RsMascot class="mascot" :pose="pose" />
      <div class="body"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.qa { container-type: inline-size; }
.qa-in { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: var(--rs-space-5); align-items: start; }
.mascot { width: 168px; position: sticky; top: var(--rs-space-4); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); min-width: 0; }
@container (max-width: 560px) {
  .qa-in { grid-template-columns: minmax(0, 1fr); }
  .mascot { width: 112px; position: static; }
}
</style>
