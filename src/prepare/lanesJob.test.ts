import { describe, expect, it } from 'vitest'
import { CHANGES_LOTS, LANES_SLICE_READY, changeBudget, engineLanes, estimateChanges, purgeMode, temperatureNotes, laneCount, laneNotices, lanesUsed, materialsOfLane, normalizeLanes, supportLanes, type JobLanes, type LaneUse } from './lanesJob'
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

describe('normalizeLanes keeps the other lanes’ filament options', () => {
  it('only for lanes after the first, as plain text, and drops them when there are none', () => {
    const r = normalizeLanes({ materials: [], settings: [{ a: '1' }, { extrusion_multiplier: '0.9', bad: 'x\ny', 'bad key': '1' }] }, sf, 2)!
    expect(r.settings).toEqual([{}, { extrusion_multiplier: '0.9' }])
    expect(normalizeLanes({ settings: [{}, {}] }, sf, 2)!.settings).toBeUndefined()
    expect(normalizeLanes({ settings: 'x' }, sf, 2)!.settings).toBeUndefined()
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
  it('lets a job in two lanes through now the slice is built', () => {
    expect(LANES_SLICE_READY).toBe(true)
    expect(laneNotices(use({ partLanes: [0, 1] })).blocks).toEqual([])
  })
  it("support marks can't go with parts in different lanes yet", () => {
    expect(laneNotices(use({ partLanes: [0, 1], hasMarks: true })).blocks.join(' ')).toContain('Support marks')
    expect(laneNotices(use({ partLanes: [1, 1], hasMarks: true })).blocks).toEqual([])
    expect(laneNotices(use({ engine: 'kiri', partLanes: [1, 1], hasMarks: true })).blocks).toEqual([])
  })
  it('warns when the supports come from the other lane, and points to interface-only (PrusaSlicer)', () => {
    const n = laneNotices(use({ supportsOn: true, lanes: lanes({ supportLane: 1 }) })).notes.join(' ')
    expect(n).toContain('a lot of changes')
    expect(n).toContain('only the interface layers')
    expect(laneNotices(use({ engine: 'kiri', supportsOn: true, lanes: lanes({ supportLane: 1 }) })).notes.join(' ')).not.toContain('only the interface layers')
    expect(laneNotices(use({ supportsOn: true, lanes: lanes({ interfaceLane: 1 }) })).notes.join(' ')).not.toContain('a lot of changes')
  })
})

describe('purgeMode', () => {
  it('is the job’s choice, the tower by default', () => {
    expect(purgeMode(use({ partLanes: [0, 1] }))).toEqual({ mode: 'tower', forced: false })
    expect(purgeMode(use({ partLanes: [0, 1], lanes: lanes({ purge: 'machine' }) }))).toEqual({ mode: 'machine', forced: false })
  })
  it('Kiri:Moto can build its tower with supports from another lane', () => {
    expect(purgeMode(use({ engine: 'kiri', supportsOn: true, lanes: lanes({ supportLane: 1 }), partLanes: [0] }))).toEqual({ mode: 'tower', forced: false })
  })
  it('is the machine when supports or the interface print from another lane than their part (PrusaSlicer has no tower then)', () => {
    expect(purgeMode(use({ supportsOn: true, lanes: lanes({ interfaceLane: 1 }), partLanes: [0] }))).toEqual({ mode: 'machine', forced: true })
    expect(purgeMode(use({ supportsOn: true, lanes: lanes({ supportLane: 1, purge: 'tower' }), partLanes: [0] }))).toEqual({ mode: 'machine', forced: true })
    expect(purgeMode(use({ supportsOn: true, lanes: lanes({ supportLane: 1 }), partLanes: [1] }))).toEqual({ mode: 'tower', forced: false })
    expect(purgeMode(use({ supportsOn: false, lanes: lanes({ supportLane: 1 }), partLanes: [0] }))).toEqual({ mode: 'tower', forced: false })
  })
})

describe('the change budget (numbers from the Nov 22 test slices)', () => {
  const sized = (o: Partial<LaneUse> = {}) => use({ layerHeight: 0.2, ...o })
  it('has nothing to say without sizes or on one lane', () => {
    expect(estimateChanges(use())).toBeNull()
    expect(estimateChanges(sized({ count: 1, lanes: undefined, partHeights: [10] }))).toBeNull()
    expect(changeBudget(sized({ partHeights: [10, 10], partLanes: [0, 0] }))).toBeNull()
  })
  it('counts about one change per layer the two lanes share', () => {
    // an 8 mm part in lane 1 and a 14 mm part in lane 2: they share 40 layers (the probe made 42 changes)
    expect(estimateChanges(sized({ partHeights: [8, 14], partLanes: [0, 1] }))).toBe(40)
    expect(estimateChanges(sized({ partHeights: [14, 14], partLanes: [0, 1] }))).toBe(70)
  })
  it('puts supports from the other lane on every layer of the part (probe: 133 for a 26 mm part)', () => {
    const n = estimateChanges(sized({ partHeights: [26], partLanes: [0], supportsOn: true, lanes: lanes({ supportLane: 1 }) }))!
    expect(n).toBe(130)
    expect(changeBudget(sized({ partHeights: [26], partLanes: [0], supportsOn: true, lanes: lanes({ supportLane: 1 }) }))!.level).toBe('many')
  })
  it('keeps interface layers alone on the other lane cheap (probe: 5)', () => {
    const u = sized({ partHeights: [26], partLanes: [0], supportsOn: true, lanes: lanes({ interfaceLane: 1 }) })
    expect(estimateChanges(u)).toBe(5)
    expect(changeBudget(u)!.level).toBe('ok')
  })
  it('flags a lot', () => {
    const u = sized({ partHeights: [60, 60], partLanes: [0, 1] })
    expect(estimateChanges(u)!).toBeGreaterThan(CHANGES_LOTS)
    expect(changeBudget(u)!.level).toBe('lots')
  })
  it('is shown beside the purge choice, not repeated in the notes under Prepare', () => {
    const u = sized({ partHeights: [60, 60], partLanes: [0, 1] })
    expect(laneNotices(u).notes.join(' ')).not.toContain('lane changes')
  })
})

describe('temperature notes', () => {
  const t = (a: [number, number], b: [number, number]) => use({ partLanes: [0, 1], temps: [{ extruder: a[0], bed: a[1] }, { extruder: b[0], bed: b[1] }] })
  it('says nothing for similar lanes or one lane', () => {
    expect(temperatureNotes(t([200, 60], [205, 60]))).toEqual([])
    expect(temperatureNotes(use({ temps: [{ extruder: 200, bed: 60 }, { extruder: 240, bed: 70 }] }))).toEqual([])
  })
  it('warns when the nozzle temperatures are 15° apart or more, and when the bed temperatures differ', () => {
    const n = temperatureNotes(t([200, 60], [240, 70]))
    expect(n[0]).toContain('Lane 1 prints at 200° and Lane 2 at 240°')
    expect(n[1]).toContain('different bed temperatures (60° and 70°)')
  })
})
