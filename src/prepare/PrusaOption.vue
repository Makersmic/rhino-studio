<script setup lang="ts">
/**
 * One PrusaSlicer option: its label, the right control for its type, units,
 * PrusaSlicer's own tooltip, and where the value comes from:
 *   yours   you changed it (dot + reset)
 *   rhino   the Rhino sets it (lock + why), not editable
 *   start / prusa  the Rhino's starting profile or PrusaSlicer's default
 * Values are PrusaSlicer INI text; vector options (per extruder) show their first value.
 */
import { computed, ref, watch, useId } from 'vue'
import { LOCKS, invalid, refused, valueOf, type RhinoCtx, type Schema } from '@/slicer/prusa/config'

const props = defineProps<{ k: string; schema: Schema; ctx: RhinoCtx; showKey?: boolean }>()
const emit = defineEmits<{ (e: 'set', key: string, value: string | null): void }>()
const id = useId()

const d = computed(() => props.schema.options[props.k]!)
const cur = computed(() => valueOf(props.k, props.schema, props.ctx))
const label = computed(() => d.value.full_label ?? d.value.label ?? props.k)
const locked = computed(() => cur.value.from === 'rhino')
const lockReason = computed(() => (locked.value ? LOCKS[props.k]?.reason ?? '' : ''))
const kind = computed(() => {
  const t = d.value.type
  if (t === 'bool' || t === 'bools') return 'bool'
  if ((t === 'enum' || t === 'enums') && !d.value.open) return 'select'
  if (t === 'point' || t === 'points' || t === 'point3') return 'readonly'
  return 'text'
})
const refusedHere = computed(() => refused(props.k, props.ctx))

const text = ref(cur.value.value)
watch(() => cur.value.value, (v) => (text.value = v))
const err = ref<string | null>(null)
function commit(v: string) {
  const e = invalid(props.k, v, props.schema, props.ctx)
  err.value = e
  if (e) return
  emit('set', props.k, v.trim())
}
function reset() {
  err.value = null
  emit('set', props.k, null)
}
const tipOpen = ref(false)
const pct = computed(() => d.value.type === 'percent' || d.value.type === 'percents')
const unit = computed(() => (pct.value ? '%' : d.value.sidetext ?? ''))
// PrusaSlicer writes 'nil' for an unset nullable value
const shown = computed(() => (text.value === 'nil' ? '' : pct.value ? text.value.replace(/%$/, '') : text.value))
function onText(v: string) {
  commit(pct.value && v.trim() !== '' && !v.trim().endsWith('%') ? `${v.trim()}%` : v)
}
</script>

<template>
  <div class="opt" :class="{ locked, mine: cur.from === 'yours', err: !!err }">
    <div class="top">
      <label :for="id" class="lab">{{ label }}<span v-if="showKey" class="key">{{ k }}</span></label>
      <button v-if="d.tooltip" type="button" class="tip-btn" :aria-expanded="tipOpen" :aria-label="`About ${label}`" @click="tipOpen = !tipOpen">?</button>
      <span v-if="d.mode !== 'simple'" class="lvl" :title="`PrusaSlicer shows this in ${d.mode} mode`">{{ d.mode === 'advanced' ? 'A' : 'E' }}</span>
      <button v-if="cur.from === 'yours'" type="button" class="reset" title="Back to the Rhino profile" :aria-label="`Reset ${label}`" @click="reset">↺</button>
    </div>

    <div class="ctl">
      <template v-if="kind === 'bool'">
        <label class="sw">
          <input :id="id" type="checkbox" :checked="cur.value === '1'" :disabled="locked" @change="commit(($event.target as HTMLInputElement).checked ? '1' : '0')" />
          <span>{{ cur.value === '1' ? 'On' : 'Off' }}</span>
        </label>
      </template>
      <select v-else-if="kind === 'select'" :id="id" :value="cur.value" :disabled="locked" @change="commit(($event.target as HTMLSelectElement).value)">
        <option v-for="o in d.enum" :key="o.value" :value="o.value" :disabled="!!refusedHere[o.value]">{{ o.label }}{{ refusedHere[o.value] ? ` (${refusedHere[o.value]})` : '' }}</option>
      </select>
      <span v-else-if="kind === 'readonly'" class="ro mono">{{ cur.value || '—' }}</span>
      <span v-else class="box">
        <input
          :id="id"
          :value="shown"
          :placeholder="text === 'nil' ? 'Not set' : undefined"
          :list="d.enum && d.open ? `${id}-l` : undefined"
          :disabled="locked"
          class="mono"
          spellcheck="false"
          autocomplete="off"
          @change="onText(($event.target as HTMLInputElement).value)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span v-if="unit" class="unit">{{ unit }}</span>
        <datalist v-if="d.enum && d.open" :id="`${id}-l`"><option v-for="o in d.enum" :key="o.value" :value="o.value">{{ o.label }}</option></datalist>
      </span>
    </div>

    <p v-if="err" class="msg bad" role="alert">{{ err }}</p>
    <p v-else-if="locked" class="msg"><strong>Set by the Rhino.</strong> {{ lockReason }}</p>
    <p v-if="tipOpen && d.tooltip" class="tip">{{ d.tooltip }}</p>
  </div>
</template>

<style scoped>
.opt { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 6px 0; }
.top { display: flex; align-items: center; gap: 6px; min-height: 20px; }
.lab { flex: 1; min-width: 0; font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.mine .lab { color: var(--rs-text-strong); }
.mine .lab::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--rs-ink); margin-right: 6px; vertical-align: 1px; }
.key { margin-left: 6px; font-family: var(--rs-font-code); font-size: 10px; font-weight: 400; color: var(--rs-text-muted); }
.tip-btn, .reset {
  width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid var(--rs-line-strong); background: transparent;
  color: var(--rs-text-muted); font-size: 10px; line-height: 1; cursor: pointer; flex: none;
}
.tip-btn:hover, .reset:hover { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.reset { border-color: var(--rs-text-strong); color: var(--rs-text-strong); font-size: 12px; }
.lvl { flex: none; font-size: 9px; line-height: 14px; padding: 0 4px; border-radius: 3px; box-shadow: inset 0 0 0 1px var(--rs-line-strong); color: var(--rs-text-muted); }
.ctl { display: flex; }
.box { flex: 1; display: flex; align-items: center; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); background: var(--rs-surface); padding-right: 10px; min-width: 0; }
.box:focus-within { outline: 2px solid var(--rs-focus); outline-offset: 1px; }
.box input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border: 0; background: transparent; color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.box input:focus { outline: none; }
.mono { font-family: var(--rs-font-code); }
.unit { font-size: var(--rs-text-xs); color: var(--rs-text-muted); white-space: nowrap; margin-left: 4px; }
select { flex: 1; min-width: 0; height: 36px; padding: 0 8px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-size: var(--rs-text-sm); }
.sw { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.sw input { width: 18px; height: 18px; accent-color: var(--rs-text-strong); }
.ro { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.locked .box, .locked select { background: var(--rs-key-fill); border-color: var(--rs-line); }
.locked .box input, .locked select { color: var(--rs-text-muted); cursor: not-allowed; }
.msg { margin: 0; font-size: 11px; color: var(--rs-text-muted); }
.msg.bad { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.err .box { border-color: var(--rs-danger); }
.tip { margin: 2px 0 0; padding: 8px 10px; border-radius: var(--rs-radius-sm); background: var(--rs-surface-2); font-size: 12px; line-height: 1.45; color: var(--rs-text); }
</style>
