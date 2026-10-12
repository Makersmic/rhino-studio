<script setup lang="ts">
/**
 * Pendant mode: the phone as a pendant at the machine. Two screens:
 *
 * Jog (two-hand control)
 *   The jog keys are dead unless the Hold button in the bottom corner is
 *   being held. Hold with one thumb, tap a key with the other: one tap is one
 *   fixed step. Letting go of Hold (or the touch being cancelled, the screen
 *   turning off, switching apps, losing focus) kills the keys at once.
 *   A key already under a finger when Hold is pressed does nothing; the
 *   step fires on the key press itself, never on a press-and-hold.
 *   Desktop testing: hold Shift as the enable button.
 *
 * Status
 *   Big position readout, Home, Set Z zero / work zero.
 *
 * Both screens keep Stop on screen, and both go through the control store's
 * gates: Klipper ready, no job running, no swap under way, toolhead
 * confirmed, axis homed, move inside the machine's travel. Wizard questions
 * (e.g. CNC_JOB_SETUP asking you to jog to the stock origin) pop up here too.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BrandMark from '@/brand/BrandMark.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import type { Axis } from '@/control/commands'

const control = useControlStore()
const machine = useMachineStore()

const screen = ref<'jog' | 'status'>('jog')
const XY_STEPS = [0.1, 1, 10, 50]
const Z_STEPS = [0.05, 0.1, 1, 10]
const xy = ref(1)
const z = ref(0.1)
const coords = ref<'work' | 'machine'>('work')

// Left-handed: mirror the jog screen so Hold sits under the right thumb
const LEFTY_KEY = 'rs.pendant.lefty'
const lefty = ref(false)
try {
  lefty.value = localStorage.getItem(LEFTY_KEY) === '1'
} catch {
  /* storage blocked */
}
watch(lefty, (v) => {
  try {
    localStorage.setItem(LEFTY_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
})

const homed = computed(() => machine.position.homed.toLowerCase())
const live = computed(() => control.enableHeld && !control.motionBlock)
const can = (a: Axis) => live.value && homed.value.includes(a.toLowerCase())

const shown = computed(() => {
  const g = machine.status.gcode_move?.gcode_position
  const work = Array.isArray(g) ? (g as number[]) : null
  return coords.value === 'work' && work ? work : machine.position.xyz
})
const fmt = (n: number | undefined) => (n == null ? '—' : n.toFixed(2))

// ---- the enable (dead-man) button ------------------------------------------
let enablePointer: number | null = null
function enableDown(e: PointerEvent) {
  if (control.motionBlock) return
  enablePointer = e.pointerId
  try {
    // Keep receiving this finger's events even if it slides off the button
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* not a real pointer (tests) */
  }
  control.setEnable(true)
  navigator.vibrate?.(20)
}
function enableUp(e: PointerEvent) {
  if (e.pointerId !== enablePointer) return
  enablePointer = null
  control.setEnable(false)
}
const release = () => {
  enablePointer = null
  control.setEnable(false)
}
const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Shift' || screen.value !== 'jog') return
  if (e.type === 'keydown' && !e.repeat) control.setEnable(true)
  if (e.type === 'keyup') release()
}

// ---- jog keys: fire on press, only while Hold is held ------------------------
function jogDown(e: PointerEvent, a: Axis, d: number) {
  if (e.pointerId === enablePointer || !can(a)) return
  e.preventDefault()
  navigator.vibrate?.(12)
  void control.jog(a, d)
}

// ---- Stop -------------------------------------------------------------------
const stopState = ref<'idle' | 'sent' | 'failed'>('idle')
async function stop() {
  release()
  navigator.vibrate?.([30, 40, 30])
  try {
    await machine.emergencyStop()
    stopState.value = 'sent'
  } catch {
    stopState.value = 'failed'
  }
  setTimeout(() => (stopState.value = 'idle'), 6000)
}

const hasWorkZero = computed(() => machine.mountedName === 'HotJoe' && control.macros.has('SET_WORK_ZERO'))
const hasZZero = computed(() => control.macros.has('SET_Z_ZERO') && machine.toolState.kind === 'mounted' && machine.toolState.type !== 'DEPOSITION')
async function setWorkZero() {
  const ok = await control.confirm({
    title: 'Set work zero here?',
    body: 'SET_WORK_ZERO makes the current position X0 Y0 Z0 for the next CNC job. Nothing moves.',
    confirmLabel: 'Set work zero',
    tone: 'normal',
  })
  if (ok) await control.send('SET_WORK_ZERO', { label: 'Set work zero' })
}

// ---- keep the screen on (needs HTTPS or localhost) ---------------------------
let wake: { release: () => Promise<void> } | null = null
const wakeOk = ref(true)
async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    if (!nav.wakeLock) throw new Error('no wake lock')
    wake = await nav.wakeLock.request('screen')
    wakeOk.value = true
  } catch {
    wakeOk.value = false
  }
}
const onVisible = () => {
  if (document.hidden) release()
  else void keepAwake()
}
onMounted(() => {
  void keepAwake()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('blur', release)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
})
onBeforeUnmount(() => {
  release()
  control.lockMotion()
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('blur', release)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKey)
  void wake?.release().catch(() => {})
})
watch(screen, release)

