import { describe, expect, it } from 'vitest'
import { FFT_N } from './fft'
import { ListenSession, type SoundSource } from './session'

const SR = 48000

/** a scripted microphone: a fan, hiss, and a plucked belt from `pluckAt` seconds */
function mic(hz: number, pluckAt: number, clock: { t: number }): SoundSource {
  let seed = 3
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1
  return {
    sampleRate: SR,
    read(buf) {
      const t0 = clock.t - FFT_N / SR
      for (let i = 0; i < buf.length; i++) {
        const t = t0 + i / SR
        let v = 0.003 * rnd() + 0.04 * Math.sin(2 * Math.PI * 120 * t) + 0.025 * Math.sin(2 * Math.PI * 240 * t)
        const age = t - pluckAt
        if (age >= 0) v += 0.08 * Math.exp(-1.6 * age) * Math.sin(2 * Math.PI * hz * age)
        buf[i] = v
      }
    },
  }
}

describe('a listening session', () => {
  it('learns the fan, then finds a pluck and nothing else', () => {
    const clock = { t: 2 }
    const s = new ListenSession(mic(147.2, 8, clock))
    // before the room is known the fan is simply the loudest thing, and no pluck is followed
    expect(s.tick(clock.t).hearing?.hz).toBeCloseTo(120, 0)
    expect(s.tick(clock.t).capture).toBeNull()

    s.startLearning()
    for (let i = 0; i < 40; i++) {
      clock.t += 0.125
      s.tick(clock.t)
    }
    expect(s.learning).toBe(true)
    expect(s.finishLearning()).toMatch(/steady tone at 120 Hz and its multiples/)
    expect(s.learning).toBe(false)

    const caught: number[] = []
    let quietHearing = 0
    for (let i = 0; i < 100; i++) {
      clock.t += 0.125
      const f = s.tick(clock.t)
      if (clock.t < 8 && f.hearing) quietHearing++
      if (f.capture) caught.push(f.capture.hz)
    }
    // one more silent frame past the end closes a run that was still ringing
    expect(quietHearing).toBe(0)
    expect(caught).toHaveLength(1)
    expect(caught[0]).toBeCloseTo(147.2, 0)
  })

  it('refuses to learn the room from too little sound', () => {
    const s = new ListenSession(mic(150, 99, { t: 2 }))
    s.startLearning()
    s.tick(2)
    expect(() => s.finishLearning()).toThrow(/Not enough sound/)
  })

  it('slices the spectrum to the guide range', () => {
    const s = new ListenSession(mic(150, 99, { t: 2 }))
    const f = s.tick(2)
    expect(f.spec.length).toBe(s.k1 - s.k0 + 1)
    expect(s.k0 * s.bh).toBeGreaterThanOrEqual(19)
    expect(s.k1 * s.bh).toBeLessThanOrEqual(501)
  })
})
