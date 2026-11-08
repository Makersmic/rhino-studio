<script setup lang="ts">
/**
 * First-layer squish (Ellis' Print Tuning Guide, First Layer Squish): print one layer of patches around the bed and
 * adjust the nozzle height live until they look right, then keep that as this head + material's fine-tune. On the Rhino
 * the Z offset is the head's paper test (NOZZLE_HEIGHT_CALIBRATE) plus a fine-tune per material, which START_JOB
 * applies (_RHINO_APPLY_Z); this saves the fine-tune (SAVE_VARIABLE rhino_zfine_<head>_<material>), nothing else.
 * The patches run as a normal job; the live steps go through Control's tuning path, behind the padlock.
 */
import { computed, onMounted, ref } from 'vue'
import PadLock from '@/components/PadLock.vue'
import RsButton from '@/components/RsButton.vue'
import StartFile from '@/files/StartFile.vue'
import type { Material } from '@/slicer/profiles'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import { SQUISH, squishFile, squishFine, zFineVariable } from './tuning'

const props = defineProps<{ tool: string; mat: Material }>()
const emit = defineEmits<{ done: [] }>()
const machine = useMachineStore()
const control = useControlStore()
const prep = usePrepareStore()
const tuning = useTuningStore()
onMounted(() => { if (!tuning.state) void tuning.load() })

const CHECKS = [
  'The bed was washed with dish soap and water, and dried with a paper towel (not a cloth)',
  'Nobody has touched the print surface since: hold it by its edges',
  'The nozzle is clean, with no blob of old plastic',
]
const ticked = ref<boolean[]>(CHECKS.map(() => false))
type Step = 'check' | 'print' | 'saved'
const step = ref<Step>('check')
const msg = ref<{ text: string; bad?: boolean } | null>(null)

const sv = computed(() => (machine.status.save_variables?.variables ?? {}) as Record<string, unknown>)
const paper = computed(() => {
  const v = sv.value[`rhino_zcal_${props.tool.toLowerCase()}`]
  return typeof v === 'number' ? v : null
})
const fineVar = computed(() => zFineVariable(props.tool, props.mat.key))
const oldFine = computed(() => {
  const v = sv.value[fineVar.value]
  return typeof v === 'number' ? v : 0
})
const mounted = computed(() => machine.mountedVerified && machine.mountedName === props.tool)
const blockers = computed(() => {
  const out: string[] = []
  if (!machine.klippyReady) out.push('Klipper isn’t ready')
  if (!mounted.value) out.push(`Mount and confirm ${props.tool} first`)
  if (paper.value == null) out.push(`${props.tool} has no nozzle height (paper test) yet: run NOZZLE_HEIGHT_CALIBRATE from Control › Macros first, then come back`)
  return out
})

// ---- the test file: made here, uploaded, started like any job
const uploaded = ref<string | null>(null)
const busy = ref(false)
async function makeTest() {
  busy.value = true
  msg.value = null
  try {
    const text = squishFile({
      tool: props.tool,
      material: props.mat.name,
      nozzle: props.mat.nozzle ?? 0.4,
      path: props.mat.path ?? 0,
      bed: { x: prep.machineInfo.workArea.x, y: prep.machineInfo.workArea.y, keepOut: prep.machineInfo.keepOut },
    })
    const name = `tuning/squish-${props.tool}-${props.mat.key}.gcode`.replace(/[^A-Za-z0-9_./-]/g, '_')
    uploaded.value = await machine.uploadFile(new File([text], name, { type: 'text/plain' }))
  } catch (e) {
    msg.value = { text: (e as Error).message, bad: true }
  } finally {
    busy.value = false
  }
}
const printing = computed(() => control.jobActive && !!machine.job.filename?.includes('squish-'))

