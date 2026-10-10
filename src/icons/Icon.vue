<script setup lang="ts">
/**
 * Renders an icon from the toolhead or nav set.
 * The markup is our own constant strings (never user input), so v-html is safe.
 */
import { computed } from 'vue'
import { TOOL_ICONS, type ToolIconId } from './toolheads'
import { NAV_ICONS, type NavIconId } from './nav'

const props = withDefaults(
  defineProps<{
    tool?: ToolIconId
    nav?: NavIconId
    size?: number
    /** Stroke width in screen pixels. Defaults scale gently with size. */
    stroke?: number
    /** Accessible name; omit for decorative icons. */
    label?: string
  }>(),
  { tool: undefined, nav: undefined, size: 24, stroke: undefined, label: undefined },
)

const def = computed(() => (props.tool ? TOOL_ICONS[props.tool] : props.nav ? NAV_ICONS[props.nav] : null))
const viewBox = computed(() => (props.tool ? '0 0 48 48' : '0 0 24 24'))
const sw = computed(() => props.stroke ?? (props.size >= 96 ? 2 : props.size >= 48 ? 1.75 : 1.6))
const showDetail = computed(() => props.size >= 32)
</script>

<template>
  <svg
    v-if="def"
    class="rs-icon"
    :class="{ 'no-detail': !showDetail }"
    :width="size"
    :height="size"
    :viewBox="viewBox"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="{ '--sw': `${sw}px` }"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    v-html="def.body"
  />
</template>

<style>
/* Not scoped: the classes live inside v-html markup */
.rs-icon { flex: none; overflow: visible; }
.rs-icon * { vector-effect: non-scaling-stroke; stroke-width: var(--sw); }
.rs-icon .k { stroke-width: calc(var(--sw) * 2); }
.rs-icon .f { fill: currentColor; stroke: none; }
.rs-icon .c { stroke-dasharray: 2 3; opacity: 0.55; }
.rs-icon.no-detail .c { display: none; }
</style>
