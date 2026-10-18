<script setup lang="ts">
/**
 * Shows one camera. Picks the right viewer for the stream type:
 *   MJPEG stream     an <img> pointed at the stream
 *   MJPEG snapshots  fetches a still picture at the camera's frame rate
 *   IP camera        a muted <video>
 *   Web page         a sandboxed <iframe>
 * WebRTC and HLS cameras say so instead (they come later).
 *
 * The Pi 3B serves the stream, so the viewer only pulls frames while it can
 * be seen: it stops when it scrolls out of view, when the tab is hidden or
 * the phone screen goes off, and when the camera changes. Each open viewer
 * is one more stream the Pi has to send.
 *
 * Read-only: a camera can't move or power anything.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { cssAspect, cssTransform, sourceUrl, viewMode, withStamp, type Webcam } from './webcams'
import { useWebcamsStore } from '@/stores/webcams'
import { useNetworkStore } from '@/stores/network'

const props = withDefaults(defineProps<{ cam: Webcam; fit?: 'contain' | 'cover'; fill?: boolean }>(), { fit: 'contain', fill: false })

const webcams = useWebcamsStore()
const root = ref<HTMLElement | null>(null)
const inView = ref(true)
const pageVisible = ref(typeof document === 'undefined' || document.visibilityState !== 'hidden')
const active = computed(() => inView.value && pageVisible.value)

// Settings / Network can turn MJPEG streams into snapshots on phones or a slow link
const net = useNetworkStore()
const asSnapshots = computed(() => viewMode(props.cam.service) === 'mjpeg' && !!props.cam.snapshotUrl && net.camerasAsSnapshots)
const mode = computed(() => (asSnapshots.value ? 'snapshot' : viewMode(props.cam.service)))
const url = computed(() => webcams.url(asSnapshots.value ? props.cam.snapshotUrl : sourceUrl(props.cam)))
const fps = computed(() => (asSnapshots.value ? Math.min(props.cam.targetFps || net.snapshotFps, net.snapshotFps) : props.cam.targetFps || 5))
const transform = computed(() => cssTransform(props.cam))
const aspect = computed(() => cssAspect(props.cam))

type Phase = 'loading' | 'live' | 'error' | 'paused'
const phase = ref<Phase>('loading')
const shown = ref('') // what the <img>/<video> currently points at
let stamp = 0
let timer: ReturnType<typeof setTimeout> | null = null
let preload: HTMLImageElement | null = null

function clear() {
  if (timer) clearTimeout(timer)
  timer = null
  if (preload) {
    preload.onload = preload.onerror = null
    preload.src = ''
    preload = null
  }
}

/** Snapshot mode: fetch the next still, show it, wait, repeat. */
function nextSnapshot() {
  clear()
  const img = new Image()
  preload = img
  const started = performance.now()
  img.onload = () => {
    if (preload !== img) return
    shown.value = img.src
    phase.value = 'live'
    const wait = Math.max(0, 1000 / fps.value - (performance.now() - started))
    timer = setTimeout(nextSnapshot, wait)
  }
  img.onerror = () => {
    if (preload !== img) return
    phase.value = 'error'
    timer = setTimeout(nextSnapshot, 5000)
  }
  img.src = withStamp(url.value, ++stamp)
}

function start() {
  clear()
  if (!active.value) {
    shown.value = '' // closes an MJPEG stream's connection
    phase.value = 'paused'
    return
  }
  if (mode.value === 'unsupported' || !url.value) return
  phase.value = phase.value === 'live' ? 'live' : 'loading'
  if (mode.value === 'snapshot') nextSnapshot()
  else shown.value = mode.value === 'mjpeg' ? withStamp(url.value, ++stamp) : url.value
}

function onLoad() {
  phase.value = 'live'
}
function onError() {
  if (!active.value) return
  phase.value = 'error'
  shown.value = ''
  clear()
  timer = setTimeout(start, 5000) // the camera may come back (crowsnest restarting)
}

const onVisibility = () => (pageVisible.value = document.visibilityState !== 'hidden')
let observer: IntersectionObserver | null = null

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  if ('IntersectionObserver' in window && root.value) {
    observer = new IntersectionObserver(([e]) => (inView.value = !!e?.isIntersecting), { threshold: 0.01 })
    observer.observe(root.value)
  }
  start()
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  observer?.disconnect()
  clear()
  shown.value = ''
})
watch([active, url, mode], () => {
  phase.value = 'loading'
  start()
})
</script>

<template>
  <div ref="root" class="cam" :class="[`fit-${fit}`, { fill }]" :style="fill ? undefined : { aspectRatio: aspect }">
    <img
      v-if="(mode === 'mjpeg' || mode === 'snapshot') && shown"
      class="pic"
      :src="shown"
      :alt="`${cam.name} camera`"
      :style="{ transform, objectFit: fit }"
      @load="onLoad"
      @error="onError"
    />
    <video
      v-else-if="mode === 'video' && shown"
      class="pic"
      :src="shown"
      :style="{ transform, objectFit: fit }"
      autoplay
      muted
      playsinline
      @playing="onLoad"
      @error="onError"
    />
    <iframe
      v-else-if="mode === 'iframe' && active"
      class="pic"
      :src="url"
      :title="`${cam.name} camera`"
      sandbox="allow-scripts allow-same-origin"
      referrerpolicy="no-referrer"
      @load="onLoad"
    />

    <div v-if="mode === 'unsupported'" class="msg">
      <strong>{{ cam.name }}: this stream type isn't supported yet</strong>
      <span>WebRTC and HLS cameras come later. Switch the camera to MJPEG in crowsnest, or set it to "MJPEG stream" in Settings.</span>
    </div>
    <div v-else-if="phase === 'error'" class="msg">
      <strong>{{ cam.name }} isn't answering</strong>
      <span>Trying again every 5 s. Check the camera is plugged in and the address in Settings.</span>
    </div>
    <div v-else-if="phase === 'loading' && mode !== 'iframe'" class="msg quiet"><span>Connecting to {{ cam.name }}…</span></div>
    <div v-else-if="phase === 'paused'" class="msg quiet"><span>Paused while hidden</span></div>

    <slot />
  </div>
</template>

<style scoped>
.cam {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--rs-cam-bg);
  color: var(--rs-overlay-text);
}
.cam.fill { position: absolute; inset: 0; height: 100%; }
.pic { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
.msg {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--rs-space-5);
  text-align: center;
  font-size: var(--rs-text-sm);
  color: var(--rs-overlay-muted);
  background: var(--rs-overlay-dither), var(--rs-cam-bg);
}
.msg strong { color: var(--rs-overlay-text); font-weight: var(--rs-weight-medium); }
.msg span { max-width: 44ch; }
.msg.quiet { background: transparent; }
</style>
