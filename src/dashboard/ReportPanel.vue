<script setup lang="ts">
/**
 * One report on the Dashboard: an RsPanel with a one-line explanation, a key
 * for the fills, the chart, and a Table button that swaps the chart for the
 * numbers (for exact values and for screen readers).
 */
import { ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import type { Fill } from './reports'

defineProps<{
  title: string
  sub?: string
  panelId: string
  legend?: { name: string; fill: Fill }[]
  table?: { head: string[]; rows: (string | number)[][] }
}>()
const showTable = ref(false)
</script>

<template>
  <RsPanel :title="title" :panel-id="panelId">
    <template v-if="table" #actions>
      <button type="button" class="tbtn" :aria-pressed="showTable" @click="showTable = !showTable">{{ showTable ? 'Chart' : 'Table' }}</button>
    </template>
    <p v-if="sub" class="sub">{{ sub }}</p>
    <ul v-if="legend?.length && !showTable" class="legend" aria-hidden="true">
      <li v-for="l in legend" :key="l.name"><i :class="`fill-${l.fill}`" />{{ l.name }}</li>
    </ul>
    <table v-if="table && showTable" class="nums">
      <thead><tr><th v-for="h in table.head" :key="h" scope="col">{{ h }}</th></tr></thead>
      <tbody><tr v-for="(r, i) in table.rows" :key="i"><td v-for="(c, j) in r" :key="j">{{ c }}</td></tr></tbody>
    </table>
    <slot v-else />
  </RsPanel>
</template>

<style scoped>
.sub { margin: 0 0 var(--rs-space-3); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.legend { list-style: none; margin: 0 0 var(--rs-space-3); padding: 0; display: flex; flex-wrap: wrap; gap: 4px var(--rs-space-4); font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.legend li { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 14px; height: 10px; border-radius: 2px; }
.tbtn {
  height: 28px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm);
  background: none; color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-xs); cursor: pointer;
}
.tbtn:hover { border-color: var(--rs-text-muted); }
.nums { width: 100%; border-collapse: collapse; font-size: var(--rs-text-sm); font-variant-numeric: tabular-nums; }
.nums th { text-align: left; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 4px 8px 6px 0; border-bottom: 1px solid var(--rs-line); }
.nums td { padding: 5px 8px 5px 0; border-bottom: 1px dotted var(--rs-line); color: var(--rs-text-strong); }
.nums td:not(:first-child), .nums th:not(:first-child) { text-align: right; }
</style>
