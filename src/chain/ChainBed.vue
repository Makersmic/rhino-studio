<script setup lang="ts">
/**
 * The bed seen from above, for the chain builder: the work area, the keep-out areas, the prime line and (from the sheet's
 * stage on) the placed sheet. Drawn to scale, machine Y up. "Zoom to part" frames the sheet. What the other stages make
 * (fixtures, features, laser marks) is drawn here once the design is loaded into the chain (docs/design-process-chain.md).
 */
import { computed, useId } from 'vue'
import { flipY, viewBoxText, viewFor } from './bedView'
import { sheetBox, type Sheet } from './chain'
import type { KeepOut } from '@/slicer/types'

const props = defineProps<{
  bed: { x: number; y: number }
  keepOut: readonly KeepOut[]
  prime: { x: number; y: number; length: number } | null
  sheet: Sheet | null
  /** the selected stage is at or after "place the sheet" */
  sheetShown: boolean
  zoom: boolean
  /** the sheet doesn't fit: draw it as a problem (an outline, not red) */
  sheetBad: boolean
}>()
const hatch = `hatch-${useId()}`
const box = computed(() => (props.sheet ? sheetBox(props.sheet) : null))
const view = computed(() =>
  viewBoxText(viewFor(props.bed, box.value ? { x0: box.value[0], y0: box.value[1], x1: box.value[2], y1: box.value[3] } : null, props.zoom)),
)
const fy = (y: number) => flipY(props.bed.y, y)
const zoomed = computed(() => props.zoom && !!box.value)
const label = computed(() => (zoomed.value ? 9 : 12))
</script>

<template>
  <svg :viewBox="view" role="img" aria-label="The bed from above, with the placed sheet" class="bedsvg">
    <defs>
      <pattern :id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" class="hatchln" />
      </pattern>
    </defs>
    <rect x="0" y="0" :width="bed.x" :height="bed.y" class="bedr" />
    <g v-for="k in keepOut" :key="k.label" class="keep">
      <rect :x="k.x0" :y="fy(k.y1)" :width="k.x1 - k.x0" :height="k.y1 - k.y0" :fill="`url(#${hatch})`" />
      <text :x="k.x0 + 4" :y="fy(k.y1) + label + 2" :font-size="label">{{ k.label }}</text>
    </g>
    <g v-if="prime" class="prime">
      <line :x1="prime.x" :y1="fy(prime.y)" :x2="prime.x + prime.length" :y2="fy(prime.y)" />
      <text :x="prime.x" :y="fy(prime.y) - 4" :font-size="label">Prime line</text>
    </g>
    <g v-if="sheet && sheetShown" class="sheetg">
      <rect :x="box![0]" :y="fy(box![3])" :width="sheet.width" :height="sheet.depth" rx="3" class="sheet" :class="{ bad: sheetBad }" />
      <line :x1="box![0]" :y1="fy(box![1]) + label * 1.4" :x2="box![2]" :y2="fy(box![1]) + label * 1.4" class="dim" />
      <text :x="sheet.x" :y="fy(box![1]) + label * 2.7" text-anchor="middle" :font-size="label" class="dimt">{{ sheet.width }}</text>
    </g>
  </svg>
</template>

<style scoped>
.bedsvg { width: 100%; height: auto; display: block; background: var(--rs-surface-2); border-radius: var(--rs-radius-md); }
.bedr { fill: var(--rs-surface); stroke: var(--rs-line-strong); stroke-width: 1.5; }
.hatchln { stroke: var(--rs-text-muted); stroke-opacity: 0.35; stroke-width: 1.5; }
.keep rect { stroke: var(--rs-line-strong); stroke-dasharray: 4 3; }
.keep text, .prime text { font-family: var(--rs-font-ui); fill: var(--rs-text-muted); }
.prime line { stroke: var(--rs-text-muted); stroke-width: 1.5; stroke-dasharray: 2 3; }
.sheet { fill: var(--rs-surface-2); stroke: var(--rs-ink); stroke-width: 1.8; }
.sheet.bad { stroke-dasharray: 5 3; stroke-width: 2.4; }
.dim { stroke: var(--rs-text-muted); stroke-width: 1; }
.dimt { font-family: var(--rs-font-code); fill: var(--rs-text-muted); }
</style>
