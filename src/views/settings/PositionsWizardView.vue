<script setup lang="ts">
/**
 * Settings / Park and positions: jog the head to a spot, press Use this spot, see the exact lines (edit them if you
 * like), try the move slowly, then keep it. The Portal never writes myrhino/positions.cfg (it is your own file), so
 * Studio saves it through Moonraker like the Config editor: a copy goes to config/studio_backups first, and ONLY the
 * `variable_*` lines for the numbers you changed are touched. Keeping it restarts Klipper (never during a job).
 * Design: Tool Manager docs/proposal-park-wizard.md, docs/wizard-rules.md. Logic: src/positions/positions.ts.
 */
import '@/toolmgr/forms.css'
import './settings.css'
import { computed, onMounted, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import StatusChip from '@/components/StatusChip.vue'
import MascotRow from '@/components/MascotRow.vue'
import WizardSteps from '@/components/WizardSteps.vue'
import WhatThisDoes from '@/components/WhatThisDoes.vue'
import EditableText from '@/components/EditableText.vue'
import MotionPanel from '@/control/MotionPanel.vue'
import { POSITIONS_STEP_POSE } from '@/brand/mascot'
import { useMachineStore } from '@/stores/machine'
import { useControlStore } from '@/stores/control'
import { fetchWithin } from '@/net/fetchWithin'
import { backupConfigFile } from '@/files/configBackup'
import { GROUPS, changedLines, fmt, limitProblems, parseEdited, parsePositions, replaceVariables, sentence, testScript, type Group, type GroupId, type Limits } from '@/positions/positions'

const STEPS = [
  { id: 'now', label: 'What is there', help: 'Your positions today' },
  { id: 'pick', label: 'Pick one', help: 'Park, swap, height…' },
  { id: 'jog', label: 'Jog there', help: 'Then Use this spot' },
  { id: 'review', label: 'Review', help: 'The lines, editable' },
  { id: 'try', label: 'Try and keep', help: 'Slowly, then save' },
] as const
type StepId = (typeof STEPS)[number]['id']
const PATH = 'config/myrhino/positions.cfg'

const machine = useMachineStore()
const control = useControlStore()
const at = ref(0)
const step = computed<StepId>(() => STEPS[at.value]!.id)

const text = ref<string | null>(null)
const readError = ref<string | null>(null)
const before = computed(() => (text.value ? parsePositions(text.value) : {}))
const limits = computed<Limits | null>(() => {
  const l = machine.limits
  return l.min && l.max ? { min: l.min as Limits['min'], max: l.max as Limits['max'] } : null
})

async function read() {
  const url = machine.rootUrl('config', 'myrhino/positions.cfg')
  if (!url) return void (readError.value = 'Studio isn\'t connected to Moonraker, so the file can\'t be read.')
  try {
    const r = await fetchWithin(url, { cache: 'no-store' }, 10_000)
    if (r.status === 404) return void (readError.value = 'myrhino/positions.cfg isn\'t in your config folder. Install the Tool Manager release again (rhino.sh option 3): it puts the file in place and never overwrites one you have.')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    text.value = await r.text()
    readError.value = null
  } catch (e) {
    readError.value = `Couldn't read positions.cfg: ${(e as Error).message}`
  }
}
onMounted(read)

const tooMany = computed(() => ALL_PRESENT.value.length < 9)
const ALL_PRESENT = computed(() => Object.keys(before.value))
const nowProblems = computed(() => limitProblems(before.value, limits.value))

// ---- pick and jog
const group = ref<Group | null>(null)
const chosen = ref<Record<string, number>>({})
const stats = computed(() => machine.position.xyz)
const homed = computed(() => machine.position.homed.toLowerCase())
function pick(g: Group) {
  group.value = g
  chosen.value = {}
  at.value = 2
}
function useSpot() {
  const g = group.value
  const p = stats.value
  if (!g || !p) return
  const c: Record<string, number> = { ...chosen.value }
  if (g.id === 'park') Object.assign(c, { park_x: p[0]!, park_y: p[1]! })
  else if (g.id === 'swap') Object.assign(c, { swap_x: p[0]!, swap_y: p[1]! })
  else if (g.id === 'safe_z') c.safe_z = p[2]!
  else if (g.id === 'zero_max_z') c.zero_max_z = p[2]!
  else if (g.id === 'prime') Object.assign(c, { prime_x: p[0]!, prime_y: p[1]!, prime_length: before.value.prime_length ?? 120 })
  chosen.value = c
}
function useEnd() {
  const p = stats.value
  const y0 = chosen.value.prime_y ?? before.value.prime_y
  if (!p || y0 == null) return
  chosen.value = { ...chosen.value, prime_y: y0, prime_length: Math.round((p[1]! - y0) * 100) / 100 }
}
const canUse = computed(() => {
  const g = group.value
  if (!g || !stats.value) return false
  return g.jog === 'z' ? homed.value.includes('z') : homed.value.includes('x') && homed.value.includes('y')
})
const have = computed(() => !!group.value && group.value.vars.every((v) => v in chosen.value))

// ---- review
const generated = computed(() => changedLines(chosen.value))
const edited = ref('')
const editedTouched = ref(false)
const shown = computed({
  get: () => (editedTouched.value ? edited.value : generated.value),
  set: (v: string) => {
    edited.value = v
    editedTouched.value = true
  },
})
const parsed = computed(() => parseEdited(shown.value))
const problems = computed(() => {
  if (parsed.value.problem) return [parsed.value.problem]
  const v = parsed.value.values
  const own = group.value?.vars ?? []
  const out = limitProblems(v, limits.value)
  if (!Object.keys(v).length) out.push('Nothing to change.')
  const strays = Object.keys(v).filter((k) => !own.includes(k))
  if (strays.length) out.push(`These belong to another position: ${strays.join(', ')}. Run the wizard again for them.`)
  return out
})
const problemText = computed(() => problems.value.join(' ') || null)
const newText = computed(() => (text.value && !problems.value.length ? replaceVariables(text.value, parsed.value.values) : null))
const missingText = computed(() => (newText.value?.missing.length ? `positions.cfg has no variable_${newText.value.missing.join(', variable_')} line to change, so nothing can be saved. Install the release again to restore the file's own lines.` : null))
const sentenceText = computed(() => (group.value && !problems.value.length ? sentence(group.value.id as GroupId, before.value, { ...before.value, ...parsed.value.values }) : ''))
function toReview() {
  editedTouched.value = false
  at.value = 3
}

// ---- try and keep
const working = ref<'test' | 'keep' | null>(null)
const msg = ref<string | null>(null)
const err = ref<string | null>(null)
const kept = ref(false)
const jobBlock = computed(() => (control.jobActive ? 'A job is running. Nothing is moved or saved until it is finished.' : !machine.klippyReady ? 'Klipper isn\'t ready.' : null))
const testable = computed(() => group.value?.id === 'park' || group.value?.id === 'swap')

async function tryIt() {
  const g = group.value
  if (!g || !testable.value || problems.value.length) return
  working.value = 'test'
  err.value = null
  msg.value = null
  try {
    const ok = await control.send(testScript(g.id as 'park' | 'swap', parsed.value.values), {
      label: `Test the ${g.label.toLowerCase()} spot`,
      confirmTitle: `Try the ${g.label.toLowerCase()} spot?`,
      confirmBody: `The head lifts the bed 10 mm, then moves slowly to X${fmt(parsed.value.values[`${g.id}_x`]!)} Y${fmt(parsed.value.values[`${g.id}_y`]!)}. Clear the bed, keep a hand near Stop. The new numbers last only until Klipper restarts.`,
      confirmLabel: 'Move there slowly',
    })
    msg.value = ok ? 'It moved there. If that is where you want the head to wait, keep it below.' : null
  } finally {
    working.value = null
  }
}

async function keep() {
  const t = newText.value
  if (!t || t.missing.length || jobBlock.value) return
  working.value = 'keep'
  err.value = null
  try {
    const copy = await backupConfigFile(machine, PATH)
    await machine.uploadTo('config', 'myrhino', new Blob([t.text], { type: 'text/plain' }), 'positions.cfg')
    text.value = t.text
    msg.value = copy ? `Saved. The file as it was is in ${copy.replace(/^config\//, '')}.` : 'Saved.'
    kept.value = true
    await control.send('FIRMWARE_RESTART', {
      label: 'Restart Klipper (new positions)',
      confirmTitle: 'Restart Klipper to use the new positions?',
      confirmBody: 'Heaters go off and the axes need homing again. positions.cfg is read when Klipper starts.',
      confirmLabel: 'Restart Klipper',
    })
  } catch (e) {
    err.value = `Not saved: ${(e as Error).message}`
  } finally {
    working.value = null
  }
}
function another() {
  group.value = null
  chosen.value = {}
  editedTouched.value = false
  kept.value = false
  msg.value = null
  at.value = 1
}
const back = () => (at.value = Math.max(0, at.value - 1))
</script>

<template>
  <div class="set-page">
    <WizardSteps :steps="[...STEPS]" :at="at" @go="at = $event" />

    <RsPanel :title="`${String(at + 1).padStart(2, '0')} · ${STEPS[at]!.label}`" panel-id="positions.step">
      <MascotRow :pose="POSITIONS_STEP_POSE[step]">
        <!-- ===== 1 Now ===== -->
        <template v-if="step === 'now'">
          <p class="q">Where does the head go today?</p>
          <p v-if="readError" class="tm-err" role="alert">{{ readError }}</p>
          <table v-else-if="text" class="tbl">
            <tbody>
              <tr v-for="g in GROUPS" :key="g.id">
                <th>{{ g.label }}</th>
                <td class="mono">{{ g.vars.map((v) => (v in before ? fmt(before[v]!) : '?')).join('  ·  ') }}</td>
                <td class="muted">{{ g.what }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="text" class="row">
            <StatusChip :tone="nowProblems.length || tooMany ? 'warn' : 'ok'">{{ nowProblems.length || tooMany ? 'Look' : 'Good' }}</StatusChip>
            <span class="plain">{{ nowProblems.length ? nowProblems.join(' ') : tooMany ? 'positions.cfg is missing some of its position lines.' : 'All positions are inside the travel limits.' }}</span>
          </p>
          <WhatThisDoes>
            <p>Read from <span class="mono">myrhino/positions.cfg</span> (the <span class="mono">variable_*</span> lines of <span class="mono">RHINO_POSITIONS</span>), and the travel limits from Klipper. In the console, <span class="mono">RHINO_POSITIONS</span> lists them and checks them the same way.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 2 Pick ===== -->
        <template v-if="step === 'pick'">
          <p class="q">Which position do you want to set?</p>
          <div class="tiles">
            <button v-for="g in GROUPS" :key="g.id" type="button" class="tile" @click="pick(g)">
              <span class="tl">{{ g.label }}</span>
              <span class="td">{{ g.what }}</span>
            </button>
          </div>
          <p class="plain">One at a time, so you never have to hold five jogs in your head.</p>
        </template>

        <!-- ===== 3 Jog ===== -->
        <template v-if="step === 'jog'">
          <p class="q">Jog the head to the {{ group?.label.toLowerCase() }} {{ group?.jog === 'z' ? 'height' : 'spot' }}.</p>
          <p class="plain">
            <template v-if="group?.jog === 'z'">Move the bed to the height, with the <b>lowest</b> toolhead mounted if it is the safe height. Bigger Z is the bed lower, further from the tool.</template>
            <template v-else>Small steps near the frame. Keep it clear of the frame, the clamps and the Z axis. Studio won't take a spot outside the travel limits.</template>
          </p>
          <MotionPanel />
          <p class="row">
            <span class="plain">Head now: <b class="mono">X{{ stats ? fmt(stats[0]!) : '—' }} Y{{ stats ? fmt(stats[1]!) : '—' }} Z{{ stats ? fmt(stats[2]!) : '—' }}</b></span>
          </p>
          <p class="row">
            <RsButton variant="primary" :disabled="!canUse" @click="useSpot">Use this spot</RsButton>
            <RsButton v-if="group?.id === 'prime'" :disabled="!canUse || !('prime_y' in chosen)" @click="useEnd">Use as the end of the line</RsButton>
            <span v-if="!canUse" class="tm-hint">Home the machine first (Control).</span>
          </p>
          <p v-if="have" class="tm-ok">Picked: <span class="mono">{{ changedLines(chosen).replace(/\n/g, '   ') }}</span></p>
          <WhatThisDoes>
            <p>The jog is the Control screen's own (padlock, small steps, refused during a job). "Use this spot" reads the head's position from Klipper and writes nothing.</p>
          </WhatThisDoes>
        </template>

        <!-- ===== 4 Review ===== -->
        <template v-if="step === 'review'">
          <p class="q">Here are the lines that will change.</p>
          <p v-if="sentenceText" class="plain"><b>{{ sentenceText }}</b></p>
          <EditableText v-model="shown" :generated="generated" :problem="problemText ?? missingText" label="Lines in myrhino/positions.cfg" :rows="5" />
          <p class="tm-hint">Only these lines are changed. Every comment and every other line stays exactly as it is.</p>
          <WhatThisDoes>
            <p>Studio copies <span class="mono">positions.cfg</span> into <span class="mono">config/studio_backups</span> (the newest ten copies are kept), then writes the file back with only those <span class="mono">variable_*</span> numbers replaced. Klipper reads it at the next restart. The Portal never writes this file.</p>
            <pre>{{ shown }}</pre>
          </WhatThisDoes>
        </template>

        <!-- ===== 5 Try and keep ===== -->
        <template v-if="step === 'try'">
          <p class="q">Try it slowly, then keep it.</p>
          <p v-if="jobBlock" class="tm-warn">{{ jobBlock }}</p>
          <template v-if="testable">
            <p class="plain">The test sets the new numbers <b>live</b> (they last until Klipper restarts), lifts the bed 10 mm and moves the head there at a slow speed. Clear the bed and keep a hand near Stop.</p>
            <p class="row"><RsButton :disabled="!!jobBlock || !!problemText || working !== null" @click="tryIt">{{ working === 'test' ? 'Moving…' : 'Move there slowly' }}</RsButton></p>
          </template>
          <p v-else class="plain">There is no test move for this one: it changes what later moves do, not where the head goes now. Check it with the Health check or a short job after you keep it.</p>
          <p class="row">
            <RsButton variant="primary" :disabled="!!jobBlock || !!problemText || !!missingText || working !== null || kept" @click="keep">{{ working === 'keep' ? 'Saving…' : 'Keep it and restart Klipper' }}</RsButton>
            <span class="tm-hint">Saves positions.cfg, then restarts Klipper so it reads it. Heaters go off and the axes need homing.</span>
          </p>
          <p v-if="msg" class="tm-ok">{{ msg }}</p>
          <p v-if="err" class="tm-err" role="alert">{{ err }}</p>
          <p v-if="kept" class="row"><StatusChip tone="ok">Good</StatusChip><span class="plain">Kept. Home the machine after the restart, then run <span class="mono">RHINO_POSITIONS</span> in the console to see the new numbers.</span> <RsButton @click="another">Set another</RsButton></p>
          <WhatThisDoes>
            <p>Test: <span class="mono">SET_GCODE_VARIABLE</span> for the two numbers, <span class="mono">SAVE_GCODE_STATE</span>, a 10 mm lift, a slow move (<span class="mono">F2400</span>), <span class="mono">RESTORE_GCODE_STATE</span>. The console asks before it runs.</p>
            <pre>{{ testable && !problemText && group ? testScript(group.id as 'park' | 'swap', parsed.values) : '(no test move for this position)' }}</pre>
            <p>Keep: copy to <span class="mono">studio_backups</span>, upload the changed file through Moonraker, <span class="mono">FIRMWARE_RESTART</span>. To go back, copy the file from <span class="mono">config/studio_backups</span> over <span class="mono">myrhino/positions.cfg</span> in Files &gt; Config and restart.</p>
          </WhatThisDoes>
        </template>
      </MascotRow>
    </RsPanel>

    <footer class="bar">
      <RsButton v-if="at > 0" :disabled="working !== null" @click="back">Back</RsButton>
      <RsButton v-if="step === 'now'" variant="primary" :disabled="!text" @click="at = 1">Next</RsButton>
      <RsButton v-if="step === 'jog'" variant="primary" :disabled="!have" @click="toReview">Next</RsButton>
      <RsButton v-if="step === 'review'" variant="primary" :disabled="!!problemText || !!missingText" @click="at = 4">Next</RsButton>
      <span class="tm-hint">Step {{ at + 1 }} of {{ STEPS.length }}</span>
    </footer>
  </div>
</template>

<style scoped>
.q { margin: 0; font-size: var(--rs-text-lg, 18px); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.plain { margin: 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); line-height: 1.5; }
.mono { font-family: var(--rs-font-code); overflow-wrap: anywhere; }
.muted { color: var(--rs-text-muted); }
.tbl { width: 100%; border-collapse: collapse; font-size: var(--rs-text-sm); }
.tbl th { text-align: left; padding: 6px 12px 6px 0; font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); white-space: nowrap; vertical-align: top; }
.tbl td { padding: 6px 12px 6px 0; vertical-align: top; }
.tbl tr { border-bottom: 1px solid var(--rs-line); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px; }
.tile { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; text-align: left; cursor: pointer; min-height: 44px; }
.tile:hover { border-color: var(--rs-line-strong); }
.tl { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); }
.td { font-size: 12px; color: var(--rs-text-muted); }
.bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-3); padding: var(--rs-space-3) var(--rs-space-4); border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg); background: var(--rs-surface); }
@media (max-width: 720px) { .bar { bottom: 84px; } .bar .tm-hint { display: none; } }
</style>
