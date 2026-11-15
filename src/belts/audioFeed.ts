/**
 * Belt guide: the browser side of listening. Takes a MediaStream (the camera's WebRTC sound, see webcams/mic.ts)
 * into the Web Audio analyser. The stream is a remote one, so no microphone permission and no HTTPS are needed.
 * The analyser is NOT connected to the speakers: the guide listens silently.
 *
 * Chrome only feeds a remote WebRTC stream into Web Audio once the same stream is attached to a media element, so
 * a muted <audio> carries it. Unproven on the Rhino until BT0 passes on the machine.
 */
import { FFT_N } from './fft'
import type { SoundSource } from './session'

export interface Feed extends SoundSource {
  stop: () => void
}

export async function openFeed(stream: MediaStream): Promise<Feed> {
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const el = new Audio()
  el.muted = true
  el.srcObject = stream
  void el.play().catch(() => undefined)
  const src = ctx.createMediaStreamSource(stream)
  const an = ctx.createAnalyser()
  an.fftSize = FFT_N
  an.smoothingTimeConstant = 0
  src.connect(an)
  return {
    sampleRate: ctx.sampleRate,
    read: (buf) => an.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>),
    stop: () => {
      el.srcObject = null
      void ctx.close().catch(() => undefined)
    },
  }
}

export interface SelfTest {
  stream: MediaStream
  /** one decaying tone, like a plucked belt */
  ping: () => void
  stop: () => void
}

/** A made-up microphone: quiet hiss, and a decaying tone on request. Proves the page and the maths without any hardware. */
export function selfTestStream(hz = 150): SelfTest {
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  const hiss = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = hiss.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.004
  const noise = ctx.createBufferSource()
  noise.buffer = hiss
  noise.loop = true
  noise.connect(dest)
  noise.start()
  const osc = ctx.createOscillator()
  osc.frequency.value = hz
  const env = ctx.createGain()
  env.gain.value = 0
  osc.connect(env).connect(dest)
  osc.start()
  return {
    stream: dest.stream,
    ping: () => {
      const t = ctx.currentTime
      env.gain.cancelScheduledValues(t)
      env.gain.setValueAtTime(0.08, t)
      env.gain.exponentialRampToValueAtTime(0.0005, t + 2.5)
    },
    stop: () => void ctx.close().catch(() => undefined),
  }
}
