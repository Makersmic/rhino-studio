import { describe, expect, it } from 'vitest'
import { DONE_POSE, POSES, TOOL_STEP_POSE, TROUBLE_POSE, TUNING_POSE, poseUrl } from './mascot'
import { STEP_POSE } from '@/hardware/wizard'
import { CUT_WIZARDS } from '@/tuning/cutTests'
import { WIZARDS } from '@/tuning/tuning'

describe('wizard mascot', () => {
  it('has a picture for every pose', () => {
    for (const p of POSES) expect(poseUrl(p), p).not.toBe('')
  })
  it('gives every wizard step and tuning test a pose that exists', () => {
    const used = [...Object.values(STEP_POSE), ...Object.values(TOOL_STEP_POSE), DONE_POSE, TROUBLE_POSE]
    for (const p of used) expect(POSES).toContain(p)
    for (const t of [...WIZARDS.map((w) => w.test), ...CUT_WIZARDS.map((w) => w.test)]) expect(POSES, t).toContain(TUNING_POSE[t])
  })
  it('never puts the shocked rhinos on a normal step', () => {
    const calm = [...Object.values(STEP_POSE), ...Object.values(TOOL_STEP_POSE), ...Object.values(TUNING_POSE), DONE_POSE]
    expect(calm).not.toContain('shocked')
    expect(calm).not.toContain('zapped')
  })
})
