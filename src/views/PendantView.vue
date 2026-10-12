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
      <button type="button" class="fs hand" :aria-pressed="lefty" :title="lefty ? 'Left-handed layout (on)' : 'Left-handed layout'" aria-label="Left-handed layout" @click="lefty = !lefty">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7H4l3-3M4 7l3 3M16 17h4l-3-3M20 17l-3 3M4 7h16M20 17H4" /></svg>
      </button>
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
        <span v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" :class="{ unhomed: !homed.includes(a.toLowerCase()) }"><b>{{ a }}</b><span class="coord">{{ fmt(shown?.[i]) }}</span></span>
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
          <span class="hub"><span class="rs-num">{{ xy }}</span><small>mm</small></span>
          <button class="k right" :disabled="!can('X')" :aria-label="`X plus ${xy}`" @pointerdown="jogDown($event, 'X', xy)">X+</button>
          <button class="k down" :disabled="!can('Y')" :aria-label="`Y minus ${xy}`" @pointerdown="jogDown($event, 'Y', -xy)">Y−</button>
        </div>
        <div class="zc">
          <button class="k" :disabled="!can('Z')" :aria-label="`Z plus ${z}`" @pointerdown="jogDown($event, 'Z', z)">Z+</button>
          <span class="hub"><span class="rs-num">{{ z }}</span><small>mm</small></span>
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
          <span class="ring" aria-hidden="true"><span /></span>
          <span class="lbl-main">{{ control.motionBlock ? 'Locked' : control.enableHeld ? 'Enabled' : 'Hold' }}</span>
          <span v-if="control.motionBlock" class="lbl-sub">{{ control.motionBlock }}</span>
        </button>
        <div class="enable-help">
          <p v-if="!control.motionBlock">{{ control.enableHeld ? 'Tap a key to jog one step.' : `Hold with your ${lefty ? 'right' : 'left'} thumb, jog with the other.` }}</p>
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
          <span class="v coord">{{ fmt(shown?.[i]) }}</span>
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
.top { display: flex; align-items: center; gap: 10px; min-height: 40px; }
.exit { display: inline-flex; color: var(--rs-text-strong); }
.conn { margin-left: auto; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); padding: 5px 10px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line); color: var(--rs-text); }
.conn::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--rs-ink); vertical-align: 1px; }
.conn.bad { border-color: var(--rs-danger); color: var(--rs-danger); }
.conn.bad::before { background: var(--rs-danger); border-radius: 1px; }
.fs { width: 36px; height: 36px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line); background: transparent; color: var(--rs-text-strong); font-size: 16px; }

.tabs { display: flex; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; }
.tabs button { flex: 1; height: 36px; border: 0; background: transparent; color: var(--rs-text); font-weight: var(--rs-weight-medium); font-size: var(--rs-text-sm); }
.tabs button + button { border-left: 1px solid var(--rs-line-strong); }
.tabs button[aria-selected='true'] { background: var(--rs-ink); color: var(--rs-on-ink); }

.stop {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  min-height: 56px; border: 0; border-radius: var(--rs-radius-lg);
  background: var(--rs-danger); color: var(--rs-on-danger);
  font-size: 1.15rem; font-weight: var(--rs-weight-bold); letter-spacing: 0.02em;
}
.stop:active { background: var(--rs-danger-strong); }
.stop:disabled { background: var(--rs-surface-2); color: var(--rs-text-muted); }
.cap { width: 30px; height: 30px; border-radius: 50%; border: 2.5px solid currentColor; background: radial-gradient(circle, currentColor 0 6px, transparent 6.5px); }

