<script lang="ts">
import type { DrawData } from './draw'
/**
 * The last file read, kept while its job runs so coming back to the Dashboard doesn't fetch it from the host again.
 * One file at most; dropped when the Dashboard says the job is over (forgetHologram).
 */
let cache: { url: string; draw: DrawData; offsets: Uint32Array } | null = null
export function forgetHologram(): void {
  cache = null
}
</script>

<script setup lang="ts">
/**
 * The running job's toolpath over the Dashboard camera, in turquoise: the finished part deeper and solid, the rest a
 * pale ghost. It turns slowly; drag to turn it, scroll or pinch to zoom. Look only: it reads the job's file once and
 * changes nothing (the look-only test in gcode/parse.test.ts covers this folder).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseInWorker, type ParseJob } from '@/gcode/parseInWorker'
import { FileTooBig } from '@/gcode/run'
import { BUDGET_REDUCED, buildDraw } from './draw'
import { HOLO_MAX_BYTES, drawnDone, layerStartOf, movesDone } from './hologram'
import type { GcodeScene } from './scene'
import { colourOf } from './theme'

const props = defineProps<{
  /** the job file's download address */
  url: string
  /** bytes Klipper has read into it */
  filePosition: number | null
  spin: boolean
  label: string
}>()
const emit = defineEmits<{ failed: [message: string] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLDivElement | null>(null)
const reading = ref(false)
const tooBig = ref<number | null>(null)
const problem = ref<string | null>(null)
let scene: GcodeScene | null = null
let observer: ResizeObserver | null = null
let reader: ParseJob | null = null
let current: { draw: DrawData; offsets: Uint32Array } | null = null

function token(name: string) {
  return colourOf(getComputedStyle(stage.value!).getPropertyValue(name).trim() || '#8ff7ec')
}
function showDone() {
  if (!scene || !current) return
  const done = drawnDone(current.draw.sourceMove, movesDone(current.offsets, props.filePosition))
  scene.setHologramDone(done, layerStartOf(current.draw.layerStarts, done))
}
function show(c: { draw: DrawData; offsets: Uint32Array }) {
  current = c
  if (!scene) return
  scene.setHologram(c.draw, { ghost: token('--rs-holo-ghost'), done: token('--rs-holo-done') })
  showDone()
  scene.setSpin(props.spin)
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
      // The lighter budget always: a ghost needs the shape, not every thread, and the kiosk has a camera to draw too
      const draw = buildDraw(p, BUDGET_REDUCED)
      cache = { url: props.url, draw, offsets: p.offsets }
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
  reader?.cancel()
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisible)
  scene?.dispose()
  scene = null
})
watch(() => props.url, () => read())
watch(() => props.filePosition, showDone)
watch(() => props.spin, (on) => scene?.setSpin(on))
</script>

<template>
  <div ref="stage" class="holo">
    <canvas ref="canvas" :class="{ glow: spin }" role="img" :aria-label="label" @contextmenu.prevent />
    <p v-if="reading" class="say" role="status">Reading the job's file…</p>
    <p v-else-if="tooBig !== null" class="say">
      The job's file is {{ (tooBig / 1048576).toFixed(0) }} MB. Reading it adds work for the Rhino during the job.
      <button type="button" @click="read(true)">Show the model anyway</button>
    </p>
    <p v-else-if="problem" class="say">No model: {{ problem }}</p>
  </div>
</template>

<style scoped>
.holo { position: relative; width: 100%; height: 100%; min-height: 220px; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; cursor: grab; }
/* A soft glow costs the graphics card a little every frame: not on the kiosk */
canvas.glow { filter: drop-shadow(0 0 6px rgb(143 247 236 / 0.35)); }
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
