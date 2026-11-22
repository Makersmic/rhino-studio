<script setup lang="ts">
/**
 * The filament lanes as piano keys (Mike, Nov 22). One white key per lane: a patterned band in the lane's tone, the filament's
 * name, the lane number. The selected key is pressed in. Between two neighbouring keys sits a black key: lit, it means "when
 * the left lane runs out, carry on with the right one" (the same filament, and a runout sensor on the left lane). A black key
 * that isn't allowed stays dark and says why on hover and in its label. A lane that holds nothing yet is drawn dotted.
 *
 * Drawing and events only: what is allowed is laneKeys.ts, and the parent owns the lanes, the links and the selection.
 */
import { computed } from 'vue'
import { laneName, linkAllowed, materialFamily, type LaneInfo } from './laneKeys'

const props = defineProps<{
  lanes: LaneInfo[]
  /** lanes the job prints with (a small mark under their key) */
  used?: number[]
  /** show the black "carry on" keys (off for a single-lane job or a machine that can't change over) */
  links?: boolean
}>()
const selected = defineModel<number>({ default: 0 })
const follow = defineModel<boolean[]>('follow', { default: () => [] })
defineEmits<{ pick: [lane: number] }>()

const gaps = computed(() => props.lanes.slice(0, -1).map((_, i) => ({ i, ...linkAllowed(props.lanes, i) })))
function toggle(i: number) {
  const g = gaps.value[i]
  if (!g?.ok) return
  const next = [...follow.value]
  next[i] = !next[i]
  follow.value = next
}
const short = (m: string | null) => materialFamily(m) ?? 'Empty'
const isUsed = (i: number) => !!props.used?.includes(i)
</script>

<template>
  <div class="keys" role="group" aria-label="Filament lanes" :style="{ '--n': lanes.length }">
    <div v-for="(l, i) in lanes" :key="i" class="slot">
      <button
        type="button"
        class="key"
        :class="[`p${(i % 8) + 1}`, { on: selected === i, empty: !l.material }]"
        :style="{ '--tone': `var(--rs-lane-${(i % 8) + 1})` }"
        :aria-pressed="selected === i"
        :aria-label="`${laneName(i)}: ${l.material ? short(l.material) : 'no filament chosen'}${l.runoutSensor ? ', runout sensor fitted' : ''}${isUsed(i) ? ', used by this job' : ''}`"
        @click="selected = i"
        @dblclick="$emit('pick', i)"
      >
        <span class="band" aria-hidden="true" />
        <span class="mat">{{ short(l.material) }}</span>
        <span class="num rs-num" aria-hidden="true">{{ i + 1 }}</span>
        <span class="marks" aria-hidden="true">
          <i v-if="isUsed(i)" class="used" title="Used by this job" />
          <i v-if="l.runoutSensor" class="sensor" title="Runout sensor fitted" />
        </span>
      </button>
      <button
        v-if="links && i < lanes.length - 1"
        type="button"
        class="black"
        :class="{ lit: follow[i] && gaps[i]?.ok, no: !gaps[i]?.ok }"
        :aria-pressed="!!follow[i] && !!gaps[i]?.ok"
        :aria-disabled="!gaps[i]?.ok"
        :aria-label="`${laneName(i)} carries on into ${laneName(i + 1)} when it runs out`"
        :title="gaps[i]?.ok ? (follow[i] ? `${laneName(i)} carries on into ${laneName(i + 1)} when it runs out. Click to turn off.` : `Carry on into ${laneName(i + 1)} when ${laneName(i)} runs out`) : (gaps[i] as { reason: string }).reason"
        @click="toggle(i)"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4h6M6 2l2 2-2 2M10 8H4M6 6l-2 2 2 2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.keys { display: flex; min-width: 0; padding-bottom: 4px; }
