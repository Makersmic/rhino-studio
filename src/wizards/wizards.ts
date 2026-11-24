/**
 * The wizards, in one list: the Wizards section's menu and landing page are drawn from it, so a new wizard is one row.
 * (Mike, Nov 23: wizards get their own section so Settings stays short.)
 */
export interface WizardInfo {
  id: string
  path: string
  title: string
  group: 'setup' | 'check' | 'keep'
  /** one plain sentence: what it is for */
  what: string
  /** when you would run it */
  when: string
  /** moves the machine or heats something */
  acts: boolean
}

export const GROUPS: { id: WizardInfo['group']; label: string; blurb: string }[] = [
  { id: 'setup', label: 'Set up', blurb: 'Tell the Rhino where things are and how to reach it.' },
  { id: 'check', label: 'Check and tune', blurb: 'Measure the machine and keep what you learn.' },
  { id: 'keep', label: 'Keep it running', blurb: 'Updates and upkeep, with a way back.' },
]

export const WIZARDS: WizardInfo[] = [
  { id: 'connect', path: '/wizards/connect', title: 'Connect', group: 'setup', what: 'How you reach the Rhino, who may control it, and Tailscale.', when: 'A new screen or network, or after a router change.', acts: false },
  { id: 'positions', path: '/wizards/positions', title: 'Park and positions', group: 'setup', what: 'Where the head parks, swaps tools, lifts to and lowers the bed to.', when: 'First setup, or after moving something.', acts: true },
  { id: 'nozzle-cleaning', path: '/wizards/nozzle-cleaning', title: 'Nozzle cleaning', group: 'setup', what: 'Measure a wipe brush and add the wipe to a print head\'s start.', when: 'After fitting a brush. One run per print head.', acts: true },
  { id: 'probe-check', path: '/wizards/probe-check', title: 'Probe check', group: 'check', what: 'Is the probe steady enough to trust a bed mesh?', when: 'Before a mesh or Z offset, or when the first layer varies.', acts: true },
  { id: 'motor-check', path: '/wizards/motor-check', title: 'Motor check', group: 'check', what: 'Are the end switches, drivers and motors all answering?', when: 'After wiring work, or when a motor sounds wrong.', acts: true },
  { id: 'update', path: '/wizards/update', title: 'Update the Rhino', group: 'keep', what: 'Check, back up, install the new release, then check again.', when: 'When a new release is out.', acts: false },
]

/** Coming next (named on the landing page, no link). */
export const COMING = ['Tune a heater (hotend, bed, chamber)', 'Input shaping with the USB accelerometer', 'Material tower (temperature and retraction)']
