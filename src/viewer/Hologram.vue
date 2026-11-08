<script lang="ts">
import type { HoloDraw } from './hologram'
/**
 * The last file read, kept while its job runs so coming back to the Dashboard doesn't fetch it from the host again.
 * One file at most; dropped when the Dashboard says the job is over (forgetHologram).
 */
let cache: { url: string; draw: HoloDraw; offsets: Uint32Array; material: string | null } | null = null
export function forgetHologram(): void {
  cache = null
}
</script>

<script setup lang="ts">
/**
 * The running job's walls over the Dashboard camera, as turquoise light: the finished part deeper and brighter towards
 * the top, the layer being made now in amber, the rest a faint ghost, standing on a ring. It redraws about once a layer. It turns slowly; drag to turn it, scroll or pinch to zoom. Look only: it reads the job's file once and
 * changes nothing (the look-only test in gcode/parse.test.ts covers this folder).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseInWorker, type ParseJob } from '@/gcode/parseInWorker'
import { FileTooBig } from '@/gcode/run'
import { BUDGET_REDUCED } from './draw'
import { DIAL_PX, DIAL_RING, drawDial } from './dial'
import { FINISH_SECONDS, FRAME_COUNT, FRAME_GLITCH, FRAME_H, FRAME_PROUD, FRAME_STAND, FRAME_W, SPARKLES, drawRunnerStrip, finishPose, glitching, trotFrame } from './runner'
import { HOLO_MAX_BYTES, buildHologram, dialPlace, drawnDone, layerNow, loadHoloGlow, movesDone, saveHoloGlow } from './hologram'
import type { GcodeScene } from './scene'
import { colourOf } from './theme'

const props = defineProps<{
  /** the job file's download address */
  url: string
  /** bytes Klipper has read into it */
  filePosition: number | null
  /** 0..1 through the file, and the toolhead's measured speed in mm/s: written on the dial */
  progress: number | null
  speed: number | null
  /** the print just completed: everything shows done, and the rhino celebrates */
  complete?: boolean
  spin: boolean
  label: string
}>()
const emit = defineEmits<{ failed: [message: string] }>()
/** After a touch or drag stops the turn, it starts again this long after letting go (Mike, Nov 7) */
const RESUME_MS = 3000

const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLDivElement | null>(null)
const reading = ref(false)
const tooBig = ref<number | null>(null)
const problem = ref<string | null>(null)
/** the model is drawn (for tests and screen readers' status) */
const ready = ref(false)
/** bloom: only where the part turns by itself (not the kiosk), and while this viewer leaves it on */
const glow = ref(loadHoloGlow())
function toggleGlow() {
  glow.value = !glow.value
  saveHoloGlow(glow.value)
  void scene?.setBloom(glow.value && props.spin)
}
let scene: GcodeScene | null = null
let observer: ResizeObserver | null = null
let reader: ParseJob | null = null
let current: { draw: HoloDraw; offsets: Uint32Array; material: string | null } | null = null
const dialCanvas = document.createElement('canvas')
dialCanvas.width = dialCanvas.height = DIAL_PX
/** the layer shown as being made now: the scene is only touched when it changes */
let shownLayer = -2

function token(name: string) {
  return colourOf(getComputedStyle(stage.value!).getPropertyValue(name).trim() || '#3ff0dc')
}
function showDone() {
  if (!scene || !current) return
  const d = current.draw
  if (props.complete) {
    shownLayer = -3
    scene.setHologramDone(d.drawnMoves, d.drawnMoves)
    return
  }
  const now = layerNow(d.layerStarts, d.drawnMoves, drawnDone(d.sourceMove, movesDone(current.offsets, props.filePosition)))
  if (now.layer === shownLayer) return
  shownLayer = now.layer
  scene.setHologramDone(now.from, now.to)
}
/** Write the dial again, at most once a second (every 3 s without turning, as on the kiosk): the speed changes all the time */
let dialAt = 0
let dialTimer: ReturnType<typeof setTimeout> | null = null
function showDial() {
  if (!scene || !current?.draw.bounds) return
  const wait = (props.spin ? 1000 : 3000) - (Date.now() - dialAt)
  if (wait > 0) {
    dialTimer ??= setTimeout(() => {
      dialTimer = null
      showDial()
    }, wait)
    return
  }
  dialAt = Date.now()
  const g = dialCanvas.getContext('2d')
  if (!g) return
  const st = getComputedStyle(stage.value!)
  drawDial(g, { progress: props.progress, speed: props.speed, material: current.material }, st.getPropertyValue('--rs-holo-ghost').trim() || '#3ff0dc', {
    ui: st.getPropertyValue('--rs-font-ui').trim() || 'sans-serif',
    mono: st.getPropertyValue('--rs-font-code').trim() || 'monospace',
  })
  const at = dialPlace(current.draw.bounds, DIAL_RING / DIAL_PX)
  const first = !framed
  scene.setDial(dialCanvas, at.x, at.y, at.z, at.size)
  if (first) {
    // The rhino: about as tall as the dial's big words (76 px of DIAL_PX), standing on the ring
    const strip = document.createElement('canvas')
    strip.width = FRAME_COUNT * FRAME_W
    strip.height = FRAME_H
    const colour = st.getPropertyValue('--rs-holo-ghost').trim() || '#3ff0dc'
    const sg = strip.getContext('2d')
    if (sg) drawRunnerStrip(sg, colour)
    scene.setRunner(strip, FRAME_COUNT, sparkleCanvas(colour), { x: at.x, y: at.y, z: at.z, radius: (at.size * DIAL_RING) / DIAL_PX, height: ((76 / DIAL_PX) * at.size) * 1.9 })
    startRunner()
    // Frame the part and its dial together, so the readings at the dial's edge stay in view
    framed = true
    const b = current.draw.bounds
    // the dial's words reach about 0.47 of its width from the centre: a box this size has that circle as its corners
    const h = at.size * 0.34
    scene.setFocus({ min: [at.x - h, at.y - h, at.z], max: [at.x + h, at.y + h, b.max[2]] })
    scene.setView('angle')
  }
}
let framed = false