.slot { position: relative; flex: 1 1 0; min-width: 0; max-width: 110px; }
.key {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  width: 100%; height: 96px; padding: 0 2px 7px; margin: 0;
  border: 1px solid var(--rs-line-strong); border-top-width: 0; border-radius: 0 0 8px 8px;
  background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; cursor: pointer;
  box-shadow: 0 2px 0 var(--rs-line);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.slot:first-child .key { border-left-width: 1px; }
.slot + .slot .key { border-left-width: 0; }
.slot:last-child .key { border-right-width: 1px; }
.key:hover { background: var(--rs-surface-2); }
/* pressed in: the selected lane */
.key.on { transform: translateY(2px); box-shadow: inset 0 0 0 2px var(--rs-text-strong); background: var(--rs-surface-2); }
.key:focus-visible { outline: none; box-shadow: var(--rs-focus); z-index: 2; }
.key.empty { background-image: radial-gradient(var(--rs-line-strong) 0.8px, transparent 1px); background-size: 6px 6px; }
.band { align-self: stretch; height: 18px; margin: 0 0 4px; background-color: var(--tone); }
/* a pattern per lane, so the tone is never the only clue */
.p2 .band { background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 0.45) 0 2px, transparent 2px 6px); }
.p3 .band { background-image: radial-gradient(rgb(255 255 255 / 0.55) 1.2px, transparent 1.5px); background-size: 6px 6px; }
.p4 .band { background-image: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.45) 0 2px, transparent 2px 6px); }
.p5 .band { background-image: repeating-linear-gradient(45deg, rgb(255 255 255 / 0.45) 0 2px, transparent 2px 6px); }
.p6 .band { background-image: repeating-linear-gradient(0deg, rgb(255 255 255 / 0.45) 0 2px, transparent 2px 6px); }
.p7 .band { background-image: linear-gradient(45deg, rgb(255 255 255 / 0.4) 25%, transparent 25% 75%, rgb(255 255 255 / 0.4) 75%), linear-gradient(45deg, rgb(255 255 255 / 0.4) 25%, transparent 25% 75%, rgb(255 255 255 / 0.4) 75%); background-size: 8px 8px; background-position: 0 0, 4px 4px; }
.p8 .band { background-image: radial-gradient(circle at 50% 50%, transparent 1.5px, rgb(255 255 255 / 0.5) 1.7px 2.6px, transparent 2.8px); background-size: 7px 7px; }
.key.empty .band { background-color: transparent; background-image: none; border-bottom: 1px dotted var(--rs-line-strong); }
.mat { max-width: 100%; padding: 0 3px; overflow: hidden; font-size: 11px; font-weight: var(--rs-weight-medium); text-overflow: ellipsis; white-space: nowrap; color: var(--rs-text-muted); }
.key.empty .mat { background: var(--rs-surface); border-radius: 3px; }
.key.on .mat { color: var(--rs-text-strong); }
.num { font-size: 1.5rem; line-height: 1; }
.marks { display: flex; gap: 4px; height: 6px; }
.marks i { width: 6px; height: 6px; border-radius: 50%; }
.used { background: var(--rs-text-strong); }
.sensor { border: 1.5px solid var(--rs-text-strong); }
/* the black keys sit across the gap between two white keys, hanging from the top like the real thing */
.black {
  position: absolute; z-index: 1; top: 0; right: 0; transform: translateX(50%);
  display: grid; place-items: center; width: 22px; height: 54px; padding: 0;
  border: 1px solid var(--rs-ink); border-top-width: 0; border-radius: 0 0 5px 5px;
  background: var(--rs-ink); color: var(--rs-on-ink); cursor: pointer; opacity: 0.88;
}
.black svg { width: 12px; height: 12px; opacity: 0; }
.black:hover svg, .black.lit svg { opacity: 1; }
/* lit: the link is on (outlined and bright rather than a colour, so red stays free) */
.black.lit { background: var(--rs-surface); color: var(--rs-text-strong); box-shadow: inset 0 0 0 2px var(--rs-ink); opacity: 1; }
.black.no { background-image: repeating-linear-gradient(135deg, transparent 0 4px, rgb(255 255 255 / 0.12) 4px 5px); cursor: not-allowed; opacity: 0.5; }
.black.no:hover svg { opacity: 0; }
.black:focus-visible { outline: none; box-shadow: var(--rs-focus); }
@media (max-width: 560px) {
  .key { height: 84px; }
  .mat { font-size: 10px; }
  .num { font-size: 1.25rem; }
  .black { width: 18px; height: 46px; }
}
@media (prefers-reduced-motion: reduce) { .key { transition: none; } }
</style>
