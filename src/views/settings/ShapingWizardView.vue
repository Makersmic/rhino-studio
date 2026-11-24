<script setup lang="ts">
/**
 * Wizards > Input shaping (Tool Manager docs/proposal-tuning-wizards-2.md, item 6): measure how the machine rings with a USB
 * ADXL345 and pick the input shaper that removes it. Sets up the accelerometer (the Portal keeps its config in tuned.cfg),
 * checks it answers and is quiet, runs a gentle test and then SHAPER_CALIBRATE for X and Y, draws the curves, and keeps the pick
 * for the print head that was mounted. It shakes the whole machine: keep a hand near Stop. SAVE_CONFIG is never sent.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import EditableText from '@/components/EditableText.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import { SHAPING_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { LEVEL_TONE, LEVEL_WORD } from '@/system/healthCheck'
import type { TunedState } from '@/portal/client'
import {
  PRESETS, boardLines, boardNameOf, boardProblem, calibrateScript, csFor, findBoards, justPlugged, csvName, fitSentence, gentleScript, noiseSentence, parseCalibrate, parseCsv, parseNoise, parseQuery,
  pathFor, plainShaper, querySentence, scriptProblem, shaperLines, shaperStoreScript, shaperUnstoreScript, type Axis, type AxisResult, type Board, type Curves, type Fit, type Found,
} from '@/checks/shaper'

const STEPS = [
  { id: 'board', label: 'Accelerometer', help: 'Is it set up?' },
  { id: 'test', label: 'Does it answer', help: 'Reading and noise' },
  { id: 'measure', label: 'Measure', help: 'Gentle, then X and Y' },
  { id: 'pick', label: 'Choose', help: 'Curves and shapers' },
  { id: 'keep', label: 'Keep it', help: 'For this print head' },
] as const
type StepId = (typeof STEPS)[number]['id']

const machine = useMachineStore()
const control = useControlStore()
const maint = useMaintenanceStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)

const tuned = ref<TunedState | null>(null)
const tunedError = ref<string | null>(null)
async function loadTuned() {
  try {
    tuned.value = (await maint.portal()?.tunedState()) ?? null
    tunedError.value = tuned.value ? null : 'The Rhino Portal isn\'t connected.'
  } catch (e) {
    tunedError.value = `The Rhino can't keep tuned values yet (${(e as Error).message}). Install the latest release first.`
  }
}
const found = ref<Found>({ fresh: [], taken: [], needsFirmware: [] })
/** the USB boards that were there when the wizard opened: one that appears later is the one just plugged in */
const before = ref<string[]>([])
let looking: ReturnType<typeof setInterval> | null = null
async function look(first = false) {
  try {
    const b = await maint.portal()?.hwBoards()
    if (!b) return
    if (first) before.value = b.serial_ports.map((p) => p.path)
    found.value = findBoards(b.serial_ports, before.value)
    // the accelerometer is the board no config file mentions: if there is exactly one, or one just appeared, use it
    const cand = found.value.fresh.filter((p) => justPlugged(p, before.value))
    const pick = cand.length === 1 ? cand[0]! : found.value.fresh.length === 1 ? found.value.fresh[0]! : null
    if (pick && !board.value.serial) board.value.serial = pick.path
  } catch { /* the list is a convenience: the serial name can be typed */ }
}
onMounted(async () => {
  void loadTuned()
  // if Klipper already has the accelerometer go straight to the check; otherwise look for the board, and keep looking while the person plugs it in
  if (hasChip.value) at.value = 1
  await look(true)
  looking = setInterval(() => step.value === 'board' && !hasChip.value && void look(), 3000)
})
onBeforeUnmount(() => looking && clearInterval(looking))
function useBoard(path: string) {
  board.value = { ...board.value, serial: path, ownMcu: true, mcu: 'adxl', csPin: csFor('adxl', gpioOf(board.value.csPin)) }
}
function useAdded(name: string) {
  board.value = { ...board.value, mcu: name, ownMcu: false, serial: '', csPin: csFor(name, gpioOf(board.value.csPin)) }
}
const gpioOf = (pin: string) => /:(gpio\d{1,2})$/.exec(pin)?.[1] ?? 'gpio1'

