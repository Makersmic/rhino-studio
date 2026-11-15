import { describe, expect, it } from 'vitest'
import { FFT_N, binHz, levelDb, spectrumDb } from './fft'
import { compare, PluckTracker, settle } from './pluck'
import { describeNoise, excess, learnNoise, steadyTones, strongestPeak } from './spectrum'

const SR = 48000
const BH = binHz(SR)

/** a deterministic pseudo-random number in -1..1 so tests don't flake */
function rng(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return (s / 4294967296) * 2 - 1
  }
}

function frame(parts: { hz: number; amp: number; decay?: number; t?: number }[], noise = 0.002, n = FFT_N, seed = 1): Float32Array {
  const r = rng(seed)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = noise * r()
    const time = i / SR
    for (const p of parts) v += p.amp * Math.exp(-(p.decay ?? 0) * time) * Math.sin(2 * Math.PI * p.hz * time + (p.t ?? 0))
    x[i] = v
  }
  return x
}

describe('spectrum and peak', () => {
  it('reads a sine to well under half a hertz', () => {
    for (const hz of [60.3, 118.4, 150, 201.7, 333.3]) {
      const p = strongestPeak(spectrumDb(frame([{ hz, amp: 0.1 }])), BH)!
      expect(Math.abs(p.hz - hz)).toBeLessThan(0.4)
    }
  })
  it('a full-scale sine reads about 0 dB, a tenth about -20', () => {
    const p1 = strongestPeak(spectrumDb(frame([{ hz: 150, amp: 1 }], 0)), BH)!
    const p2 = strongestPeak(spectrumDb(frame([{ hz: 150, amp: 0.1 }], 0)), BH)!
    expect(Math.abs(p1.db)).toBeLessThan(1)
    expect(Math.abs(p2.db + 20)).toBeLessThan(1)
  })
  it('silence has no peak', () => {
    expect(strongestPeak(spectrumDb(new Float32Array(FFT_N)), BH)).toBeNull()
    expect(levelDb(new Float32Array(100))).toBeLessThan(-100)
  })
  it('only looks inside the range', () => {
    const p = strongestPeak(spectrumDb(frame([{ hz: 900, amp: 0.5 }, { hz: 150, amp: 0.01 }])), BH)!
    expect(Math.abs(p.hz - 150)).toBeLessThan(0.5)
  })
})

describe('the room', () => {
  const fan = [{ hz: 120, amp: 0.05 }, { hz: 240, amp: 0.03 }, { hz: 360, amp: 0.02 }]
  const room = () => learnNoise(Array.from({ length: 12 }, (_, i) => spectrumDb(frame(fan, 0.003, FFT_N, i + 1))))

  it('names a fan and its multiples', () => {
    const tones = steadyTones(room(), BH)
    expect(tones.length).toBeGreaterThanOrEqual(3)
    expect(describeNoise(tones)).toMatch(/steady tone at 120 Hz and its multiples/)
  })
  it('says a quiet room is quiet', () => {
    const quiet = learnNoise(Array.from({ length: 12 }, (_, i) => spectrumDb(frame([], 0.003, FFT_N, i + 1))))
    expect(describeNoise(steadyTones(quiet, BH))).toMatch(/quiet/)
  })
  it('subtracts the fan so a pluck near it still stands out', () => {
    const p = room()
    const pluck = spectrumDb(frame([...fan, { hz: 131, amp: 0.05 }], 0.003, FFT_N, 99))
    const ex = strongestPeak(excess(pluck, p), BH)!
    // a pluck 11 Hz from a loud fan tone reads up to about 0.7 Hz off: subtracting the fan bends the peak. Goal is 1 Hz.
    expect(Math.abs(ex.hz - 131)).toBeLessThan(1)
    expect(ex.db).toBeGreaterThan(12)
    // and the fan alone, a fresh frame, stays under the threshold
    const only = strongestPeak(excess(spectrumDb(frame(fan, 0.003, FFT_N, 55)), p), BH)
    expect(only === null || only.db < 12).toBe(true)
  })
})

