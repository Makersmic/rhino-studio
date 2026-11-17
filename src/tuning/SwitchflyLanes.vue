<script setup lang="ts">
/**
 * SwitchFly's Tune page › Lanes: power the path servo's UBEC, try an angle, save each lane's angle and retract.
 * Three steps, each with a small picture of what it sets. The logic lives in src/control/lanes.ts; the commands go
 * through control.sendLanes (only those four, SwitchFly mounted, no job). Power off needs no padlock; everything
 * else does. The angle controls wake up only while the UBEC has power. Klipper doesn't report a servo's angle, so
 * the arm shows the last angle sent, worked out from the signal pin.
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import PadLock from '@/components/PadLock.vue'
import { ANGLE, RETRACT, laneScript, lanesState, powerScript, testScript, type Lane } from '@/control/lanes'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'

const control = useControlStore()
const machine = useMachineStore()
onBeforeUnmount(control.lockLanes)

const st = computed(() => lanesState(machine.status))
const block = computed(() => control.lanesLockBlock)
const unlocked = computed(() => control.lanesUnlocked)
const powered = computed(() => st.value.powered === true)
/** the angle controls: unlocked and the UBEC has power */
const live = computed(() => unlocked.value && powered.value && !block.value)

// what is typed in each field (null = untouched, so the field follows the saved value)
const draft = reactive<{ angle: [string | null, string | null]; retract: [string | null, string | null] }>({ angle: [null, null], retract: [null, null] })
const text = (kind: 'angle' | 'retract', l: Lane) => draft[kind][l] ?? String(st.value[kind][l])
const value = (kind: 'angle' | 'retract', l: Lane): number | null => {
  const t = text(kind, l).trim()
  const n = t === '' ? NaN : Number(t)
  return Number.isFinite(n) ? n : null
}
const angleOk = (l: Lane) => { const v = value('angle', l); return v != null && v >= ANGLE.min && v <= ANGLE.max }
const retractOk = (l: Lane) => { const v = value('retract', l); return v != null && v >= RETRACT.min && v <= RETRACT.max }
const angleChanged = (l: Lane) => angleOk(l) && value('angle', l) !== st.value.angle[l]
const retractChanged = (l: Lane) => retractOk(l) && value('retract', l) !== st.value.retract[l]

const busy = ref(false)
const note = ref('')
async function run(b: { script: string } | { error: string }, label: string): Promise<boolean> {
  if ('error' in b) { note.value = b.error; return false }
  note.value = ''
  busy.value = true
  try { return await control.sendLanes(b.script, label) } finally { busy.value = false }
}
const togglePower = () => run(powerScript(!powered.value), powered.value ? 'Servo power off' : 'Servo power on')
const tryLane = (l: Lane) => run(testScript(value('angle', l) ?? NaN), `Try lane ${l + 1}`)
/** the lane the arm is sitting on, if it is on one */
const onLane = computed<Lane | null>(() => {
  const s = st.value.sent
  if (s == null || !powered.value) return null
  return ([0, 1] as Lane[]).find((l) => Math.abs(st.value.angle[l] - s) < 1.5) ?? null
})
const other = computed<Lane>(() => (onLane.value === 0 ? 1 : 0))
const switchLane = () => run(testScript(st.value.angle[other.value]), `Switch to lane ${other.value + 1}`)
async function save(l: Lane) {
  const ok = await run(laneScript(l, { angle: angleChanged(l) && powered.value ? value('angle', l) : null, retract: retractChanged(l) ? value('retract', l) : null }), `Save lane ${l + 1}`)
  if (!ok) return
  if (angleChanged(l) && powered.value) draft.angle[l] = null
  if (retractChanged(l)) draft.retract[l] = null
}
const canSave = (l: Lane) => unlocked.value && !block.value && !busy.value && ((angleChanged(l) && powered.value) || retractChanged(l))

function toggleLock() {
  if (unlocked.value) control.lockLanes()
  else control.unlockLanes()
}
const lockLabel = computed(() => (unlocked.value ? `Lock the lanes panel (${control.lanesSecondsLeft} s left)` : 'Unlock the lanes panel'))