/** A four-point pixel sparkle */
function sparkleCanvas(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 28
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = colour
    g.fillRect(12, 0, 4, 28)
    g.fillRect(0, 12, 28, 4)
    g.fillStyle = '#ffffff'
    g.fillRect(12, 12, 4, 4)
  }
  return c
}

// ---- the rhino's movement. With the part turning (not the kiosk): a trot while the dial moves, about 9 frames a
// second. At the finish: it rears, hops, runs a lap of the dial, then stands proud among blinking sparkles. On the kiosk or with
// reduced motion it just stands, and stands proud at the finish.
let runTimer: ReturnType<typeof setInterval> | null = null
let finishFrame = 0
let finishStart = 0
function stopRunner() {
  if (runTimer) clearInterval(runTimer)
  runTimer = null
  if (finishFrame) cancelAnimationFrame(finishFrame)
  finishFrame = 0
}
function startRunner() {
  stopRunner()
  if (!scene) return
  if (props.complete) return finish()
  if (!props.spin) return scene.setRunnerPose(FRAME_STAND, 0, 0)
  const t0 = performance.now()
  const seed = Math.random()
  runTimer = setInterval(() => {
    if (!scene || document.hidden) return
    const t = (performance.now() - t0) / 1000
    const moving = Math.abs(scene.runnerMoving) > 1e-5
    scene.setRunnerPose(glitching(t, seed) ? FRAME_GLITCH : moving ? trotFrame(t) : FRAME_STAND, 0, 0)
  }, 70)
}
const sparkleLevels = (t: number) => SPARKLES.map((k) => Math.max(0, Math.sin((t * 1.4 + k.phase) * Math.PI * 2)))
function finish() {
  stopRunner()
  if (!scene) return
  if (!props.spin) return scene.setRunnerPose(FRAME_PROUD, 0, 0, SPARKLES.map(() => 1))
  finishStart = performance.now()
  const step = () => {
    if (!scene) return
    const t = (performance.now() - finishStart) / 1000
    const p = finishPose(t)
    scene.setRunnerPose(p.frame, p.angle, p.lift, p.sparkles ? sparkleLevels(t) : [])
    if (t < FINISH_SECONDS) finishFrame = requestAnimationFrame(step)
    else {
      finishFrame = 0
      // after the lap: the sparkles keep blinking, a few times a second
      runTimer = setInterval(() => {
        if (!scene || document.hidden) return
        scene.setRunnerPose(FRAME_PROUD, 0, 0, sparkleLevels((performance.now() - finishStart) / 1000))
      }, 120)
    }
  }
  finishFrame = requestAnimationFrame(step)
}
function show(c: { draw: HoloDraw; offsets: Uint32Array; material: string | null }) {
  current = c
  if (!scene) return
  shownLayer = -2
  framed = false
  ready.value = true
  scene.setHologram(c.draw, { ghost: token('--rs-holo-ghost'), done: token('--rs-holo-done'), now: token('--rs-holo-now') })
  showDone()
  dialAt = 0
  showDial()
  // the dial's fonts may still be loading: write it again once they're in
  void document.fonts?.ready.then(() => {
    dialAt = 0
    showDial()
  })
  scene.setSpin(props.spin, RESUME_MS)
  void scene.setBloom(glow.value && props.spin)
  // the light bar every 4 s, except on the kiosk and for anyone who asked for less motion
  scene.setScan(props.spin ? 4000 : 0)
}

