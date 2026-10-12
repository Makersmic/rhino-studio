<script setup lang="ts">
/** One maintenance task: what, for which part of the machine, how close it is, and what to do. */
import { computed } from 'vue'
import RsButton from '@/components/RsButton.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { lookFor } from '@/toolheads/registry'
import CareBar from './CareBar.vue'
import { attentionOf } from './summary'
import type { MaintTask } from './types'

const props = withDefaults(defineProps<{ task: MaintTask; compact?: boolean; busy?: boolean }>(), { compact: false, busy: false })
defineEmits<{ log: [task: MaintTask]; snooze: [task: MaintTask] }>()

const att = computed(() => attentionOf(props.task))
const tool = computed(() => (props.task.asset.startsWith('tool:') ? props.task.asset.slice(5) : null))
const stateText = computed(() => ({ overdue: 'Overdue', due_soon: 'Due soon', held: props.task.status?.hold?.label ?? 'On hold', snoozed: 'Snoozed', ok: 'Scheduled', off: 'Off' })[att.value])
const showPriority = computed(() => props.task.priority === 'high' || props.task.priority === 'critical')
</script>

<template>
  <article class="card" :class="[att, { compact }]">
    <header class="top">
      <ToolheadBadge v-if="tool" :look="lookFor(tool)" size="sm" />
      <span v-else class="area">{{ task.asset_label }}</span>
      <span class="state" :class="att">{{ stateText }}</span>
    </header>

    <h3 class="title">{{ task.title }}</h3>

    <CareBar :fraction="task.status?.fraction ?? 0" :level="att" :label="`${task.title}: interval used`" />
    <p class="when">
      {{ task.status?.next?.text ?? task.status?.next?.summary ?? '' }}
      <span v-if="showPriority" class="prio">{{ task.priority === 'critical' ? 'Critical' : 'High priority' }}</span>
    </p>

    <footer v-if="!compact" class="actions">
      <RsButton :disabled="busy" @click="$emit('log', task)">Log work</RsButton>
      <RsButton v-if="att === 'overdue' || att === 'due_soon'" variant="quiet" :disabled="busy" @click="$emit('snooze', task)">Snooze 7 days</RsButton>
      <span v-if="task.minutes" class="mins">About {{ task.minutes }} min</span>
    </footer>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--rs-space-3);
  padding: var(--rs-space-4) var(--rs-space-5) var(--rs-space-5);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  color: var(--rs-text);
  min-width: 0;
}
.card.compact { padding: var(--rs-space-4); gap: var(--rs-space-2); background: var(--rs-surface-2); }
.top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--rs-space-2) var(--rs-space-3); min-height: 32px; }
.area { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.state {
  font-size: var(--rs-text-xs);
  font-weight: var(--rs-weight-medium);
  padding: 3px 10px;
  border-radius: var(--rs-radius-pill);
  border: 1.5px solid var(--rs-line-strong);
  white-space: nowrap;
}
.state.due_soon { background: var(--rs-warn-fill); border-color: transparent; color: var(--th-ink); }
.state.overdue {
  background: var(--rs-warn-fill);
  border-color: transparent;
  color: var(--th-ink);
  font-weight: var(--rs-weight-bold);
  box-shadow: 0 0 0 2px var(--rs-surface), 0 0 0 3.5px var(--rs-warn-fill);
}
.title { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); line-height: 1.25; }
.compact .title { font-size: var(--rs-text-md); }
.card { color: var(--rs-text-muted); }
.title, .area { color: var(--rs-text-strong); }
.when { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.prio { margin-left: var(--rs-space-2); color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-1); }
.mins { margin-left: auto; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
</style>