// ---- the pictures ---------------------------------------------------------------------------------------
const CX = 110, CY = 108, R = 84
/** an angle on the dial: 0° at the left, 90° straight up, 180° at the right */
const at = (deg: number, r = R) => ({ x: CX - r * Math.cos((deg * Math.PI) / 180), y: CY - r * Math.sin((deg * Math.PI) / 180) })
const arm = computed(() => (st.value.sent == null ? null : at(st.value.sent, R - 8)))
const mark = (l: Lane) => (angleOk(l) ? at(value('angle', l)!, R) : null)
const ticks = [0, 30, 60, 90, 120, 150, 180]
const retractMm = (l: Lane) => (retractOk(l) ? value('retract', l)! : 0)
const status = computed(() =>
  block.value ? block.value
    : !unlocked.value ? 'Unlock to use'
      : !powered.value ? 'Step 1: turn the servo power on'
        : 'Step 2: try an angle for each lane')
</script>

<template>
  <RsPanel title="Lanes" panel-id="tune.lanes" :live="unlocked && !block" :status="status">
    <template #actions>
      <PadLock :open="unlocked" :disabled="!!block" :label="lockLabel" :text="unlocked ? `${control.lanesSecondsLeft} s` : undefined" @toggle="toggleLock" />
    </template>

    <p class="muted small intro">
      SwitchFly's servo picks which filament lane feeds the hotend. Set the angle where the selector sits right on each lane, and how far to pull
      the filament back before it moves away from a lane.
    </p>

    <!-- 1 · power -->
    <section class="step" aria-labelledby="ln-power">
      <div class="head">
        <h3 id="ln-power"><span class="n">1</span> Servo power</h3>
        <RsButton :variant="powered ? 'default' : 'primary'" size="sm" :disabled="busy || !!block || st.powered === null || (!powered && !unlocked)" @click="togglePower">
          {{ powered ? 'Turn power off' : 'Turn power on' }}
        </RsButton>
      </div>
      <div class="body">
        <svg class="pic power" :class="{ on: powered }" viewBox="0 0 250 62" role="img" :aria-label="powered ? 'The UBEC is powered and feeds the servo' : 'The UBEC is off, so the servo has no power'">
          <rect x="2" y="14" width="62" height="34" rx="6" class="box" />
          <text x="33" y="35" text-anchor="middle">24 V</text>
          <line x1="64" y1="31" x2="94" y2="31" class="wire" />
          <rect x="94" y="14" width="62" height="34" rx="6" class="box hot" />
          <text x="125" y="35" text-anchor="middle" class="hotText">UBEC</text>
          <line x1="156" y1="31" x2="184" y2="31" class="wire" />
          <rect x="184" y="14" width="62" height="34" rx="6" class="box hot" />
          <text x="215" y="35" text-anchor="middle" class="hotText">Servo</text>
          <text x="125" y="9" text-anchor="middle" class="cap">PA1 switches it</text>
        </svg>
        <p class="muted small">
          {{ powered ? 'The UBEC has power, so the servo holds a position.' : 'Off. A servo with no power does not hold its place.' }}
          A lane change, a job start and a tool swap turn it on by themselves; the end of a job, a cancel, a swap and the emergency stop turn it off.
        </p>
      </div>
    </section>

    <!-- 2 · angles -->
    <section class="step" :class="{ asleep: !live }" aria-labelledby="ln-angle">
      <div class="head">
        <h3 id="ln-angle"><span class="n">2</span> Lane angles</h3>
        <RsButton variant="primary" size="sm" :disabled="!live || busy || !angleOk(other)" @click="switchLane">Switch to lane {{ other + 1 }}</RsButton>
      </div>
      <div class="body two">
        <svg class="pic dial" viewBox="0 0 220 124" role="img" :aria-label="st.sent == null ? 'Servo dial, no angle sent yet' : `Servo dial, last angle sent ${st.sent} degrees`">
          <path :d="`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`" class="track" />
          <g v-for="t in ticks" :key="t">
            <line :x1="at(t, R - 5).x" :y1="at(t, R - 5).y" :x2="at(t, R + 4).x" :y2="at(t, R + 4).y" class="tick" />
          </g>
          <text :x="CX - R" :y="CY + 14" text-anchor="middle" class="cap">0°</text>
          <text :x="CX" :y="CY - R - 8" text-anchor="middle" class="cap">90°</text>
          <text :x="CX + R" :y="CY + 14" text-anchor="middle" class="cap">180°</text>
          <line v-if="arm" :x1="CX" :y1="CY" :x2="arm.x" :y2="arm.y" class="arm" :class="{ held: powered }" />
          <circle :cx="CX" :cy="CY" r="6" class="hub" />
          <g v-for="l in ([0, 1] as Lane[])" :key="l">
            <g v-if="mark(l)" :class="['mk', { unsaved: angleChanged(l as Lane) }]">
              <circle :cx="mark(l)!.x" :cy="mark(l)!.y" r="9" />
              <text :x="mark(l)!.x" :y="mark(l)!.y + 3.5" text-anchor="middle">{{ l + 1 }}</text>
            </g>
          </g>
        </svg>
        <div class="lanes">
          <div v-for="l in ([0, 1] as Lane[])" :key="l" class="lane" :class="{ here: onLane === l }">
            <div class="lname">Lane {{ l + 1 }} <span class="muted small">· T{{ l }}{{ onLane === l ? ' · arm is here' : '' }}</span></div>
            <label class="fld">
              <span>Angle</span>
              <span class="field">
                <input class="num" inputmode="decimal" :value="text('angle', l)" :disabled="!live" :aria-label="`Lane ${l + 1} angle in degrees, 0 to 180`"
                  @input="draft.angle[l] = ($event.target as HTMLInputElement).value" @keydown.enter="tryLane(l)" @keydown.esc="draft.angle[l] = null" /><small>°</small>
              </span>
            </label>
            <RsButton size="sm" :disabled="!live || busy || !angleOk(l)" @click="tryLane(l)">Try</RsButton>
            <label class="fld">
              <span>Retract</span>
              <span class="field">
                <input class="num" inputmode="decimal" :value="text('retract', l)" :disabled="!unlocked || !!block" :aria-label="`Lane ${l + 1} retract in millimetres, 0 to 100`"
                  @input="draft.retract[l] = ($event.target as HTMLInputElement).value" @keydown.esc="draft.retract[l] = null" /><small>mm</small>
              </span>
            </label>
            <RsButton size="sm" :variant="canSave(l) ? 'primary' : 'default'" :disabled="!canSave(l)" @click="save(l)">Save</RsButton>
          </div>
          <p class="muted small">
            <b>Try</b> moves the servo and saves nothing. <b>Save</b> keeps the angle (and the retract) on the Rhino. Klipper doesn't report the servo's angle,
            so the arm shows the last angle sent{{ st.sent != null ? `: ${st.sent}°` : '' }}. A bench move doesn't change which lane Klipper has recorded{{ st.recorded != null ? ` (lane ${st.recorded + 1})` : '' }};
            the next job or lane change sets both.
          </p>
        </div>
      </div>
    </section>

    <!-- 3 · retract -->
    <section class="step" aria-labelledby="ln-retract">
      <div class="head"><h3 id="ln-retract"><span class="n">3</span> Retract when leaving a lane</h3></div>
      <div class="body">
        <svg class="pic retract" viewBox="0 0 250 64" role="img" aria-label="Filament pulled back out of the hotend by the retract distance before the servo moves to the other lane">
          <text x="198" y="11" text-anchor="middle" class="cap">hotend</text>
          <rect x="150" y="16" width="96" height="26" rx="4" class="box" />
          <line x1="2" y1="29" x2="150" y2="29" class="fil" />
          <line x1="150" y1="29" x2="238" y2="29" class="fil ghost" />
          <path d="M 236 56 L 152 56" class="dim" /><path d="M 160 51 L 152 56 L 160 61" class="dim" />
          <text x="194" y="52" text-anchor="middle" class="cap">retract</text>
        </svg>
        <p class="muted small">
          Before the servo swings away from a lane, its filament is pulled back by this distance so it clears the selector. It is the lane being left that counts.
          <b>0 means the material's own retract</b> (set in Assets › Materials). Today: lane 1 {{ st.retract[0] || 'material' }}{{ st.retract[0] ? ' mm' : '' }}, lane 2 {{ st.retract[1] || 'material' }}{{ st.retract[1] ? ' mm' : '' }}.
          Set it in each lane's box above.
        </p>
      </div>
    </section>
    <p v-if="note" class="note" role="alert">{{ note }}</p>
    <p v-if="retractMm(0) > 60 || retractMm(1) > 60" class="note" role="status">That is a long retract. Most hotends need well under 60 mm.</p>
  </RsPanel>