// ---- 1 accelerometer
const hasChip = computed(() => machine.objects.has('adxl345'))
const hasTester = computed(() => machine.objects.has('resonance_tester'))
const board = ref<Board>({ serial: '', mcu: 'adxl', ownMcu: true, csPin: csFor('adxl', PRESETS[0]!.pins.gpio), spiBus: PRESETS[0]!.pins.spiBus, axesMap: 'x,y,z' })
const lim = computed(() => (machine.limits.min && machine.limits.max ? { min: machine.limits.min, max: machine.limits.max } : null))
const probe = computed(() => ({ x: Math.round(lim.value ? (lim.value.min[0]! + lim.value.max[0]!) / 2 : 150), y: Math.round(lim.value ? (lim.value.min[1]! + lim.value.max[1]!) / 2 : 150), z: 20 }))
const bProblem = computed(() => boardProblem(board.value))
const savingBoard = ref(false)
const boardKept = ref(false)
const boardError = ref<string | null>(null)
async function keepBoard() {
  const p = maint.portal()
  if (!p || !tuned.value) return
  savingBoard.value = true
  boardError.value = null
  try {
    tuned.value = await p.tunedAccelerometer(tuned.value.rev, { serial: board.value.serial, mcu: board.value.mcu, own_mcu: board.value.ownMcu, cs_pin: board.value.csPin, spi_bus: board.value.spiBus, axes_map: board.value.axesMap, probe: probe.value })
    boardKept.value = true
  } catch (e) {
    boardError.value = (e as Error).message
  } finally {
    savingBoard.value = false
  }
}

// ---- 2 test
const base = computed(() => (!machine.klippyReady ? 'Klipper isn\'t ready.' : control.jobActive ? 'A job is running.' : null))
const queryNote = ref<{ ok: boolean; say: string } | null>(null)
const noiseNote = ref<{ ok: boolean; say: string } | null>(null)
const testing = ref(false)
const testError = ref<string | null>(null)
async function runTest() {
  testing.value = true
  testError.value = null
  try {
    const q = await control.runCapture('ACCELEROMETER_QUERY', { label: 'Accelerometer check' }, 400)
    const s = parseQuery(q.lines)
    queryNote.value = s ? querySentence(s) : null
    if (!s) return void (testError.value = q.lines.find((l) => l.startsWith('!!'))?.replace(/^!!\s*/, '') ?? 'The accelerometer didn\'t answer. Check the cable, the serial name and that Klipper restarted after the config was kept.')
    const n = await control.runCapture('MEASURE_AXES_NOISE', { label: 'Accelerometer noise' }, 400)
    const nn = parseNoise(n.lines)
    noiseNote.value = nn ? noiseSentence(nn) : null
  } finally {
    testing.value = false
  }
}

