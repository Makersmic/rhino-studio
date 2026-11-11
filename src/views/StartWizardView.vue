<script setup lang="ts">
/**
 * Start a laser, drag knife or CNC job (#/start?file=…): checklist, Set Z zero, the frame check (offered), test fire or
 * test cut, then `<SETUP> FILE=… FROM=STUDIO`. The spindle: checklist, X/Y zero with the jog panel, Z zero, frame,
 * the warm-up at a throttle (Stop always there), then the start, which the Rhino refuses on a stopped spindle. Logic and every script in src/control/startWizard.ts; each script goes
 * through the console check and asks first. The Rhino's own Set Z zero window opens over this page (PromptDialog).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import MascotRow from '@/components/MascotRow.vue'
import MotionPanel from '@/control/MotionPanel.vue'
import '@/toolmgr/forms.css'
import { DONE_POSE, TROUBLE_POSE, type Pose } from '@/brand/mascot'
import { parseGcode } from '@/gcode/parse'
import { jobCareNote } from '@/maintenance/summary'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import { useMaintenanceStore } from '@/stores/maintenance'
import { usePrepareStore } from '@/stores/prepare'
import { useTuningStore } from '@/stores/tuning'
import {
  START_TOOLS, STOP_SCRIPT, THROTTLE, XY_SCRIPT, adjustScript, checklist, clampThrottle, focusSteps, frameProblem, frameScript, startScript,
  stepsFor, testQuestion, testScript, warmScript, zeroScript, type Box,
} from '@/control/startWizard'
import { throttlePct } from '@/tuning/cutTests'

type Step = ReturnType<typeof stepsFor>[number]['id']

const route = useRoute()
const router = useRouter()
const machine = useMachineStore()
const control = useControlStore()
const care = useMaintenanceStore()
const prep = usePrepareStore()
const tuning = useTuningStore()

const file = computed(() => String(route.query.file ?? ''))
const name = computed(() => file.value.split('/').pop() ?? file.value)
const t = computed(() => (machine.mountedName ? START_TOOLS[machine.mountedName] ?? null : null))
const kind = computed(() => t.value?.kind ?? 'laser')
const zeroed = computed(() => (machine.status['gcode_macro SET_Z_ZERO'] as Record<string, unknown> | undefined)?.zeroed)
const hasZero = computed(() => !!t.value && zeroed.value === t.value.tool)
const STEPS = computed(() => stepsFor(kind.value))
const cncSetup = computed(() => machine.status['gcode_macro CNC_JOB_SETUP'] as Record<string, unknown> | undefined)
// the spindle: X/Y zero set in this wizard, the throttle to warm up at, and whether it's turning
const xySet = ref(false)
const duty = ref<number>(THROTTLE.default)
const spinning = computed(() => !!machine.outputs.spindle?.turning)
const throttleNow = computed(() => machine.outputs.spindle?.throttle ?? 0)
watch(cncSetup, (c) => { if (typeof c?.duty === 'number' && !spinning.value) duty.value = clampThrottle(c.duty) }, { immediate: true })
const dutyPct = computed({ get: () => throttlePct(duty.value), set: (p: number) => { duty.value = clampThrottle(p / 100) } })

const step = ref<Step>('check')
const ticks = ref<boolean[]>([])
const tested = ref(false)
const adjusting = ref(false)
const framed = ref(false)
const busy = ref(false)
const pressure = computed(() => {
  const v = (machine.status.save_variables?.variables as Record<string, unknown> | undefined)?.set_material_blade_pressure
  return typeof v === 'number' ? v : null
})
const lines = computed(() => checklist(kind.value, pressure.value))
watch(lines, (l) => (ticks.value = l.map(() => false)), { immediate: true })
const focus = computed(() => {
  const v = tuning.state?.heads?.[t.value?.tool ?? '']?.laser_focus_height
  return kind.value === 'laser' ? focusSteps(v?.value) : null
})
const q = computed(() => testQuestion(kind.value))

// The job's outline, for the frame check
const box = ref<Box | null>(null)
const boxError = ref('')
onMounted(async () => {
  void tuning.load()
  const url = machine.rootUrl('gcodes', file.value)
  if (!url) return
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const b = parseGcode(new Uint8Array(await r.arrayBuffer())).bounds
    box.value = b ? { minX: b.min[0], minY: b.min[1], maxX: b.max[0], maxY: b.max[1] } : null
  } catch (e) {
    boxError.value = `The file couldn’t be read for its outline (${(e as Error).message}).`
  }
})
const travel = computed<Box>(() => {
  const m = prep.machineInfo
  return { minX: m.travelMin[0], minY: m.travelMin[1], maxX: m.travelMax[0], maxY: m.travelMax[1] }
})
// a CNC file is in work coordinates: it lands at its moves plus the X/Y zero just set
const workOffset = computed(() => {
  if (kind.value !== 'cnc') return { x: 0, y: 0 }
  const o = (machine.status.gcode_move as { homing_origin?: number[] } | undefined)?.homing_origin ?? [0, 0]
  return { x: Number(o[0]) || 0, y: Number(o[1]) || 0 }
})
const frameWhy = computed(() => boxError.value || frameProblem(box.value, travel.value, workOffset.value))

// Anything that would make this start wrong: shown instead of the step, and the start is refused on the machine too
const blocker = computed(() => {
  if (!file.value) return 'No file was given. Start a job from Files or Job setup.'
  if (!t.value) return `Studio’s start wizard is for the LightSaber, the DragKnife and the HotJoe; ${machine.mountedName ?? 'no toolhead'} is mounted. Start this job from Files.`
  if (typeof zeroed.value !== 'string') return 'The Rhino’s config is older than Tool Manager 1.9.25, which this wizard needs. Start the job from Files: the Rhino’s own prompts walk you through it.'
  if (kind.value === 'cnc' && Number(cncSetup.value?.studio_start) !== 1) return 'The Rhino’s config is older than Tool Manager 1.9.27, which this wizard needs for the spindle. Start the job from Files: the Rhino’s own prompts walk you through it.'
  if (!machine.klippyReady) return 'Klipper isn’t ready.'
  if (control.jobActive) return 'A job is running.'
  if (!startScript(t.value, file.value)) return 'Rename the file without spaces or special characters: the setup takes it as FILE=.'
  return null
})

// A swap or restart clears the zero: from a later step, go back to it (the spindle: to its X/Y zero)
watch(hasZero, (z) => {
  if (!z && (step.value === 'frame' || step.value === 'test' || step.value === 'warm' || step.value === 'start')) {
    step.value = kind.value === 'cnc' ? 'xy' : 'zero'
    tested.value = false
    xySet.value = false
  }
})
// the spindle stopped before the start: back to the warm-up
watch(spinning, (on) => { if (!on && kind.value === 'cnc' && step.value === 'start') step.value = 'warm' })

async function setXY() {
  busy.value = true
  try {
    xySet.value = (await control.send(XY_SCRIPT, { label: 'Set X/Y zero', confirmTitle: 'Set the X/Y zero here?', confirmBody: 'The bit’s position now becomes the job’s X0 Y0 (G54). Nothing moves.' })) || xySet.value
  } finally {
    busy.value = false
  }
}
async function warm() {
  busy.value = true
  try {
    await control.send(warmScript(duty.value), {
      label: 'Warm up the spindle',
      confirmTitle: 'Start the spindle?',
      confirmBody: `The Rhino checks the lid, lifts the bit 10 mm above the zero, switches the spindle on and ramps it to ${dutyPct.value} % throttle. Glasses and hearing protection on, hands clear.`,
      confirmLabel: 'Start the spindle',
    })
  } finally {
    busy.value = false
  }
}
async function adjust(up: boolean) {
  busy.value = true
  try {
    await control.send(adjustScript(up), { label: `Throttle ${up ? '+' : '−'}5 %` })
  } finally {
    busy.value = false
  }
}
async function stopSpindle() {
  busy.value = true
  try {
    await control.send(STOP_SCRIPT, { label: 'Stop the spindle', confirmTitle: 'Stop the spindle?', confirmBody: 'The spindle switches off and the bit lifts 15 mm clear. Start it again from this step.', confirmLabel: 'Stop the spindle' })
  } finally {
    busy.value = false
  }
}

async function setZero() {
  busy.value = true
  try {
    await control.send(zeroScript(kind.value), { label: 'Set Z zero', confirmTitle: 'Set the Z zero?', confirmBody: 'Klipper opens its Set Z zero window here: move the bed with its buttons, then press SET. It may home first if Z isn’t homed.' })
  } finally {
    busy.value = false
  }
}
async function frame() {
  if (!box.value || frameWhy.value) return
  busy.value = true
  try {
    framed.value = await control.send(frameScript(kind.value, box.value), {
      label: 'Trace the outline',
      confirmTitle: 'Trace the job’s outline?',
      confirmBody: `The ${t.value?.tool} moves round the outline ${5} mm above the ${kind.value === 'cnc' ? 'stock' : 'zero'}, with the ${kind.value === 'cnc' ? 'spindle' : 'tool'} off. Watch that it stays on the material and clear of clamps.`,
    }) || framed.value
  } finally {
    busy.value = false
  }
}
async function test() {
  busy.value = true
  adjusting.value = false
  try {
    tested.value = await control.send(testScript(kind.value), {
      label: kind.value === 'laser' ? 'Test fire' : 'Test cut',
      confirmTitle: kind.value === 'laser' ? 'Fire a test pulse?' : 'Cut a test line?',
      confirmBody: kind.value === 'laser'
        ? 'A 0.2 s pulse at 5 % where the laser is now. Glasses on. The lid must be closed.'
        : 'The knife goes to the work zero, cuts a 10 mm line at 0.3 mm deep, and lifts clear.',
    })
  } finally {
    busy.value = false
  }
}
function testFailed() {
  if (kind.value === 'knife') adjusting.value = true
  else again()
}
function again() {
  adjusting.value = false
  tested.value = false
  step.value = 'zero'
}
async function start() {
  if (!t.value) return
  const s = startScript(t.value, file.value)
  if (!s) return
  busy.value = true
  try {
    const note = jobCareNote(care.forTool(t.value.tool), t.value.tool)
    const ok = await control.send(s, {
      label: `Start ${name.value}`,
      confirmTitle: `Start ${name.value}?`,
      confirmBody: [`Runs ${t.value.setup} FROM=STUDIO: it checks the lid and the Z zero${kind.value === 'cnc' ? ', and that the spindle is running,' : ''} again, then starts the file.`, note].filter(Boolean).join('\n\n'),
      confirmLabel: 'Start job',
    })
    if (ok) void router.push('/control')
  } finally {
    busy.value = false
  }
}

const pose = computed<Pose>(() => {
  if (blocker.value || (step.value === 'test' && adjusting.value)) return TROUBLE_POSE
  if (step.value === 'start') return DONE_POSE
  if (step.value === 'check') return 'carry'
  if (step.value === 'xy') return 'wrench'
  if (step.value === 'zero') return 'calipers'
  if (step.value === 'frame') return 'meter'
  if (step.value === 'warm') return 'spindle'
  return kind.value === 'laser' ? 'laser' : 'pipewrench'
})
const at = computed(() => STEPS.value.findIndex((s) => s.id === step.value))
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Start {{ name || 'a job' }}</h1>
      <p>{{ t ? (kind === 'cnc' ? `${t.tool}: the checks, both zeros and the spindle warm-up before the job, on this page.` : `${t.tool}: the checks, the Z zero and a test before the job, on this page.`) : 'Studio’s start wizard for laser, drag knife and CNC jobs.' }}</p>
    </div>

    <ol class="steps" aria-label="Steps">
      <li v-for="(s, i) in STEPS" :key="s.id" :class="{ now: s.id === step, done: i < at }"><span class="n">{{ i + 1 }}</span>{{ s.label }}</li>
    </ol>

    <RsPanel :title="STEPS[at]!.label" panel-id="start.step">
      <MascotRow :pose="pose">
        <p v-if="blocker" class="msg">{{ blocker }}</p>

        <!-- 1 checklist -->
        <template v-else-if="step === 'check'">
          <p>Check before you start:</p>
          <label v-for="(l, i) in lines" :key="l" class="tick"><input v-model="ticks[i]" type="checkbox" /> {{ l }}</label>
          <div class="acts">
            <RsButton variant="primary" :disabled="!ticks.every(Boolean)" @click="step = kind === 'cnc' ? 'xy' : 'zero'">{{ kind === 'cnc' ? 'All checked - set X/Y zero' : 'All checked - set Z zero' }}</RsButton>
            <RsButton @click="router.back()">Cancel</RsButton>
          </div>
        </template>

        <!-- the spindle: X/Y zero on the stock's corner -->
        <template v-else-if="step === 'xy'">
          <p>Jog the bit over the X/Y origin of your stock (usually its front-left corner) with the panel below, then set X/Y zero. Nothing moves when you set it.</p>
          <p v-if="xySet" class="state ok">X/Y zero set at X {{ workOffset.x.toFixed(2) }} Y {{ workOffset.y.toFixed(2) }}.</p>
          <div class="acts">
            <RsButton :variant="xySet ? 'default' : 'primary'" :disabled="busy" @click="setXY">{{ xySet ? 'Set it again here' : 'Set X/Y zero here' }}</RsButton>
            <RsButton :variant="xySet ? 'primary' : 'default'" :disabled="!xySet" @click="step = 'zero'">Next</RsButton>
          </div>
        </template>

        <!-- 2 Z zero -->
        <template v-else-if="step === 'zero'">
          <p v-if="kind === 'laser'">Set the Z zero at the focus point. Klipper’s Set Z zero window opens here: move the bed with its buttons, then press <b>SET</b>.</p>
          <p v-else-if="kind === 'cnc'">Set the Z zero on the stock’s top: bring the bed up until the bit just touches the top of the stock (a sheet of paper should drag), then press <b>SET</b>.</p>
          <p v-else>Set the Z zero on the material surface: bring the bed up until the blade tip just touches the top of the material, then press <b>SET</b>. The knife’s X/Y zero (the machine origin) is set straight after.</p>
          <ol v-if="focus" class="focus">
            <li v-for="l in focus" :key="l">{{ l }}</li>
          </ol>
          <p v-else-if="kind === 'laser'" class="muted small">Smallest, sharpest dot: wear laser glasses before turning the focus dot on. Tune the LightSaber’s focus height to set it by measurement instead.</p>
          <p class="state" :class="{ ok: hasZero }">{{ hasZero ? `Z zero set for the ${t?.tool}.` : 'No Z zero for this job yet.' }}</p>
          <div class="acts">
            <RsButton :variant="hasZero ? 'default' : 'primary'" :disabled="busy" @click="setZero">{{ hasZero ? 'Set it again' : 'Set Z zero' }}</RsButton>
            <RsButton :variant="hasZero ? 'primary' : 'default'" :disabled="!hasZero" @click="step = 'frame'">Next</RsButton>
          </div>
        </template>

        <!-- 3 frame (offered) -->
        <template v-else-if="step === 'frame'">
          <p>Trace the job’s outline {{ 5 }} mm above the zero, with the tool off, to see where it will cut. You can skip this.</p>
          <p v-if="box && !frameWhy" class="muted small mono">X {{ box.minX.toFixed(1) }} to {{ box.maxX.toFixed(1) }} · Y {{ box.minY.toFixed(1) }} to {{ box.maxY.toFixed(1) }} mm ({{ (box.maxX - box.minX).toFixed(1) }} × {{ (box.maxY - box.minY).toFixed(1) }})</p>
          <p v-if="frameWhy" class="msg">{{ frameWhy }}</p>
          <p v-if="framed" class="state ok">Traced. Trace it again, or go on.</p>
          <div class="acts">
            <RsButton :variant="framed ? 'default' : 'primary'" :disabled="busy || !!frameWhy" @click="frame">{{ framed ? 'Trace again' : 'Trace the outline' }}</RsButton>
            <RsButton :variant="framed ? 'primary' : 'default'" @click="step = kind === 'cnc' ? 'warm' : 'test'">{{ framed ? 'Next' : 'Skip' }}</RsButton>
          </div>
        </template>

        <!-- 4 test -->
        <template v-else-if="step === 'test'">
          <template v-if="!tested">
            <p v-if="kind === 'laser'">Fire a short, low-power pulse where the laser is now, to check the focus.</p>
            <p v-else>Cut a short test line at the work zero, to check the depth and pressure.</p>
            <div class="acts">
              <RsButton variant="primary" :disabled="busy" @click="test">{{ kind === 'laser' ? 'Test fire' : 'Cut a test line' }}</RsButton>
              <RsButton @click="step = 'zero'">Back to the Z zero</RsButton>
            </div>
          </template>
          <template v-else-if="adjusting">
            <p v-for="l in q.adjust" :key="l">{{ l }}</p>
            <div class="acts"><RsButton variant="primary" @click="again">Set Z zero and test again</RsButton></div>
          </template>
          <template v-else>
            <p v-for="l in q.lines" :key="l">{{ l }}</p>
            <div class="acts">
              <RsButton variant="primary" @click="step = 'start'">{{ q.yes }}</RsButton>
              <RsButton @click="testFailed">{{ q.no }}</RsButton>
            </div>
          </template>
        </template>

        <!-- the spindle: warm-up at a throttle, Stop always there -->
        <template v-else-if="step === 'warm'">
          <template v-if="!spinning">
            <p>Start the spindle: the Rhino checks the lid, lifts the bit 10 mm above the stock, switches the spindle on and ramps it up.</p>
            <label class="thr">Throttle (%)<input v-model.number="dutyPct" type="number" :min="THROTTLE.min * 100" :max="100" step="5" class="tm-in" /></label>
            <p class="muted small">As the setup counts it: 30 % is stopped, 100 % full. Your tuned throttle for this bit and material is on Tune HotJoe.</p>
            <div class="acts">
              <RsButton variant="primary" :disabled="busy" @click="warm">Start the spindle</RsButton>
              <RsButton @click="step = 'frame'">Back</RsButton>
            </div>
          </template>
          <template v-else>
            <p class="state ok">Spindle running at {{ throttlePct(throttleNow) }} % throttle.</p>
            <p>Listen: a steady sound, no rattle. Dust extraction on and eye protection on? Then start the cut.</p>
            <div class="acts">
              <RsButton variant="primary" @click="step = 'start'">Next</RsButton>
              <RsButton :disabled="busy || throttleNow >= 1" @click="adjust(true)">Throttle +5 %</RsButton>
              <RsButton :disabled="busy || throttleNow <= 0.31" @click="adjust(false)">Throttle −5 %</RsButton>
              <RsButton variant="danger-outline" :disabled="busy" @click="stopSpindle">Stop the spindle</RsButton>
            </div>
          </template>
        </template>

        <!-- 5 start -->
        <template v-else>
          <p v-if="kind === 'cnc'">Ready to cut <b>{{ name }}</b> with the {{ t?.tool }}, spindle at {{ throttlePct(throttleNow) }} %. The Rhino checks the lid, the Z zero and that the spindle is running, then starts the file.</p>
          <p v-else>Ready to cut <b>{{ name }}</b> with the {{ t?.tool }}. The Rhino checks the lid and the Z zero again, then starts the file{{ kind === 'laser' ? ', and powers the laser only once it has loaded' : '' }}.</p>
          <div class="acts">
            <RsButton variant="primary" :disabled="busy || !hasZero || (kind === 'cnc' && !spinning)" @click="start">Start the job</RsButton>
            <RsButton @click="step = kind === 'cnc' ? 'warm' : 'test'">Back</RsButton>
            <RsButton v-if="kind === 'cnc' && spinning" variant="danger-outline" :disabled="busy" @click="stopSpindle">Stop the spindle</RsButton>
          </div>
        </template>
      </MascotRow>
    </RsPanel>
    <!-- the spindle's X/Y zero: Control's own jog panel, padlock and all -->
    <MotionPanel v-if="step === 'xy' && !blocker" class="jog" />
  </div>
</template>

<style scoped>
.steps { list-style: none; margin: 0 0 var(--rs-gap); padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: var(--rs-text-sm); }
.steps li { display: inline-flex; align-items: center; gap: 6px; color: var(--rs-text-muted); }
.steps .n { width: 20px; height: 20px; display: inline-grid; place-items: center; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--rs-line-strong); font-size: 11px; }
.steps .now, .steps .done { color: var(--rs-text-strong); }
.steps .now .n { box-shadow: inset 0 0 0 2px var(--rs-ink); }
.steps .done .n { background: var(--rs-ink); color: var(--rs-on-ink); box-shadow: none; }
p { margin: 0 0 var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text); }
.jog { margin-top: var(--rs-gap); }
.thr { display: flex; flex-direction: column; gap: 4px; max-width: 180px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin-bottom: var(--rs-space-2); }
.tick { display: flex; align-items: flex-start; gap: var(--rs-space-2); margin: 0 0 var(--rs-space-2); font-size: var(--rs-text-sm); color: var(--rs-text-strong); cursor: pointer; }
.tick input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--rs-text-strong); flex: none; }
.acts { display: flex; flex-wrap: wrap; gap: var(--rs-space-2); margin-top: var(--rs-space-4); }
.focus { margin: 0 0 var(--rs-space-3); padding-left: 1.3em; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.focus li { margin: 2px 0; }
.state { font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.state.ok { color: var(--rs-text-strong); }
.msg { padding: 8px 12px; border-radius: var(--rs-radius-md); background: var(--rs-surface-2); color: var(--rs-text-strong); border-left: 4px solid var(--rs-text-strong); }
.muted { color: var(--rs-text-muted); }
.small { font-size: var(--rs-text-xs); }
.mono { font-family: var(--rs-font-code); }
</style>
