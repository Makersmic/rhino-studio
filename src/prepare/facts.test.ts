import { describe, expect, it } from 'vitest'
import { prettyMaterial, toolFacts } from './facts'
import { materialsFor } from '@/slicer/profiles'
import { suits } from '@/stores/prepare'
import { DEFAULT_MACHINE } from '@/slicer/types'

describe('tool card facts', () => {
  it('material names read as words', () => {
    expect(prettyMaterial('PLA')).toBe('PLA')
    expect(prettyMaterial('SOFT_WOOD')).toBe('Soft wood')
    expect(prettyMaterial('THIN_FOAM')).toBe('Thin foam')
  })
  it('print heads: files, build volume under the Z limit, materials once each, nozzles', () => {
    const f = toolFacts({ name: 'BlockOne', process: 'fdm' }, materialsFor('BlockOne', null).list, DEFAULT_MACHINE)
    expect(f).toEqual([
      { label: 'Files', value: 'STL · 3MF · OBJ' },
      { label: 'Build', value: '550 × 375 mm × 290 high' },
      { label: 'Materials', value: 'PLA, PETG, ABS, ASA' },
      { label: 'Nozzle', value: '0.4 / 0.8 mm' },
    ])
    const sf = toolFacts({ name: 'SwitchFly', process: 'fdm' }, materialsFor('SwitchFly', null).list, DEFAULT_MACHINE)
    expect(sf.find((x) => x.label === 'Nozzle')?.value).toBe('0.4 mm · 2 filament paths')
  })
  it('no care or slicer wording on any card', () => {
    for (const [name, p] of [['LightSaber', 'laser'], ['HotJoe', 'cnc'], ['DragKnife', 'dragknife']] as const) {
      const text = JSON.stringify(toolFacts({ name, process: p }, materialsFor(name, null).list, DEFAULT_MACHINE))
      expect(text).not.toMatch(/kiri|care|maint/i)
    }
  })
})

describe('which processes a file suits', () => {
  it('flat drawings only cut; 3D models suit everything', () => {
    expect(['fdm', 'laser', 'cnc', 'dragknife'].filter((p) => suits(p as never, true))).toEqual(['laser', 'dragknife'])
    expect(['fdm', 'laser', 'cnc', 'dragknife'].every((p) => suits(p as never, false))).toBe(true)
  })
})
