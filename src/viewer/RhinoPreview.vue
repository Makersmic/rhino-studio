<script setup lang="ts">
/**
 * The hologram's rhino, large, for the Style guide: it trots on the spot, or plays the finish round its ring exactly as
 * the Dashboard does (runner.ts finishPose and ringPlace). Drag to turn it. It draws only while shown, and stops when
 * the page is hidden or left.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AdditiveBlending, Mesh, MeshBasicMaterial, PerspectiveCamera, RingGeometry, Scene, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildRhino, type Rhino3d } from './rhino3d'
import { FINISH_SECONDS, FRAME_PROUD, FRAME_STAND, LAP_END, finishPose, framePose, ringPlace, trotPhase } from './runner'

const canvas = ref<HTMLCanvasElement | null>(null)
const mode = ref<'trot' | 'finish' | 'stand'>('trot')
/** as on the Dashboard: the ring is about 3.1 shoulder heights out from the dial's centre */
const RADIUS = 3.1

let renderer: WebGLRenderer | null = null
let camera: PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let scene: Scene | null = null
let rhino: Rhino3d | null = null
let frame = 0
let started = 0
let observer: ResizeObserver | null = null

function size() {
  if (!renderer || !camera || !canvas.value) return
  const w = canvas.value.clientWidth
  const h = canvas.value.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
}

function tick(now: number) {
  frame = requestAnimationFrame(tick)
  if (!renderer || !scene || !camera || !rhino || document.hidden) return
  const t = (now - started) / 1000
  const camAz = Math.atan2(camera.position.y, camera.position.x)
  let angle = 0
  let lift = 0
  let face = false
  if (mode.value === 'trot') rhino.setPose(framePose(trotPhase(t)))
  else if (mode.value === 'stand') rhino.setPose(framePose(FRAME_STAND))
  else {
    const p = t < FINISH_SECONDS + 1.5 ? finishPose(t) : { frame: FRAME_PROUD, angle: LAP_END, lift: 0, face: true }
    rhino.setPose(framePose(p.frame))
    angle = p.angle
    lift = p.lift
    face = p.face
  }
  if (mode.value === 'finish') {
    const at = ringPlace(camAz, angle, 1, RADIUS)
    rhino.group.position.set(at.x, at.y, lift)
    const want = face ? Math.atan2(camera.position.y - at.y, camera.position.x - at.x) : at.yaw
    // turn smoothly, as the Dashboard does
    const d = Math.atan2(Math.sin(want - rhino.group.rotation.z), Math.cos(want - rhino.group.rotation.z))
    rhino.group.rotation.z += Math.sign(d) * Math.min(Math.abs(d), 0.1)
  } else rhino.group.position.set(0, 0, 0)
  controls?.update()
  renderer.render(scene, camera)
}

/** close for the trot; further back for the finish, so the whole ring is in view */
function frameFor(m: 'trot' | 'finish' | 'stand') {
  if (!camera) return
  const dir = camera.position.clone().normalize()
  camera.position.copy(dir.multiplyScalar(m === 'finish' ? 11 : 6))
}
function play(m: 'trot' | 'finish' | 'stand') {
  mode.value = m
  started = performance.now()
  frameFor(m)
  if (m === 'finish' && rhino && camera) rhino.group.rotation.z = Math.atan2(camera.position.y, camera.position.x) + Math.PI / 2
}

onMounted(() => {
  if (!canvas.value) return
  const colour = getComputedStyle(canvas.value).getPropertyValue('--rs-holo-ghost').trim() || '#3ff0dc'
  renderer = new WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  scene = new Scene()
  camera = new PerspectiveCamera(32, 2, 0.1, 100)
  camera.up.set(0, 0, 1)
  camera.position.set(4.6, -3.2, 2.2).setLength(6)
  controls = new OrbitControls(camera, canvas.value)
  controls.target.set(0, 0, 0.45)
  controls.enablePan = false
  rhino = buildRhino(colour)
  rhino.setFrame(0, 1)
  rhino.group.rotation.z = Math.atan2(camera.position.y, camera.position.x) + Math.PI / 2
  scene.add(rhino.group)
  // the dial's ring, faintly, so the lap reads
  const ring = new Mesh(new RingGeometry(RADIUS - 0.02, RADIUS + 0.02, 96), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }))
  scene.add(ring)
  observer = new ResizeObserver(size)
  observer.observe(canvas.value)
  size()
  started = performance.now()
  frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  controls?.dispose()
  rhino?.dispose()
  scene?.traverse((o) => {
    if (o instanceof Mesh && o.geometry instanceof RingGeometry) {
      o.geometry.dispose()
      ;(o.material as MeshBasicMaterial).dispose()
    }
  })
  renderer?.dispose()
})
</script>

<template>
  <div class="rhino-preview">
    <canvas ref="canvas" role="img" aria-label="The hologram's rhino, in 3D" />
    <div class="modes" role="group" aria-label="What the rhino does">
      <button v-for="m in (['trot', 'finish', 'stand'] as const)" :key="m" type="button" :aria-pressed="mode === m" @click="play(m)">
        {{ m === 'trot' ? 'Trot' : m === 'finish' ? 'Play the finish' : 'Stand' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.rhino-preview { position: relative; border-radius: var(--rs-radius-md); overflow: hidden; background: var(--rs-holo-backdrop); }
canvas { display: block; width: 100%; height: 340px; touch-action: none; cursor: grab; }
.modes { position: absolute; left: var(--rs-space-3); bottom: var(--rs-space-3); display: flex; gap: var(--rs-space-2); flex-wrap: wrap; }
.modes button {
  font: inherit; font-size: var(--rs-text-sm); color: var(--rs-overlay-text);
  background: var(--rs-overlay-button); border: 1px solid var(--rs-overlay-faint); border-radius: var(--rs-radius-sm); padding: 4px 10px; cursor: pointer;
}
.modes button[aria-pressed='true'] { border-color: var(--rs-holo-ghost); color: var(--rs-holo-ghost); }
@media (max-width: 719px) { canvas { height: 260px; } }
</style>
