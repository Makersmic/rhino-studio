<script setup lang="ts">
/** The parts in a job: pick one to work on it, or open its menu from its ⋯ button. */
import type { PartView } from '@/slicer/types'

defineProps<{ parts: PartView[]; selectedId: number }>()
const emit = defineEmits<{ select: [id: number]; menu: [id: number, x: number, y: number] }>()

const fmt = (v: number) => String(Math.round(v * 10) / 10)
function openMenu(id: number, e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  emit('menu', id, r.left, r.bottom + 4)
}
</script>

<template>
  <section class="list" aria-label="Parts in this job">
    <h3>Parts ({{ parts.length }})</h3>
    <ul>
      <li v-for="p in parts" :key="p.id" :class="{ on: p.id === selectedId }">
        <button type="button" class="row" :aria-pressed="p.id === selectedId" @click="emit('select', p.id)" @contextmenu.prevent="emit('select', p.id); emit('menu', p.id, $event.clientX, $event.clientY)">
          <span class="name" :title="p.name">{{ p.name }}</span>
          <span class="facts">{{ fmt(p.info.size.x) }} × {{ fmt(p.info.size.y) }} × {{ fmt(p.info.size.z) }} mm</span>
          <span class="facts">X {{ fmt(p.x) }} · Y {{ fmt(p.y) }}</span>
        </button>
        <button type="button" class="more" :aria-label="`Actions for ${p.name}`" @click="openMenu(p.id, $event)">⋯</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: var(--rs-space-1); min-width: 0; }
/* cards that lie on the 3D view: paper, a fine edge and a soft shadow; only the cards themselves take clicks */
h3 { align-self: flex-start; margin: 0; padding: 2px 8px; font-size: var(--rs-text-xs); font-weight: 600; color: var(--rs-text-muted); background: var(--rs-surface); border-radius: 6px; pointer-events: auto; }
ul { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0 2px 4px 0; list-style: none; max-height: min(58vh, 600px); overflow-y: auto; pointer-events: auto; }
li { display: flex; align-items: stretch; border: 1px solid var(--rs-line); border-radius: 8px; background: var(--rs-surface); box-shadow: var(--rs-float-shadow); }
li.on { border-color: var(--rs-text-strong); box-shadow: inset 0 0 0 1px var(--rs-text-strong), var(--rs-float-shadow); }
.row { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; padding: 6px 8px; font: inherit; text-align: left; color: var(--rs-text-strong); background: none; border: 0; border-radius: 8px 0 0 8px; cursor: pointer; }
.name { overflow: hidden; font-size: var(--rs-text-sm); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.facts { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.more { flex: none; width: 44px; min-height: 44px; font: inherit; font-size: var(--rs-text-lg, 1.1rem); color: var(--rs-text-strong); background: none; border: 0; border-radius: 0 8px 8px 0; cursor: pointer; }
.row:hover, .more:hover { background: var(--rs-surface-2); }
.row:focus-visible, .more:focus-visible { outline: 2px solid var(--rs-text-strong); outline-offset: -2px; }
</style>