/** Read the file (unless it's the one already held). Over the size limit it waits to be asked. */
function read(anySize = false) {
  reader?.cancel()
  reader = null
  tooBig.value = null
  problem.value = null
  if (cache?.url === props.url) return show(cache)
  reading.value = true
  const mine = parseInWorker({ url: props.url, maxBytes: anySize ? undefined : HOLO_MAX_BYTES })
  reader = mine
  mine.result.then(
    (p) => {
      if (reader !== mine) return
      reader = null
      reading.value = false
      // Walls only, within the lighter budget: a ghost needs the shape, not every thread, and the kiosk has a camera to draw too
      const draw = buildHologram(p, BUDGET_REDUCED)
      cache = { url: props.url, draw, offsets: p.offsets, material: p.material }
      show(cache)
    },
    (e: Error) => {
      if (reader !== mine) return
      reader = null
      reading.value = false
      if (e instanceof FileTooBig) tooBig.value = e.bytes
      else problem.value = e.message
    },
  )
}

const onVisible = () => {
  if (!document.hidden) scene?.draw()
}
onMounted(async () => {
  try {
    const { GcodeScene } = await import('./scene')
    if (!canvas.value || !stage.value) return
    scene = new GcodeScene(canvas.value, { reduced: !props.spin, onContextChange: () => scene?.draw() })
    const r = stage.value.getBoundingClientRect()
    scene.resize(r.width, r.height)
    observer = new ResizeObserver(([e]) => {
      if (e) scene?.resize(e.contentRect.width, e.contentRect.height)
    })
    observer.observe(stage.value)
    document.addEventListener('visibilitychange', onVisible)
    read()
  } catch (e) {
    emit('failed', (e as Error).message)
  }
})
onBeforeUnmount(() => {
  stopRunner()
  if (dialTimer) clearTimeout(dialTimer)
  reader?.cancel()
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisible)
  scene?.dispose()
  scene = null
})
watch(() => props.url, () => read())
watch(() => props.filePosition, showDone)
watch(() => props.spin, (on) => {
  scene?.setSpin(on)
  scene?.setScan(on ? 4000 : 0)
  startRunner()
})
watch(() => [props.progress, props.speed], showDial)
watch(() => props.complete, () => {
  shownLayer = -2
  showDone()
  startRunner()
})
</script>

<template>
  <div ref="stage" class="holo" :data-ready="ready || undefined">
    <canvas ref="canvas" :class="{ glow: spin && !glow, bloom: spin && glow }" role="img" :aria-label="label" @contextmenu.prevent />
    <button v-if="ready && spin" type="button" class="glow-toggle" :aria-pressed="glow" @click="toggleGlow">{{ glow ? 'Glow on' : 'Glow off' }}</button>
    <p v-if="reading" class="say" role="status">Reading the job's file…</p>
    <p v-else-if="tooBig !== null" class="say">
      The job's file is {{ (tooBig / 1048576).toFixed(0) }} MB. Reading it adds work for the Rhino during the job.
      <button type="button" @click="read(true)">Show the model anyway</button>
    </p>
    <p v-else-if="problem" class="say">No model: {{ problem }}</p>
  </div>
</template>

<style scoped>
.holo { position: relative; width: 100%; height: 100%; min-height: 220px; background: var(--rs-holo-pool); }
canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; cursor: grab; }
/* A soft glow costs the graphics card a little every frame: not on the kiosk */
canvas.glow { filter: drop-shadow(0 0 6px rgb(63 240 220 / 0.35)); }
/* With bloom the scene is drawn on black: screen blending lets black vanish and adds the light over the camera */
canvas.bloom { mix-blend-mode: screen; }
.glow-toggle {
  position: absolute; left: 0; bottom: 0; padding: 3px 10px; font: inherit; font-size: var(--rs-text-xs); color: var(--rs-overlay-text);
  background: var(--rs-overlay-button); border: 1px solid var(--rs-overlay-faint); border-radius: 6px; cursor: pointer;
}
canvas:active { cursor: grabbing; }
.say {
  position: absolute; right: 0; bottom: 0; max-width: 300px; margin: 0;
  font-size: var(--rs-text-xs); color: var(--rs-overlay-muted); text-align: right;
}
.say button {
  display: block; margin: 6px 0 0 auto; padding: 4px 10px; font: inherit; color: var(--rs-overlay-text);
  background: var(--rs-overlay-button); border: 1px solid var(--rs-overlay-faint); border-radius: 6px; cursor: pointer;
}
</style>