const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {})
</script>

<template>
  <div class="pendant" :class="{ live, lefty }" @contextmenu.prevent>
    <header class="top">
      <RouterLink to="/control" class="exit" aria-label="Leave pendant mode"><BrandMark :size="26" :show-name="false" /></RouterLink>
      <ToolheadBadge :look="machine.mountedLook" :verified="machine.mountedVerified" size="sm" />
      <span class="conn" :class="machine.klippyReady ? 'ok' : 'bad'">{{ machine.klippyReady ? 'Ready' : machine.connection === 'online' ? `Klipper ${machine.klippy}` : 'Offline' }}</span>
      <button type="button" class="fs" aria-label="Full screen" @click="fullscreen">⤢</button>
    </header>

    <nav class="tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="screen === 'jog'" @click="screen = 'jog'">Jog</button>
      <button type="button" role="tab" :aria-selected="screen === 'status'" @click="screen = 'status'">Status</button>
    </nav>

    <button type="button" class="stop" :disabled="machine.connection === 'offline'" @click="stop">
      <span class="cap" aria-hidden="true" />
      {{ stopState === 'sent' ? 'Stop sent' : stopState === 'failed' ? 'Stop failed: use the machine switch' : 'Stop' }}
    </button>

    <!-- ===== Jog: two-hand control ===== -->
    <template v-if="screen === 'jog'">
      <section class="strip" aria-label="Position">
        <span v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" :class="{ unhomed: !homed.includes(a.toLowerCase()) }"><b>{{ a }}</b>{{ fmt(shown?.[i]) }}</span>
      </section>

      <section class="steps">
        <div class="seg" role="radiogroup" aria-label="X/Y step">
          <span class="lbl">XY</span>
          <button v-for="s in XY_STEPS" :key="s" type="button" role="radio" :aria-checked="xy === s" @click="xy = s">{{ s }}</button>
        </div>
        <div class="seg" role="radiogroup" aria-label="Z step">
          <span class="lbl">Z</span>
          <button v-for="s in Z_STEPS" :key="s" type="button" role="radio" :aria-checked="z === s" @click="z = s">{{ s }}</button>
        </div>
      </section>

      <section class="keys" aria-label="Jog keys">
        <div class="xy">
          <button class="k up" :disabled="!can('Y')" :aria-label="`Y plus ${xy}`" @pointerdown="jogDown($event, 'Y', xy)">Y+</button>
          <button class="k left" :disabled="!can('X')" :aria-label="`X minus ${xy}`" @pointerdown="jogDown($event, 'X', -xy)">X−</button>
          <span class="hub">{{ xy }}</span>
          <button class="k right" :disabled="!can('X')" :aria-label="`X plus ${xy}`" @pointerdown="jogDown($event, 'X', xy)">X+</button>
          <button class="k down" :disabled="!can('Y')" :aria-label="`Y minus ${xy}`" @pointerdown="jogDown($event, 'Y', -xy)">Y−</button>
        </div>
        <div class="zc">
          <button class="k" :disabled="!can('Z')" :aria-label="`Z plus ${z}`" @pointerdown="jogDown($event, 'Z', z)">Z+</button>
          <span class="hub">{{ z }}</span>
          <button class="k" :disabled="!can('Z')" :aria-label="`Z minus ${z}`" @pointerdown="jogDown($event, 'Z', -z)">Z−</button>
        </div>
      </section>

      <section class="enable-row">
        <button
          type="button"
          class="enable"
          :class="{ held: control.enableHeld }"
          :disabled="!!control.motionBlock"
          aria-label="Hold to enable jogging"
          @pointerdown="enableDown"
          @pointerup="enableUp"
          @pointercancel="release"
          @lostpointercapture="release"
        >
          <span class="dot" aria-hidden="true" />
          <span>{{ control.motionBlock ? control.motionBlock : control.enableHeld ? 'Enabled' : 'Hold' }}</span>
        </button>
        <div class="enable-help">
          <p v-if="!control.motionBlock">{{ control.enableHeld ? 'Tap a key to jog one step.' : `Hold with your ${lefty ? 'right' : 'left'} thumb, jog with the other.` }}</p>
          <label class="lefty-toggle"><input v-model="lefty" type="checkbox" /> Left-handed</label>
        </div>
      </section>
    </template>

    <!-- ===== Status ===== -->
    <template v-else>
      <section class="pos" aria-label="Position">
        <div class="pos-head">
          <button type="button" :class="{ on: coords === 'work' }" @click="coords = 'work'">Work</button>
          <button type="button" :class="{ on: coords === 'machine' }" @click="coords = 'machine'">Machine</button>
        </div>
        <div v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" class="axis" :class="{ unhomed: !homed.includes(a.toLowerCase()) }">
          <span class="a">{{ a }}</span>
          <span class="v">{{ fmt(shown?.[i]) }}</span>
        </div>
      </section>
      <section class="actions">
        <button type="button" :disabled="!machine.klippyReady || control.jobActive" @click="control.home('all')">Home all</button>
        <button v-if="hasZZero" type="button" :disabled="!machine.klippyReady || control.jobActive" @click="control.send('SET_Z_ZERO', { label: 'Set Z zero' })">Set Z zero</button>
        <button v-if="hasWorkZero" type="button" :disabled="!machine.klippyReady || control.jobActive" @click="setWorkZero">Set work zero</button>
      </section>
      <p class="note">
        <template v-if="control.motionBlock">Jogging is off: {{ control.motionBlock }}.</template>
        <template v-else>Jogging lives on the Jog screen and needs both thumbs.</template>
      </p>
      <p v-if="!wakeOk" class="note">This connection can't keep your screen on; raise the phone's auto-lock time.</p>
    </template>
  </div>
