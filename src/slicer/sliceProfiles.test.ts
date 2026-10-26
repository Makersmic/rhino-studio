import { describe, expect, it } from 'vitest'
import {
  applyProfile, builtinId, builtinProfile, diffSettings, engineOf, isBuiltin, jobSettings, planImport, profileStatus, profilesFor, setJobSettings, statusText,
} from './sliceProfiles'
import { newJob } from './profiles'
import type { PrepareJob } from './types'

const P = (id: string, over: Partial<{ process: string; engine: string; toolhead: string | null; material: string | null; name: string }> = {}) =>
  ({ id, name: over.name ?? id, engine: (over.engine ?? 'kiri') as 'kiri', process: (over.process ?? 'fdm') as 'fdm', toolhead: over.toolhead ?? null, material: over.material ?? null })

describe('slice profiles', () => {
  it('Prepare offers this process and engine; a toolhead-only profile only for that toolhead; built-in first, then the material', () => {
    const all = [P('p_z', { name: 'Zed' }), P('p_pla', { material: 'PLA', name: 'Pla' }), P('p_petg', { material: 'PETG', name: 'Aa' }), P('p_other', { toolhead: 'SwitchFly' }),
      P('p_laser', { process: 'laser' }), P('p_prusa', { engine: 'prusa' }), P(builtinId('fdm'), { name: 'Built in' })]
    const got = profilesFor(all, { process: 'fdm', engine: 'kiri', toolhead: 'BlockOne', material: 'PLA' }).map((p) => p.id)
    expect(got).toEqual(['builtin:fdm', 'p_pla', 'p_z', 'p_petg'])
    expect(profilesFor(all, { process: 'fdm', engine: 'kiri', toolhead: 'SwitchFly', material: null }).map((p) => p.id)).toContain('p_other')
  })

  it('a job keeps only the settings that differ from its profile', () => {
    const base = { walls: 3, infill: 0.2, supports: false, ops: [{ a: 1 }] }
    expect(diffSettings(base, { walls: 3, infill: 0.35, supports: false, ops: [{ a: 1 }] })).toEqual({ infill: 0.35 })
    expect(diffSettings(base, { ...base, ops: [{ a: 2 }] })).toEqual({ ops: [{ a: 2 }] })
    expect(applyProfile({ walls: 2, infill: 0.1, speed: 50 }, { walls: 3 }, { infill: 0.4 })).toEqual({ walls: 3, infill: 0.4, speed: 50 })
  })

  it('the job settings in use: Kiri per process, PrusaSlicer its INI options; drag knife keeps them under knife', () => {
    const j = newJob('BlockOne', 'fdm', [])
    j.engine = 'kiri'
    expect(engineOf(j)).toBe('kiri')
    expect(jobSettings(j).walls).toBe(j.fdm.walls)
    j.engine = 'prusa'
    setJobSettings(j, { layer_height: '0.2' })
    expect(j.prusa).toEqual({ layer_height: '0.2' })
    const k = newJob('Knife', 'dragknife', [])
    setJobSettings(k, { ...jobSettings(k), depth: 0.5 })
    expect(k.knife.depth).toBe(0.5)
    expect(engineOf({ process: 'laser', engine: 'prusa' })).toBe('kiri')
  })

  it('built-in profiles are the code defaults, read-only ids', () => {
    expect(isBuiltin(builtinProfile('cnc').id)).toBe(true)
    expect(builtinProfile('fdm', 'prusa').settings).toEqual({})
    expect(builtinProfile('dragknife').name).toContain('Drag knife')
  })

  it('status says saved, changed, stale or offline', () => {
    expect(statusText(profileStatus({ online: true, builtin: false, overrides: 0, jobRev: 2, profileRev: 2 }))).toBe('Saved on the Rhino')
    expect(statusText(profileStatus({ online: true, builtin: false, overrides: 1, jobRev: 2, profileRev: 2 }))).toBe('Changed: 1 setting')
    expect(profileStatus({ online: true, builtin: false, overrides: 0, jobRev: 1, profileRev: 3 })).toEqual({ kind: 'stale', from: 1, to: 3 })
    expect(profileStatus({ online: false, builtin: false, overrides: 0, jobRev: 1, profileRev: 1 }).kind).toBe('offline')
  })

  it('the one-time import: one profile per distinct set of settings; every old job points at one', () => {
    const a = newJob('BlockOne', 'fdm', []); a.engine = 'kiri'
    const b = newJob('SwitchFly', 'fdm', []); b.engine = 'kiri'
    const c = newJob('LightSaber', 'laser', [])
    const d = newJob('BigOne', 'fdm', []); d.engine = 'prusa'; d.prusa = { perimeters: '4' }
    const plan = planImport({ BlockOne: a, SwitchFly: b, LightSaber: c, BigOne: d, junk: null as unknown as PrepareJob }, new Date('2026-10-25T12:00:00Z'))
    expect(plan.profiles.map((p) => [p.process, p.engine])).toEqual([['fdm', 'kiri'], ['laser', 'kiri'], ['fdm', 'prusa']])
    expect(plan.profiles[0]!.name).toBe('Imported 2026-10-25 BlockOne')
    expect(plan.profiles[2]!.settings).toEqual({ perimeters: '4' })
    expect(plan.jobs.map((j) => j.file)).toEqual(['BlockOne', 'SwitchFly', 'LightSaber', 'BigOne'])
    expect(plan.jobs[0]!.profileKey).toBe(plan.jobs[1]!.profileKey)
    expect(plan.jobs.every((j) => Object.keys(j.job.overrides).length === 0)).toBe(true)
  })
})
