import { describe, expect, it } from 'vitest'
import { FINISH_SECONDS, FRAME_HOP, FRAME_PROUD, FRAME_REAR, FRAME_STAND, FRAME_TROT, STANCE, facesRight, finishPose, framePose, glitching, legAt, trotFrame, trotPose } from './runner'

describe('legAt', () => {
  it('is planted and straight, sweeping back, for most of the stride', () => {
    const a = legAt(0.05)
    const b = legAt(STANCE - 0.05)
    expect(a.fold).toBe(0)
    expect(b.fold).toBe(0)
    expect(a.swing).toBeGreaterThan(b.swing)
  })
  it('folds its lower half only while it swings forward', () => {
    const mid = legAt(STANCE + (1 - STANCE) / 2)
    expect(mid.fold).toBeGreaterThan(0.5)
  })
})

describe('trotPose', () => {
  it('moves diagonal pairs together, and always has a pair planted', () => {
    for (let k = 0; k < 24; k++) {
      const [backFar, backNear, frontFar, frontNear] = trotPose(k / 24).legs
      expect(backNear).toEqual(frontFar)
      expect(backFar).toEqual(frontNear)
      expect(backNear.fold === 0 || backFar.fold === 0).toBe(true)
    }
  })
  it('drops onto each step: lowest mid-stance, twice a stride', () => {
    const rises = Array.from({ length: 48 }, (_, k) => trotPose(k / 48).rise)
    const low = rises.indexOf(Math.min(...rises)) / 48
    expect(Math.abs(low - STANCE / 2)).toBeLessThan(0.03)
    expect(trotPose(STANCE / 2 + 0.5).rise).toBeCloseTo(Math.min(...rises), 1)
    expect(Math.max(...rises)).toBeGreaterThan(2.5)
  })
})

describe('framePose', () => {
  it('rears nose up with the front legs lifted, and stands proud with the head a little up', () => {
    expect(framePose(FRAME_REAR).tip).toBeGreaterThan(0.2)
    expect(framePose(FRAME_REAR).legs[3].fold).toBeGreaterThan(0.5)
    expect(framePose(FRAME_PROUD).tip).toBeGreaterThan(0)
    expect(framePose(FRAME_STAND).tip).toBe(0)
  })
})

describe('trotFrame', () => {
  it('cycles through the trot', () => {
    const seen = new Set(Array.from({ length: 80 }, (_, i) => trotFrame(i / 80)))
    expect([...seen].sort((a, b) => a - b)).toEqual(FRAME_TROT)
  })
})

describe('glitching', () => {
  it('is brief and rare', () => {
    const samples = Array.from({ length: 7000 }, (_, i) => glitching(i / 1000))
    const share = samples.filter(Boolean).length / samples.length
    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThan(0.03)
  })
})

describe('finishPose', () => {
  it('rears, hops, then runs a lap, then stands proud', () => {
    expect(finishPose(0.5).frame).toBe(FRAME_REAR)
    expect(Math.max(...[1.3, 1.45, 1.6].map((t) => finishPose(t).lift))).toBeGreaterThan(0.25)
    expect([FRAME_HOP, FRAME_STAND]).toContain(finishPose(1.45).frame)
    expect(finishPose(4.5).angle).toBeGreaterThan(1)
    expect(finishPose(6.19).angle).toBeCloseTo(Math.PI * 2, 1)
    expect(finishPose(FINISH_SECONDS + 1)).toEqual({ frame: FRAME_PROUD, angle: 0, lift: 0, sparkles: true })
  })
})

describe('facesRight', () => {
  it('follows the way the dial turns, and keeps its way when it stops', () => {
    expect(facesRight(0.01, false)).toBe(true)
    expect(facesRight(-0.01, true)).toBe(false)
    expect(facesRight(0, false)).toBe(false)
  })
})
