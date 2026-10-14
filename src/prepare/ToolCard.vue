<script setup lang="ts">
/**
 * A toolhead as a way into a job: what it makes, what files it takes and the
 * facts that decide whether it fits the job. The whole card is one button.
 */
import Icon from '@/icons/Icon.vue'
import type { ToolheadLook } from '@/toolheads/registry'

defineProps<{
  look: ToolheadLook
  slot: number | null
  process: string
  facts: Array<{ label: string; value: string }>
  mounted?: boolean
  action: string
}>()
defineEmits<{ pick: [] }>()
</script>

<template>
  <button type="button" class="card" :style="{ '--accent': `var(${look.accentVar})` }" :aria-label="`${action}: ${look.name}`" @click="$emit('pick')">
    <span class="head">
      <span class="emblem"><Icon :tool="look.icon" :size="44" /></span>
      <span class="who">
        <span class="name">{{ look.name }}</span>
        <span class="proc">{{ process }}</span>
      </span>
      <span v-if="slot != null" class="index">{{ String(slot).padStart(2, '0') }}</span>
    </span>
    <dl class="facts">
      <div v-for="f in facts" :key="f.label" class="fact">
        <dt>{{ f.label }}</dt>
        <dd>{{ f.value }}</dd>
      </div>
    </dl>
    <span class="foot">
      <span class="go">{{ action }} <span aria-hidden="true">→</span></span>
      <span v-if="mounted" class="mounted">Mounted</span>
    </span>
  </button>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--rs-space-3);
  padding: var(--rs-space-4) var(--rs-space-4) var(--rs-space-4) var(--rs-space-5);
  border: 1px solid var(--rs-line);
  border-radius: var(--rs-radius-lg);
  background: var(--rs-surface);
  color: var(--rs-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
}
/* the tool's colour: one tab along the top edge */
.card::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--accent); }
.card:hover { border-color: var(--rs-line-strong); }
.card:hover .go { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.head { display: flex; align-items: center; gap: var(--rs-space-3); }
.emblem { display: grid; place-items: center; width: 56px; height: 56px; flex: none; border-radius: var(--rs-radius-md); background: var(--rs-dither-faint); color: var(--rs-text-strong); }
.who { display: flex; flex-direction: column; min-width: 0; }
.name { font-size: var(--rs-text-lg); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.proc { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.index { margin-left: auto; align-self: flex-start; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: var(--rs-space-2); }
.mounted { padding: 2px 8px; border-radius: var(--rs-radius-sm); background: var(--rs-ink); color: var(--rs-on-ink); font-size: 11px; font-weight: var(--rs-weight-medium); }
.facts { margin: 0; display: flex; flex-direction: column; gap: 6px; background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 0 / 5px 2px repeat-x; padding-top: var(--rs-space-3); }
.fact { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: var(--rs-space-2); font-size: var(--rs-text-xs); }
.fact dt { color: var(--rs-text-muted); }
.fact dd { margin: 0; color: var(--rs-text-strong); }
.go { padding: 6px 12px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
</style>
