<script setup lang="ts">
/** Set a usage meter by hand (hours before tracking started, a new part). Logged in the work log. */
import { ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsDialog from '@/components/RsDialog.vue'
import { useMaintenanceStore } from '@/stores/maintenance'
import { fmtMeter } from './summary'
import type { MeterRow } from './types'
import '@/toolmgr/forms.css'

const props = defineProps<{ meter: MeterRow | null; tool: string | null }>()
const emit = defineEmits<{ close: []; saved: [msg: string] }>()
const care = useMaintenanceStore()
const value = ref<number | string>('')
const note = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

watch(
  () => props.meter,
  (m) => {
    if (!m) return
    value.value = m.unit ? Math.round(m.value * 100) / 100 : Math.round(m.value)
    note.value = ''
    error.value = null
  },
  { immediate: true },
)

async function save() {
  if (!props.meter) return
  saving.value = true
  error.value = null
  try {
    await care.write((c) => c.setMeter({ scope: props.tool ? 'tool' : 'machine', tool: props.tool, meter: props.meter!.meter, value: Number(value.value), note: note.value.trim() }))
    emit('saved', `${props.meter.label} set and logged`)
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <RsDialog :open="!!meter" :title="`Set ${meter?.label.toLowerCase() ?? ''}`" :kicker="tool ?? 'Machine'" :error="error" @close="emit('close')" @submit="save">
    <p class="tm-lead">Now {{ meter ? fmtMeter(meter.value, meter.unit) : '' }}. Tasks that count this meter keep their due points, so a higher reading brings them closer.</p>
    <div class="tm-row">
      <label class="tm-fld"><span class="tm-lbl">New reading{{ meter?.unit ? ` (${meter.unit})` : '' }}</span><input v-model="value" class="tm-in" type="number" min="0" step="any" required /></label>
    </div>
    <label class="tm-fld"><span class="tm-lbl">Why (optional)</span><input v-model="note" class="tm-in" maxlength="200" placeholder="Hours on the machine before tracking started" /></label>
    <template #actions>
      <RsButton type="submit" variant="primary" :disabled="saving || value === ''">Set reading</RsButton>
      <RsButton variant="quiet" @click="emit('close')">Cancel</RsButton>
      <span class="tm-hint">Saved to the work log.</span>
    </template>
  </RsDialog>
</template>
