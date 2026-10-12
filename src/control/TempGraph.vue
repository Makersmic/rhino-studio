<script setup lang="ts">
/**
 * Temperature history: a thin red line for the reading and a grey line for
 * the target, scrolling as time passes. A square (last 5 minutes) or, when
 * expanded, three times as wide (last 20 minutes).
 */
import { computed } from 'vue'
import { SPAN_SMALL, SPAN_WIDE, graphPaths, type HeaterId } from './tempHistory'
import { useTempsStore } from '@/stores/temps'

const props = defineProps<{ heater: HeaterId; expanded: boolean; label: string }>()
const temps = useTempsStore()

const W = computed(() => (props.expanded ? 300 : 100))
const span = computed(() => (props.expanded ? SPAN_WIDE : SPAN_SMALL))
const paths = computed(() => graphPaths(temps.history[props.heater], temps.now, span.value, W.value, 100))
</script>

<template>
  <svg
    class="graph"
    :class="{ wide: expanded }"
    :viewBox="`0 0 ${W} 100`"
    preserveAspectRatio="none"
    role="img"
    :aria-label="`${label}: last ${expanded ? 20 : 5} minutes`"
  >
    <path v-if="paths.target" class="target" :d="paths.target" />
    <path v-if="paths.temp" class="temp" :d="paths.temp" />
  </svg>
</template>

<style scoped>
.graph {
  display: block;
  flex: none;
  width: var(--g, 3.1rem);
  height: var(--g, 3.1rem);
  border-radius: 4px;
  background: radial-gradient(var(--rs-dot-faint) 0.8px, transparent 1px) 0 0 / 6px 6px;
  box-shadow: inset 0 0 0 1px var(--rs-line);
  overflow: hidden;
  transition: width 180ms ease;
}
.graph.wide { width: calc(var(--g, 3.1rem) * 3); }
path { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.temp { stroke: var(--rs-graph-temp); stroke-width: 1.5; }
.target { stroke: var(--rs-graph-target); stroke-width: 1; }
@media (prefers-reduced-motion: reduce) { .graph { transition: none; } }
</style>
