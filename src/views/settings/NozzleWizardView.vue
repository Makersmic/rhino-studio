<script setup lang="ts">
/**
 * Settings / Nozzle cleaning: a wizard for a wipe brush. It measures: jog the nozzle to each end of the bristles and
 * press Use this spot, so any brush works. It writes G-code (shown, editable, with Reset), lets you try it cold and slowly,
 * then saves it as a Studio macro and, if you choose, attaches it to one print head's start G-code (job hooks, slot
 * "after start": after the heat-up, the mesh and the prime line, before the file runs). Only the Studio macro and the job
 * hooks are written, both through the Portal's own checks. Nothing here changes Klipper's own macros.
 * Design: Tool Manager docs/proposal-nozzle-wipe-wizard.md, docs/wizard-rules.md. Logic: src/wipe/wipe.ts.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import EditableText from '@/components/EditableText.vue'
import MotionPanel from '@/control/MotionPanel.vue'
import RestartBanner from '@/toolmgr/RestartBanner.vue'
import { WIPE_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { useMaintenanceStore } from '@/stores/maintenance'
import { LEVEL_TONE, LEVEL_WORD } from '@/system/healthCheck'
import { copyMacroTo, setSlot, type Hooks, type HookSources } from '@/hardware/hooks'
import type { MacroDraft } from '@/control/userMacros'
import { LIMITS_HELP, attachPlan, defaults, linesOf, problemOf, sentence, setupProblems, slowed, wipeLines, type Limits, type Mount, type Spot } from '@/wipe/wipe'

const STEPS = [
  { id: 'check', label: 'Check', help: 'A print head, homed' },
  { id: 'start', label: 'Start of the bristles', help: 'Jog, Use this spot' },
  { id: 'end', label: 'End of the bristles', help: 'Jog, Use this spot' },
  { id: 'how', label: 'How hard', help: 'Passes and speed' },
  { id: 'review', label: 'Review', help: 'The G-code, editable' },
  { id: 'try', label: 'Try it', help: 'Cold and slow' },
  { id: 'save', label: 'Save', help: 'Macro and start G-code' },
] as const
type StepId = (typeof STEPS)[number]['id']

const machine = useMachineStore()
const control = useControlStore()
const maint = useMaintenanceStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)
const setup = ref(defaults())
const limits = computed<Limits | null>(() => {
  const l = machine.limits
  return l.min && l.max ? { min: l.min, max: l.max } : null
})

// ---- 1 check
const head = computed(() => machine.mountedName)
const homed = computed(() => machine.position.homed.toLowerCase())
const checks = computed(() => {
  const out: { level: 'PASS' | 'FAIL'; what: string; detail?: string }[] = []
  out.push(machine.klippyReady ? { level: 'PASS', what: 'Klipper is ready' } : { level: 'FAIL', what: 'Klipper isn\'t ready', detail: 'Look in Control, or restart Klipper from Settings > Host.' })
  out.push(machine.toolKind === 'print' ? { level: 'PASS', what: `${head.value} is mounted: a print head` } : { level: 'FAIL', what: machine.mountedVerified ? `${head.value} isn't a print head` : 'No toolhead is confirmed as mounted', detail: 'This wizard is for print heads. Mount one and confirm it in Control, then come back.' })
  out.push(/x/.test(homed.value) && /y/.test(homed.value) && /z/.test(homed.value) ? { level: 'PASS', what: 'The machine is homed' } : { level: 'FAIL', what: 'The machine isn\'t homed', detail: 'Home all in Control first.' })
  out.push(control.jobActive ? { level: 'FAIL', what: 'A job is running', detail: 'Nothing moves until it is finished.' } : { level: 'PASS', what: 'No job is running' })
  return out
})
const ready = computed(() => checks.value.every((c) => c.level === 'PASS'))

// ---- 2, 3 spots
const pos = computed(() => machine.position.xyz)
const canUse = computed(() => !!pos.value && ready.value)
const here = (): Spot | null => (pos.value ? { x: Math.round(pos.value[0]! * 100) / 100, y: Math.round(pos.value[1]! * 100) / 100, z: Math.round(pos.value[2]! * 100) / 100 } : null)
function useStart() {
  const p = here()
  if (p) setup.value = { ...setup.value, start: p }
}
function useEnd() {
  const p = here()
  if (p) setup.value = { ...setup.value, end: p }
}
const mounts: { id: Mount; label: string; help: string }[] = [
  { id: 'bed', label: 'On the bed', help: 'The bed\'s height decides how hard the bristles touch the nozzle. Jog Z until the nozzle just touches.' },
  { id: 'frame', label: 'On the frame', help: 'The brush is fixed; the bed only needs to be lowered clear. Jog X and Y only, at the height the nozzle meets the bristles.' },
]

// ---- 4 how
const problems = computed(() => setupProblems(setup.value, limits.value))

// ---- 5 review
const generated = computed(() => wipeLines(setup.value).join('\n'))
const edited = ref('')
const touched = ref(false)
const text = computed({
  get: () => (touched.value ? edited.value : generated.value),
  set: (v: string) => {
    edited.value = v
    touched.value = true
  },
})
function toReview() {
  touched.value = false
  at.value = 4
}
const textProblem = computed(() => problemOf(text.value, limits.value))

// ---- 6 try
const cold = computed(() => (machine.hotend.temp ?? 0) < 60 && (machine.hotend.target ?? 0) === 0)
const tryBlock = computed(() => (control.jobActive ? 'A job is running.' : !machine.klippyReady ? 'Klipper isn\'t ready.' : !cold.value ? 'The hotend isn\'t cold. These test runs are cold on purpose: let it cool, or turn the heater off.' : textProblem.value))
const ran = ref<'slow' | 'full' | null>(null)
const running = ref(false)
const skipTest = ref(false)
async function run(slow: boolean) {
  running.value = true
  try {
    const script = slow ? slowed(text.value) : text.value
    const ok = await control.send(script, {
      label: slow ? 'Nozzle cleaning, slow and cold' : 'Nozzle cleaning, cold',
      confirmTitle: slow ? 'Run the nozzle cleaning slowly?' : 'Run the nozzle cleaning at full speed, cold?',
      confirmBody: `The bed lowers, the head goes over the brush and wipes ${setup.value.passes} times${slow ? ' at about a fifth of the speed' : ''}. The nozzle is cold. Keep a hand near Stop and watch that it touches the bristles and clears everything.`,
      confirmLabel: slow ? 'Run it slowly' : 'Run it',
    })
    if (ok && (slow || ran.value !== 'full')) ran.value = slow && ran.value === 'full' ? 'full' : slow ? 'slow' : 'full'
  } finally {
    running.value = false
  }
}

// ---- 7 save
const macroName = computed(() => `Clean nozzle (${head.value ?? 'print head'})`)
const attach = ref<'none' | 'add' | 'replace'>('add')
const hooks = ref<{ rev: number; hooks: Hooks; sources: HookSources } | null>(null)
const hooksError = ref<string | null>(null)
const macroId = ref<string | null>(null)
const saving = ref(false)
const done = ref<string | null>(null)
const saveError = ref<string | null>(null)
async function loadHooks() {
  const p = maint.portal()
  if (!p) return void (hooksError.value = 'The Rhino Portal isn\'t connected, so the macro and the start G-code can\'t be saved from here.')
  try {
    const s = await p.hooksState()
    hooks.value = { rev: s.rev, hooks: s.hooks, sources: s.sources ?? {} }
    hooksError.value = null
  } catch (e) {
    hooksError.value = (e as Error).message
  }
}
const scope = computed(() => (head.value ? `tool:${head.value}` : null))
const existing = computed(() => (scope.value ? hooks.value?.hooks[scope.value]?.after_start ?? [] : []))
const plan = computed(() => attachPlan(existing.value, linesOf(text.value), attach.value === 'replace' ? 'replace' : 'add'))
const saveBlock = computed(() => textProblem.value || (attach.value !== 'none' && plan.value.problem) || (!ran.value && !skipTest.value ? 'Try it first (cold and slowly), or tick that you are saving without a test.' : null))
function goSave() {
  at.value = 6
  void loadHooks()
}
async function save() {
  const p = maint.portal()
  const tool = head.value
  if (!p || !tool || saveBlock.value) return
  saving.value = true
  saveError.value = null
  done.value = null
  try {
    const draft: MacroDraft = { name: macroName.value, toolheads: [tool], notes: `Made by the Nozzle cleaning wizard. Wipes ${setup.value.passes} times along the brush, in machine coordinates.`, steps: linesOf(text.value).map((line) => ({ kind: 'gcode' as const, line })) }
    const list = await p.userMacros()
    const old = list?.macros.find((m) => m.name === draft.name)
    const m = old ? await p.saveMacro(old.id, draft, old.rev) : await p.createMacro(draft)
    macroId.value = m.id
    let msg = `The macro "${m.name}" is saved: run it from Control > Macros.`
    if (attach.value !== 'none' && hooks.value) {
      let next: { hooks: Hooks; sources: HookSources } | { error: string }
      if (attach.value === 'replace') next = copyMacroTo(hooks.value.hooks, hooks.value.sources, tool, 'after_start', m)
      else next = { hooks: setSlot(hooks.value.hooks, `tool:${tool}`, 'after_start', plan.value.next), sources: hooks.value.sources }
      if ('error' in next) throw new Error(next.error)
      await p.saveHooks({ rev: hooks.value.rev, hooks: next.hooks, sources: next.sources })
      await loadHooks()
      msg += ` It is now in ${tool}'s start G-code (after the heat-up, the mesh and the prime line, before the file). It goes live after the next Klipper restart.`
    }
    done.value = msg
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />
    <RestartBanner />

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="wipe.step">
      <MascotRow :pose="WIPE_STEP_POSE[step]">
        <!-- ===== 1 Check ===== -->
        <template v-if="step === 'check'">
          <p class="q">Ready to measure the brush?</p>
          <ul class="list checks">
            <li v-for="(c, i) in checks" :key="i"><StatusChip :tone="LEVEL_TONE[c.level]">{{ LEVEL_WORD[c.level] }}</StatusChip><span>{{ c.what }}<span v-if="c.detail" class="detail">{{ c.detail }}</span></span></li>
          </ul>
          <p class="plain">The wipe is measured for one print head: tool lengths differ, so a spot measured with one head isn't right for another. Run it again for each head that has a brush.</p>
          <fieldset class="mounts">
            <legend class="tm-lbl">Where is the brush?</legend>
            <label v-for="m in mounts" :key="m.id" class="mount" :class="{ on: setup.mount === m.id }">
              <input v-model="setup.mount" type="radio" name="mount" :value="m.id"><span><b>{{ m.label }}</b><span class="detail">{{ m.help }}</span></span>
            </label>
          </fieldset>
          <WhatThisDoes>
            <p>Nothing moves in this step. The wizard needs a print head mounted and the machine homed, because it records where the nozzle is, in machine coordinates, and tests the move later. It never sets a temperature.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 2 Start ===== -->
        <template v-if="step === 'start'">
          <p class="q">Jog the nozzle to the <b>start</b> of the bristles.</p>
          <p class="plain">{{ setup.mount === 'bed' ? 'At the height you want it to touch: just in contact, not pressing hard.' : 'At the height where the nozzle meets the bristles.' }} Small steps. Keep clear of the frame and the part.</p>
          <MotionPanel />
          <p class="row"><RsButton variant="primary" :disabled="!canUse" @click="useStart">Use this spot</RsButton><span class="plain">Head now: <b class="mono">X{{ pos ? pos[0]!.toFixed(1) : '—' }} Y{{ pos ? pos[1]!.toFixed(1) : '—' }} Z{{ pos ? pos[2]!.toFixed(1) : '—' }}</b></span></p>
          <p v-if="setup.start" class="tm-ok">Start: <span class="mono">X{{ setup.start.x }} Y{{ setup.start.y }} Z{{ setup.start.z }}</span></p>
          <WhatThisDoes><p>"Use this spot" reads the head's position from Klipper (machine coordinates) and writes nothing.</p></WhatThisDoes>
        </template>

        <!-- ===== 3 End ===== -->
        <template v-if="step === 'end'">
          <p class="q">Now the <b>end</b> of the bristles.</p>
          <p class="plain">Jog along the brush to its other end, at the same contact height. The wipe goes back and forth between the two spots.</p>
          <MotionPanel />
          <p class="row"><RsButton variant="primary" :disabled="!canUse" @click="useEnd">Use this spot</RsButton><span class="plain">Head now: <b class="mono">X{{ pos ? pos[0]!.toFixed(1) : '—' }} Y{{ pos ? pos[1]!.toFixed(1) : '—' }} Z{{ pos ? pos[2]!.toFixed(1) : '—' }}</b></span></p>
          <p v-if="setup.end" class="tm-ok">End: <span class="mono">X{{ setup.end.x }} Y{{ setup.end.y }} Z{{ setup.end.z }}</span></p>
        </template>

        <!-- ===== 4 How ===== -->
        <template v-if="step === 'how'">
          <p class="q">How should it wipe?</p>
          <div class="tm-row">
            <div class="tm-fld"><label for="np">Passes</label><input id="np" v-model.number="setup.passes" class="tm-in" type="number" :min="LIMITS_HELP.passes[0]" :max="LIMITS_HELP.passes[1]" step="1"><span class="tm-hint">One pass is one trip along the brush. Three is usual.</span></div>
            <div class="tm-fld"><label for="ws">Wipe speed (mm/s)</label><input id="ws" v-model.number="setup.wipeSpeed" class="tm-in" type="number" step="5"><span class="tm-hint">Along the bristles.</span></div>
            <div class="tm-fld"><label for="ts">Travel speed (mm/s)</label><input id="ts" v-model.number="setup.travelSpeed" class="tm-in" type="number" step="5"><span class="tm-hint">Over to the brush.</span></div>
            <div class="tm-fld"><label for="zs">Up and down (mm/s)</label><input id="zs" v-model.number="setup.zSpeed" class="tm-in" type="number" step="1"><span class="tm-hint">Bed up and down.</span></div>
            <div class="tm-fld"><label for="cl">Clearance (mm)</label><input id="cl" v-model.number="setup.clear" class="tm-in" type="number" step="1"><span class="tm-hint">The bed lowers this far to clear the brush and the part.</span></div>
          </div>
          <p v-if="problems.length" class="tm-err" role="alert">{{ problems.join(' ') }}</p>
          <p class="plain">Check the brush's temperature rating against your nozzle temperature: the wizard doesn't know what the brush is made of, and it never sets a temperature itself. The wipe happens at the temperature the job start has reached.</p>
        </template>

        <!-- ===== 5 Review ===== -->
        <template v-if="step === 'review'">
          <p class="q">This is the G-code that will run.</p>
          <p class="plain"><b>{{ sentence(setup) }}</b></p>
          <EditableText v-model="text" :generated="generated" :problem="textProblem" label="G-code (machine coordinates)" :rows="12" />
          <WhatThisDoes>
            <p><span class="mono">SET_GCODE_OFFSET X=0 Y=0 Z=0</span> puts the nozzle-height and work offsets aside so the numbers are machine positions; <span class="mono">RESTORE_GCODE_STATE</span> puts every offset back. Bigger Z is the bed lower, so "clear" lowers the bed.</p>
            <p>Edits are checked here and again by the Portal when they are attached to the job hooks: no internal macros, none of the never-from-a-button commands (<span class="mono">M112</span>, <span class="mono">SAVE_CONFIG</span>, restarts, <span class="mono">FORCE_MOVE</span>…), absolute moves inside the travel limits, at most 20 lines.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 6 Try ===== -->
        <template v-if="step === 'try'">
          <p class="q">Try it cold, and slowly first.</p>
          <p v-if="tryBlock" class="tm-warn">{{ tryBlock }}</p>
          <p class="plain">Keep a hand near Stop. Watch that the nozzle <b>touches the bristles</b> (it wipes along them) and <b>clears everything</b> (the part, the frame, the clamps). The nozzle must be cold.</p>
          <p class="row">
            <RsButton :disabled="!!tryBlock || running" @click="run(true)">{{ running ? 'Running…' : 'Run it slowly (20%)' }}</RsButton>
            <RsButton :disabled="!!tryBlock || running || !ran" @click="run(false)">Run it at full speed (cold)</RsButton>
          </p>
          <p v-if="ran" class="tm-ok">Done: {{ ran === 'full' ? 'ran at full speed, cold' : 'ran slowly, cold' }}. If it touched the bristles and cleared everything, go on. Otherwise go back and measure again.</p>
          <WhatThisDoes>
            <p>The slow run is the same lines with every feed rate cut to 20% (never below 5 mm/s). The console shows the lines and asks before it runs.</p>
            <pre>{{ slowed(text) }}</pre>
          </WhatThisDoes>
        </template>

        <!-- ===== 7 Save ===== -->
        <template v-if="step === 'save'">
          <p class="q">Save it, and say when it runs.</p>
          <p class="plain">The wizard saves a macro called <b>{{ macroName }}</b> (run it any time from Control &gt; Macros). Then choose whether it runs by itself at the start of {{ head ?? 'this print head' }}'s jobs.</p>
          <p v-if="hooksError" class="tm-warn">{{ hooksError }}</p>
          <fieldset class="mounts">
            <legend class="tm-lbl">At the start of every {{ head }} job</legend>
            <label class="mount" :class="{ on: attach === 'none' }"><input v-model="attach" type="radio" value="none"><span><b>Only when I press the button</b><span class="detail">Saves the macro; no job runs it by itself.</span></span></label>
            <label class="mount" :class="{ on: attach === 'add' }"><input v-model="attach" type="radio" value="add"><span><b>Add it after what is there</b><span class="detail">{{ existing.length ? `${head}'s start G-code has ${existing.length} line${existing.length === 1 ? '' : 's'} already; these go after them.` : `${head}'s start G-code is empty.` }}</span></span></label>
            <label class="mount" :class="{ on: attach === 'replace' }"><input v-model="attach" type="radio" value="replace"><span><b>Replace what is there</b><span class="detail">{{ existing.length ? `Removes the ${existing.length} existing line${existing.length === 1 ? '' : 's'}.` : 'Nothing to replace.' }} The start G-code then follows this macro: the editor tells you when it has changed.</span></span></label>
          </fieldset>
          <p v-if="attach !== 'none' && plan.problem" class="tm-err" role="alert">{{ plan.problem }}</p>
          <label v-if="!ran" class="chip"><input v-model="skipTest" type="checkbox"> I'm saving without trying it</label>
          <p class="row"><RsButton variant="primary" :disabled="!!saveBlock || saving || !!done" @click="save">{{ saving ? 'Saving…' : 'Save' }}</RsButton><span v-if="saveBlock" class="tm-hint">{{ saveBlock }}</span></p>
          <p v-if="done" class="row"><StatusChip tone="ok">Good</StatusChip><span class="plain">{{ done }}</span></p>
          <p v-if="saveError" class="tm-err" role="alert">{{ saveError }}</p>
          <WhatThisDoes>
            <p>The start G-code is the job hooks' <span class="mono">after_start</span> slot for <span class="mono">tool:{{ head }}</span>: it runs after the heat-up, the Z-tilt, the bed mesh and the prime line, and before the file starts, so the nozzle is hot. The Portal checks every line again and rewrites <span class="mono">job_hooks.cfg</span>; it is live after the next Klipper restart.</p>
            <pre>{{ plan.next.join('\n') }}</pre>
          </WhatThisDoes>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="running || saving" @click="at--">Back</RsButton>
      <RsButton v-if="step === 'check'" variant="primary" :disabled="!ready" @click="at = 1">Next</RsButton>
      <RsButton v-if="step === 'start'" variant="primary" :disabled="!setup.start" @click="at = 2">Next</RsButton>
      <RsButton v-if="step === 'end'" variant="primary" :disabled="!setup.end" @click="at = 3">Next</RsButton>
      <RsButton v-if="step === 'how'" variant="primary" :disabled="problems.length > 0" @click="toReview">Next</RsButton>
      <RsButton v-if="step === 'review'" variant="primary" :disabled="!!textProblem" @click="at = 5">Next</RsButton>
      <RsButton v-if="step === 'try'" variant="primary" :disabled="running" @click="goSave">Next</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.mono { font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.checks li { display: flex; align-items: baseline; gap: var(--rs-space-3); font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.checks li > :first-child { flex: none; }
.detail { display: block; font-size: var(--rs-text-sm); color: var(--rs-text-muted); font-weight: normal; }
.mounts { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.mount { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); cursor: pointer; color: var(--rs-text-strong); font-size: var(--rs-text-sm); }
.mount.on { border-color: var(--rs-ink); box-shadow: inset 0 0 0 1px var(--rs-ink); }
.mount input { margin-top: 3px; accent-color: var(--rs-text-strong); }
.chip { display: flex; align-items: flex-start; gap: 8px; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
