import { describe, expect, it } from 'vitest'
import { LANES_SLICE_READY, engineLanes, laneCount, laneNotices, lanesUsed, materialsOfLane, normalizeLanes, supportLanes, type JobLanes, type LaneUse } from './lanesJob'
import type { Material } from '@/slicer/profiles'

const m = (key: string, path?: 0 | 1): Material => ({ key, name: key.split('_')[0]!, path })
const sf = [m('PLA_0_4_T0', 0), m('PETG_0_4_T0', 0), m('PLA_0_4_T1', 1), m('PETG_0_4_T1', 1)]
const one = [m('PLA_0_4'), m('PETG_0_4')]

describe('lane count and materials', () => {
  it('counts paths, at least one', () => {
    expect(laneCount(sf)).toBe(2)
    expect(laneCount(one)).toBe(1)
    expect(laneCount([])).toBe(1)
  })
  it("gives a lane its own path's materials, or all of them on a one-lane tool", () => {
    expect(materialsOfLane(sf, 1, 2).map((x) => x.key)).toEqual(['PLA_0_4_T1', 'PETG_0_4_T1'])
    expect(materialsOfLane(one, 0, 1)).toHaveLength(2)
  })
})

describe('normalizeLanes', () => {
  it('has no lanes for a one-lane tool', () => expect(normalizeLanes({}, one, 1)).toBeUndefined())
  it('fills each lane with its first material and keeps valid choices', () => {
    expect(normalizeLanes(undefined, sf, 2)).toEqual({ materials: ['PLA_0_4_T0', 'PLA_0_4_T1'], supportLane: null, interfaceLane: null })
    const keep = normalizeLanes({ materials: ['PETG_0_4_T0', 'PETG_0_4_T1'], supportLane: 1, interfaceLane: 1 }, sf, 2)!
    expect(keep).toEqual({ materials: ['PETG_0_4_T0', 'PETG_0_4_T1'], supportLane: 1, interfaceLane: 1 })
  })
  it("drops a material that isn't that lane's and lanes that don't exist", () => {
    const r = normalizeLanes({ materials: ['PETG_0_4_T1', 'nope'], supportLane: 5, interfaceLane: -1 }, sf, 2)!
    expect(r.materials).toEqual(['PLA_0_4_T0', 'PLA_0_4_T1'])
    expect(r.supportLane).toBeNull()
    expect(r.interfaceLane).toBeNull()
  })
})

const lanes = (o: Partial<JobLanes> = {}): JobLanes => ({ materials: ['PLA_0_4_T0', 'PETG_0_4_T1'], supportLane: null, interfaceLane: null, ...o })
const use = (o: Partial<LaneUse> = {}): LaneUse => ({ engine: 'prusa', count: 2, partLanes: [0], supportsOn: false, lanes: lanes(), ...o })

describe('lanes in use', () => {
  it('is lane 1 for a one-lane tool or a plain job', () => {
    expect(lanesUsed(use({ count: 1, lanes: undefined }))).toEqual([0])
    expect(lanesUsed(use())).toEqual([0])
  })
  it('adds the parts', () => expect(lanesUsed(use({ partLanes: [0, 1] }))).toEqual([0, 1]))
  it('adds the support and interface lanes only when supports are on', () => {
    expect(lanesUsed(use({ lanes: lanes({ supportLane: 1 }) }))).toEqual([0])
    expect(lanesUsed(use({ supportsOn: true, lanes: lanes({ supportLane: 1 }) }))).toEqual([0, 1])
    expect(lanesUsed(use({ supportsOn: true, lanes: lanes({ interfaceLane: 1 }) }))).toEqual([0, 1])
  })
  it("Kiri has no interface filament: it follows the supports", () => {
    expect(supportLanes(use({ engine: 'kiri', supportsOn: true, lanes: lanes({ supportLane: 1, interfaceLane: 0 }) }))).toEqual({ support: 1, interface: 1 })
    expect(supportLanes(use({ supportsOn: true, lanes: lanes({ supportLane: 1, interfaceLane: 0 }) }))).toEqual({ support: 1, interface: 0 })
    expect(engineLanes('kiri').partsOnLanes).toBe(false)
  })
})

describe('lane notices', () => {
  it('says nothing for a one-lane tool', () => expect(laneNotices(use({ count: 1, lanes: undefined }))).toEqual({ blocks: [], notes: [] }))
  it('is fine on one lane', () => expect(laneNotices(use()).blocks).toEqual([]))
  it('blocks Kiri with parts in different lanes', () => {
    expect(laneNotices(use({ engine: 'kiri', partLanes: [0, 1] })).blocks.join(' ')).toContain('whole job from one lane')
    expect(laneNotices(use({ engine: 'prusa', partLanes: [0, 1] })).blocks.join(' ')).not.toContain('whole job')
  })
  it('asks for a filament in every lane in use', () => {
    const r = laneNotices(use({ partLanes: [1], lanes: { materials: ['PLA_0_4_T0', null], supportLane: null, interfaceLane: null } }))
    expect(r.blocks).toContain('Choose a filament for lane 2.')
  })
  it('holds back a job in two lanes until the slice is built', () => {
    expect(LANES_SLICE_READY).toBe(false)
    expect(laneNotices(use({ partLanes: [0, 1] })).blocks.join(' ')).toContain('can’t be sliced yet')
    expect(laneNotices(use({ partLanes: [1] })).blocks).toEqual([])
  })
  it('warns when the supports come from the other lane, and points to interface-only (PrusaSlicer)', () => {
    const n = laneNotices(use({ supportsOn: true, lanes: lanes({ supportLane: 1 }) })).notes.join(' ')
    expect(n).toContain('a lot of changes')
    expect(n).toContain('only the interface layers')
    expect(laneNotices(use({ engine: 'kiri', supportsOn: true, lanes: lanes({ supportLane: 1 }) })).notes.join(' ')).not.toContain('only the interface layers')
    expect(laneNotices(use({ supportsOn: true, lanes: lanes({ interfaceLane: 1 }) })).notes.join(' ')).not.toContain('a lot of changes')
  })
})
