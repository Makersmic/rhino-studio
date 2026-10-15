<script setup lang="ts">
/**
 * A task's state as a small chip. Overdue is inverted ink, due soon an ink
 * outline; a status code (Waiting on parts) gets its Portal colour only as a
 * small tab, the way toolhead accents are used. Red stays for Stop.
 */
import { computed } from 'vue'
import { attentionOf } from './summary'
import type { MaintTask } from './types'

const props = defineProps<{ task: MaintTask }>()
const att = computed(() => (props.task.archived ? 'archived' : attentionOf(props.task)))
const hold = computed(() => props.task.status?.hold ?? null)
const text = computed(
  () =>
    ({ overdue: 'Overdue', due_soon: 'Due soon', held: hold.value?.label ?? 'On hold', snoozed: 'Snoozed', ok: 'Scheduled', off: 'Paused', archived: 'Archived' })[att.value] ??
    att.value,
)
</script>

<template>
  <span class="ts">
    <span v-if="hold" class="chip hold" :title="hold.note || hold.label"><span class="tab" :style="{ background: hold.hex }" />{{ hold.label }}</span>
    <span v-if="!hold || att !== 'held'" class="chip" :class="att">{{ text }}</span>
  </span>
</template>

<style scoped>
.ts { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: var(--rs-radius-sm);
  border: 1px solid var(--rs-line); font-size: 11px; font-weight: var(--rs-weight-medium); color: var(--rs-text); white-space: nowrap;
}
.chip.due_soon { border-color: var(--rs-ink); color: var(--rs-text-strong); }
.chip.overdue { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.chip.off, .chip.archived { color: var(--rs-text-muted); background: var(--rs-dither-faint); }
.chip.hold { color: var(--rs-text-strong); border-color: var(--rs-line-strong); padding-left: 0; overflow: hidden; }
.tab { width: 5px; align-self: stretch; }
</style>
