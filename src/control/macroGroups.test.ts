import { describe, expect, it } from 'vitest'
import { hiddenForOtherTools, macroPanels } from './macroGroups'

// The macros on the real Rhino config (toolhead manager 1.4.1), plus a few extras
const rhino = new Set([
  'ABORT_TOOL_SWAP', 'ACTIVATE_LASER', 'BACKUP_CFG', 'BED_COOLDOWN', 'CALCULATE_PA', 'CALIBRATE_ESC', 'CANCEL_PRINT',
  'CHECK_TOOLHEADS', 'CNC_JOB_SETUP', 'DEACTIVATE_LASER', 'FILAMENT_CHANGE', 'G28', 'LASER_FOCUS_ALIGN', 'LASER_JOB_SETUP',
  'LEDFLASH', 'LEDMAX', 'LEDMIN', 'LEDOFF', 'LIST_TOOLHEADS', 'NOZZLE_HEIGHT_CALIBRATE', 'PAUSE', 'PM_STATUS', 'PREHEAT',
  'PURGE', 'RESTORE_TOOL', 'RESUME', 'SET_PAUSE_AT_LAYER', 'SET_WORK_ZERO', 'SET_Z_ZERO', 'SHOW_BACKUP_LOCATION',
  'SWAP_TOOL', 'SWITCH_T0', 'SWITCH_T1', '_CNC_START',
])
const names = (b: { name: string }[]) => b.map((x) => x.name)
const sharedNames = (p: ReturnType<typeof macroPanels>) => p.shared.flatMap((g) => names(g.buttons))
const allNames = (p: ReturnType<typeof macroPanels>) => [...names(p.tool), ...names(p.toolMore), ...sharedNames(p)]

describe('macroPanels', () => {
  it('gives a print head its own macros, bed included', () => {
    const p = macroPanels(rhino, { toolType: 'DEPOSITION', toolName: 'BlockOne' })
    expect(names(p.tool)).toEqual(['PREHEAT', 'BED_COOLDOWN', 'NOZZLE_HEIGHT_CALIBRATE', 'FILAMENT_CHANGE', 'PURGE', 'CALCULATE_PA'])
    expect(names(p.toolMore)).toEqual(['SET_PAUSE_AT_LAYER'])
    expect(sharedNames(p)).not.toContain('BED_COOLDOWN')
  })

  it('keeps bed macros away from the laser, the spindle and the knife', () => {
    for (const [toolType, toolName] of [['LASER', 'LightSaber'], ['CNC', 'HotJoe'], ['DRAG_KNIFE', 'DragKnife']] as const) {
      const p = macroPanels(rhino, { toolType, toolName })
      expect(allNames(p)).not.toContain('BED_COOLDOWN')
      expect(allNames(p)).not.toContain('PREHEAT')
      expect(names(p.tool)).toContain('SET_Z_ZERO')
    }
  })

  it('shows the same shared panel whatever is mounted', () => {
    const a = macroPanels(rhino, { toolType: 'DEPOSITION', toolName: 'BlockOne' }).shared
    const b = macroPanels(rhino, { toolType: 'LASER', toolName: 'LightSaber' }).shared
    const c = macroPanels(rhino, { toolType: null, toolName: null }).shared
    expect(a).toEqual(b)
    expect(a).toEqual(c)
    expect(a.map((g) => g.title)).toEqual(['Machine', 'Lights and air', 'Other macros'])
    expect(names(a.find((g) => g.title === 'Lights and air')!.buttons)).toEqual(['LEDMAX', 'LEDMIN', 'LEDOFF', 'LEDFLASH'])
  })

  it('puts new system hardware (exhaust, chamber, filters) in the shared panel by name', () => {
    const set = new Set([...rhino, 'EXHAUST_ON', 'EXHAUST_OFF', 'CHAMBER_LIGHT_ON', 'NEVERMORE_ON'])
    const p = macroPanels(set, { toolType: 'LASER', toolName: 'LightSaber' })
    const air = names(p.shared.find((g) => g.title === 'Lights and air')!.buttons)
    for (const n of ['EXHAUST_ON', 'EXHAUST_OFF', 'CHAMBER_LIGHT_ON', 'NEVERMORE_ON']) expect(air).toContain(n)
  })

  it('leaves Swap, the toolhead lists, Confirm tool, Pause, Resume and Cancel out of the macro panels', () => {
    const p = macroPanels(rhino, { toolType: 'DEPOSITION', toolName: 'BlockOne', showAll: true })
    for (const n of ['SWAP_TOOL', 'LIST_TOOLHEADS', 'CHECK_TOOLHEADS', 'RESTORE_TOOL', 'PAUSE', 'RESUME', 'CANCEL_PRINT']) expect(allNames(p)).not.toContain(n)
  })

  it('never offers internal macros, job wizards or motion overrides as buttons', () => {
    const p = macroPanels(rhino, { toolType: 'CNC', toolName: 'HotJoe', showAll: true })
    for (const n of ['_CNC_START', 'G28', 'CNC_JOB_SETUP', 'LASER_JOB_SETUP']) expect(allNames(p)).not.toContain(n)
  })

  it('shows no tool macros until Klipper confirms a tool', () => {
    const p = macroPanels(rhino, { toolType: null, toolName: null })
    expect(p.tool).toEqual([])
    expect(p.toolMore).toEqual([])
    expect(sharedNames(p)).not.toContain('PREHEAT')
    expect(sharedNames(p)).not.toContain('SET_Z_ZERO')
  })

  it("leaves out other tools' macros unless asked, and gives SwitchFly its path switches", () => {
    const blockOne = macroPanels(rhino, { toolType: 'DEPOSITION', toolName: 'BlockOne' })
    for (const n of ['ACTIVATE_LASER', 'LASER_FOCUS_ALIGN', 'SET_WORK_ZERO', 'SWITCH_T0', 'SWITCH_T1']) expect(allNames(blockOne)).not.toContain(n)
    expect(hiddenForOtherTools(rhino, 'DEPOSITION', 'BlockOne')).toBe(8) // laser on/off, focus, ESC, work zero, Z zero, two SwitchFly paths
    const switchFly = macroPanels(rhino, { toolType: 'DEPOSITION', toolName: 'SwitchFly' })
    expect(names(switchFly.tool)).toEqual(['PREHEAT', 'BED_COOLDOWN', 'NOZZLE_HEIGHT_CALIBRATE', 'FILAMENT_CHANGE', 'PURGE', 'CALCULATE_PA', 'SWITCH_T0', 'SWITCH_T1'])
    const spindle = macroPanels(rhino, { toolType: 'CNC', toolName: 'HotJoe' })
    expect(names(spindle.tool)).toEqual(['SET_Z_ZERO', 'SET_WORK_ZERO', 'CALIBRATE_ESC'])
    const asked = macroPanels(rhino, { toolType: 'CNC', toolName: 'HotJoe', showAll: true })
    expect(names(asked.toolMore)).toContain('SWITCH_T0')
    expect(sharedNames(asked)).not.toContain('SWITCH_T0')
  })
})
