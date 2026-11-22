import { describe, expect, it } from 'vitest'
import { MAX_LANES, cleanLinks, linkAllowed, materialFamily, resizeLanes, runoutChain, type LaneInfo } from './laneKeys'

const lane = (material: string | null, runoutSensor = true): LaneInfo => ({ material, runoutSensor })

describe('materialFamily', () => {
  it('drops the nozzle and the path', () => {
    expect(materialFamily('PLA_0_4_T0')).toBe('PLA')
    expect(materialFamily('petg_0_8_T1')).toBe('PETG')
    expect(materialFamily('PLA_0_4')).toBe('PLA')
    expect(materialFamily('PLA')).toBe('PLA')
    expect(materialFamily(null)).toBeNull()
    expect(materialFamily('')).toBeNull()
  })
})

describe('linkAllowed', () => {
  it('needs the same filament, a sensor and a next lane', () => {
    expect(linkAllowed([lane('PLA_0_4_T0'), lane('PLA_0_4_T1')], 0)).toEqual({ ok: true })
    expect(linkAllowed([lane('PLA_0_4_T0'), lane('PETG_0_4_T1')], 0)).toMatchObject({ ok: false })
    expect(linkAllowed([lane('PLA_0_4_T0', false), lane('PLA_0_4_T1')], 0)).toMatchObject({ ok: false, reason: expect.stringContaining('runout sensor') })
    expect(linkAllowed([lane(null), lane('PLA')], 0)).toMatchObject({ ok: false })
    expect(linkAllowed([lane('PLA')], 0)).toMatchObject({ ok: false })
  })
  it("the last lane's sensor doesn't matter: only the lane being left needs one", () => {
    expect(linkAllowed([lane('PLA', true), lane('PLA', false)], 0)).toEqual({ ok: true })
  })
})

describe('cleanLinks and runoutChain', () => {
  const four = [lane('PLA'), lane('PLA'), lane('PETG'), lane('PETG')]
  it('switches off links that no longer make sense', () => {
    expect(cleanLinks(four, [true, true, true])).toEqual([true, false, true])
    expect(cleanLinks(four, [])).toEqual([false, false, false])
  })
  it('follows linked neighbours in order and stops at the first gap', () => {
    expect(runoutChain(four, [true, false, true], 0)).toEqual([0, 1])
    expect(runoutChain(four, [true, false, true], 2)).toEqual([2, 3])
    const three = [lane('PLA'), lane('PLA'), lane('PLA')]
    expect(runoutChain(three, [true, true], 0)).toEqual([0, 1, 2])
    expect(runoutChain(three, [false, true], 0)).toEqual([0])
  })
})

describe('resizeLanes', () => {
  it('keeps what is set, adds empty lanes and stops at the limit', () => {
    const r = resizeLanes([lane('PLA')], 3)
    expect(r).toHaveLength(3)
    expect(r[0]!.material).toBe('PLA')
    expect(r[2]).toEqual({ material: null, runoutSensor: false })
    expect(resizeLanes(r, 99)).toHaveLength(MAX_LANES)
    expect(resizeLanes(r, 0)).toHaveLength(1)
  })
})
