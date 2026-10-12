# Testing on the machine

Run these in order. 2a (A) only reads; Care (C) only changes maintenance records; 2b (B) moves the machine. Don't start B until every A check passes, because B relies on Studio reading the mounted toolhead correctly.

The E-stop check (A6) really sends M112.

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

## Care (maintenance)

Needs the Portal running on the Pi (it normally is: `http://mainsailos.local:5000`). Start the dev server as above; it forwards `/portal` to port 5000 on the same host.

| # | Do this | Pass when | If it fails |
|---|---|---|---|
| C1 | Open Care | Counts match the Portal's Due & upcoming page; the Portal version shows in the intro | If "Can't reach the Rhino Portal": check the Portal is running, or run with `PORTAL=http://<pi-ip>:5000` |
| C2 | Compare a few tasks with the Portal | Same title, state, and "x left (due at y)" text | Note the task |
| C3 | Toolheads screen | Each tile's care line matches that tool in the Portal | Note the tool |
| C4 | Log work on a task that is safe to log (e.g. one you've just done), with a note | It leaves Due now; the Portal's work log shows the entry with your note and today's date | Stop. Check the Portal's work log before logging anything else. |
| C5 | Snooze a due task, then check the Portal | Shown as snoozed in both | Note it |

What the app sent is visible in the browser's developer tools (Network → WS → messages): only `server.*`, `printer.objects.*` and, in A6, `printer.emergency_stop`.

The checks above were run against the mock Moonraker, not the real machine. A1 to A8 are the first run on hardware.

## Phase 2b: control (moves the machine)

Before you start: bed clear, nothing in the nozzle path, hand near the physical stop. Use 1 mm steps until B3 passes. If anything moves when or where you didn't expect, press Stop and stop testing.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| B1 | Open Control without unlocking | Jog buttons are disabled; the console shows Klipper's recent history | Any jog button works while locked |
| B2 | Unlock motion, wait 60 s without jogging | It relocks by itself; also relocks when you switch to another screen | It stays unlocked |
| B3 | Unlock, jog X+ 1 mm, Y+ 1 mm, Z+ 1 mm (BlockOne mounted) | Each axis moves 1 mm the right way; Mainsail's position agrees | Wrong axis or direction |
| B4 | Jog toward a limit with 50 mm steps | Studio refuses the step that would pass the travel, before sending | The machine tries to move past it |
| B5 | Home all, then Home X Y | Each asks first and says what will happen; your G28 rules apply (no Z with a non-print head) | It homes without asking |
| B6 | Type `G1 Z5` in the console | A confirmation lists the line and "moves the machine"; Cancel sends nothing | It moves without asking |
| B7 | Type `M3 S100` with LightSaber **not** mounted, then Cancel | A "This powers a tool" confirmation appears; Cancel sends nothing | It sends without asking |
| B8 | Swap toolhead button | SWAP_TOOL's question appears in Studio and Mainsail; picking a slot and finishing the swap shows the new tool in Studio | Studio shows the new tool before you confirm it in the wizard |
| B9 | Heat: bed to 40°, then Off | Target set and cleared, matches Mainsail | |
| B10 | Upload a small print file | It appears in Files; it doesn't start | It starts |
| B11 | Start a file for a tool that isn't mounted | Start is replaced by "Swap to …"; nothing starts | It starts |
| B12 | Start a BlockOne file with BlockOne mounted | Confirmation explains START_JOB; job runs; Pause, then Resume (asks), then Cancel (asks) work | Cancel doesn't switch the heaters off |
| B13 | With LightSaber mounted, Start a laser file (config 1.4.1 on the Pi) | Studio runs LASER_JOB_SETUP FILE=…; its questions show in Studio; the laser only fires after the wizard's own steps | The laser fires before the wizard's start step |
| B14 | E-stop from Studio, then Restart Klipper from the red alert | Shutdown, then a confirmation, then Klipper restarts and the tool shows "not confirmed" until RESTORE_TOOL | |
| B15 | Pendant Jog screen on your phone (same Wi-Fi, `#/pendant`), 1 mm steps: tap X+ without Hold; then hold Hold and tap X+; then let go and tap X+ | Only the middle tap moves, 1 mm. The keys look greyed out until Hold is held | Anything moves without Hold held |
| B15b | Hold Hold, then lock the phone screen or switch apps, come back | Keys are dead until you press Hold again | Keys are still live |
| B15c | Hold Hold and press and keep a finger on a jog key | Exactly one step; nothing more while the finger stays down | It keeps moving |
| B16 | Pendant: press Stop | Klipper shuts down | |

Notes:
- B13 needs Toolhead_Manager 1.4.1 on the Pi (the laser rail fix). On 1.3.4, don't run laser jobs from Studio yet.
- Pendant over plain http can't keep the phone screen on. Raise the phone's auto-lock time while you use it.
