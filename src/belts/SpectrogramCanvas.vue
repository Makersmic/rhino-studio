<script setup lang="ts">
/**
 * A scrolling spectrogram (Mike, Nov 15): time runs left to right, frequency up the side, paper to ink for louder.
 * `push(column)` adds one column; the picture shifts left by a pixel. Look-only: nothing here reaches the machine.
 * The marker and the axis are HTML so they follow the theme.
 */
import { onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{ rows: number; lo: number; hi: number; min: number; max: number; marker?: number | null; target?: number | null }>(),
  { marker: null, target: null },
)

const cv = ref<HTMLCanvasElement | null>(null)
const W = 640
let ctx: CanvasRenderingContext2D | null = null
let paper = [237, 235, 229]
let ink = [21, 22, 24]
let colourAt = 0

function rgbOf(v: string, fallback: number[]): number[] {
  const m = v.match(/(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback
}
function colours() {
  const el = cv.value
  if (!el) return
  const probe = document.createElement('span')
  el.parentElement?.appendChild(probe)
  probe.style.color = 'var(--rs-surface)'
  paper = rgbOf(getComputedStyle(probe).color, paper)
  probe.style.color = 'var(--rs-ink)'
  ink = rgbOf(getComputedStyle(probe).color, ink)
  probe.remove()
  colourAt = Date.now()
}

onMounted(() => {
  const el = cv.value
  if (!el) return
  el.width = W
  el.height = props.rows
  ctx = el.getContext('2d', { willReadFrequently: false })
  colours()
  clear()
})

function clear() {
  if (!ctx) return
  ctx.fillStyle = `rgb(${paper.join(',')})`
  ctx.fillRect(0, 0, W, props.rows)
}

function push(col: Float32Array) {
  if (!ctx || !cv.value) return
  if (Date.now() - colourAt > 2000) colours()
  ctx.drawImage(cv.value, -1, 0)
  const img = ctx.createImageData(1, props.rows)
  const span = props.max - props.min
  for (let i = 0; i < props.rows; i++) {
    const v = Math.min(Math.max(((col[Math.min(i, col.length - 1)] ?? props.min) - props.min) / span, 0), 1)
    const y = props.rows - 1 - i
    for (let c = 0; c < 3; c++) img.data[y * 4 + c] = Math.round(paper[c]! + (ink[c]! - paper[c]!) * v)
    img.data[y * 4 + 3] = 255
  }
  ctx.putImageData(img, W - 1, 0)
}

const at = (hz: number) => `${(1 - (hz - props.lo) / (props.hi - props.lo)) * 100}%`
const ticks = () => {
  const out: number[] = []
  for (let f = Math.ceil(props.lo / 100) * 100; f <= props.hi; f += 100) out.push(f)
  return out
}
defineExpose({ push, clear })
</script>

<template>
  <div class="spg">
    <canvas ref="cv" class="cv" aria-label="Spectrogram: sound over time, frequency up the side" role="img" />
    <div v-for="f in ticks()" :key="f" class="tick" :style="{ top: at(f) }"><span>{{ f }} Hz</span></div>
    <div v-if="target" class="line target" :style="{ top: at(target) }"><span>target {{ target.toFixed(1) }} Hz</span></div>
    <div v-if="marker" class="line mark" :style="{ top: at(marker) }"><span>{{ marker.toFixed(1) }} Hz</span></div>
  </div>
</template>

<style scoped>
.spg { position: relative; width: 100%; border: 1px solid var(--rs-line-strong); border-radius: 6px; overflow: hidden; background: var(--rs-surface); }
.cv { display: block; width: 100%; height: 300px; image-rendering: auto; }
.tick { position: absolute; left: 0; right: 0; border-top: 1px dotted var(--rs-line-strong); pointer-events: none; }
.tick span { position: absolute; left: 4px; top: 1px; font-size: 10px; color: var(--rs-text-muted); background: var(--rs-surface); padding: 0 3px; border-radius: 3px; }
.line { position: absolute; left: 0; right: 0; pointer-events: none; }
.line span { position: absolute; right: 4px; top: -9px; font: 600 11px/1 var(--rs-font-mono, monospace); padding: 2px 4px; border-radius: 3px; }
.mark { border-top: 2px solid var(--rs-text-strong); }
.mark span { background: var(--rs-ink); color: var(--rs-on-ink); }
.target { border-top: 2px dashed var(--rs-text-strong); }
.target span { background: var(--rs-surface); color: var(--rs-text-strong); border: 1px solid var(--rs-text-strong); }
@media (max-width: 720px) { .cv { height: 220px; } }
</style>
