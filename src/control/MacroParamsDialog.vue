<script setup lang="ts">
/**
 * Asks for a macro's values before it's sent (src/control/macroParams.ts). A value with a stated range
 * ("SPEED=0..1" in the macro's description) gets a slider and a field; the rest a field, with the macro's
 * own default shown. Leaving a field empty leaves the macro's default. Run sends the line through the
 * console's usual safety check, so a macro that moves or powers something still asks.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { checkParam, macroLine, type MacroParam } from './macroParams'

const props = defineProps<{ macro: { name: string; label: string; description: string; params: MacroParam[] } | null }>()
const emit = defineEmits<{ close: []; run: [line: string] }>()

const dlg = ref<HTMLDialogElement | null>(null)
const values = reactive<Record<string, string>>({})
const error = ref<string | null>(null)

watch(
  () => props.macro,
  async (m) => {
    if (!m) return dlg.value?.open && dlg.value.close()
    error.value = null
    for (const k of Object.keys(values)) delete values[k]
    for (const p of m.params) values[p.name] = p.default
    await nextTick()
    if (!dlg.value?.open) dlg.value?.showModal()
    dlg.value?.querySelector<HTMLInputElement>('input.num, input.txt')?.focus()
  },
)

const preview = computed(() => {
  if (!props.macro) return ''
  const r = macroLine(props.macro.name, values)
  return 'line' in r ? r.line : props.macro.name
})
const step = (p: MacroParam) => ((p.max ?? 1) - (p.min ?? 0) <= 2 ? 0.01 : 1)

function run() {
  if (!props.macro) return
  for (const p of props.macro.params) {
    const e = checkParam(p, values[p.name] ?? '')
    if (e) return (error.value = e)
  }
  const r = macroLine(props.macro.name, values)
  if ('error' in r) return (error.value = r.error)
  emit('run', r.line)
}
</script>

<template>
  <dialog ref="dlg" class="dlg" aria-labelledby="mp-title" @cancel.prevent="emit('close')" @close="emit('close')">
    <form v-if="macro" class="body" method="dialog" @submit.prevent="run">
      <h2 id="mp-title">{{ macro.label }}</h2>
      <p v-if="macro.description" class="text">{{ macro.description }}</p>
      <div v-for="p in macro.params" :key="p.name" class="fld">
        <label :for="`mp-${p.name}`">{{ p.name }}<span v-if="p.default" class="def"> · default {{ p.default }}</span></label>
        <div v-if="p.min != null && p.max != null" class="set">
          <input
            type="range"
            :min="p.min"
            :max="p.max"
            :step="step(p)"
            :value="values[p.name] === '' ? (p.default || p.min) : values[p.name]"
            :style="{ '--fill': `${((Number(values[p.name] || p.default || p.min) - p.min) / (p.max - p.min || 1)) * 100}%` }"
            :aria-label="`${p.name}, ${p.min} to ${p.max}`"
            @input="values[p.name] = ($event.target as HTMLInputElement).value"
          />
          <input :id="`mp-${p.name}`" v-model="values[p.name]" class="num" inputmode="decimal" />
          <span class="range">{{ p.min }} to {{ p.max }}</span>
        </div>
        <input v-else :id="`mp-${p.name}`" v-model="values[p.name]" class="txt" :placeholder="p.default || 'leave empty for the default'" />
      </div>
      <code class="line">{{ preview }}</code>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <div class="acts">
        <RsButton type="button" @click="emit('close')">Cancel</RsButton>
        <RsButton type="submit" variant="primary">Run</RsButton>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dlg { width: min(480px, calc(100vw - 24px)); padding: 0; border: 2px solid var(--rs-ink); border-radius: var(--rs-radius-lg); background: var(--rs-surface); color: var(--rs-text); }
.dlg::backdrop { background: rgb(0 0 0 / 0.55); }
.body { display: flex; flex-direction: column; gap: var(--rs-space-4); padding: var(--rs-space-5); }
h2 { font-size: var(--rs-text-xl); font-weight: var(--rs-weight-body); letter-spacing: -0.02em; font-family: var(--rs-font-code); }
.text { margin: 0; color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.fld { display: flex; flex-direction: column; gap: 6px; }
.fld label { font-family: var(--rs-font-code); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.def { font-family: var(--rs-font-ui, inherit); color: var(--rs-text-muted); font-size: 11px; }
.set { display: flex; align-items: center; gap: 10px; }
.num, .txt { height: 34px; padding: 0 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-family: var(--rs-font-code); }
.num { width: 74px; text-align: right; }
.range { font-size: 11px; color: var(--rs-text-muted); white-space: nowrap; }
.line { padding: 8px 12px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); color: var(--rs-text-strong); font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.err { margin: 0; color: var(--rs-danger); font-size: var(--rs-text-sm); }
.acts { display: flex; justify-content: flex-end; gap: var(--rs-space-3); }
input[type='range'] { flex: 1; min-width: 0; height: 18px; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer; }
input[type='range']::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-moz-range-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--rs-ink), var(--rs-ink)) 0 0 / var(--fill) 100% no-repeat, var(--rs-line-strong); }
input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5.5px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }
input[type='range']::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--rs-ink); border: 2px solid var(--rs-surface); }
</style>
