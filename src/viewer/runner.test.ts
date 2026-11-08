import { describe, expect, it } from 'vitest'
import { FINISH_SECONDS, LAP_END, ringPlace, trotPhase, FRAME_HOP, FRAME_PROUD, FRAME_REAR, FRAME_STAND, FRAME_TROT, STANCE, facesRight, finishPose, framePose, glitching, legAt, trotFrame, trotPose } from './runner'

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
  it('runs round to the left side first, then rears, hops and stands proud there', () => {
    // right side (a quarter round) going away, then across the back
    expect(finishPose(1.2).angle).toBeGreaterThan(0.3)
    expect(finishPose(1.2).angle).toBeLessThan(Math.PI)
    expect(finishPose(3.59).angle).toBeCloseTo(LAP_END, 1)
    // trotting smoothly while it runs
    expect(finishPose(1.2).frame % 1).not.toBe(0)
    expect(finishPose(4.0)).toMatchObject({ frame: FRAME_REAR, angle: LAP_END })
    expect(Math.max(...[4.7, 4.85, 5.0].map((t) => finishPose(t).lift))).toBeGreaterThan(0.25)
    expect([FRAME_HOP, FRAME_STAND]).toContain(finishPose(4.85).frame)
    expect(finishPose(FINISH_SECONDS + 1)).toEqual({ frame: FRAME_PROUD, angle: LAP_END, lift: 0, sparkles: true, face: true })
    expect(finishPose(1.2).face).toBe(false)
    expect(finishPose(4.0).face).toBe(true)
  })
})

describe('trotPhase', () => {
  it('moves smoothly through the trot frames and wraps round', () => {
    expect(trotPhase(0)).toBe(0)
    expect(trotPhase(0.05)).toBeGreaterThan(0)
    expect(trotPhase(0.05) % 1).not.toBe(0)
    expect(Math.max(...Array.from({ length: 200 }, (_, i) => trotPhase(i / 50)))).toBeLessThan(FRAME_TROT.length)
  })
})

describe('facesRight', () => {
  it('follows the way the dial turns, and keeps its way when it stops', () => {
    expect(facesRight(0.01, false)).toBe(true)
    expect(facesRight(-0.01, true)).toBe(false)
    expect(facesRight(0, false)).toBe(false)
  })
})

describe('ringPlace', () => {
  // the camera on +x, looking at the centre with +z up: its right is +y
  const r = (v: number) => Math.round(v) + 0 // + 0 turns -0 into 0
  const heading = (yaw: number) => [r(Math.cos(yaw)), r(Math.sin(yaw))]
  it('runs up the right side going away, and down the left side coming head-on', () => {
    const right = ringPlace(0, Math.PI / 2, 1, 10)
    expect([r(right.x), r(right.y)]).toEqual([0, 10])
    expect(heading(right.yaw)).toEqual([-1, 0]) // away from the camera: seen from behind
    const left = ringPlace(0, LAP_END, 1, 10)
    expect([r(left.x), r(left.y)]).toEqual([0, -10])
    expect(heading(left.yaw)).toEqual([1, 0]) // straight at the camera: head-on
  })
  it('stands at the front, side-on, facing the way it runs', () => {
    expect(heading(ringPlace(0, 0, 1, 10).yaw)).toEqual([0, 1])
    expect(heading(ringPlace(0, 0, -1, 10).yaw)).toEqual([0, -1])
  })
})