describe('plucks', () => {
  const room = learnNoise(Array.from({ length: 10 }, (_, i) => spectrumDb(frame([{ hz: 120, amp: 0.04 }], 0.003, FFT_N, i + 1))))
  /** the stream the tracker would see: a fan, then a pluck at `hz` that decays over ~2 s */
  function run(hz: number, start = 1, secs = 6, fps = 8, tr = new PluckTracker(), out: ReturnType<PluckTracker['push']>[] = []) {
    for (let i = 0; i < secs * fps; i++) {
      const t = i / fps
      const age = t - start
      const parts: { hz: number; amp: number }[] = [{ hz: 120, amp: 0.04 }]
      if (age >= 0) parts.push({ hz, amp: 0.08 * Math.exp(-1.6 * age) })
      const ex = strongestPeak(excess(spectrumDb(frame(parts, 0.003, FFT_N, 200 + i)), room), BH)
      const c = tr.push(t, ex)
      if (c) out.push(c)
    }
    const end = tr.push(secs + 1, null)
    if (end) out.push(end)
    return out
  }
  it('captures a decaying pluck with its pitch', () => {
    const got = run(147.2)
    expect(got).toHaveLength(1)
    expect(Math.abs(got[0]!.hz - 147.2)).toBeLessThan(0.6)
    expect(got[0]!.length).toBeGreaterThan(0.5)
  })
  it('does not capture the fan alone, however long it runs', () => {
    const tr = new PluckTracker()
    const got: ReturnType<PluckTracker['push']>[] = []
    for (let i = 0; i < 100; i++) {
      const c = tr.push(i / 8, strongestPeak(excess(spectrumDb(frame([{ hz: 120, amp: 0.04 }], 0.003, FFT_N, 300 + i)), room), BH))
      if (c) got.push(c)
    }
    expect(got).toHaveLength(0)
  })
  it('ignores a tone that never dies, until it stops', () => {
    const tr = new PluckTracker({ riseDb: 12, steadyFraction: 0.015, minSeconds: 0.5, maxSeconds: 2 })
    const loud = { hz: 200, db: 30 }
    let caught = 0
    for (let i = 0; i < 80; i++) if (tr.push(i / 8, loud)) caught++
    expect(caught).toBe(0)
    expect(tr.push(11, null)).toBeNull()
    for (let i = 0; i < 6; i++) tr.push(12 + i / 8, { hz: 150, db: 20 })
    expect(tr.push(13, null)?.hz).toBeCloseTo(150, 0)
  })
  it('a click that is not a steady pitch is not a reading', () => {
    const tr = new PluckTracker()
    const hzs = [90, 310, 140, 420, 75]
    let got = 0
    hzs.forEach((hz, i) => tr.push(i / 8, { hz, db: 25 }) && got++)
    expect(got + (tr.push(2, null) ? 1 : 0)).toBe(0)
  })
  it('three plucks that agree settle; ones that do not, do not', () => {
    expect(settle([118.2, 118.9, 118.5])).toBeCloseTo(118.5, 1)
    expect(settle([118, 125, 118.5])).toBeNull()
    expect(settle([118, 118.1])).toBeNull()
    expect(settle([90, 118.2, 118.9, 118.5])).toBeCloseTo(118.5, 1)
  })
})

describe('comparing belts', () => {
  it('matching belts pass', () => {
    const c = compare(118, 120)
    expect(c.within).toBe(true)
    expect(c.lower).toBeNull()
  })
  it('names the lower belt', () => {
    const c = compare(120, 111)
    expect(c.within).toBe(false)
    expect(c.lower).toBe('b')
    expect(c.text).toMatch(/Belt two is 7\.5 % lower/)
    expect(compare(100, 120).lower).toBe('a')
  })
})
