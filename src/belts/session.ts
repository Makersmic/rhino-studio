/**
 * Belt guide: one listening session. It takes sound from any source (the camera's microphone, the 7050's input
 * later, or the built-in self-test), keeps the room's profile, and turns each frame into what the screen draws.
 * Plain TypeScript so the tests can drive it with scripted sound. Nothing here can reach the machine.
 */
import { FFT_N, binHz, levelDb, spectrumDb } from './fft'
import { PluckTracker, type Capture } from './pluck'
import { HI_HZ, LO_HZ, describeNoise, excess, learnNoise, steadyTones, strongestPeak, type NoiseProfile, type Peak } from './spectrum'

export interface SoundSource {
  sampleRate: number
  /** fills buf with the most recent samples */
  read(buf: Float32Array): void
}

export interface Frame {
  t: number
  /** loudness of the whole frame, dB relative to full scale */
  level: number
  /** the part of the spectrum between lo and hi, bottom (lo) first: the room-subtracted one once the room is learned */
  spec: Float32Array
  /** what `spec` is in: raw dBFS, or dB above the room */
  mode: 'raw' | 'excess'
  /** the tone to show as "hearing": the strongest, if it is clearly there */
  hearing: Peak | null
  /** the pitch being followed as a pluck right now */
  tracking: number | null
  capture: Capture | null
}

/** In raw mode a peak must be louder than this (dBFS amplitude) to be shown as heard */
export const HEAR_RAW_DB = -70
/** In room-subtracted mode, this many dB above the room */
export const HEAR_EXCESS_DB = 12
export const LEARN_SECONDS = 5

export class ListenSession {
  profile: NoiseProfile | null = null
  readonly tracker = new PluckTracker()
  readonly bh: number
  readonly k0: number
  readonly k1: number
  private buf = new Float32Array(FFT_N)
  private learn: Float32Array[] | null = null

  constructor(
    private src: SoundSource,
    readonly lo = LO_HZ,
    readonly hi = HI_HZ,
  ) {
    this.bh = binHz(src.sampleRate)
    this.k0 = Math.ceil(lo / this.bh)
    this.k1 = Math.floor(hi / this.bh)
  }

  get learning(): boolean {
    return this.learn !== null
  }

  startLearning(): void {
    this.learn = []
  }

  /** Stops learning and keeps the profile; says in words what the room sounds like. */
  finishLearning(): string {
    const frames = this.learn ?? []
    this.learn = null
    if (frames.length < 3) throw new Error('Not enough sound to learn the room: is the sound on?')
    this.profile = learnNoise(frames)
    return describeNoise(steadyTones(this.profile, this.bh, this.lo, this.hi))
  }

  forgetRoom(): void {
    this.profile = null
    this.learn = null
  }

  tick(t: number): Frame {
    this.src.read(this.buf)
    const level = levelDb(this.buf)
    const raw = spectrumDb(this.buf)
    if (this.learn) this.learn.push(raw)
    const mode = this.profile ? 'excess' : 'raw'
    const shown = this.profile ? excess(raw, this.profile) : raw
    const peak = strongestPeak(shown, this.bh, this.lo, this.hi)
    const hearing = peak && peak.db >= (this.profile ? HEAR_EXCESS_DB : HEAR_RAW_DB) ? peak : null
    // plucks are only followed once the room is known: without it a fan would look like a belt
    const capture = this.profile ? this.tracker.push(t, peak) : null
    return {
      t,
      level,
      spec: shown.slice(this.k0, this.k1 + 1),
      mode,
      hearing,
      tracking: this.profile ? this.tracker.current : null,
      capture,
    }
  }
}