</template>

<style scoped>
.intro { margin: 0 0 8px; }
.step { padding: 12px 0; border-top: 1px dotted var(--rs-line); }
.step:first-of-type { border-top: 0; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
h3 { margin: 0; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); display: flex; align-items: center; gap: 8px; }
.n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--rs-ink); font-size: 11px; font-family: var(--rs-font-code); }
.body { display: flex; align-items: center; gap: var(--rs-space-4); min-width: 0; }
.body p { margin: 0; flex: 1; min-width: 0; }
.body.two { align-items: flex-start; }
.asleep .lanes, .asleep .dial { opacity: 0.55; }
.pic { flex: none; width: 250px; max-width: 100%; height: auto; }
.pic.dial { width: 220px; }
.pic text { font-family: var(--rs-font-ui, inherit); font-size: 11px; fill: var(--rs-text-strong); }
.pic .cap { font-size: 10px; fill: var(--rs-text-muted); }
.box { fill: var(--rs-surface); stroke: var(--rs-line-strong); stroke-width: 1.5; }
.wire, .fil, .dim { stroke: var(--rs-line-strong); stroke-width: 2; fill: none; stroke-dasharray: 4 4; }
.power.on .wire { stroke: var(--rs-ink); stroke-dasharray: none; }
.power.on .box.hot { fill: var(--rs-ink); stroke: var(--rs-ink); }
.power.on .hotText { fill: var(--rs-on-ink); }
.retract .fil { stroke: var(--rs-ink); stroke-dasharray: none; stroke-width: 3; }
.retract .fil.ghost { stroke: var(--rs-line-strong); stroke-dasharray: 3 4; stroke-width: 2; }
.retract .dim { stroke: var(--rs-ink); stroke-dasharray: none; stroke-width: 1.5; }
.track { fill: none; stroke: var(--rs-line-strong); stroke-width: 2; }
.tick { stroke: var(--rs-line-strong); stroke-width: 1.5; }
.arm { stroke: var(--rs-text-muted); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 5 4; }
.arm.held { stroke: var(--rs-ink); stroke-dasharray: none; }
.hub { fill: var(--rs-ink); }
.mk circle { fill: var(--rs-surface); stroke: var(--rs-ink); stroke-width: 1.5; }
.mk text { font-size: 10px; font-weight: 700; fill: var(--rs-ink); }
.mk.unsaved circle { stroke-dasharray: 3 2; }
.lanes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.lane { display: grid; grid-template-columns: auto auto auto auto auto; align-items: center; gap: 8px 12px; padding: 8px 10px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-md); }
.lane.here { border-color: var(--rs-ink); background: var(--rs-dither-faint), var(--rs-surface); }
.lname { grid-column: 1 / -1; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); }
.fld { display: inline-flex; align-items: baseline; gap: 6px; font-size: 12px; color: var(--rs-text-muted); }
.field { display: inline-flex; align-items: baseline; gap: 2px; }
.num { width: 64px; height: 30px; padding: 0 8px; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-sm); background: var(--rs-surface); color: var(--rs-text-strong); font: inherit; font-family: var(--rs-font-code); text-align: right; }
.num:focus { outline: 2px solid var(--rs-ink); outline-offset: 1px; }
.num:disabled { opacity: 0.5; cursor: not-allowed; }
.field small { font-size: 11px; color: var(--rs-text-muted); }
.note { margin: 8px 0 0; font-size: var(--rs-text-sm); color: var(--rs-text-strong); }
@media (max-width: 760px) {
  .body, .body.two { flex-direction: column; align-items: stretch; }
  .pic { align-self: center; }
  .lane { grid-template-columns: 1fr auto; }
  .lname { grid-column: 1 / -1; }
}
</style>
