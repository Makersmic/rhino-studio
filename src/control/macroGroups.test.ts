import { describe, expect, it } from 'vitest'
import { hiddenForOtherTools, macroGroups } from './macroGroups'

const all = new Set(['SWAP_TOOL', 'RESTORE_TOOL', 'SET_Z_ZERO', 'PREHEAT', 'LASER_FOCUS_ALIGN', 'BACKUP_CFG', 'G28', 'CANCEL_PRINT', '_CNC_START', 'LASER_JOB_SETUP', 'SWITCH_T0'])

describe('macroGroups', () => {
  it('offers the mounted tool its own macros', () => {
    const g = macroGroups(all, { toolType: 'LASER', toolName: 'LightSaber', needsRestore: false })
    expect(g.find((x) => x.title === 'For LightSaber')!.buttons.map((b) => b.name)).toEqual(['LASER_FOCUS_ALIGN', 'SET_Z_ZERO'])
  })
  it('suggests RESTORE_TOOL only after a restart', () => {
    const before = macroGroups(all, { toolType: null, toolName: null, needsRestore: true })
    expect(before[0]!.buttons[0]).toMatchObject({ name: 'RESTORE_TOOL', suggested: true })
    const after = macroGroups(all, { toolType: 'DEPOSITION', toolName: 'BlockOne', needsRestore: false })
    expect(after.flatMap((g) => g.buttons).some((b) => b.name === 'RESTORE_TOOL')).toBe(false)
  })
  it('never offers internal macros, job wizards or the job/motion overrides as buttons', () => {
    const names = macroGroups(all, { toolType: 'DEPOSITION', toolName: 'BlockOne', needsRestore: false }).flatMap((g) => g.buttons.map((b) => b.name))
    for (const n of ['_CNC_START', 'G28', 'CANCEL_PRINT', 'LASER_JOB_SETUP']) expect(names).not.toContain(n)
  })
  it("leaves out other tools' macros unless asked, and gives SwitchFly its path switches", () => {
    const set = new Set([...all, 'ACTIVATE_LASER', 'SET_WORK_ZERO', 'SWITCH_T1', 'BED_COOLDOWN'])
    const blockOne = macroGroups(set, { toolType: 'DEPOSITION', toolName: 'BlockOne', needsRestore: false }).flatMap((g) => g.buttons.map((b) => b.name))
    for (const n of ['ACTIVATE_LASER', 'LASER_FOCUS_ALIGN', 'SET_WORK_ZERO', 'SWITCH_T0', 'SWITCH_T1']) expect(blockOne).not.toContain(n)
    expect(blockOne).toContain('PREHEAT')
    expect(hiddenForOtherTools(set, 'DEPOSITION', 'BlockOne')).toBe(5)
    const switchFly = macroGroups(set, { toolType: 'DEPOSITION', toolName: 'SwitchFly', needsRestore: false })
    expect(switchFly.find((g) => g.title === 'For SwitchFly')!.buttons.map((b) => b.name)).toEqual(['PREHEAT', 'SWITCH_T0', 'SWITCH_T1'])
    const spindle = macroGroups(set, { toolType: 'CNC', toolName: 'HotJoe', needsRestore: false }).flatMap((g) => g.buttons.map((b) => b.name))
    expect(spindle).toContain('SET_WORK_ZERO')
    expect(spindle).not.toContain('PREHEAT')
    const all2 = macroGroups(set, { toolType: 'CNC', toolName: 'HotJoe', needsRestore: false, showAll: true }).flatMap((g) => g.buttons.map((b) => b.name))
    expect(all2).toContain('SWITCH_T0')
  })
})
