<script setup lang="ts">
/**
 * The Dashboard's sound (Mike, Nov 9): a tap starts the camera's microphone (browsers only play sound after a tap),
 * a slider sets this screen's volume, another tap stops it. Stops when the page is left or hidden.
 * `overlay`: drawn on the camera picture, in the Dashboard's white overlay style.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMicStore } from '@/stores/mic'

defineProps<{ overlay?: boolean }>()
const mic = useMicStore()
const audio = ref<HTMLAudioElement | null>(null)

watch(
  () => mic.stream,
  (s) => {
    const a = audio.value
    if (!a) return
    a.srcObject = s
    if (s) void a.play().catch(() => (mic.error = 'This browser blocked the sound: tap Sound again.'))
  },
)
watch(() => mic.volume, (v) => audio.value && (audio.value.volume = v / 100), { immediate: true })
onMounted(() => audio.value && (audio.value.volume = mic.volume / 100))

function toggle() {
  if (mic.state === 'on' || mic.state === 'connecting') mic.stop()
  else void mic.start()
}
const onHidden = () => document.hidden && mic.stop()
onMounted(() => document.addEventListener('visibilitychange', onHidden))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onHidden)
  mic.stop()
  mic.clearError()
})
</script>

<template>
  <div class="mic" :class="{ overlay }" role="group" aria-label="Camera sound">
    <button type="button" class="tog" :aria-pressed="mic.state === 'on'" :title="mic.error ?? undefined" @click="toggle">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        <template v-if="mic.state === 'on'">
          <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </template>
        <path v-else d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span>{{ mic.state === 'on' ? 'Sound on' : mic.state === 'connecting' ? 'Connecting…' : 'Sound off' }}</span>
    </button>
    <input v-if="mic.state === 'on'" v-model.number="mic.volume" type="range" min="0" max="100" step="5" class="vol" aria-label="Camera sound volume" />
    <span v-if="mic.state === 'error'" class="err" role="status">{{ mic.error }}</span>
    <audio ref="audio" autoplay playsinline />
  </div>
</template>

<style scoped>
.mic { display: inline-flex; align-items: center; gap: var(--rs-space-2); flex-wrap: wrap; min-width: 0; }
.tog { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; font: inherit; font-size: var(--rs-text-xs); font-weight: var(--rs-weight-medium); color: var(--rs-text-strong); background: transparent; border: 1px solid var(--rs-line-strong); border-radius: 6px; cursor: pointer; }
.tog[aria-pressed='true'] { background: var(--rs-ink); border-color: var(--rs-ink); color: var(--rs-on-ink); }
.tog:focus-visible { outline: 2px solid var(--rs-text-strong); outline-offset: 2px; }
.vol { width: 110px; accent-color: var(--rs-text-strong); }
.err { font-size: var(--rs-text-xs); color: var(--rs-text-muted); max-width: 46ch; }
/* on the camera picture */
.overlay .tog { color: var(--rs-overlay-text); background: var(--rs-overlay-button); border-color: var(--rs-overlay-faint); text-shadow: none; }
.overlay .tog[aria-pressed='true'] { background: var(--rs-overlay-text); color: var(--rs-cam-bg); border-color: var(--rs-overlay-text); }
.overlay .tog:focus-visible { outline-color: var(--rs-overlay-text); }
.overlay .vol { accent-color: var(--rs-overlay-text); }
.overlay .err { color: var(--rs-overlay-muted); }
</style>
