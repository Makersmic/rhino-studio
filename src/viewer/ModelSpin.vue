<script setup lang="ts">
/**
 * The job's parts in 3D, where they sit beside each other, turning slowly, for Job setup's "which toolhead" step. Look only: a drag turns the view
 * and stops the turning; nothing here changes the job or reaches the machine. Built on the same scene as the workspace.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GcodeScene, SceneModel } from './scene'
import { colourOf, watchTheme } from './theme'

const props = defineProps<{
  /** every part, where it sits */
  models: SceneModel[]
  /** the box around them all, for the camera */
  box: { min: [number, number, number]; max: [number, number, number] }
  /** turn by itself (off when the system asks for less motion) */
  spin: boolean
  label: string
}>()
const emit = defineEmits<{
  /** this browser can't draw in 3D */
  failed: [message: string]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLDivElement | null>(null)
const contextLost = ref(false)
let scene: GcodeScene | null = null
let observer: ResizeObserver | null = null
let stopTheme: (() => void) | null = null

function applyColours() {
  if (!stage.value || !scene) return
  const st = getComputedStyle(stage.value)
  scene.setColours({ ink: colourOf(st.color), paper: colourOf(st.backgroundColor) })
}
function show() {
  if (!scene) return
  scene.setModels(props.models, null)
  scene.setFocus(props.box)
  scene.setView('angle')
  scene.setSpin(props.spin)
}
const onVisible = () => {
  if (!document.hidden) scene?.draw()
}

onMounted(async () => {
  try {
    const { GcodeScene } = await import('./scene')
    if (!canvas.value || !stage.value) return
    scene = new GcodeScene(canvas.value, { reduced: false, onContextChange: (l) => (contextLost.value = l) })
    const r = stage.value.getBoundingClientRect()
    scene.resize(r.width, r.height)
    applyColours()
    show()
    observer = new ResizeObserver(([e]) => {
      if (e) scene?.resize(e.contentRect.width, e.contentRect.height)
    })
    observer.observe(stage.value)
    stopTheme = watchTheme(applyColours)
    document.addEventListener('visibilitychange', onVisible)
  } catch (e) {
    emit('failed', (e as Error).message)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stopTheme?.()
  document.removeEventListener('visibilitychange', onVisible)
  scene?.dispose()
  scene = null
})
watch(() => [props.models, props.spin], show)
</script>

<template>
  <div ref="stage" class="stage">
    <canvas ref="canvas" tabindex="0" role="img" :aria-label="label" @contextmenu.prevent />
    <p v-if="contextLost" class="lost" role="status">The browser paused the 3D drawing. It comes back by itself.</p>
  </div>
</template>

<style scoped>
.stage { position: relative; width: 100%; aspect-ratio: 4 / 3; max-height: 260px; overflow: hidden;
  /* The same paper, ink and frame as the workspace in step 3: the 3D shading is worked out from these two colours, so the
     background has to be a solid colour (a dotted pattern reads as no colour, and the part comes out dark) */
  color: var(--rs-text-strong); background: var(--rs-surface); border: 1px solid var(--rs-line); border-radius: 10px; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; cursor: grab; -webkit-touch-callout: none; user-select: none; }
canvas:active { cursor: grabbing; }
canvas:focus-visible { outline: 2px solid var(--rs-text-strong); outline-offset: -2px; }
.lost { position: absolute; left: var(--rs-space-2); bottom: var(--rs-space-2); margin: 0; padding: 2px 6px; font-size: var(--rs-text-xs); color: var(--rs-text-muted); background: var(--rs-surface); border-radius: 4px; }
</style>
