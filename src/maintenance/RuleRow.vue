<script setup lang="ts">
/** One schedule rule: every so often, after so much use, after each event, or once on a date. */
import { computed } from 'vue'
import { useMaintenanceStore } from '@/stores/maintenance'
import { RULE_KINDS, UNITS, blankRule, describeRule, meterChoices, meterOf, type FormRule, type RuleKind } from './edit'
import '@/toolmgr/forms.css'

const props = defineProps<{ rule: FormRule; asset: string | null; template: boolean; n: number; removable: boolean }>()
const emit = defineEmits<{ replace: [r: FormRule]; remove: [] }>()
const care = useMaintenanceStore()

const choices = computed(() => meterChoices(care.overview, props.asset, props.template, props.rule.kind === 'event'))
const key = computed(() => `${props.rule.scope}.${props.rule.meter}`)
const unit = computed(() => meterOf(care.overview, props.rule, props.asset)?.unit ?? '')
const setMeter = (v: string) => {
  const [scope, meter] = v.split('.') as ['machine' | 'tool', string]
  Object.assign(props.rule, { scope, meter })
}
const setKind = (k: RuleKind) => emit('replace', blankRule(k, props.asset, props.template))
const text = computed(() => describeRule(care.overview, props.rule, props.asset, props.template))
</script>

<template>
  <div class="rr">
    <div class="line">
      <span class="no">{{ n }}</span>
      <select class="tm-sel kind" :value="rule.kind" :aria-label="`Rule ${n} kind`" @change="setKind(($event.target as HTMLSelectElement).value as RuleKind)">
        <option v-for="[k, l] in RULE_KINDS" :key="k" :value="k">{{ l }}</option>
      </select>
      <button v-if="removable" type="button" class="tm-link danger rm" @click="emit('remove')">Remove</button>
    </div>

    <div class="fields">
      <template v-if="rule.kind === 'time'">
        <label class="tm-fld"><span class="tm-lbl">Every</span><span class="pair"><input v-model="rule.every" class="tm-in n" type="number" min="1" :aria-label="`Rule ${n} every`" /><select v-model="rule.unit" class="tm-sel u" :aria-label="`Rule ${n} unit`"><option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option></select></span></label>
        <label class="tm-fld"><span class="tm-lbl">Early alarm</span><span class="pair"><input v-model="rule.lead" class="tm-in n" type="number" min="0" :aria-label="`Rule ${n} early alarm`" /><select v-model="rule.lead_unit" class="tm-sel u" :aria-label="`Rule ${n} early alarm unit`"><option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option></select><span class="suf">before</span></span></label>
      </template>

      <template v-else-if="rule.kind === 'meter'">
        <label class="tm-fld wide"><span class="tm-lbl">Counting</span><select class="tm-sel" :value="key" :aria-label="`Rule ${n} meter`" @change="setMeter(($event.target as HTMLSelectElement).value)"><option v-for="c in choices" :key="c.value" :value="c.value">{{ c.label }}</option></select></label>
        <label class="tm-fld"><span class="tm-lbl">Every</span><span class="pair"><input v-model="rule.every" class="tm-in n" type="number" min="0.1" step="any" :aria-label="`Rule ${n} every`" /><span class="suf">{{ unit || 'times' }}</span></span></label>
        <label class="tm-fld"><span class="tm-lbl">Early alarm</span><span class="pair"><input v-model="rule.lead" class="tm-in n" type="number" min="0" step="any" :aria-label="`Rule ${n} early alarm`" /><span class="suf">{{ unit }} before</span></span></label>
      </template>

      <label v-else-if="rule.kind === 'event'" class="tm-fld wide"><span class="tm-lbl">After</span><select class="tm-sel" :value="key" :aria-label="`Rule ${n} event`" @change="setMeter(($event.target as HTMLSelectElement).value)"><option v-for="c in choices" :key="c.value" :value="c.value">{{ c.label }}</option></select></label>

      <template v-else>
        <label class="tm-fld"><span class="tm-lbl">On</span><input v-model="rule.on" class="tm-in" type="date" :aria-label="`Rule ${n} date`" /></label>
        <label class="tm-fld"><span class="tm-lbl">Early alarm</span><span class="pair"><input v-model="rule.lead" class="tm-in n" type="number" min="0" :aria-label="`Rule ${n} early alarm`" /><span class="suf">days before</span></span></label>
      </template>
    </div>
    <p class="say">{{ text.charAt(0).toUpperCase() + text.slice(1) }}.</p>
  </div>
</template>

<style scoped>
.rr { display: flex; flex-direction: column; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-bg); }
.line { display: flex; align-items: center; gap: var(--rs-space-3); }
.no { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--rs-ink); color: var(--rs-on-ink); font-size: 12px; font-weight: var(--rs-weight-bold); }
.kind { max-width: 240px; }
.rm { margin-left: auto; }
.fields { display: flex; flex-wrap: wrap; gap: var(--rs-space-3) var(--rs-space-5); padding-left: 36px; }
.fields .wide { flex: 1 1 260px; max-width: 420px; }
.pair { display: flex; align-items: center; gap: 6px; }
.n { width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
.u { width: 110px; }
.suf { font-size: var(--rs-text-sm); color: var(--rs-text-muted); white-space: nowrap; }
.say { margin: 0; padding-left: 36px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
@media (max-width: 560px) {
  .fields, .say { padding-left: 0; }
}
</style>