/* ---- jog screen: one e-paper display ---- */
.strip {
  display: grid; grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface);
}
.strip > span { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; }
.strip > span + span { background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 50% / 2px 5px repeat-y; }
.strip b { font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.coord { font-family: var(--rs-font-code); font-variant-numeric: tabular-nums; color: var(--rs-text-strong); letter-spacing: -0.02em; }
.strip .coord { font-size: 1.3rem; }
.strip .unhomed .coord { color: var(--rs-text-muted); }

.steps { display: flex; flex-direction: column; gap: 6px; }
.seg { display: flex; align-items: stretch; }
.lbl { width: 30px; display: flex; align-items: center; font-size: var(--rs-text-xs); color: var(--rs-text-muted); }
.seg button { flex: 1; height: 38px; border: 1px solid var(--rs-line-strong); margin-left: -1px; background: transparent; color: var(--rs-text-strong); font-family: var(--rs-font-code); font-size: var(--rs-text-sm); }
.seg button:nth-child(2) { border-radius: var(--rs-radius-md) 0 0 var(--rs-radius-md); margin-left: 0; }
.seg button:last-child { border-radius: 0 var(--rs-radius-md) var(--rs-radius-md) 0; }
.seg button[aria-checked='true'] { background: var(--rs-ink); color: var(--rs-on-ink); }

.keys {
  /* square keys, sized to the phone: three across plus the Z column */
  --key: clamp(60px, calc((100vw - 92px) / 4.3), 92px);
  display: grid; grid-template-columns: auto var(--key); justify-content: space-evenly; align-items: center; gap: 12px; touch-action: none;
  padding: 10px; border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface);
}
.lefty .keys { grid-template-columns: var(--key) auto; }
.lefty .zc { order: -1; }
.xy { display: grid; grid-template-columns: repeat(3, var(--key)); grid-template-rows: repeat(3, var(--key)); gap: 8px; }
.xy .up { grid-area: 1 / 2; } .xy .left { grid-area: 2 / 1; } .xy .hub { grid-area: 2 / 2; } .xy .right { grid-area: 2 / 3; } .xy .down { grid-area: 3 / 2; }
.zc { display: grid; grid-template-rows: var(--key) var(--key) var(--key); grid-template-columns: var(--key); gap: 8px; }
.k {
  border-radius: var(--rs-radius-md);
  border: 1px solid var(--rs-line-strong);
  background: var(--rs-surface);
  color: var(--rs-text-strong);
  font-size: 1.1rem; font-weight: var(--rs-weight-bold); letter-spacing: 0.02em;
  width: var(--key); height: var(--key); padding: 0; touch-action: none;
  transition: background 70ms, color 70ms;
}
/* Dead until Hold is held: solid light grey, label faded */
.k:disabled { background: var(--rs-key-fill); border-color: transparent; color: var(--rs-text-muted); }
/* Live: inverted ink */
.live .k:not(:disabled) { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.k:active:not(:disabled) { transform: scale(0.97); }
.hub { display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--rs-text-muted); min-height: 40px; }
.hub .rs-num { font-size: 1.2rem; }
.hub small { font-size: 10px; }

.enable-row { display: flex; align-items: stretch; gap: 10px; }
.lefty .enable-row { flex-direction: row-reverse; }
.enable {
  flex: 0 0 54%; min-height: 116px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border: 1.5px solid var(--rs-line-strong); border-radius: var(--rs-radius-lg);
  background: var(--rs-key-fill); border-color: transparent;
  color: var(--rs-text-strong); touch-action: none;
}
.ring { width: 34px; height: 34px; border-radius: 50%; border: 2px solid currentColor; display: grid; place-items: center; }
.ring span { width: 12px; height: 12px; border-radius: 50%; background: transparent; transition: background 70ms; }
.lbl-main { font-size: 1.1rem; font-weight: var(--rs-weight-bold); }
.lbl-sub { font-size: var(--rs-text-xs); color: var(--rs-text-muted); text-align: center; padding: 0 10px; }
.enable.held { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.enable.held .ring span { background: currentColor; }
.enable:disabled { color: var(--rs-text-muted); border-style: dashed; }
.enable-help { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; font-size: var(--rs-text-sm); color: var(--rs-text-muted); padding: 4px 0; }
.hand { display: grid; place-items: center; padding: 0; }
.hand svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.hand[aria-pressed='true'] { background: var(--rs-ink); color: var(--rs-on-ink); border-color: var(--rs-ink); }

/* ---- status screen ---- */
.pos { border: 1px solid var(--rs-line); border-radius: var(--rs-radius-lg); background: var(--rs-surface); padding: 12px 18px 16px; }
.pos-head { display: flex; border: 1px solid var(--rs-line-strong); border-radius: var(--rs-radius-md); overflow: hidden; width: fit-content; margin-bottom: 8px; }
.pos-head button { border: 0; background: transparent; color: var(--rs-text); font-size: var(--rs-text-xs); padding: 6px 12px; }
.pos-head button.on { background: var(--rs-ink); color: var(--rs-on-ink); }
.axis { display: flex; align-items: baseline; justify-content: space-between; line-height: 1.1; padding: 4px 0; }
.axis + .axis { background: radial-gradient(var(--rs-dot-faint) 0.9px, transparent 1.1px) 0 0 / 5px 2px repeat-x; }
.axis .a { font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.axis .v { font-size: 2.6rem; }
.axis.unhomed .v { color: var(--rs-text-muted); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions button { flex: 1; min-height: 48px; border-radius: var(--rs-radius-md); border: 1px solid var(--rs-line-strong); background: var(--rs-surface); color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.actions button:disabled { opacity: 0.35; }
.note { font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
</style>
