import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BODY, LEG, bodyFolds, buildRhino, loft } from './rhino3d'
import { FRAME_REAR, framePose, trotPose } from './runner'

const box = (r: ReturnType<typeof buildRhino>) => {
  r.group.updateMatrixWorld(true)
  return new Box3().setFromObject(r.group)
}
const footZ = (r: ReturnType<typeof buildRhino>, i: number) => r.feet()[i]!

describe('loft', () => {
  it('makes a closed skin through its stations', () => {
    const g = loft([{ x: 0, bottom: 0, top: 1, w: 0.5 }, { x: 1, bottom: 0, top: 1, w: 0.5 }, { x: 2, bottom: 0, top: 1, w: 0.5 }], { around: 8, steps: 1 })
    g.computeBoundingBox()
    expect(g.boundingBox!.min.x).toBeCloseTo(0)
    expect(g.boundingBox!.max.x).toBeCloseTo(2)
    expect(g.boundingBox!.max.z).toBeCloseTo(1)
    expect(g.index!.count % 3).toBe(0)
  })
})

describe('the rhino', () => {
  it('has a rump lower and narrower than its shoulders (not a big rear end)', () => {
    const rump = BODY.filter((s) => s.x < -0.2)
    const shoulders = BODY.filter((s) => s.x > 0 && s.x < 0.4)
    expect(Math.max(...rump.map((s) => s.top))).toBeLessThan(Math.max(...shoulders.map((s) => s.top)) - 0.1)
    expect(Math.max(...rump.map((s) => s.w))).toBeLessThan(Math.max(...shoulders.map((s) => s.w)))
  })

  it('stands on the ground, about a shoulder height tall and short-bodied, facing +x', () => {
    const r = buildRhino('#3ff0dc')
    r.setPose(framePose(12))
    const b = box(r)
    expect(b.min.z).toBeGreaterThan(-0.02)
    expect(b.min.z).toBeLessThan(0.02)
    expect(b.max.z).toBeGreaterThan(0.95)
    expect(b.max.z).toBeLessThan(1.15)
    // a quarter shorter in the body than a real white rhino (about 2.1-2.3 shoulder heights nose to tail)
    expect(b.max.x - b.min.x).toBeGreaterThan(1.5)
    expect(b.max.x - b.min.x).toBeLessThan(1.95)
    // the head and horns are at the front
    expect(b.max.x).toBeGreaterThan(-b.min.x)
    r.dispose()
  })

  it('lifts a swinging foot and keeps a planted one on the ground as it trots', () => {
    const r = buildRhino('#3ff0dc')
    const p = trotPose(0.1)
    r.setPose(p)
    const zs = [0, 1, 2, 3].map((i) => footZ(r, i))
    const planted = p.legs.map((l) => l.fold === 0)
    zs.forEach((z, i) => (planted[i] ? expect(z).toBeLessThan(0.06) : expect(z).toBeGreaterThan(0.02)))
    r.dispose()
  })

  it('rears up with its front off the ground', () => {
    const r = buildRhino('#3ff0dc')
    r.setPose(framePose(FRAME_REAR))
    expect(footZ(r, 2)).toBeGreaterThan(0.2)
    expect(footZ(r, 3)).toBeGreaterThan(0.2)
    expect(footZ(r, 0)).toBeLessThan(0.08)
    r.dispose()
  })
})

describe('the build (Mike, Nov 7)', () => {
  it('has its hind legs right at the back, as long as the front ones, and every foot on the ground', () => {
    expect(LEG.back.upper + LEG.back.lower).toBeCloseTo(LEG.front.upper + LEG.front.lower)
    expect(LEG.back.upper + LEG.back.lower).toBeCloseTo(LEG.back.hipZ)
    expect(LEG.back.x).toBeLessThan(BODY[0]!.x + 0.15)
    const r = buildRhino('#3ff0dc')
    r.setPose(framePose(12))
    r.feet().forEach((z) => expect(Math.abs(z)).toBeLessThan(0.02))
    r.dispose()
  })
})

describe('skin folds', () => {
  it('raise a ridge behind the shoulder and in front of the hip on the sides, with a crease beside each', () => {
    expect(bodyFolds(0.07, 0.36, 0.95)).toBeGreaterThan(0.015) // the shoulder ridge, low on the side
    expect(bodyFolds(0.07 - 0.042, 0.36, 0.95)).toBeLessThan(-0.008) // its crease just behind
    expect(bodyFolds(-0.2, 0.27, 0.88)).toBeGreaterThan(0.012) // in front of the hind leg too
    expect(bodyFolds(-0.2 + 0.038, 0.27, 0.88)).toBeLessThan(-0.006) // with its crease in front
  })
  it('stay off the spine, fade out before the belly, and leave the rump alone', () => {
    expect(Math.abs(bodyFolds(0.07, 0, 0.95))).toBeLessThan(0.001)
    expect(Math.abs(bodyFolds(-0.2, 0, 0.88))).toBeLessThan(0.001)
    // and well off the back: nothing until about halfway down the side
    expect(Math.abs(bodyFolds(0.07, 0.18, 0.95))).toBeLessThan(0.001)
    expect(Math.abs(bodyFolds(-0.2, 0.15, 0.88))).toBeLessThan(0.001)
    expect(Math.abs(bodyFolds(0.19, 0.3, 0.3))).toBeLessThan(0.001)
    expect(Math.abs(bodyFolds(-0.4, 0.3, 0.8))).toBeLessThan(0.001)
  })
})