</template>

<style scoped>
.pendant {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  max-width: 520px;
  margin: 0 auto;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
}
.top { display: flex; align-items: center; gap: 10px; }
.exit { display: inline-flex; color: var(--rs-text-strong); }
.conn { margin-left: auto; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); padding: 4px 12px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); }
.conn::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--rs-ok); }
.conn.bad::before { background: var(--rs-danger); border-radius: 1px; }
.fs { width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-size: 18px; }

.tabs { display: flex; padding: 4px; gap: 4px; border-radius: var(--rs-radius-pill); background: var(--rs-surface); }
.tabs button { flex: 1; height: 38px; border: 0; border-radius: var(--rs-radius-pill); background: transparent; color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); }
.tabs button[aria-selected='true'] { background: var(--rs-paper); color: var(--rs-paper-ink); }

.stop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 60px;
  border: 0;
  border-radius: var(--rs-radius-pill);
  background: var(--rs-danger);
  color: var(--rs-on-danger);
  font-size: 1.3rem;
  font-weight: var(--rs-weight-bold);
  font-stretch: 112%;
}
.stop:active { background: var(--rs-danger-strong); }
.stop:disabled { background: var(--rs-surface-2); color: var(--rs-text-muted); }
.cap { width: 34px; height: 34px; border-radius: 50%; border: 3px solid currentColor; background: radial-gradient(circle, currentColor 0 7px, transparent 7.5px); }

/* ---- jog screen ---- */
.strip { display: flex; justify-content: space-between; padding: 10px 16px; border-radius: var(--rs-radius-lg); background: var(--rs-paper); color: var(--rs-paper-ink); font-size: 1.35rem; font-weight: var(--rs-weight-light); letter-spacing: -0.02em; }
.strip b { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); margin-right: 6px; letter-spacing: 0; }
.strip .unhomed { opacity: 0.4; }

