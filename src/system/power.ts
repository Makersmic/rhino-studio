/**
 * Restarts and host power, for Settings > Host. Pure: what each action is,
 * what it sends, and whether it may run now. The view confirms every one.
 *
 * Safety: none of these moves the machine, but each stops whatever Klipper is
 * doing, so all are refused while a job is printing or paused (cancel the job
 * first). Shut down needs someone at the machine to turn it back on, so it
 * says so in its confirmation.
 */
export type PowerId = 'firmware' | 'klipper-host' | 'svc-klipper' | 'svc-moonraker' | 'svc-crowsnest' | 'reboot' | 'shutdown'

export interface PowerAction {
  id: PowerId
  label: string
  /** The button */
  button: string
  /** One line under the button */
  what: string
  method: string
  params?: Record<string, unknown>
  /** Confirmation dialog */
  confirmTitle: string
  confirmBody: string
  confirmLabel: string
  /** Shown as outlined red: the screen will lose the machine for a while */
  heavy: boolean
  group: 'klipper' | 'services' | 'host'
}

export const POWER_ACTIONS: readonly PowerAction[] = [
  {
    id: 'firmware', group: 'klipper', heavy: false, button: 'Restart',
    label: 'Restart firmware', what: 'Reloads the config and resets the boards (FIRMWARE_RESTART).',
    method: 'printer.firmware_restart',
    confirmTitle: 'Restart the firmware?', confirmBody: 'Klipper reloads its config and resets the MCU boards. Heaters turn off and the axes need homing again.', confirmLabel: 'Restart firmware',
  },
  {
    id: 'klipper-host', group: 'klipper', heavy: false, button: 'Restart',
    label: 'Restart Klipper', what: 'Reloads the config without resetting the boards (RESTART).',
    method: 'printer.restart',
    confirmTitle: 'Restart Klipper?', confirmBody: 'Klipper reloads its config. Heaters turn off and the axes need homing again.', confirmLabel: 'Restart Klipper',
  },
  {
    id: 'svc-klipper', group: 'services', heavy: false, button: 'Restart',
    label: 'Klipper service', what: 'Restarts the Klipper program on the host.',
    method: 'machine.services.restart', params: { service: 'klipper' },
    confirmTitle: 'Restart the Klipper service?', confirmBody: 'The Klipper program restarts. Heaters turn off and the axes need homing again.', confirmLabel: 'Restart service',
  },
  {
    id: 'svc-moonraker', group: 'services', heavy: false, button: 'Restart',
    label: 'Moonraker', what: 'Studio loses the connection for a few seconds and reconnects.',
    method: 'server.restart',
    confirmTitle: 'Restart Moonraker?', confirmBody: 'Studio loses the connection for a few seconds, then reconnects by itself. Klipper keeps running.', confirmLabel: 'Restart Moonraker',
  },
  {
    id: 'svc-crowsnest', group: 'services', heavy: false, button: 'Restart',
    label: 'Cameras (crowsnest)', what: 'Restarts the camera streamer, if it is installed.',
    method: 'machine.services.restart', params: { service: 'crowsnest' },
    confirmTitle: 'Restart the cameras?', confirmBody: 'Camera pictures stop for a few seconds while crowsnest restarts.', confirmLabel: 'Restart cameras',
  },
  {
    id: 'reboot', group: 'host', heavy: true, button: 'Reboot',
    label: 'Reboot host', what: 'Restarts the computer that runs the Rhino. Back in a minute or two.',
    method: 'machine.reboot',
    confirmTitle: 'Reboot the host?', confirmBody: 'The computer that runs Klipper restarts. Studio waits and reconnects when it is back, usually within two minutes. Heaters turn off.', confirmLabel: 'Reboot',
  },
  {
    id: 'shutdown', group: 'host', heavy: true, button: 'Shut down',
    label: 'Shut down host', what: 'Turns the host off. Someone has to switch it back on at the machine.',
    method: 'machine.shutdown',
    confirmTitle: 'Shut down the host?', confirmBody: 'The computer that runs Klipper turns off. Studio cannot turn it back on: someone has to do that at the machine. Heaters turn off.', confirmLabel: 'Shut down',
  },
]

/** Why an action can't run right now, or null. */
export function powerBlock(opts: { online: boolean; jobState: string }): string | null {
  if (!opts.online) return 'Not connected to the Rhino'
  if (opts.jobState === 'printing' || opts.jobState === 'paused') return 'A job is running: cancel it first, or wait for it to end'
  return null
}
