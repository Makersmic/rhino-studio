<script setup lang="ts">
/**
 * Extruder calibration (Ellis' Print Tuning Guide, Extruder Calibration): mark the filament 120 mm above the extruder,
 * push 100 mm at 1 mm/s, measure what's left, and scale the rotation distance; repeat until two runs agree, then save
 * it for this print head. Every run sets the value being tested first, so the measurement always matches it. The push
 * goes through the console's check (it asks first). printer.cfg isn't touched: jobs Studio prepares use the result.
 */
import { computed, onMounted, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { useTuningStore } from '@/stores/tuning'
import { EXTRUDER_TEST, extrudeScript, extruderSettled, newRotationDistance } from './tuning'

const props = defineProps<{ tool: string; temp: number }>()
const emit = defineEmits<{ done: [] }>()
const machine = useMachineStore()
const control = useControlStore()
const tuning = useTuningStore()

const CHECKS = [
  'Every screw on the extruder and print head is tight (check again)',
  'The nozzle isn’t partly blocked: hot, filament pushed by hand comes straight down, not curling sideways',
  'The nozzle is clean and was tightened hot, with no leaks round the threads',
  'The filament runs freely from the spool',
]
const ticked = ref<boolean[]>(CHECKS.map(() => false))
type Step = 'check' | 'ready' | 'mark' | 'measure' | 'saved'
const step = ref<Step>('check')
const config = ref<Record<string, unknown> | null>(null)
const configError = ref<string | null>(null)
onMounted(async () => {
  try {
    config.value = await machine.extruderConfig()
  } catch (e) {
    configError.value = (e as Error).message
  }
  if (!tuning.state) await tuning.load()
})
const configRd = computed(() => Number(config.value?.rotation_distance ?? NaN))
const savedRd = computed(() => tuning.state?.heads[props.tool]?.rotation_distance?.value ?? null)
/** the value being tested: the head's saved one, else printer.cfg's */
const current = ref<number | null>(null)
const startRd = computed(() => savedRd.value ?? (Number.isFinite(configRd.value) ? configRd.value : null))
const maxExtrude = computed(() => Number(config.value?.max_extrude_only_distance ?? 50))
/** what it was before this save: the head's earlier saved value, else printer.cfg's */
const wasRd = ref<number | null>(null)

const mounted = computed(() => machine.mountedVerified && machine.mountedName === props.tool)
const hot = computed(() => (machine.hotend.temp ?? 0) >= props.temp - 5)
const blockers = computed(() => {
  const out: string[] = []
  if (!machine.klippyReady) out.push('Klipper isn’t ready')
  if (control.jobActive) out.push('A job is running')
  if (!mounted.value) out.push(`Mount and confirm ${props.tool} first`)
  if (config.value && maxExtrude.value < EXTRUDER_TEST.extrude + 1)
    out.push(`Klipper allows only ${maxExtrude.value} mm of extrusion on its own (max_extrude_only_distance in [extruder]); this test needs 101 or more. Raise it in printer.cfg and restart, then come back`)
  if (startRd.value == null) out.push('The current rotation distance can’t be read from Klipper')
  return out
})

const actuals = ref<number[]>([])
const left = ref<string>('')
const reading = computed(() => (current.value != null && left.value.trim() !== '' ? newRotationDistance(current.value, Number(left.value)) : null))
const settled = computed(() => extruderSettled(actuals.value))
const busy = ref(false)
const msg = ref<{ text: string; bad?: boolean } | null>(null)

function begin() {
  current.value = startRd.value
  step.value = 'ready'
}
async function heat() {
  await control.send(`M104 S${Math.round(props.temp)}`, { label: `Heat ${props.tool} to ${props.temp}°` })
}
/** set the value under test, then push 100 mm at 1 mm/s (the console asks first) */
async function push() {
  if (current.value == null) return
  const ok = await control.send(`SET_EXTRUDER_ROTATION_DISTANCE EXTRUDER=extruder DISTANCE=${current.value}\n${extrudeScript()}`, {
    label: 'Extruder calibration: 100 mm',
    confirmTitle: 'Push 100 mm of filament?',
    confirmBody: `It takes about ${EXTRUDER_TEST.extrude / (EXTRUDER_TEST.feed / 60)} seconds. Watch it: stop if the extruder clicks or skips.`,
    confirmLabel: 'Push 100 mm',
  })
  if (ok) {
    left.value = ''
    step.value = 'measure'
  }
}
function takeReading() {
  const r = reading.value
  if (!r || 'error' in r) return
  actuals.value.push(r.actual)
  if (Math.abs(r.actual - EXTRUDER_TEST.extrude) <= 0.5) {
    msg.value = { text: `${r.actual} mm went in: within half a millimetre. ${extruderSettled(actuals.value) ? 'Two runs agree: ready to save.' : 'Run it once more to be sure.'}` }
  } else {
    current.value = r.value
    msg.value = { text: `${r.actual} mm went in. The next run tests ${r.value}.` }
  }
  step.value = 'mark'
}
async function save() {
  if (current.value == null) return
  busy.value = true
  try {
    wasRd.value = savedRd.value ?? (Number.isFinite(configRd.value) ? configRd.value : null)
    await tuning.save({ tool: props.tool, test: 'extruder_calibration', value: current.value })
    step.value = 'saved'
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wiz">
    <template v-if="step === 'check'">
      <h3 class="sub-h">Before you begin</h3>
      <p class="muted small">From Ellis’ guide: a loose part or a part-blocked nozzle gives a wrong answer here and in every test after it.</p>
      <label v-for="(c, i) in CHECKS" :key="i" class="tick"><input v-model="ticked[i]" type="checkbox" /> {{ c }}</label>
      <div class="acts"><RsButton variant="primary" :disabled="ticked.some((t) => !t)" @click="begin">Start</RsButton></div>
    </template>

    <template v-else-if="step === 'ready' || step === 'mark'">
      <ul v-if="blockers.length" class="block">
        <li v-for="b in blockers" :key="b">{{ b }}</li>
      </ul>
      <p v-if="configError" class="msg bad">{{ configError }}</p>
      <dl class="facts">
        <div><dt>Testing rotation distance</dt><dd class="mono">{{ current ?? '–' }}</dd></div>
        <div><dt>printer.cfg</dt><dd class="mono">{{ Number.isFinite(configRd) ? configRd : '–' }}</dd></div>
        <div><dt>Runs</dt><dd>{{ actuals.length ? actuals.map((a) => `${a} mm`).join(', ') : 'none yet' }}</dd></div>
      </dl>
      <p v-if="msg" class="msg" :class="{ bad: msg.bad }" role="status">{{ msg.text }}</p>
      <ol class="how">
        <li>
          Heat the nozzle to {{ temp }}° (it extrudes hot, as it prints).
          <span class="temp mono">{{ machine.hotend.temp != null ? `${Math.round(machine.hotend.temp)}°` : '–' }}</span>
          <RsButton size="sm" :disabled="!!blockers.length" @click="heat">Heat to {{ temp }}°</RsButton>
        </li>
        <li>Mark the filament <strong>{{ EXTRUDER_TEST.mark }} mm</strong> above where it goes into the extruder: hold a ruler along it, tape at 120.</li>
        <li>
          Push 100 mm at 1 mm/s.
          <RsButton size="sm" variant="primary" :disabled="!!blockers.length || !hot" @click="push">Push 100 mm</RsButton>
          <span v-if="!hot" class="muted small">once it’s hot</span>
        </li>
      </ol>
      <div v-if="settled" class="acts">
        <RsButton variant="primary" :disabled="busy" @click="save">Save {{ current }} for {{ tool }}</RsButton>
      </div>
    </template>

    <template v-else-if="step === 'measure'">
      <label class="fld">
        <span>How much is left from where it enters the extruder to your mark (mm)?</span>
        <input v-model="left" inputmode="decimal" class="mono" placeholder="20" />
      </label>
      <p v-if="reading && 'error' in reading" class="msg bad">{{ reading.error }}</p>
      <p v-else-if="reading" class="msg">{{ reading.actual }} mm went in: the rotation distance becomes <strong class="mono">{{ reading.value }}</strong>.</p>
      <div class="acts"><RsButton variant="primary" :disabled="!reading || 'error' in reading" @click="takeReading">Use this reading</RsButton></div>
    </template>

    <template v-else>
      <p class="msg" role="status">Saved: {{ tool }}’s rotation distance is <strong class="mono">{{ current }}</strong> (was {{ wasRd ?? '–' }}). Prints Studio prepares for {{ tool }} use it from now on; printer.cfg stays as it was.</p>
      <div class="acts"><RsButton variant="primary" @click="emit('done')">Done</RsButton></div>
    </template>
  </div>
</template>

<style scoped>
.wiz { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.tick { display: flex; gap: var(--rs-space-2); align-items: flex-start; font-size: var(--rs-text-sm); }
.acts { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); }
.block { margin: 0; padding-left: 1.2em; color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.facts { display: flex; flex-wrap: wrap; gap: var(--rs-space-4); margin: 0; }
.facts dt { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.facts dd { margin: 0; font-weight: var(--rs-weight-medium); }
.how { margin: 0; padding-left: 1.3em; display: flex; flex-direction: column; gap: var(--rs-space-3); font-size: var(--rs-text-sm); }
.how li > :deep(button), .temp { margin-left: var(--rs-space-2); }
.fld { display: flex; flex-direction: column; gap: 6px; font-size: var(--rs-text-sm); max-width: 420px; }
.fld input { padding: 8px 10px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); }
.mono { font-family: var(--rs-font-code); }
.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); }
</style>