// ---- 3 measure
const head = computed(() => machine.mountedName)
const homed = computed(() => /x/.test(machine.position.homed.toLowerCase()) && /y/.test(machine.position.homed.toLowerCase()) && /z/.test(machine.position.homed.toLowerCase()))
const checks = computed(() => {
  const out: { level: 'PASS' | 'FAIL'; what: string; detail?: string }[] = []
  out.push(machine.mountedVerified ? { level: 'PASS', what: `${head.value} is mounted` } : { level: 'FAIL', what: 'No toolhead is confirmed as mounted', detail: 'Mount one and confirm it in Control.' })
  out.push(homed.value ? { level: 'PASS', what: 'The machine is homed' } : { level: 'FAIL', what: 'The machine isn\'t homed', detail: 'Home all in Control.' })
  out.push(base.value ? { level: 'FAIL', what: base.value } : { level: 'PASS', what: 'Klipper is ready and no job is running' })
  out.push(hasChip.value && hasTester.value ? { level: 'PASS', what: 'Klipper has the accelerometer and the resonance tester' } : { level: 'FAIL', what: 'Klipper doesn\'t have the accelerometer yet', detail: 'Set it up in step 1 and restart Klipper.' })
  out.push(queryNote.value?.ok ? { level: 'PASS', what: 'It answered in step 2' } : { level: 'FAIL', what: 'Run the check in step 2 first' })
  return out
})
const ready = computed(() => checks.value.every((c) => c.level === 'PASS'))
const gentle = computed(() => gentleScript('x'))
const texts = ref<Record<Axis, string>>({ x: calibrateScript('x'), y: calibrateScript('y') })
const results = ref<Partial<Record<Axis, AxisResult>>>({})
const curves = ref<Partial<Record<Axis, Curves>>>({})
const running = ref<string | null>(null)
const runError = ref<string | null>(null)
const gentleDone = ref(false)
async function runGentle() {
  running.value = 'gentle'
  runError.value = null
  try {
    gentleDone.value = (await control.runCapture(gentle.value, { label: 'Gentle shake test', confirmTitle: 'Shake the machine gently?', confirmBody: 'The head shakes back and forth, quietly, for a few seconds. Keep a hand near Stop and watch that nothing rattles loose.', confirmLabel: 'Shake gently' }, 800)).ok
  } finally {
    running.value = null
  }
}
async function calibrate(axis: Axis) {
  running.value = axis
  runError.value = null
  try {
    const r = await control.runCapture(texts.value[axis], { label: `Shaper calibration, ${axis.toUpperCase()}`, confirmTitle: `Measure the ${axis.toUpperCase()} axis?`, confirmBody: `The head shakes along ${axis.toUpperCase()} from 5 to 133 Hz for about a minute and gets louder as it goes. Keep a hand near Stop. Nothing is kept until you say so.`, confirmLabel: 'Measure' }, 1200)
    const got = parseCalibrate(r.lines).find((a) => a.axis === axis)
    if (!r.ok || !got) return void (runError.value = r.lines.find((l) => l.startsWith('!!'))?.replace(/^!!\s*/, '') ?? 'Klipper gave no result. Look in Control for what it said.')
    results.value = { ...results.value, [axis]: got }
    picks.value = { ...picks.value, [axis]: got.recommended?.type ?? got.fits[0]?.name ?? '' }
    try {
      const c = parseCsv(await maint.portal()!.resonanceCsv(axis, csvName(axis)))
      if (c) curves.value = { ...curves.value, [axis]: c }
    } catch { /* the chart is a bonus: the numbers are enough */ }
  } finally {
    running.value = null
  }
}
const tx = computed(() => scriptProblem(texts.value.x) ?? scriptProblem(texts.value.y))

// ---- 4 pick
const picks = ref<Partial<Record<Axis, string>>>({})
const fitOf = (a: Axis): Fit | null => results.value[a]?.fits.find((f) => f.name === picks.value[a]) ?? null
const W = 520, H = 130
const ymax = (a: Axis) => Math.max(1e-9, ...(curves.value[a]?.psd ?? [0]))
const have = computed(() => !!results.value.x && !!results.value.y)

