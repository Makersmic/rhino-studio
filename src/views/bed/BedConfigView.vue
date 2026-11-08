<script setup lang="ts">
/**
 * Bed › Configuration (Mike, Nov 8 2026): when Z_TILT_ADJUST faults out because the bed is too far off level for a
 * probe point to be reached, bring it close by eye by moving the lead screws one at a time, then home and level.
 * A correction the machine can't make for itself with the current hardware. Nothing on this screen is saved.
 * The commands and their order are in src/bed/zscrews.ts; the padlock and send path in the control store.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import RsPanel from '@/components/RsPanel.vue'
import RsButton from '@/components/RsButton.vue'
import PadLock from '@/components/PadLock.vue'
import ScrewMap from '@/bed/ScrewMap.vue'
import { SCREW_STEPS, bedLayout, lastTiltRun, screwEnableScript, screwMoveScript, type BedLayout } from '@/bed/zscrews'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'

const machine = useMachineStore()
const control = useControlStore()

// ---- where the screws are: read from Klipper's config each time Klipper is ready
const settings = ref<Record<string, Record<string, unknown>> | null>(null)
const readError = ref<string | null>(null)
async function read() {
  if (!machine.klippyReady) return
  try {
    settings.value = await machine.bedConfig()
    readError.value = null
  } catch (e) {
    readError.value = (e as Error).message
  }
}
watch(() => machine.klippyReady, (r) => r && void read(), { immediate: true })
const bedW = computed(() => (machine.limits.max?.[0] ?? 0) || 576)
const bedH = computed(() => (machine.limits.max?.[1] ?? 0) || 406)
const layout = computed<BedLayout | null>(() => (settings.value ? bedLayout(settings.value, { w: bedW.value, h: bedH.value }) : null))
const steppers = computed(() => layout.value?.screws.map((s) => s.stepper) ?? [])
const nameOf = (st: string) => layout.value?.screws.find((s) => s.stepper === st)?.label ?? st

// ---- which motors, how far
const picked = ref<string[]>([])
function toggle(s: string) {
  picked.value = picked.value.includes(s) ? picked.value.filter((p) => p !== s) : [...picked.value, s]
}
const step = ref<number>(0.5)
/** mm moved per motor since unlocking; bed up is + (only for showing: nothing is kept) */
const moved = ref<Record<string, number>>({})
watch(() => control.screwUnlocked, (u) => u && (moved.value = {}))
onBeforeUnmount(() => control.lockScrews())

const armed = computed(() => control.screwUnlocked && !control.screwBlock)
const zState = computed(() => ({
  homed: machine.position.homed,
  zSafe: (machine.status.save_variables?.variables as Record<string, unknown> | undefined)?.rhino_z_safe,
}))
const enabled = computed(() => ((machine.status as Record<string, { steppers?: Record<string, boolean> }>).stepper_enable?.steppers ?? {}))
const released = computed(() => steppers.value.filter((s) => enabled.value[s] === false))
const zHomed = computed(() => machine.position.homed.toLowerCase().includes('z'))

const busy = ref(false)
async function move(up: boolean) {
  const b = screwMoveScript(picked.value, steppers.value, up, step.value, zState.value)
  if ('error' in b) return control.log('error', b.error)
  busy.value = true
  const label = `${picked.value.map(nameOf).join(', ')}: bed ${up ? 'up' : 'down'} ${step.value} mm`
  const ok = await control.sendScrews(b.script, label, steppers.value)
  busy.value = false
  if (ok) for (const s of picked.value) moved.value[s] = Number(((moved.value[s] ?? 0) + (up ? step.value : -step.value)).toFixed(3))
}
async function release(on: boolean) {
  const b = screwEnableScript(picked.value, steppers.value, on, zState.value)
  if ('error' in b) return control.log('error', b.error)
  if (!on) {
    const ok = await control.confirm({
      title: 'Switch these motors off?',
      body: `${picked.value.map(nameOf).join(', ')} stop holding, so you can turn the lead screws by hand. The bed may settle at those screws. Z is marked not homed first. The next move, or Hold, switches them on again.`,
      lines: b.script.split('\n').map((t) => ({ text: t, reason: t.startsWith('SET_STEPPER_ENABLE') ? 'switches a motor off' : t.startsWith('SAVE') ? 'the saved park height no longer holds' : 'Z is no longer trusted: home it after' })),
      confirmLabel: 'Switch off',
      tone: 'motion',
    })
    if (!ok) return
  }
  busy.value = true
  await control.sendScrews(b.script, `${picked.value.map(nameOf).join(', ')}: ${on ? 'hold' : 'released to turn by hand'}`, steppers.value)
  busy.value = false
}

