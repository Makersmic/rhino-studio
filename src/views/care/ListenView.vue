<script setup lang="ts">
/**
 * Care › Microphone test (belt guide, batch A, Mike Nov 15). Listens to the camera's microphone and draws a live
 * spectrogram, so we can prove the microphone can see a plucked belt before the guide is built on it. Look-only:
 * it sends nothing to the machine. The logic is in src/belts/ (tested); this page only drives it and draws.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import RsButton from '@/components/RsButton.vue'
import RsPanel from '@/components/RsPanel.vue'
import SpectrogramCanvas from '@/belts/SpectrogramCanvas.vue'
import { openFeed, selfTestStream, type Feed, type SelfTest } from '@/belts/audioFeed'
import type { Capture } from '@/belts/pluck'
import { LEARN_SECONDS, ListenSession } from '@/belts/session'
import type { Peak } from '@/belts/spectrum'
import { useMicStore } from '@/stores/mic'

const mic = useMicStore()
const source = ref<'off' | 'mic' | 'self'>('off')
const busy = ref(false)
const err = ref('')
const level = ref(-180)
const hearing = ref<Peak | null>(null)
const tracking = ref<number | null>(null)
const captures = ref<Capture[]>([])
const roomText = ref('')
const learning = ref(false)
const learnLeft = ref(0)
const mode = ref<'raw' | 'excess'>('raw')
const rows = ref(0)
const range = ref({ lo: 20, hi: 500 })
const spg = ref<InstanceType<typeof SpectrogramCanvas> | null>(null)

let feed: Feed | null = null
let self: SelfTest | null = null
let session: ListenSession | null = null
let timer: ReturnType<typeof setInterval> | undefined
let ping: ReturnType<typeof setInterval> | undefined
let learnTimer: ReturnType<typeof setInterval> | undefined
let t0 = 0

const scale = computed(() => (mode.value === 'excess' ? { min: 0, max: 30 } : { min: -100, max: -30 }))
const meter = computed(() => Math.min(Math.max((level.value + 80) / 80, 0), 1) * 100)
const levelWords = computed(() => {
  if (source.value === 'off') return ''
  if (level.value > -3) return 'Too loud: it may be clipping. Lower the input level on the Rhino.'
  if (level.value < -75) return 'Very quiet or silent. Is the sound on, and is the input level up?'
  return 'Level is fine.'
})
const pluckHz = computed(() => (captures.value[0] ? captures.value[0].hz.toFixed(1) : ''))

function tick() {
  if (!session) return
  const f = session.tick((performance.now() - t0) / 1000)
  level.value = f.level
  hearing.value = f.hearing
  tracking.value = f.tracking
  mode.value = f.mode
  spg.value?.push(f.spec)
  if (f.capture) captures.value = [f.capture, ...captures.value].slice(0, 8)
}

async function begin(stream: MediaStream, kind: 'mic' | 'self') {
  feed = await openFeed(stream)
  session = new ListenSession(feed)
  rows.value = session.k1 - session.k0 + 1
  range.value = { lo: session.k0 * session.bh, hi: session.k1 * session.bh }
  source.value = kind
  t0 = performance.now()
  timer = setInterval(tick, 125)
}

async function useMic() {
  stop()
  busy.value = true
  err.value = ''
  try {
    await mic.start()
    if (mic.state !== 'on' || !mic.stream) throw new Error(mic.error ?? 'The camera sound did not start.')
    await begin(mic.stream, 'mic')
  } catch (e) {
    err.value = (e as Error).message
    stop()
  } finally {
    busy.value = false
  }
}

async function useSelf() {
  stop()
  err.value = ''
  self = selfTestStream(150)
  self.ping()
  // a made-up microphone is quiet while the room is being learned, like a real one with nobody plucking
  ping = setInterval(() => !learning.value && self?.ping(), 4000)
  try {
    await begin(self.stream, 'self')
  } catch (e) {
    err.value = (e as Error).message
    stop()
  }
}

function stop() {
  clearInterval(timer)
  clearInterval(ping)
  clearInterval(learnTimer)
  feed?.stop()
  self?.stop()
  mic.stop()
  feed = self = session = null
  source.value = 'off'
  learning.value = false
  hearing.value = null
  tracking.value = null
  level.value = -180
  mode.value = 'raw'
}

function learnRoom() {
  if (!session || learning.value) return
  session.startLearning()
  learning.value = true
  learnLeft.value = LEARN_SECONDS
  roomText.value = ''
  learnTimer = setInterval(() => {
    learnLeft.value -= 1
    if (learnLeft.value > 0) return
    clearInterval(learnTimer)
    try {
      roomText.value = session?.finishLearning() ?? ''
    } catch (e) {
      err.value = (e as Error).message
    }
    learning.value = false
  }, 1000)
}
function forgetRoom() {
  session?.forgetRoom()
  roomText.value = ''
  mode.value = 'raw'
}

const onHidden = () => document.hidden && stop()
document.addEventListener('visibilitychange', onHidden)
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onHidden)
  stop()
  mic.clearError()
})
</script>

<template>
  <div class="listen">
    <RsPanel title="Microphone test" :status="source === 'mic' ? 'Listening to the camera' : source === 'self' ? 'Self-test' : 'Off'">
      <p class="lead">
        The belt guide listens for a plucked belt. Before it does, check that the microphone can hear one. This page only listens: it sends
        nothing to the machine.
      </p>
      <div class="row">
        <RsButton variant="primary" :disabled="busy" @click="useMic">{{ source === 'mic' ? 'Restart on the camera microphone' : 'Listen to the camera microphone' }}</RsButton>
        <RsButton @click="useSelf">Self-test (no microphone)</RsButton>
        <RsButton v-if="source !== 'off'" variant="quiet" @click="stop">Stop</RsButton>
      </div>
      <p v-if="err" class="err" role="alert">{{ err }}</p>

      <template v-if="source !== 'off'">
        <div class="meter" role="img" :aria-label="`Sound level ${Math.round(level)} dB`"><i :style="{ width: meter + '%' }" /></div>
        <p class="small">{{ levelWords }}</p>

        <div class="hear">
          <div>
            <span class="label">Hearing</span>
            <div class="rs-num big">{{ hearing ? hearing.hz.toFixed(1) : '—' }}<small v-if="hearing"> Hz</small></div>
          </div>
          <div>
            <span class="label">Last pluck</span>
            <div class="rs-num big">{{ pluckHz || '—' }}<small v-if="pluckHz"> Hz</small></div>
          </div>
        </div>

        <SpectrogramCanvas
          :key="rows"
          ref="spg"
          :rows="rows"
          :lo="range.lo"
          :hi="range.hi"
          :min="scale.min"
          :max="scale.max"
          :marker="hearing ? hearing.hz : null"
        />
        <p class="small">
          {{ mode === 'excess' ? 'Showing what is louder than the room was. A steady fan has been taken out.' : 'Showing everything the microphone hears.' }}
        </p>

        <div class="row">
          <RsButton :disabled="learning" @click="learnRoom">{{ learning ? `Listening to the room… ${learnLeft}` : 'Learn the room (5 s)' }}</RsButton>
          <RsButton v-if="mode === 'excess'" variant="quiet" @click="forgetRoom">Forget the room</RsButton>
        </div>
        <p v-if="roomText" class="small" role="status">{{ roomText }}</p>
        <p class="small">Turn the part fan and the driver fans off first if you can, then keep the room still while it learns.</p>

        <ul v-if="captures.length" class="caps" aria-label="Plucks found">
          <li v-for="(c, i) in captures" :key="i"><b class="mono">{{ c.hz.toFixed(1) }}</b> Hz <span class="small">rang {{ c.length.toFixed(1) }} s</span></li>
        </ul>
        <p v-else-if="mode === 'excess'" class="small">Learn the room, then pluck a belt. Each clean pluck shows up here.</p>
      </template>
    </RsPanel>

    <RsPanel title="Tone test">
      <ol class="steps">
        <li>Press <b>Listen to the camera microphone</b>.</li>
        <li>On a phone, play a steady tone near the camera (a tone generator app or a web page): 100 Hz, then 150 Hz, then 200 Hz.</li>
        <li>The <b>Hearing</b> number should match each tone to about 1 Hz, and the line on the spectrogram should sit at it.</li>
        <li>No camera sound at all? Turn it on in Settings › Cameras › Sound, then press the button again.</li>
        <li>Press <b>Self-test</b> any time: it makes a pretend microphone, so you can see the page work without hardware.</li>
      </ol>
    </RsPanel>
  </div>
</template>

<style scoped>
.listen { display: grid; gap: var(--rs-space-3); max-width: 880px; }
.lead { margin: 0 0 var(--rs-space-3); color: var(--rs-text-muted); font-size: var(--rs-text-sm); }
.row { display: flex; gap: var(--rs-space-2); flex-wrap: wrap; margin: var(--rs-space-2) 0; }
.small { font-size: var(--rs-text-xs); color: var(--rs-text-muted); margin: 4px 0 8px; }
.err { color: var(--rs-text-strong); border-left: 3px solid var(--rs-line-strong); padding: 4px 8px; font-size: var(--rs-text-sm); }
.meter { height: 8px; border: 1px solid var(--rs-line-strong); border-radius: 4px; overflow: hidden; margin-top: var(--rs-space-2); }
.meter i { display: block; height: 100%; background: var(--rs-ink); transition: width 0.1s linear; }
.hear { display: flex; gap: 32px; margin: var(--rs-space-3) 0; flex-wrap: wrap; }
.label { display: block; font-size: 12px; font-weight: var(--rs-weight-medium); color: var(--rs-text-muted); }
.big { font-size: 2.4rem; line-height: 1.1; }
.big small { font-family: var(--rs-font-ui); font-weight: var(--rs-weight-medium); font-size: 0.4em; vertical-align: top; }
.mono { font-family: var(--rs-font-code); font-variant-numeric: tabular-nums; }
.caps { list-style: none; padding: 0; margin: var(--rs-space-2) 0 0; display: grid; gap: 2px; font-size: var(--rs-text-sm); }
.steps { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; font-size: var(--rs-text-sm); }
</style>
