/**
 * Belt guide (Mike, Nov 15): the spectrum maths. Plain TypeScript, no libraries, nothing here touches the machine.
 * A radix-2 FFT with a Hann window; the output is the amplitude spectrum in dB relative to a full-scale sine
 * (a sine of amplitude 1 reads about 0 dB at its own frequency).
 */

export const FFT_N = 16384

const hanns = new Map<number, Float32Array>()
/** Hann window of length n (cached) */
export function hann(n: number): Float32Array {
  let w = hanns.get(n)
  if (!w) {
    w = new Float32Array(n)
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
    hanns.set(n, w)
  }
  return w
}

const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array }>()
function twiddle(n: number) {
  let t = twiddles.get(n)
  if (!t) {
    const cos = new Float64Array(n / 2)
    const sin = new Float64Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n)
      sin[i] = -Math.sin((2 * Math.PI * i) / n)
    }
    t = { cos, sin }
    twiddles.set(n, t)
  }
  return t
}

/** In-place FFT of re/im (length a power of two) */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  const { cos, sin } = twiddle(n)
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const step = n / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step]!
        const s = sin[k * step]!
        const a = i + k
        const b = a + half
        const rb = re[b]!
        const ib = im[b]!
        const tr = rb * c - ib * s
        const ti = rb * s + ib * c
        re[b] = re[a]! - tr
        im[b] = im[a]! - ti
        re[a] = re[a]! + tr
        im[a] = im[a]! + ti
      }
    }
  }
}

/** The tiniest amplitude we report, so silence is -180 dB and not minus infinity */
export const FLOOR_DB = -180

/** Amplitude spectrum in dB of the last `n` samples of x (bins 0..n/2). n must be a power of two. */
export function spectrumDb(x: ArrayLike<number>, n: number = FFT_N): Float32Array {
  const win = hann(n)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  const off = Math.max(x.length - n, 0)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const w = win[i]!
    re[i] = (x[off + i] ?? 0) * w
    sum += w
  }
  fft(re, im)
  const out = new Float32Array(n / 2 + 1)
  for (let k = 0; k <= n / 2; k++) {
    const a = (2 * Math.hypot(re[k]!, im[k]!)) / sum
    out[k] = a > 1e-9 ? 20 * Math.log10(a) : FLOOR_DB
  }
  return out
}

/** Hz per bin */
export const binHz = (sampleRate: number, n: number = FFT_N) => sampleRate / n

/** Loudness of the last frame in dB relative to full scale (RMS), for the level meter */
export function levelDb(x: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!
  const rms = Math.sqrt(s / Math.max(x.length, 1))
  return rms > 1e-9 ? 20 * Math.log10(rms) : FLOOR_DB
}
