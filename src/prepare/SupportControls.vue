<script setup lang="ts">
/**
 * Supports for a print, at the top of the Support section of either slicing engine (Mike, Nov 9: moved here from
 * under the 3D view): Off / Automatic / Only where I mark, the buttons that mark, erase or block on the part, and the
 * mark's reach. The marking itself still happens on the 3D view; this only switches it on and off.
 */
import { computed } from 'vue'
import RsButton from '@/components/RsButton.vue'
import NumField from './NumField.vue'
import { MARK_SIZES, SHOW_BLOCKS, marksNote } from './supportMarks'
import { usePrepareStore } from '@/stores/prepare'

/** is3d: the 3D view is showing (marks are placed on it) */
const props = defineProps<{ is3d: boolean }>()
const marking = defineModel<'mark' | 'block' | 'erase' | null>('marking', { default: null })
const prep = usePrepareStore()

const engine = computed(() => prep.job?.engine)
const selReach = computed({ get: () => prep.selectedMarkReach ?? MARK_SIZES.start, set: (v: number) => prep.setSelectedReach(v) })
const message = computed(() => marksNote(prep.supportMarks, prep.supportMode))
const marks = computed(() => prep.supportMarks?.marks.length ?? 0)
function toggle(k: 'mark' | 'block' | 'erase') {
  marking.value = marking.value === k ? null : k
}
</script>

<template>
  <div class="supports wide" role="group" aria-label="Supports">
    <div class="row">
      <label class="field">
        <span>Supports</span>
        <select :value="prep.supportMode" :disabled="engine === 'prusa' && !prep.schema" @change="prep.setSupportMode(($event.target as HTMLSelectElement).value as 'off' | 'auto' | 'marked')">
          <option value="off">Off</option>
          <option value="auto">Automatic</option>
          <option value="marked">Only where I mark</option>
        </select>
      </label>
      <div v-if="prep.canMark && props.is3d" class="btns">
        <RsButton size="sm" :variant="marking === 'mark' ? 'primary' : undefined" :aria-pressed="marking === 'mark'" @click="toggle('mark')">{{ marking === 'mark' ? 'Done marking' : 'Mark supports' }}</RsButton>
        <RsButton v-if="marks" size="sm" :variant="marking === 'erase' ? 'primary' : undefined" :aria-pressed="marking === 'erase'" @click="toggle('erase')">{{ marking === 'erase' ? 'Done erasing' : 'Erase marks' }}</RsButton>
        <RsButton v-if="SHOW_BLOCKS && engine === 'prusa'" size="sm" :variant="marking === 'block' ? 'primary' : undefined" :aria-pressed="marking === 'block'" @click="toggle('block')">{{ marking === 'block' ? 'Done blocking' : 'Block supports' }}</RsButton>
      </div>
    </div>
    <p v-if="prep.canMark && !props.is3d" class="note">Marks are placed on the 3D view: turn off Lighter drawing under the bed.</p>
    <template v-if="prep.canMark">
      <div v-if="prep.selectedMarkReach != null" class="row" role="group" aria-label="The selected mark">
        <RsButton size="sm" aria-label="Smaller" @click="prep.setSelectedReach(prep.selectedMarkReach - 0.5)">−</RsButton>
        <NumField v-model="selReach" label="Selected mark's reach" unit="mm" :min="MARK_SIZES.min" :max="MARK_SIZES.max" :step="0.5" hint="Delete removes it, Esc lets it go" />
        <RsButton size="sm" aria-label="Bigger" @click="prep.setSelectedReach(prep.selectedMarkReach + 0.5)">+</RsButton>
        <RsButton size="sm" variant="danger-outline" @click="prep.removeSelectedMark()">Remove</RsButton>
      </div>
      <div v-else class="row">
        <NumField v-model="prep.markSize" label="Mark reach" unit="mm" :min="MARK_SIZES.min" :max="MARK_SIZES.max" :step="0.5" hint="New marks and the eraser; or press and drag on the part" />
        <RsButton v-if="marks" size="sm" variant="quiet" @click="prep.clearMarks()">Clear marks</RsButton>
      </div>
    </template>
    <p v-if="message" class="note strong" role="status">{{ message }}<template v-if="engine !== 'prusa' && prep.supportMarks?.marks.some((m) => m.kind === 'block')"> Kiri:Moto can't block support, so blocked spots are left out with it.</template></p>
  </div>
</template>

<style scoped>
.supports { display: flex; flex-direction: column; gap: var(--rs-space-3); padding-bottom: var(--rs-space-3); border-bottom: 1px dotted var(--rs-line-strong); }
.row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--rs-space-2) var(--rs-space-3); }
.btns { display: flex; flex-wrap: wrap; gap: 4px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
.field > span { font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
select { height: 38px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.note { margin: 0; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.note.strong { color: var(--rs-text-strong); }
</style>
