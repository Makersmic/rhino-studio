import { describe, expect, it } from 'vitest'
import { featureColours } from './theme'

describe('featureColours', () => {
  const ink = { r: 0.08, g: 0.09, b: 0.1 }
  const paper = { r: 0.93, g: 0.92, b: 0.9 }
  it('uses the theme’s button colour for supports when it differs from the model’s', () => {
    const teal = { r: 0.1, g: 0.6, b: 0.55 }
    expect(featureColours(ink, teal, paper)).toEqual({ model: ink, support: teal })
  })
  it('washes the model colour towards the paper when the two are alike (ink and paper)', () => {
    const { support } = featureColours(ink, ink, paper)
    expect(support.r).toBeGreaterThan(0.4)
    expect(support.r).toBeLessThan(paper.r)
  })
})