.steps { display: flex; flex-direction: column; gap: 6px; }
.seg { display: flex; align-items: center; gap: 6px; }
.lbl { width: 26px; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.seg button { flex: 1; height: 40px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-family: var(--rs-font-code); }
.seg button[aria-checked='true'] { background: var(--rs-text-strong); color: var(--rs-bg); border-color: transparent; }

.keys { flex: 1; min-height: 230px; max-height: 420px; display: grid; grid-template-columns: 1fr 84px; gap: 12px; align-items: stretch; touch-action: none; }
.lefty .keys { grid-template-columns: 84px 1fr; }
.lefty .zc { order: -1; }
.xy { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, minmax(58px, 1fr)); gap: 8px; }
.xy .up { grid-area: 1 / 2; } .xy .left { grid-area: 2 / 1; } .xy .hub { grid-area: 2 / 2; } .xy .right { grid-area: 2 / 3; } .xy .down { grid-area: 3 / 2; }
.zc { display: grid; grid-template-rows: 1fr auto 1fr; gap: 8px; }
.k {
  border: 0;
  border-radius: 20px;
  background: var(--rs-surface);
  color: var(--rs-text-muted);
  font-size: 1.25rem;
  font-weight: var(--rs-weight-bold);
  min-height: 58px;
  touch-action: none;
  transition: background 80ms, color 80ms;
}
/* Greyed until Hold is held: dashed outline says "inactive" without colour */
.k:disabled { box-shadow: inset 0 0 0 1.5px var(--rs-line); background: repeating-linear-gradient(135deg, var(--rs-surface) 0 8px, var(--rs-bg) 8px 16px); }
.live .k:not(:disabled) { background: var(--rs-active); color: var(--th-ink); }
.k:active:not(:disabled) { transform: scale(0.96); }
.hub { display: grid; place-items: center; border-radius: 50%; border: 1.5px dashed var(--rs-line-strong); font-family: var(--rs-font-code); color: var(--rs-text-muted); min-height: 40px; }

.enable-row { display: flex; align-items: stretch; gap: 12px; }
.lefty .enable-row { flex-direction: row-reverse; }
.enable {
  flex: 0 0 52%;
  min-height: 112px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 28px;
  background: var(--rs-surface-2);
  color: var(--rs-text-strong);
  font-size: 1.2rem;
  font-weight: var(--rs-weight-bold);
  touch-action: none;
  box-shadow: inset 0 0 0 2px var(--rs-line-strong);
}
.enable .dot { width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid currentColor; }
.enable.held { background: var(--rs-warn-fill); color: var(--th-ink); box-shadow: inset 0 0 0 3px var(--th-ink); }
.enable.held .dot { background: currentColor; }
.enable:disabled { font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); padding: 0 12px; text-align: center; }
.enable-help { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.lefty-toggle { display: flex; align-items: center; gap: 8px; color: var(--rs-text); }
.lefty-toggle input { width: 20px; height: 20px; accent-color: var(--rs-text-strong); }

/* ---- status screen ---- */
.pos { border-radius: var(--rs-radius-xl); background: var(--rs-paper); color: var(--rs-paper-ink); padding: 10px 18px 14px; }
.pos-head { display: flex; gap: 4px; margin-bottom: 4px; }
.pos-head button { border: 0; background: transparent; color: var(--rs-paper-muted); font-size: var(--rs-text-sm); padding: 4px 10px; border-radius: var(--rs-radius-pill); }
.pos-head button.on { background: var(--rs-paper-ink); color: var(--rs-paper); }
.axis { display: flex; align-items: baseline; justify-content: space-between; line-height: 1.05; }
.axis .a { font-weight: var(--rs-weight-medium); font-size: var(--rs-text-lg); }
.axis .v { font-size: 3rem; font-weight: var(--rs-weight-light); letter-spacing: -0.04em; }
.axis.unhomed .v { opacity: 0.4; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions button { flex: 1; min-height: 50px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.actions button:disabled { opacity: 0.4; }
.note { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
</style>