// ---- 5 keep
const saving = ref(false)
const removing = ref(false)
const removed = ref(false)
const removeError = ref<string | null>(null)
/** The board is a one-time tool: take it out of the config when every head is measured, restart Klipper, then unplug it. */
async function removeAccelerometer() {
  const p = maint.portal()
  if (!p || !tuned.value) return
  removing.value = true
  removeError.value = null
  try {
    tuned.value = await p.tunedAccelerometerClear(tuned.value.rev)
    removed.value = true
  } catch (e) {
    removeError.value = (e as Error).message
  } finally {
    removing.value = false
  }
}
const kept = ref(false)
const keepError = ref<string | null>(null)
const maxAccel = computed(() => {
  const a = [fitOf('x')?.maxAccel, fitOf('y')?.maxAccel].filter((v): v is number => !!v)
  return a.length ? Math.min(...a) : null
})
async function keep() {
  const p = maint.portal(), fx = fitOf('x'), fy = fitOf('y')
  if (!p || !tuned.value || !fx || !fy || !head.value) return
  saving.value = true
  keepError.value = null
  try {
    tuned.value = await p.tunedShaper(tuned.value.rev, { head: head.value, x: { type: fx.name, freq: fx.freq }, y: { type: fy.name, freq: fy.freq }, max_accel: maxAccel.value })
    kept.value = true
    // what the job-start macro reads, so each print head gets its own pick (Tool Manager 1.9.49)
    if (!(await control.send(shaperStoreScript(head.value, { type: fx.name, freq: fx.freq }, { type: fy.name, freq: fy.freq }), { label: `Store the input shaper for ${head.value} on the Rhino` })))
      keepError.value = 'Kept in tuned.cfg, but Klipper didn\'t store the per-head value, so jobs will use the last shaper loaded. Keep it again.'
  } catch (e) {
    keepError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
async function putBack() {
  const p = maint.portal()
  if (!p || !tuned.value || !head.value) return
  saving.value = true
  try {
    tuned.value = await p.tunedShaperClear(tuned.value.rev, head.value)
    await control.send(shaperUnstoreScript(head.value), { label: `Forget the input shaper for ${head.value}` })
    kept.value = false
  } catch (e) {
    keepError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />
    <RestartBanner />
    <p v-if="tuned?.accelerometer_present === false" class="warnbar" role="alert">
      <StatusChip tone="danger">Not plugged in</StatusChip>
      The accelerometer is set up but its board isn't connected. <b>Klipper won't start until you plug it in or remove it.</b>
      <RsButton size="sm" variant="danger-outline" :disabled="removing" @click="removeAccelerometer">Remove it from the config</RsButton>
    </p>

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="shaping.step">
      <MascotRow :pose="SHAPING_STEP_POSE[step]">
        <template v-if="step === 'board'">
          <p class="q">Does Klipper know about the accelerometer?</p>
          <p v-if="hasChip" class="plain"><StatusChip tone="ok">Set up</StatusChip> Klipper has an accelerometer and a resonance tester. Go on to the check.</p>
          <template v-else>
            <p class="plain"><b>Plug your accelerometer into the Rhino's host now.</b> This is a one-time job: you plug it in, measure each print head, then take it out of the config and unplug it when you're done. The wizard walks you through both ends.</p>
            <p class="plain">The USB accelerometer is a small second board (its own MCU) with the sensor on it. Plug it into the Rhino's host and Studio looks for it. Fix it firmly to the head (the heatsink fan mount worked before) with the cable free to move, and keep it clear of fans.</p>
            <p v-for="p in found.fresh" :key="p.path" class="plain"><StatusChip tone="ok">{{ justPlugged(p, before) ? 'Just plugged in' : 'Not in your config' }}</StatusChip> <span class="mono">{{ p.path.replace('/dev/serial/by-id/', '') }}</span> <RsButton size="sm" :variant="board.serial === p.path ? 'default' : 'primary'" @click="useBoard(p.path)">{{ board.serial === p.path ? 'Using this one' : 'This is it' }}</RsButton></p>
            <p v-for="p in found.taken" :key="p.path" class="plain"><StatusChip tone="neutral">Added already</StatusChip> <span class="mono">{{ p.path.replace('/dev/serial/by-id/', '') }}</span> ({{ p.used_by }}) <RsButton v-if="boardNameOf(p.used_by)" size="sm" @click="useAdded(boardNameOf(p.used_by)!)">Use it as the accelerometer</RsButton></p>
            <p v-for="p in found.needsFirmware" :key="p.path" class="plain"><StatusChip tone="warn">Needs firmware</StatusChip> <span class="mono">{{ p.path.replace('/dev/serial/by-id/', '') }}</span> is a board waiting for Klipper's firmware. Flash it first (the maker's page says how), unplug and replug it, then come back.</p>
            <p v-if="found.fresh.length > 1" class="plain muted">More than one USB board isn't used by your config. The accelerometer is the one that appeared when you plugged it in; if you're not sure, check the name against the board's label.</p>
            <p v-if="!found.fresh.length && !found.taken.length && !found.needsFirmware.length" class="plain muted">No unused USB board found yet. Plug the accelerometer in (Studio checks every few seconds), or type its name below: <code>ls /dev/serial/by-id/</code>.</p>
            <p v-if="tunedError" class="tm-err">{{ tunedError }}</p>
            <div class="grid">
              <label v-if="board.ownMcu" class="tm-lbl">Serial name<input v-model="board.serial" type="text" class="tm-inp" placeholder="/dev/serial/by-id/usb-Klipper_rp2040_…"></label>
              <label class="tm-lbl">Board name in Klipper<input v-model="board.mcu" type="text" class="tm-inp" @change="board.csPin = csFor(board.mcu, gpioOf(board.csPin))"></label>
              <label class="tm-lbl">Chip-select pin<input v-model="board.csPin" type="text" class="tm-inp"></label>
              <label class="tm-lbl">SPI bus<input v-model="board.spiBus" type="text" class="tm-inp"></label>
              <label class="tm-lbl">Axes map<input v-model="board.axesMap" type="text" class="tm-inp"></label>
            </div>
            <p class="plain muted">The pins are a common default for RP2040 USB boards. Check them against the maker's page for your exact board: a wrong pin only makes the check in step 2 fail, it can't hurt anything. The axes map says how the board is turned (x,y,z if its X, Y and Z arrows match the machine's).</p>
            <p v-if="bProblem" class="tm-err">{{ bProblem }}</p>
            <p class="row"><RsButton variant="primary" :disabled="!!bProblem || savingBoard || !!tunedError || boardKept" @click="keepBoard">{{ boardKept ? 'Kept' : 'Keep these settings' }}</RsButton></p>
            <p v-if="boardKept" class="tm-ok">Kept. Klipper reads it after a restart (the banner above). Then come back here.</p>
            <p v-if="boardError" class="tm-err">{{ boardError }}</p>
            <WhatThisDoes><p>Keep writes this into <code>myrhino/tuned.cfg</code>:</p><pre class="dump">{{ boardLines(board, probe).join('\n') }}</pre><p>The measuring spot (probe_points) is the middle of the bed. Nothing moves in this step.</p></WhatThisDoes>
          </template>
        </template>

        <template v-if="step === 'test'">
          <p class="q">Does it answer, and is it quiet?</p>
          <p class="plain">Nothing moves. The accelerometer is read once at rest (about one g, 9.8) and its noise is measured for a couple of seconds.</p>
          <p class="row"><RsButton variant="primary" :disabled="testing || !hasChip || !!base" @click="runTest">{{ testing ? 'Reading…' : queryNote ? 'Read again' : 'Check it' }}</RsButton></p>
          <p v-if="!hasChip" class="plain muted">Klipper has no accelerometer yet: do step 1 and restart Klipper.</p>
          <p v-if="testError" class="tm-err">{{ testError }}</p>
          <p v-if="queryNote" class="plain"><StatusChip :tone="queryNote.ok ? 'ok' : 'warn'">{{ queryNote.ok ? 'Answers' : 'Look' }}</StatusChip> {{ queryNote.say }}</p>
          <p v-if="noiseNote" class="plain"><StatusChip :tone="noiseNote.ok ? 'ok' : 'warn'">{{ noiseNote.ok ? 'Quiet' : 'Noisy' }}</StatusChip> {{ noiseNote.say }}</p>
          <WhatThisDoes><p>This sends <code>ACCELEROMETER_QUERY</code> and <code>MEASURE_AXES_NOISE</code>. Both only read.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'measure'">
          <p class="q">Shake it gently, then measure X and Y.</p>
          <ul class="list checks"><li v-for="(c, i) in checks" :key="i"><StatusChip :tone="LEVEL_TONE[c.level]">{{ LEVEL_WORD[c.level] }}</StatusChip><span>{{ c.what }}<span v-if="c.detail" class="detail">{{ c.detail }}</span></span></li></ul>
          <p class="plain"><b>This shakes the whole machine</b>, up to several hundred hertz. Before you start: the head is mounted and locked, the bed is clear, nothing is loose on it, and the cable bundle can move freely. Keep a hand near Stop. If anything rattles loose or the head unlocks, press Stop.</p>
          <EditableText v-model="texts.x" :generated="calibrateScript('x')" :problem="scriptProblem(texts.x)" label="X axis G-code" :rows="2" />
          <EditableText v-model="texts.y" :generated="calibrateScript('y')" :problem="scriptProblem(texts.y)" label="Y axis G-code" :rows="2" />
          <p class="row">
            <RsButton :disabled="!ready || !!running" @click="runGentle">{{ running === 'gentle' ? 'Shaking…' : gentleDone ? 'Gentle test done ✓' : '1 · Shake gently first' }}</RsButton>
            <RsButton variant="primary" :disabled="!ready || !gentleDone || !!running || !!tx" @click="calibrate('x')">{{ running === 'x' ? 'Measuring X…' : results.x ? 'Measure X again' : '2 · Measure X' }}</RsButton>
            <RsButton variant="primary" :disabled="!ready || !gentleDone || !!running || !!tx" @click="calibrate('y')">{{ running === 'y' ? 'Measuring Y…' : results.y ? 'Measure Y again' : '3 · Measure Y' }}</RsButton>
          </p>
          <p v-if="runError" class="tm-err">{{ runError }}</p>
          <p v-if="results.x" class="plain"><StatusChip tone="ok">X done</StatusChip> Klipper recommends {{ results.x.recommended?.type?.toUpperCase() }} at {{ results.x.recommended?.freq }} Hz.</p>
          <p v-if="results.y" class="plain"><StatusChip tone="ok">Y done</StatusChip> Klipper recommends {{ results.y.recommended?.type?.toUpperCase() }} at {{ results.y.recommended?.freq }} Hz.</p>
          <WhatThisDoes><p>The gentle test is <code>{{ gentle }}</code>: low force over a narrow band, so you can hear and see it is mild before the real runs. <code>SHAPER_CALIBRATE</code> ends by asking for <code>SAVE_CONFIG</code>; this wizard never sends it. If Klipper has an <code>[input_shaper]</code> section it applies the result live until the next restart, so a print started before you decide would use it.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'pick'">
          <p class="q">Which shaper for each axis?</p>
          <p v-if="!have" class="plain muted">Measure both axes first (step 3).</p>
          <template v-for="a in (['x', 'y'] as const)" :key="a">
            <div v-if="results[a]" class="axis">
              <p class="plain"><b>{{ a.toUpperCase() }} axis</b> — Klipper recommends <b>{{ results[a]!.recommended?.type?.toUpperCase() }}</b>.</p>
              <svg v-if="curves[a]" :viewBox="`0 0 ${W} ${H}`" class="chart" role="img" :aria-label="`How the ${a.toUpperCase()} axis rings, by frequency`">
                <path :d="pathFor(curves[a]!.psd, curves[a]!.freq, W, H, ymax(a))" class="psd" />
                <path v-for="s in curves[a]!.shapers.filter((x) => x.name === picks[a])" :key="s.name" :d="pathFor(s.values, curves[a]!.freq, W, H, ymax(a))" class="shp" />
              </svg>
              <p v-if="curves[a]" class="plain muted">The solid line is how the {{ a.toUpperCase() }} axis rings at each frequency; the dashed line is what is left with the chosen shaper.</p>
              <div class="pick"><label v-for="f in results[a]!.fits" :key="f.name" class="opt" :class="{ on: picks[a] === f.name }"><input v-model="picks[a]" type="radio" :name="`s-${a}`" :value="f.name"><span><b>{{ f.name.toUpperCase() }}</b> <span class="detail">{{ plainShaper(f.name) }}. {{ fitSentence(f) }}</span></span></label></div>
            </div>
          </template>
          <WhatThisDoes><p>A lower-smoothing shaper keeps corners sharper but cancels less; a stronger one cancels more and rounds corners. Klipper's recommendation balances the two. The maximum acceleration is how fast you can go before the shaper rounds corners too much.</p></WhatThisDoes>
        </template>

        <template v-if="step === 'keep'">
          <p class="q">Keep these for {{ head ?? 'this print head' }}?</p>
          <template v-if="fitOf('x') && fitOf('y')">
            <ul class="list mono"><li>X: {{ fitOf('x')!.name.toUpperCase() }} at {{ fitOf('x')!.freq }} Hz</li><li>Y: {{ fitOf('y')!.name.toUpperCase() }} at {{ fitOf('y')!.freq }} Hz</li><li v-if="maxAccel">Keep print acceleration at or under {{ maxAccel }} mm/s²</li></ul>
            <p class="plain">The result is kept for <b>{{ head }}</b>: every head weighs something different, so measure each one with it mounted. At the start of each job Klipper sets this head's pick (a head with none keeps what was loaded). After a restart it loads the last one you kept.</p>
            <p v-if="!kept" class="row"><RsButton variant="primary" :disabled="saving || !head" @click="keep">Keep it</RsButton><span class="plain muted">Nothing is changed unless you keep it.</span></p>
            <p v-else class="tm-ok">Kept. Restart Klipper (the banner above) to load it. <RsButton variant="quiet" :disabled="saving" @click="putBack">Put back what it had</RsButton></p>
            <p v-if="keepError" class="tm-err">{{ keepError }}</p>
            <div v-if="tuned?.accelerometer && !removed" class="done">
              <p class="plain"><b>Finished measuring every print head?</b> The accelerometer is a one-time tool. Take it out of the config <b>before</b> you unplug it: a board that is unplugged but still configured stops Klipper starting.</p>
              <ol class="plain steps">
                <li>Press <b>Remove it from the config</b>. Your kept shaper picks stay; they don't need the board.</li>
                <li>Restart Klipper (the banner at the top offers it).</li>
                <li>Then unplug the board and take it off the head.</li>
              </ol>
              <p class="row"><RsButton variant="primary" :disabled="removing" @click="removeAccelerometer">Remove it from the config</RsButton><span class="plain muted">Still have another head to measure? Leave it: mount the board on that head and run the wizard again.</span></p>
              <p v-if="removeError" class="tm-err">{{ removeError }}</p>
            </div>
            <p v-if="removed" class="tm-ok">Removed from the config. Restart Klipper (the banner above), then unplug the board. The picks you kept are still there.</p>
            <WhatThisDoes><p>Keep writes this into <code>myrhino/tuned.cfg</code>:</p><pre class="dump">{{ shaperLines({ type: fitOf('x')!.name, freq: fitOf('x')!.freq }, { type: fitOf('y')!.name, freq: fitOf('y')!.freq }).join('\n') }}</pre></WhatThisDoes>
          </template>
          <p v-else class="plain muted">Choose a shaper for each axis first (step 4).</p>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="!!running || saving" @click="at--">Back</RsButton>
      <RsButton v-if="step === 'board'" variant="primary" @click="at = 1">Next</RsButton>
      <RsButton v-if="step === 'test'" variant="primary" :disabled="!queryNote?.ok" @click="at = 2">Next</RsButton>
      <RsButton v-if="step === 'measure'" variant="primary" :disabled="!have || !!running" @click="at = 3">Next</RsButton>
      <RsButton v-if="step === 'pick'" variant="primary" :disabled="!have || !picks.x || !picks.y" @click="at = 4">Next</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.muted { color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-code); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); margin: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--rs-space-3); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.checks li { display: flex; align-items: baseline; gap: var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.checks li > :first-child { flex: none; }
.detail { font-size: var(--rs-text-sm); color: var(--rs-text-muted); font-weight: normal; }
.checks .detail { display: block; }
.axis { display: flex; flex-direction: column; gap: 6px; padding: var(--rs-space-3); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); }
.chart { width: 100%; max-width: 560px; height: auto; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm, 4px); background: var(--rs-surface-sunken, transparent); }
.chart path { fill: none; stroke-width: 1.5; }
.chart .psd { stroke: var(--rs-text-strong); }
.chart .shp { stroke: var(--rs-text-muted); stroke-dasharray: 4 3; }
.pick { display: flex; flex-direction: column; gap: 4px; }
.opt { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); cursor: pointer; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.opt.on { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.opt input { margin-top: 3px; accent-color: var(--rs-text-strong); }
.dump { margin: 8px 0; padding: 8px; font: 12px/1.4 var(--rs-font-code); background: var(--rs-surface-sunken, transparent); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-sm, 4px); white-space: pre-wrap; overflow-wrap: anywhere; }
.warnbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); margin: 0; padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-danger, #b3261e); border-radius: var(--rs-radius-md); background: var(--rs-surface); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.done { display: flex; flex-direction: column; gap: 8px; padding: var(--rs-space-3); border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); }
.steps { margin: 0; padding-left: 1.3em; }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
