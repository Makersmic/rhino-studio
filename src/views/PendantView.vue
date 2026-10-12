<script setup lang="ts">
/**
 * Pendant mode: the phone as a jog pendant at the machine.
 *
 * Same safety gates as Control (it uses the same store):
 * - motion is locked until you unlock it; it relocks after 60 s idle, when
 *   the screen turns off or you switch apps, on disconnect, Klipper restart,
 *   job start, tool swap or tool change;
 * - one tap = one fixed step. There is no hold-to-move, so a lost touch or a
 *   dropped Wi-Fi packet can never leave the machine moving;
 * - Stop is always on screen and never asks.
 * Wizard questions (e.g. CNC_JOB_SETUP asking you to jog to the stock
 * origin) pop up here too, so you can answer them from the phone.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BrandMark from '@/brand/BrandMark.vue'
import ToolheadBadge from '@/toolheads/ToolheadBadge.vue'
import { useControlStore } from '@/stores/control'
import { useMachineStore } from '@/stores/machine'
import type { Axis } from '@/control/commands'

const control = useControlStore()
const machine = useMachineStore()

const XY_STEPS = [0.1, 1, 10, 50]
const Z_STEPS = [0.05, 0.1, 1, 10]
const xy = ref(1)
const z = ref(0.1)
const coords = ref<'work' | 'machine'>('work')

const armed = computed(() => control.motionUnlocked && !control.motionBlock)
const homed = computed(() => machine.position.homed.toLowerCase())
const can = (a: Axis) => armed.value && homed.value.includes(a.toLowerCase())

const shown = computed(() => {
  const g = machine.status.gcode_move?.gcode_position
  const work = Array.isArray(g) ? (g as number[]) : null
  return coords.value === 'work' && work ? work : machine.position.xyz
})
const fmt = (n: number | undefined) => (n == null ? '—' : n.toFixed(2))

function jog(a: Axis, d: number) {
  navigator.vibrate?.(12)
  void control.jog(a, d)
}

// Stop: same as the top bar's, big
const stopState = ref<'idle' | 'sent' | 'failed'>('idle')
async function stop() {
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

// Keep the screen on while the pendant is open (works over HTTPS or localhost)
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
const onVisible = () => !document.hidden && keepAwake()
onMounted(() => {
  void keepAwake()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  control.lockMotion()
  document.removeEventListener('visibilitychange', onVisible)
  void wake?.release().catch(() => {})
})

const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {})
</script>

<template>
  <div class="pendant" :class="{ armed }">
    <header class="top">
      <RouterLink to="/control" class="exit" aria-label="Leave pendant mode"><BrandMark :size="26" :show-name="false" /></RouterLink>
      <ToolheadBadge :look="machine.mountedLook" :verified="machine.mountedVerified" size="sm" />
      <span class="conn" :class="machine.klippyReady ? 'ok' : 'bad'">{{ machine.klippyReady ? 'Ready' : machine.connection === 'online' ? `Klipper ${machine.klippy}` : 'Offline' }}</span>
      <button type="button" class="fs" aria-label="Full screen" @click="fullscreen">⤢</button>
    </header>

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

    <section class="arm">
      <button v-if="!armed" type="button" class="unlock" :disabled="!!control.motionBlock" @click="control.unlockMotion()">
        {{ control.motionBlock ?? 'Unlock motion' }}
      </button>
      <button v-else type="button" class="relock" @click="control.lockMotion()">
        Unlocked · locks in {{ control.unlockSecondsLeft }} s · tap to lock
      </button>
    </section>

    <section class="pad" :class="{ off: !armed }">
      <div class="xy">
        <button class="k up" :disabled="!can('Y')" @click="jog('Y', xy)">Y+</button>
        <button class="k left" :disabled="!can('X')" @click="jog('X', -xy)">X−</button>
        <span class="hub">{{ xy }}</span>
        <button class="k right" :disabled="!can('X')" @click="jog('X', xy)">X+</button>
        <button class="k down" :disabled="!can('Y')" @click="jog('Y', -xy)">Y−</button>
      </div>
      <div class="zc">
        <button class="k" :disabled="!can('Z')" @click="jog('Z', z)">Z+</button>
        <span class="hub">{{ z }}</span>
        <button class="k" :disabled="!can('Z')" @click="jog('Z', -z)">Z−</button>
      </div>
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

    <section class="actions">
      <button type="button" :disabled="!machine.klippyReady || control.jobActive" @click="control.home('all')">Home all</button>
      <button v-if="hasZZero" type="button" :disabled="!machine.klippyReady || control.jobActive" @click="control.send('SET_Z_ZERO', { label: 'Set Z zero' })">Set Z zero</button>
      <button v-if="hasWorkZero" type="button" :disabled="!machine.klippyReady || control.jobActive" @click="setWorkZero">Set work zero</button>
    </section>

    <p v-if="!wakeOk" class="note">This connection can't keep your screen on; raise the phone's auto-lock time.</p>

    <button type="button" class="stop" :disabled="machine.connection === 'offline'" @click="stop">
      <span class="cap" aria-hidden="true" />
      {{ stopState === 'sent' ? 'Stop sent' : stopState === 'failed' ? 'Stop failed: use the machine switch' : 'Stop' }}
    </button>
  </div>
</template>

<style scoped>
.pendant {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  max-width: 520px;
  margin: 0 auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
.top { display: flex; align-items: center; gap: 10px; }
.exit { display: inline-flex; color: var(--rs-text-strong); }
.conn { margin-left: auto; font-size: var(--rs-text-sm); font-weight: var(--rs-weight-medium); padding: 4px 12px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); }
.conn.ok::before, .conn.bad::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--rs-ok); }
.conn.bad::before { background: var(--rs-danger); border-radius: 1px; }
.fs { width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-size: 18px; }

.pos { border-radius: var(--rs-radius-xl); background: var(--rs-paper); color: var(--rs-paper-ink); padding: 10px 18px 12px; }
.pos-head { display: flex; gap: 4px; margin-bottom: 2px; }
.pos-head button { border: 0; background: transparent; color: var(--rs-paper-muted); font-size: var(--rs-text-sm); padding: 4px 10px; border-radius: var(--rs-radius-pill); }
.pos-head button.on { background: var(--rs-paper-ink); color: var(--rs-paper); }
.axis { display: flex; align-items: baseline; justify-content: space-between; line-height: 1.05; }
.axis .a { font-weight: var(--rs-weight-medium); font-size: var(--rs-text-lg); }
.axis .v { font-size: 2.3rem; font-weight: var(--rs-weight-light); letter-spacing: -0.04em; }
.axis.unhomed .v { opacity: 0.4; }

.arm button { width: 100%; min-height: 52px; border-radius: var(--rs-radius-pill); font-weight: var(--rs-weight-bold); font-size: var(--rs-text-md); border: 0; }
.unlock { background: var(--rs-active); color: var(--th-ink); }
.unlock:disabled { background: var(--rs-surface-2); color: var(--rs-text-muted); font-weight: var(--rs-weight-medium); }
.relock { background: var(--rs-warn-fill); color: var(--th-ink); }

.pad { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; transition: opacity var(--rs-dur); }
.pad.off { opacity: 0.35; }
.xy { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, minmax(60px, 1fr)); gap: 8px; aspect-ratio: 1.08; }
.xy .up { grid-area: 1 / 2; } .xy .left { grid-area: 2 / 1; } .xy .hub { grid-area: 2 / 2; } .xy .right { grid-area: 2 / 3; } .xy .down { grid-area: 3 / 2; }
.zc { display: grid; grid-template-rows: 1fr auto 1fr; gap: 8px; height: 100%; width: 84px; }
.k { border: 0; border-radius: 20px; background: var(--rs-surface-2); color: var(--rs-text-strong); font-size: 1.3rem; font-weight: var(--rs-weight-bold); min-height: 64px; }
.armed .k:not(:disabled) { background: var(--rs-active); color: var(--th-ink); }
.k:active:not(:disabled) { transform: scale(0.97); }
.k:disabled { opacity: 0.6; }
.hub { display: grid; place-items: center; border-radius: 50%; border: 1.5px dashed var(--rs-line-strong); font-family: var(--rs-font-code); color: var(--rs-text-muted); min-height: 44px; }

.steps { display: flex; flex-direction: column; gap: 6px; }
.seg { display: flex; align-items: center; gap: 6px; }
.lbl { width: 26px; font-size: var(--rs-text-sm); color: var(--rs-text-muted); }
.seg button { flex: 1; height: 42px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-family: var(--rs-font-code); }
.seg button[aria-checked='true'] { background: var(--rs-text-strong); color: var(--rs-bg); border-color: transparent; }

.actions { display: flex; gap: 8px; }
.actions button { flex: 1; min-height: 46px; border-radius: var(--rs-radius-pill); border: 1.5px solid var(--rs-line-strong); background: transparent; color: var(--rs-text-strong); font-weight: var(--rs-weight-medium); }
.actions button:disabled { opacity: 0.4; }
.note { font-size: var(--rs-text-xs); color: var(--rs-text-muted); }

.stop {
  margin-top: auto;
  position: sticky;
  bottom: calc(8px + env(safe-area-inset-bottom));
  box-shadow: 0 0 0 8px var(--rs-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 72px;
  border: 0;
  border-radius: var(--rs-radius-pill);
  background: var(--rs-danger);
  color: var(--rs-on-danger);
  font-size: 1.4rem;
  font-weight: var(--rs-weight-bold);
  font-stretch: 112%;
}
.stop:active { background: var(--rs-danger-strong); }
.stop:disabled { background: var(--rs-surface-2); color: var(--rs-text-muted); }
.cap { width: 40px; height: 40px; border-radius: 50%; border: 3px solid currentColor; background: radial-gradient(circle, currentColor 0 9px, transparent 9.5px); }
</style>
