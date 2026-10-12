<script setup lang="ts">
/**
 * A tool output in the status strip: the laser, the spindle, the part fan,
 * an added powered tool. Read only: the readings come from Klipper's pins,
 * and switching a tool on stays with its wizard (or the console, which asks
 * first).
 */
defineProps<{
  label: string
  /** short state word: Off, Armed, Running... */
  state?: string
  /** inverted ink: the output is live right now */
  live?: boolean
  /** big reading, 0-100 %; null = dash */
  percent: number | null
  /** what the percent means */
  sub?: string
}>()
</script>

<template>
  <div class="cell">
    <span class="k">{{ label }}<em v-if="state" :class="{ live }">{{ state }}</em></span>
    <span class="big rs-num" :class="{ empty: percent == null }">{{ percent == null ? '—' : Math.round(percent) }}<small v-if="percent != null">%</small></span>
    <span class="sub">{{ sub }}</span>
  </div>
</template>

<style scoped>
.cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; height: 100%; }
.k { font-size: var(--rs-text-xs); color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); white-space: nowrap; display: flex; align-items: center; gap: 6px; }
.k em { font-style: normal; color: var(--rs-text-strong); padding: 0 6px; border-radius: var(--rs-radius-sm); box-shadow: inset 0 0 0 1px var(--rs-line-strong); }
.k em.live { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
.big { font-size: 2.4rem; line-height: 0.9; margin-top: 6px; white-space: nowrap; }
.big small { font-family: var(--rs-font-ui); font-size: 0.4em; color: var(--rs-text-muted); margin-left: -0.04em; vertical-align: top; }
.sub { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; min-height: 1.3em; }
@media (max-width: 560px) { .big { font-size: 2.1rem; } }
</style>