// ---- live: closer / farther, as Control's tuning does; the fine-tune it would keep
const STEP = 0.01
const fine = computed(() => (machine.zOffset != null && paper.value != null ? squishFine(machine.zOffset, paper.value) : null))
async function nudge(d: number) {
  await control.zStep(d)
}
/** the fine-tune before this save, for old and new side by side */
const wasFine = ref(0)
async function keep() {
  if (fine.value == null) return
  wasFine.value = oldFine.value
  busy.value = true
  try {
    const ok = await control.send(`SAVE_VARIABLE VARIABLE=${fineVar.value} VALUE=${fine.value}`, { label: `First-layer fine-tune for ${props.tool} / ${props.mat.key}` })
    if (!ok) return
    await tuning.save({ tool: props.tool, test: 'first_layer', value: fine.value, nozzle: props.mat.nozzle ?? 0.4, material: props.mat.name })
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
      <p class="muted small">From Ellis’ guide: oil from fingers and fabric softener from towels spoil the first layer more than anything this test can fix.</p>
      <label v-for="(c, i) in CHECKS" :key="i" class="tick"><input v-model="ticked[i]" type="checkbox" /> {{ c }}</label>
      <div class="acts"><RsButton variant="primary" :disabled="ticked.some((t) => !t)" @click="step = 'print'">Start</RsButton></div>
    </template>

    <template v-else-if="step === 'print'">
      <ul v-if="blockers.length" class="block"><li v-for="b in blockers" :key="b">{{ b }}</li></ul>
      <ol class="how">
        <li>
          Five {{ SQUISH.size }} mm patches, one layer at {{ SQUISH.height }} mm, around the bed ({{ mat.name }}, {{ mat.nozzle ?? 0.4 }} mm nozzle).
          <RsButton v-if="!uploaded" size="sm" variant="primary" :disabled="!!blockers.length || busy" @click="makeTest">{{ busy ? 'Sending…' : 'Make the test' }}</RsButton>
          <span v-else class="muted small">Sent as {{ uploaded }}</span>
        </li>
        <li v-if="uploaded && !printing">Start it. It heats, homes and sets the nozzle height as for any print.<StartFile :file-path="uploaded" stay /></li>
        <li v-else-if="uploaded">Printing the patches.</li>
        <li>
          While the patches go down, watch the lines and move the nozzle:
          <ul class="look">
            <li><strong>Too high:</strong> round lines with gaps between them; light shows through.</li>
            <li><strong>Too low:</strong> lines fade into each other, the top looks rough or wavy, or ridges build up.</li>
            <li><strong>Right:</strong> lines just touch, the top is smooth and flat, the underside shows clear lines with no gaps. If unsure, a little more squish.</li>
          </ul>
        </li>
      </ol>
      <div class="live" :class="{ 'rs-live': control.tuneUnlocked }">
        <PadLock :open="control.tuneUnlocked" :disabled="!control.tuneUnlocked && !!control.tuningBlock" label="Live nozzle height" @toggle="control.tuneUnlocked ? control.lockTuning() : control.unlockTuning()" />
        <RsButton :disabled="!control.tuneUnlocked" @click="nudge(-STEP)">Closer ({{ -STEP }} mm)</RsButton>
        <RsButton :disabled="!control.tuneUnlocked" @click="nudge(STEP)">Farther (+{{ STEP }} mm)</RsButton>
        <span class="mono">Z offset {{ machine.zOffset != null ? machine.zOffset.toFixed(3) : '–' }}</span>
        <span class="mono muted">fine-tune {{ fine != null ? fine.toFixed(3) : '–' }} (was {{ oldFine.toFixed(3) }})</span>
      </div>
      <p v-if="msg" class="msg" :class="{ bad: msg.bad }">{{ msg.text }}</p>
      <div class="acts">
        <RsButton variant="primary" :disabled="fine == null || busy || !printing" @click="keep">Keep this height for {{ mat.name }}</RsButton>
        <RsButton v-if="printing" variant="danger-outline" @click="control.cancelJob()">Cancel the test print</RsButton>
      </div>
      <p class="muted small">Keep it while the patches print, then cancel the rest if you like: Ellis stops once the first patches look right.</p>
    </template>

    <template v-else>
      <p class="msg" role="status">Saved: {{ tool }} with {{ mat.key }} starts at the paper-test height {{ fine != null && fine >= 0 ? '+' : '' }}{{ fine?.toFixed(3) }} mm (was {{ wasFine >= 0 ? '+' : '' }}{{ wasFine.toFixed(3) }}). Every print with them uses it from the next START_JOB.</p>
      <div class="acts"><RsButton variant="primary" @click="emit('done')">Done</RsButton></div>
    </template>
  </div>
</template>

<style scoped>
.wiz { display: flex; flex-direction: column; gap: var(--rs-space-3); }
.tick { display: flex; gap: var(--rs-space-2); align-items: flex-start; font-size: var(--rs-text-sm); }
.acts { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); }
.block { margin: 0; padding-left: 1.2em; color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.how { margin: 0; padding-left: 1.3em; display: flex; flex-direction: column; gap: var(--rs-space-3); font-size: var(--rs-text-sm); }
.how > li > :deep(button) { margin-left: var(--rs-space-2); }
.look { margin: 6px 0 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 2px; }
.live { background: var(--rs-surface); color: var(--rs-text); display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2) var(--rs-space-3); padding: var(--rs-space-3); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); }
.mono { font-family: var(--rs-font-code); font-size: var(--rs-text-sm); color: var(--rs-text); }
.live .muted { color: var(--rs-text-muted); }
.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); }
</style>
