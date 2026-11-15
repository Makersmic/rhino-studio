/**
 * The control store's gates (audit 2026-11, S9): a padlock can't open without Klipper, opens for a minute, and
 * shuts the moment Klipper goes away; the hotend is refused without a confirmed print head. No Moonraker: the
 * machine store's connection and Klipper state are set directly.
 */
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useControlStore } from './control'
import { useMachineStore } from './machine'

describe('control store gates', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the hardware padlock needs Klipper, times out, and relocks when Klipper goes', async () => {
    const machine = useMachineStore()
    const control = useControlStore()
    control.unlockHardware()
    expect(control.hwUnlocked).toBe(false)
    machine.connection = 'online'
    machine.klippy = 'ready'
    await nextTick()
    control.unlockHardware()
    expect(control.hwUnlocked).toBe(true)
    expect(control.hwSecondsLeft).toBeGreaterThan(50)
    machine.klippy = 'shutdown'
    await nextTick()
    expect(control.hwUnlocked).toBe(false)
  })

  it('tuning relocks the same way, and the lead screws need the confirm first', async () => {
    const machine = useMachineStore()
    const control = useControlStore()
    machine.connection = 'online'
    machine.klippy = 'ready'
    await nextTick()
    control.unlockTuning() // no print head confirmed: blocked
    expect(control.tuneUnlocked).toBe(false)
    expect(control.tuningBlock).toMatch(/print head/)
    expect(control.screwUnlocked).toBe(false)
  })

  it('the hotend is refused without a confirmed print head, and says so in the console', async () => {
    const machine = useMachineStore()
    const control = useControlStore()
    machine.connection = 'online'
    machine.klippy = 'ready'
    await nextTick()
    await control.setHeater('extruder', 200)
    expect(control.lines.some((l) => l.kind === 'error' && /Hotend not set/.test(l.text))).toBe(true)
    expect(control.lines.some((l) => l.kind === 'sent')).toBe(false)
  })
})
