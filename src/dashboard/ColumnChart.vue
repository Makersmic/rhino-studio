<script setup lang="ts">
/** Weekly columns, parts stacked from the bottom; a light rule at half and full scale. */
import { computed } from 'vue'
import { niceMax, type Column } from './reports'

const props = defineProps<{ columns: Column[]; label: string }>()
const totals = computed(() => props.columns.map((c) => c.parts.reduce((a, p) => a + p.v, 0)))
const max = computed(() => niceMax(Math.max(0, ...totals.value)))
const describe = (c: Column) => `${c.label}: ${c.parts.map((p) => `${p.v} ${p.name.toLowerCase()}`).join(', ')}`
</script>

<template>
  <div class="colchart" role="img" :aria-label="`${label}. ${columns.map(describe).join('; ')}`">
    <div class="scale" aria-hidden="true"><span>{{ max }}</span><span>{{ max / 2 }}</span><span>0</span></div>
    <div class="plot">
      <div v-for="(c, i) in columns" :key="c.start" class="col" :title="describe(c)">
        <span class="stack">
          <span v-for="p in c.parts" v-show="p.v > 0" :key="p.name" class="seg" :class="`fill-${p.fill}`" :style="{ height: `${(p.v / max) * 100}%` }" />
        </span>
        <span class="x" :class="{ hide: (columns.length - 1 - i) % 2 === 1, edge: i === 0 || i === columns.length - 1 }">{{ c.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.colchart { display: grid; grid-template-columns: auto 1fr; gap: var(--rs-space-2); }
.scale { display: flex; flex-direction: column; justify-content: space-between; height: 140px; font-size: 10px; color: var(--rs-text-muted); text-align: right; font-variant-numeric: tabular-nums; transform: translateY(-6px); }
.plot {
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; align-items: end;
  background: linear-gradient(to bottom, var(--rs-line) 1px, transparent 1px) 0 0 / 100% 70px repeat-y;
  background-size: 100% 70px; height: 140px; border-bottom: 1px solid var(--rs-line-strong); position: relative;
}
.col { position: relative; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; min-width: 0; }
.stack { display: flex; flex-direction: column-reverse; height: 100%; gap: 1px; }
.seg { width: 100%; flex: none; border-radius: 1px; }
.x { position: absolute; top: calc(100% + 4px); left: 50%; transform: translateX(-50%); font-size: 10px; color: var(--rs-text-muted); white-space: nowrap; }
.x.hide { visibility: hidden; }
.colchart { padding-bottom: 18px; }
@media (max-width: 560px) { .x { visibility: hidden; } .x.edge { visibility: visible; } .x.edge:first-child, .col:first-child .x { transform: none; left: 0; } .col:last-child .x { transform: none; left: auto; right: 0; } }
</style>