// ---- home and level
const tiltRun = computed(() => lastTiltRun(control.lines))
const firstAdjust = computed(() => tiltRun.value?.passes[0]?.adjust ?? null)
const printHead = computed(() => machine.mountedVerified && machine.toolKind === 'print')
const tolerance = computed(() => Number(settings.value?.z_tilt?.retry_tolerance ?? NaN))
const tiltBlock = computed(() => {
  if (!machine.klippyReady) return 'Klipper is not ready'
  if (control.jobActive) return 'A job is running'
  if (!printHead.value) return 'Mount and confirm a print head: the probe is on the print heads'
  if (machine.position.homed.toLowerCase() !== 'xyz') return 'Home all first'
  return null
})
async function level() {
  control.lockScrews()
  await control.send('Z_TILT_ADJUST', {
    label: 'Z_TILT_ADJUST (level the gantry)',
    confirmTitle: 'Level the gantry?',
    confirmBody: `Probes ${layout.value?.points.length ?? 3} points and moves each Z motor until they agree${Number.isFinite(tolerance.value) ? ` within ${tolerance.value} mm` : ''}. If a point can't be reached it stops with an error: move that screw closer here and try again.`,
    confirmLabel: 'Level',
  })
}
const f3 = (n: number | undefined) => (n == null ? '–' : n.toFixed(3))
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>Bed configuration</h1>
      <p>
        The Z lead screws, seen from above as you stand at the front. When Z-tilt can't reach a probe point because the bed is too far off level,
        tick a screw and move it until the bed looks about level, then home and level the gantry.
      </p>
    </div>

    <p v-if="!machine.klippyReady" class="note">Klipper is not ready, so the lead screws can't be read.</p>
    <p v-else-if="readError" class="note bad">{{ readError }}</p>
    <p v-else-if="layout?.error" class="note">{{ layout.error }}</p>

    <div v-if="layout && !layout.error" class="wrap">
      <div class="grid">
        <RsPanel class="map-panel" title="Lead screws" :status="picked.length ? `${picked.length} ticked` : undefined" panel-id="bed.screws">
          <ScrewMap :layout="layout" :picked="picked" :moved="moved" :tilt="firstAdjust" :enabled="enabled" @toggle="toggle" />
          <p class="muted small key-note">
            Tick the screws to move. "Moved" is since you unlocked, + is bed up; "Z-tilt" is the first correction the last
            Z-tilt made, as Klipper printed it.
          </p>
        </RsPanel>

        <div class="side">
          <RsPanel title="Move screws" panel-id="bed.move" :live="armed">
            <template #actions>
              <PadLock
                :open="armed"
                :disabled="!armed && !!control.screwBlock"
                :text="armed ? `${control.screwSecondsLeft} s` : undefined"
                :label="armed ? `Unlocked, locks in ${control.screwSecondsLeft} seconds. Tap to lock now` : control.screwBlock ? `Locked: ${control.screwBlock}` : 'Locked. Tap to unlock the lead screws for 60 s'"
                @toggle="armed ? control.lockScrews() : control.unlockScrews()"
              />
            </template>
            <div class="layout">
              <div class="keys" role="group" aria-label="Move the ticked screws">
                <button type="button" class="key up" :disabled="!armed || !picked.length || busy" :aria-label="`Bed up ${step} mm at the ticked screws`" @click="move(true)"><i />Up</button>
                <span class="center" aria-hidden="true"><span class="rs-num">{{ step }}</span><small>mm</small></span>
                <button type="button" class="key down" :disabled="!armed || !picked.length || busy" :aria-label="`Bed down ${step} mm at the ticked screws`" @click="move(false)"><i />Down</button>
              </div>
              <div class="ctl">
                <fieldset class="seg">
                  <legend>Step</legend>
                  <label v-for="s in SCREW_STEPS" :key="s"><input v-model="step" type="radio" :value="s" name="screw-step" /><span>{{ s }}</span></label>
                </fieldset>
                <p class="hint">
                  <template v-if="control.screwBlock">{{ control.screwBlock }}.</template>
                  <template v-else-if="!armed">Tap the red padlock to move screws. It locks again 60 s after your last press.</template>
                  <template v-else-if="!picked.length">Tick a screw on the map.</template>
                  <template v-else>Up raises the bed at {{ picked.map(nameOf).join(', ') }}, one motor after another.</template>
                </p>
              </div>
            </div>
            <div class="hand">
              <RsButton size="sm" :disabled="!armed || !picked.length || busy" @click="release(false)">Release to turn by hand</RsButton>
              <RsButton size="sm" variant="quiet" :disabled="!armed || !released.length || busy" @click="release(true)">Hold</RsButton>
              <span v-if="released.length" class="muted small">Motors off: {{ released.map(nameOf).join(', ') }}</span>
            </div>
          </RsPanel>

          <RsPanel title="Home and level" panel-id="bed.level" :status="tiltRun ? (tiltRun.outcome === 'done' ? 'Level' : tiltRun.outcome === 'failed' ? 'Stopped' : 'Running') : undefined">
            <p class="state">
              <span :class="{ warn: !zHomed }">{{ zHomed ? 'Z is homed.' : 'Z is not homed: home before anything moves Z.' }}</span>
            </p>
            <div class="hand">
              <RsButton size="sm" :disabled="!!control.homeBlock" :title="control.homeBlock ?? ''" @click="control.home('all')">Home all</RsButton>
              <RsButton size="sm" variant="primary" :disabled="!!tiltBlock" @click="level">Level the gantry</RsButton>
            </div>
            <p v-if="tiltBlock" class="muted small">{{ tiltBlock }}.</p>
            <template v-if="tiltRun">
              <p v-if="tiltRun.outcome === 'failed'" class="warn small">Last Z-tilt stopped: <span class="mono">{{ tiltRun.error }}</span></p>
              <table v-if="tiltRun.passes.length" class="passes">
                <thead><tr><th>Pass</th><th v-for="s in steppers" :key="s">{{ nameOf(s) }}</th><th>Range</th></tr></thead>
                <tbody>
                  <tr v-for="(p, i) in tiltRun.passes" :key="i">
                    <td>{{ i + 1 }}</td>
                    <td v-for="s in steppers" :key="s" class="mono">{{ f3(p.adjust[s]) }}</td>
                    <td class="mono">{{ f3(p.range) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
            <p v-else class="muted small">NO Z_TILT PERFORMED SINCE RESTART</p>
          </RsPanel>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.note { font-size: var(--rs-text-sm); }
.note.bad, .warn { color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.wrap { container-type: inline-size; }
/* the same split as Bed mesh, so the map panel is the Map's size */
.grid { display: grid; gap: var(--rs-gap); grid-template-columns: minmax(0, 1fr); }
.side { display: flex; flex-direction: column; gap: var(--rs-gap); min-width: 0; }
@container (min-width: 900px) {
  .grid { grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); align-items: start; }
}
.map-panel { container-type: inline-size; }
.key-note { margin: var(--rs-space-3) 0 0; max-width: 68ch; }
.small { font-size: var(--rs-text-xs); }
.muted { color: var(--rs-text-muted); }
.mono { font-family: var(--rs-font-code); }

/* keys and step chooser: as Motion's Z keys (src/control/MotionPanel.vue) */
.layout { display: flex; gap: var(--rs-space-5); align-items: start; }
.keys { display: grid; grid-template-rows: repeat(3, 62px); grid-template-columns: 62px; gap: 6px; flex: none; }
.key {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface);
  color: var(--rs-text-strong); font-size: var(--rs-text-xs); font-weight: var(--rs-weight-bold); cursor: pointer;
}
.key i { width: 9px; height: 9px; border: solid currentColor; border-width: 2px 2px 0 0; }
.up i { transform: rotate(-45deg) translate(-1px, 2px); }
.down i { transform: rotate(135deg) translate(-1px, 2px); order: 2; }
.key:hover:not(:disabled) { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }
.key:active:not(:disabled) { transform: translateY(1px); }
.key:disabled { cursor: not-allowed; background: var(--rs-key-fill); border-color: transparent; color: var(--rs-text-muted); }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.center .rs-num { font-size: 1.25rem; }
.center small { font-size: 10px; color: var(--rs-text-muted); }
.ctl { display: flex; flex-direction: column; gap: var(--rs-space-3); min-width: 0; flex: 1; }
.seg { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; }
legend { font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin-bottom: 6px; padding: 0; }
.seg label { flex: 1; min-width: 46px; }
.seg label span {
  display: flex; align-items: center; justify-content: center; height: 34px; border: 1px solid var(--rs-line-strong); margin-left: -1px;
  font-family: var(--rs-font-code); font-size: var(--rs-text-sm); cursor: pointer; color: var(--rs-text-strong);
}
.seg label:first-of-type span { border-radius: var(--rs-radius-md) 0 0 var(--rs-radius-md); margin-left: 0; }
.seg label:last-of-type span { border-radius: 0 var(--rs-radius-md) var(--rs-radius-md) 0; }
.seg input { position: absolute; opacity: 0; width: 0; height: 0; }
.seg input:checked + span { background: var(--rs-ink); color: var(--rs-on-ink); }
.seg input:focus-visible + span { box-shadow: var(--rs-focus); position: relative; }
.hint { font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin: 0; }
.hand { display: flex; flex-wrap: wrap; align-items: center; gap: var(--rs-space-2); margin-top: var(--rs-space-4); }
.state { margin: 0; font-size: var(--rs-text-sm); }
.passes { width: 100%; border-collapse: collapse; font-size: var(--rs-text-xs); margin-top: var(--rs-space-3); }
.passes th, .passes td { text-align: left; padding: 4px 6px; border-top: 1px solid var(--rs-line); }
.passes thead th { color: var(--rs-text-muted); font-weight: 400; border-top: 0; }
</style>
