<script setup lang="ts">
/** Horizontal bars, one row per item, parts stacked left to right; the total (or a note) after the bar. */
import { computed } from 'vue'
import { niceMax, type BarRow } from './reports'

const props = withDefaults(defineProps<{ rows: BarRow[]; fmt?: (v: number) => string; axis?: boolean; label: string }>(), {
  fmt: (v: number) => Math.round(v).toLocaleString(),
  axis: true,
})
const max = computed(() => niceMax(Math.max(0, ...props.rows.map((r) => r.total))))
const pct = (v: number) => `${(v / max.value) * 100}%`
const describe = (r: BarRow) => `${r.label}: ${r.parts.filter((p) => p.v).map((p) => `${p.name} ${props.fmt(p.v)}`).join(', ') || 'none'}`
</script>

<template>
  <div class="hbars" role="img" :aria-label="`${label}. ${rows.map(describe).join('; ')}`">
    <div v-for="r in rows" :key="r.label" class="row">
      <span class="name">{{ r.label }}</span>
      <span class="track">
        <span v-for="p in r.parts" v-show="p.v > 0" :key="p.name" class="seg" :class="`fill-${p.fill}`" :style="{ width: pct(p.v) }" :title="`${p.name}: ${fmt(p.v)}`" />
        <span class="val">{{ r.note ?? fmt(r.total) }}</span>
      </span>
    </div>
    <div v-if="axis" class="row axis" aria-hidden="true">
      <span />
      <span class="ticks"><span>0</span><span>{{ fmt(max / 2) }}</span><span>{{ fmt(max) }}</span></span>
    </div>
  </div>
</template>

<style scoped>
.hbars { display: flex; flex-direction: column; gap: 7px; }
.row { display: grid; grid-template-columns: minmax(70px, 96px) 1fr; align-items: center; gap: var(--rs-space-3); }
.name { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track {
  position: relative; display: flex; align-items: center; height: 16px; min-width: 0;
  background: linear-gradient(90deg, transparent calc(50% - 0.5px), var(--rs-line) calc(50% - 0.5px), var(--rs-line) calc(50% + 0.5px), transparent calc(50% + 0.5px));
}
.seg { height: 100%; flex: none; }
.seg + .seg { margin-left: 1px; }
.val { margin-left: 8px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.axis .ticks { display: flex; justify-content: space-between; border-top: 1px solid var(--rs-line); padding-top: 3px; font-size: 10px; color: var(--rs-text-muted); font-variant-numeric: tabular-nums; }
</style>
