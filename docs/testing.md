# Testing on the machine

Phase 2a only reads from the Rhino, so these checks change nothing on the Pi. The one exception is the E-stop check (A6), which really sends M112.

Before you start: Rhino idle, no job running, nothing hot. Run `npm test` first; all tests should pass.

Start the app against the machine:

```bash
MOONRAKER=http://mainsailos.local npm run dev
```

Open http://localhost:5173 and keep Mainsail open in another tab to compare.

## Checks

| # | Do this | Pass when | If it fails |
|---|---|---|---|
| A1 | Open the app | Top bar shows "Connected" within a few seconds | Stop. Note the text under Device → Connection and send it to me. Try the Pi's IP instead of `mainsailos.local`. |
| A2 | Look at the top bar and Device → Mounted toolhead | Shows the same tool Mainsail's SWAP_TOOL says is installed, in that tool's colour | Stop. Don't trust the app's tool display until fixed. Send me the screen. |
| A3 | Device readouts | Hotend, bed and Z match Mainsail (within a degree / 0.1 mm) and update | Note which readout is wrong. |
| A4 | Files | Every file is listed; Orca BlockOne files show BlockOne; files the mounted tool can run say "Fits mounted tool" | Note the file name. A file showing the wrong toolhead is a stop condition. |
| A5 | In Mainsail run `FIRMWARE_RESTART` | The app's band turns hatched, the tool shows unknown, then "not confirmed since restart" with the last saved tool. After you answer RESTORE_TOOL in Mainsail, the app shows the tool again | Stop if the app ever shows a tool as mounted before RESTORE_TOOL is answered. |
| A6 | With the machine idle and cold, press **Stop** in the app | Klipper shuts down within a second (Mainsail shows the M112 shutdown) and the app shows the red "Klipper is shut down" banner | Stop. Do not rely on the app's Stop button. Use the machine's switch. |
| A7 | Run `FIRMWARE_RESTART` in Mainsail after A6 | App reconnects to Klipper on its own; banner clears | Note what the app shows. |
| A8 | Unplug the Pi's network, or stop Moonraker, for 10 s, then restore it | App shows "Can't reach machine", tool goes unknown, then reconnects by itself | Note what the app shows. |

What the app sent is visible in the browser's developer tools (Network → WS → messages): only `server.*`, `printer.objects.*` and, in A6, `printer.emergency_stop`.

The checks above were run against the mock Moonraker, not the real machine. A1 to A8 are the first run on hardware.
