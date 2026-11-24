# Testing on the machine

Run these in order. 2a (A) only reads; Care (C) only changes maintenance records; 2b (B) moves the machine. Don't start B until every A check passes, because B relies on Studio reading the mounted toolhead correctly.

The E-stop check (A6) really sends M112.

Before you start: Rhino idle, no job running, nothing hot. Run `npm test` first; all tests should pass.

Start the app against the machine:

```bash
MOONRAKER=http://rhino.local npm run dev
```

Open http://localhost:5173. Where a check says "Klipper's own answer", ask Klipper in Studio's Console (for example `GET_POSITION` or `M105`) instead of trusting one screen.

## Checks

| # | Do this | Pass when | If it fails |
|---|---|---|---|
| A1 | Open the app | Top bar shows "Connected" within a few seconds | Stop. Note the text under Device → Connection and send it to me. Try the Pi's IP instead of `rhino.local`. |
| A2 | Look at the top bar and Device → Mounted toolhead | Shows the same tool Klipper's SWAP_TOOL says is installed, in that tool's colour | Stop. Don't trust the app's tool display until fixed. Send me the screen. |
| A3 | Device readouts | Hotend, bed and Z match Klipper's own answer (`M105`, `GET_POSITION` in the Console) (within a degree / 0.1 mm) and update | Note which readout is wrong. |
| A4 | Files | Every file is listed; Orca BlockOne files show BlockOne; files the mounted tool can run say "Fits mounted tool" | Note the file name. A file showing the wrong toolhead is a stop condition. |
| A5 | In Studio's Console run `FIRMWARE_RESTART` | The app's band turns hatched, the tool shows unknown, then "not confirmed since restart" with the last saved tool. After you answer RESTORE_TOOL, the app shows the tool again | Stop if the app ever shows a tool as mounted before RESTORE_TOOL is answered. |
| A6 | With the machine idle and cold, press **Stop** in the app | Klipper shuts down within a second (the Console shows the M112 shutdown) and the app shows the red "Klipper is shut down" banner | Stop. Do not rely on the app's Stop button. Use the machine's switch. |
| A7 | Run `FIRMWARE_RESTART` in the Console after A6 | App reconnects to Klipper on its own; banner clears | Note what the app shows. |
| A8 | Unplug the Pi's network, or stop Moonraker, for 10 s, then restore it | App shows "Can't reach machine", tool goes unknown, then reconnects by itself | Note what the app shows. |

## Care (maintenance)

Needs the Portal running on the Pi (it normally is: `http://rhino.local:5000`). Start the dev server as above; it forwards `/portal` to port 5000 on the same host.

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
| B3 | Unlock, jog X+ 1 mm, Y+ 1 mm, Z+ 1 mm (BlockOne mounted) | Each axis moves 1 mm the right way; `GET_POSITION` in the Console agrees | Wrong axis or direction |
| B4 | Jog toward a limit with 50 mm steps | Studio refuses the step that would pass the travel, before sending | The machine tries to move past it |
| B5 | Home all, then Home X Y | Each asks first and says what will happen; your G28 rules apply (no Z with a non-print head) | It homes without asking |
| B6 | Type `G1 Z5` in the console | A confirmation lists the line and "moves the machine"; Cancel sends nothing | It moves without asking |
| B7 | Type `M3 S100` with LightSaber **not** mounted, then Cancel | A "This powers a tool" confirmation appears; Cancel sends nothing | It sends without asking |
| B8 | Swap toolhead button | SWAP_TOOL's question appears in Studio and in the Console; picking a slot and finishing the swap shows the new tool in Studio | Studio shows the new tool before you confirm it in the wizard |
| B9 | In the status strip, click the bed temperature, type 40, Enter; then click it again, type 0, Enter | The box fills light grey while you type; the small set temperature in its corner reads 40°, then Off; `M105` in the Console agrees | |
| B9b | Click the hotend temperature, type 80, press Esc (or click away) | Nothing is sent; the set temperature is unchanged | A target is set |
| B9c | Mount LightSaber (or any non-print tool) | The hotend reads "Body temperature", says "No heater on this tool" and can't be clicked. (The console can still send a hotend target: it's a full console.) | The box can be edited |
| B9d | Watch the graphs for a few minutes; press the dots | Red line follows the reading, grey line sits at the set temperature; the dots widen the graph to the last 20 minutes and back | |
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

## Extruder block (Control)

Needs Toolhead_Manager 1.4.7 (per-path materials for SwitchFly, and the record that tells Studio which path is in use). Before you start: no job, bed clear, a bin under the nozzle, filament loaded. Use 5 mm feeds until X3 passes. If filament moves the wrong way, or anything but the extruder moves when you feed, press Stop and stop testing.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| X1 | Mount LightSaber, open Control | No extruder block | The block shows, or Extrude can be pressed |
| X2 | Mount BlockOne, hotend cold | Block under the status box, the same height; Path row greyed out, "SwitchFly only"; Extrude and Retract solid grey, "Hotend cold" | Extrude sends anything |
| X3 | Heat BlockOne to its print temperature, Length 5, Speed 2, Extrude, then Retract | No confirmation; filament goes in 5 mm, then back 5 mm; X, Y and Z don't move; the Console shows the G1 E lines inside SAVE/RESTORE_GCODE_STATE | Filament goes the wrong way, or the head moves |
| X4 | Flow: drag to 95%, let go; then + once | the Console shows M221 S95, then S96; the big number agrees | |
| X5 | Pressure advance: arrow up twice, wait; type 0.045 in Smooth, Enter | One SET_PRESSURE_ADVANCE per pause, values match `GET_PRESSURE_ADVANCE` (in the Console) | Values outside 0–1 s / 0.005–0.2 s are sent |
| X6 | During a BlockOne print: change Flow and Advance; try Extrude | Flow and Advance apply live; Extrude and Retract are dead, "Not while a job is running" | Extrude works during a job |
| X7 | Mount SwitchFly (record still says BlockOne) | Path row live; neither T0 nor T1 selected; feed keys dead, "Pick a path first" | Extrude works before a path is picked |
| X8 | Press T0 | Confirmation "Switch to T0?" saying it lifts Z, retracts, heats, loads and purges, with the remembered material; Cancel sends nothing; Switch to T0 runs SWITCH_T0 | It switches without asking |
| X9 | On T0, hot, Extrude 5 mm; then switch to T1 and Extrude 5 mm | Both paths feed **in** (the config reverses the stepper for T1) | T1 pulls filament out |
| X10 | On SwitchFly T1, swap to BlockOne, then back to SwitchFly and confirm | The selector turns to path 1; the block shows T0 selected; hot, Extrude 5 mm feeds **in** | T1 still shows, or filament comes out |

## Settings: Software and Network

Software needs Moonraker's update manager; the Rhino's network needs Toolhead_Manager 1.4.8 (its N checks cover the
Pi side). Machine idle, no job.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| S1 | Open Settings | A menu like Care: Appearance; Machine (Connection, Tool changing, Cameras); System (Software, Network); About. Every old setting is still there | A setting is missing |
| S2 | Software | Klipper, Moonraker and the Rhino's own packages with their versions; one Status column: "Up to date" or an Update button | A web interface such as Mainsail or Fluidd is listed |
| S3 | Update one package (e.g. Crowsnest) | Asks first, lists what restarts; progress lines appear; ends "Up to date" | It starts without asking |
| S4 | Update all with Moonraker and Klipper behind | Order: system, Moonraker, repos, Klipper last; Studio reconnects after Moonraker by itself and carries on; Klipper restarts once | Klipper restarts more than once, or the run stops at Moonraker |
| S5 | Start a print, open Software | Update buttons are dead, "Not while a job is running" | An update can start |
| S6 | Network, Link now | Response, Wi-Fi signal, traffic and screens connected show and change; address line matches the Pi | |
| S7 | Network, cameras Snapshots, open Control | The camera shows stills at the snapshot rate; Live video brings the stream back | |
| S8 | Network, Reconnect Patient, stop Moonraker 20 s | Reconnects with longer waits (watch the top bar) | |

## Studio served from the Rhino

Needs Toolhead_Manager 1.5.1 installed. **Stop if** another site on this host (a spare Mainsail, if you still have one) stops opening.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| S1 | Open `http://<pi>:5001` on the PC | Studio opens, Connected, the mounted tool shows | A spare Mainsail (if installed) no longer opens |
| S2 | Same address on a phone | Studio opens and works the same | |
| S3 | Care and Toolheads | Tasks, tools and photos come from the Portal | "Portal not reachable" |
| S4 | From this address, Settings › Software, PrusaSlicer engine: Install (that is P1) | It starts installing; no "Cross-site request refused" | |
| S5 | Control, cameras | The camera picture shows | |
| S6 | Prepare a part with PrusaSlicer and Send to Rhino, then Files | The file is there | |
| S7 | Settings › Software | Rhino Studio row says "served by the Rhino" with this version | |

## PrusaSlicer on the Rhino

Needs Toolhead_Manager 1.5.2 (the engine comes from Flathub) and, once, `sudo apt install flatpak` on the host over
SSH. Machine idle unless a check says otherwise. **Stop if** Klipper reports "Timer too close" or a shutdown while
slicing, or anything asks for a password.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| P0 | Settings > Software before installing Flatpak | The PrusaSlicer row says "Not offered" and gives the one `sudo apt install flatpak` command | Install is offered anyway |
| P1 | After Flatpak: Settings > Software, PrusaSlicer engine: Install | Asks first; the row steps through "Adding Flathub", "Downloading from Flathub…" (first time 10-20 min), "Checking it slices"; then the version and Up to date. On a Pi 3B: "Not offered", needs 2 GB | Klipper or Moonraker restart |
| P2 | Job setup: a 3D model, BlockOne, PLA | Engine switch shows PrusaSlicer on the Rhino; Print / Filament / Printer tabs with PrusaSlicer's pages; Simple / Advanced / Expert change how many options show | |
| P3 | Filament tab | Temperatures, diameter and type are locked with "Set by the Rhino" and the material's numbers | A temperature can be typed |
| P4 | Change Perimeters to 4 and Fill pattern to Gyroid, Prepare | Slices on the Rhino with a progress bar; time and filament from PrusaSlicer; every check passes; the file starts with START_JOB and has no M104/M140 above 0 | The file heats or homes; "Permission denied" (report it) |
| P5 | Prepare again with nothing changed | Comes back at once ("from the cache") | |
| P6 | Change a setting while it slices, then Cancel the new one | The old slice stops and a new one starts; after Cancel, `htop` shows no `prusa-slicer` or `bwrap` left | Two slices run at once, or one stays in `htop` |
| P7 | Start a print, then Prepare a part | Bigger host: slices with half the cores, print keeps going smoothly. Pi 3B: refused, says why | The print stutters or Klipper shuts down |
| P8 | Print the P4 file | First layer and walls look like the Orca prints; SwitchFly path 2 prints the same way | Extrusion runs backwards |
| P9 | When Flathub has a newer build: Update, then Go back | Update ends with "Go back to <old>" under the row; Go back brings the old version back and it slices (or says Flathub no longer has it) | The engine is left unable to slice |

## Cameras and Dashboard

Nothing here moves the machine. Camera edits change Moonraker's camera list, which every other screen on the host uses too.

| # | Do this | Pass when | If it fails |
|---|---|---|---|
| D1 | Open Control | The Camera panel shows the cameras already set up in Moonraker, live | "isn't answering": open `http://rhino.local/webcam/?action=stream` in the browser. If that fails too, crowsnest isn't running |
| D2 | With two or more cameras, use the arrows, the dots, and the left/right keys | Each switches camera and the count (e.g. 2 of 3) follows; the Dashboard shows the same camera | Note which control |
| D3 | Settings → Cameras → Add camera, with a wrong address | The preview says the camera isn't answering; Save still works but the panel shows the same message | |
| D4 | Edit that camera to a real address, turn it, mirror it | The preview updates; after saving, `http://rhino.local/server/webcams/list` shows the same camera with the same turn and mirror | It doesn't: note the Moonraker version |
| D5 | Delete it | Asks first; it disappears from Studio and from `/server/webcams/list`; crowsnest is unchanged | It deletes without asking |
| D6 | Leave Control open, switch to another app or lock the phone for 30 s, come back | The picture resumes. On the Pi, `top` shows crowsnest's CPU drop while it's hidden | CPU stays up while hidden |
| D7 | Open the Dashboard during a print | Stats along the top, notices on the left, job along the bottom with time left and finish time. No buttons that act on the machine; tapping a value opens its screen; Stop stays in the top bar | Anything on it starts, stops or moves something (apart from the top bar's Stop) |
| D8 | During a job run a wizard that asks a question (or start a laser job) | The Dashboard shows "Klipper is asking" in red; the question itself appears on Control, not on the Dashboard | |
| D9 | Mount a non-print tool | The Dashboard says "Body temperature" with "No sensor yet" instead of the hotend | It shows a hotend reading for a laser, spindle or knife |
| D10 | Klipper busy without a job (Home all from the Console) | The Dashboard's state reads Busy and a "Machine busy" notice shows until homing ends | |
| D11 | Scroll down the Dashboard | Reports under the camera screen: five number tiles, Toolheads (hours, jobs, at a glance, jobs per week) and Maintenance (task status, next up, tasks by machine and toolhead, work per week). The figures match the Portal's own Dashboard at port 5000 | A figure differs from the Portal's |
| D12 | Press Table on any report, then Chart | The numbers as a table, then the chart again; nothing is logged or changed | |
| D13 | Stop the Portal (`sudo systemctl stop rhino-portal`), reload the Dashboard; start it again | The reports say the Portal isn't answering, the camera screen above still works; they come back within 2 minutes of starting it | The Dashboard breaks or goes blank |

Notes:
- Each open camera view is one more stream the Pi 3B sends. Studio only pulls frames from the camera that's on screen, and stops when hidden. If Klipper reports "Timer too close" while watching, use "MJPEG snapshots" at 5 fps instead.
- A camera is not a safety device: the picture can lag or freeze without notice. Don't leave a laser or spindle job unwatched because the Dashboard looks fine.
- WebRTC and HLS cameras show "not supported yet". Crowsnest's default (ustreamer, MJPEG) works.

## What each tool shows

Read only, nothing moves. Compare each tool's status strip with Klipper's own answer in the Console.

| # | Do this | Pass when | If it fails |
|---|---|---|---|
| E1 | Mount BlockOne | Hotend, bed and part fan; position is machine position | |
| E2 | Mount LightSaber | No hotend or bed; Laser shows Off with the rail off. During a laser job it shows Armed, then Firing with the power Klipper reports for `output_pin SERVO_LASER` | Bed or hotend shows while both are cold and off |
| E3 | Mount HotJoe, set a work zero, run CNC_JOB_SETUP to spin-up | Spindle Running with the throttle the wizard reports; Work position matches Klipper's work coordinates (`GET_POSITION` in the Console), machine position below | Spindle shows Off while it's running (pin names differ on your config: note them) |
| E4 | With HotJoe or LightSaber mounted, set the bed to 50 from the console | "Bed heating" appears in the strip and on the Dashboard; typing anything but 0 there is refused; 0 switches it off and it goes away once below 40° | |
| E7 | Panel ⋮ > Panel colours on any panel; pick a background, text and border; Save to theme; open Studio on a second device | The panel previews while choosing; after saving, the second device shows the same colours (day and night kept apart). Low-contrast or red/orange picks show a warning. Stop, Cancel, the swap list and graph lines keep their colours. Reset to default colours and Settings > Reset all panels bring back the default | Colours only on the first device; Stop or Cancel change colour; reset leaves colours behind |
| E8 | Settings > Appearance: save the colours as a theme; Reset all panels; pick the saved theme; Revert; pick it again and Apply; Download theme file; Load theme file | Picking previews on screen without saving; Revert brings back what was in use; Apply makes it current on every device; the downloaded file loads back as a new saved theme ("… 2"), previewed until Apply; a non-theme file gives a plain error | A pick is saved without Apply; leaving the page keeps an unapplied preview; loading overwrites a saved theme |
| E10 | (toolchanger mock) Start a print with no tool held; untick "Ask before tool changes I start from the Swap list" and swap; type T0 in the console; on the Rhino, open Tool changing | The print starts with no tool; the swap goes straight away; T0 still asks; the Rhino shows no such tick box and says every swap is confirmed | Start blocked for lack of a tool; a confirmation on the Swap list with the box unticked; T0 sent without asking; the option offered on the Rhino |
| E9 | Settings > Machine > Tool changing on the Rhino | "Automatic (found: Rhino tool macros)"; Control, Swap and Confirm tool work exactly as before | Anything else found; a Rhino screen behaves differently |
| E6 | Top bar Swap with a tool mounted and no job | An orange list drops under Swap with every other toolhead (name, slot, kind). Picking one shows "Tool Swap Ready" with the tool's name, and only after Start sends `SWAP_TOOL TOOL=<slot>`; the wizard's prompts follow. Esc or a click outside closes it. Greyed while a job runs | The list includes the mounted tool; anything is sent before the confirmation; the list opens during a job |
| E5 | Tool macros with each tool mounted (desktop: the row along the bottom of the status box; narrower windows: the <tool> Macros panel) | Only that tool's macros (Bed cooldown only for BlockOne/SwitchFly); "Show N for other tools" lists the rest. **System Macros** is identical for every tool, and its Other macros list folds and stays folded after a reload. Neither offers Swap, List toolheads, Confirm tool, Pause, Resume or Cancel | Another tool's macro shows by default; the System Macros panel changes on a swap; Bed cooldown appears under the laser, spindle or knife |


## Job setup (phases 3-4): job files

Run A1-A4 first. Prepare itself never touches the machine: it only uploads files. The first run of each kind of file is the test, so go slowly and stay at the machine with a hand near the power switch.

Before any of these: Rhino config **1.4.3 or later** (real Z travel), `zero_max_z` 290 or less.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| P0 | Job setup: drop an SVG, then an STL; then click the BlockOne card and give it an STL | SVG: only Laser cutting and Knife cutting offered. STL: 3D printing first, laser and knife marked "Also possible". Card + STL goes straight to Set up & send with BlockOne | A flat drawing is offered for printing or milling |
| P1 | Job setup, any tool, with nothing connected | Toolheads and materials still listed ("Built-in copy"); Prepare and Download work; Send says to connect | The page errors, or Send is offered while offline |
| P2 | Connected: pick each tool | Materials match variables.cfg ("Read from Klipper"); the mounted tool is marked | A material is missing or a number differs from variables.cfg |
| P3 | BlockOne, PLA_0_4, a 20 mm cube, Prepare | Every check ticked; X/Y on the bed view near the middle | Any check fails on a plain cube |
| P4 | Download that file and read the top | `; rhino_toolhead = BlockOne`, `START_JOB TOOLHEAD=BlockOne MATERIAL=PLA NOZZLE_SIZE=0.4 EXTRUDER=0`, then `CALCULATE_PA BOWDEN_LENGTH=5.9 …` as in the Orca profile, `M83`, no `M104`/`M140` with a temperature, ends `END_PRINT` | Anything else |
| P5 | Send to Rhino, then Start it from Files | Files highlights it, says Fits mounted tool; Start runs START_JOB exactly as an Orca file (tool question, homing, preheat question, prime line), then prints the cube where the bed view showed | It moves anywhere unexpected, or heats to a temperature that isn't the material's: cancel |
| P6 | Move the cube to the left edge over the prime line | A "Clear of the prime line" note appears (a note, not a block) | It blocks, or no note |
| P6b | Put the part on the hatched Leadscrew area (Centre X 500, Y 325) | "Clear of the leadscrew" fails; Send is greyed | It can still be sent |
| P7 | Drag a part past the bed edge, or type Centre X 560 | "Inside the bed" fails and Send/Download are greyed | The file can still be sent |
| P8 | LightSaber, PLYWOOD, an SVG at **10 % power**, cardboard, Prepare, Send, Start from Files | Files starts it through LASER_JOB_SETUP (focus, test fire); the laser only fires inside the shape's outline, where the bed view showed it; rail off and bed parked at the end | The laser fires before the wizard's test, fires outside the outline, or stays on after the job: power off at once |
| P9 | Download the laser file, open it, start it with `SDCARD_PRINT_FILE FILENAME=<file>` from the Console (skipping the wizard), on cardboard | Head traces the shape but the laser **doesn't fire** (rail never switched on); END_PRINT parks | It fires: power off and report it |
| P10 | DragKnife, VINYL, an SVG, Prepare | The file plunges `G1 Z-0.3 F200` and lifts `G0 Z5`; start it from Files (DRAGKNIFE_JOB_SETUP sets Z0 on the vinyl); cuts the shape, backing uncut | The blade goes deeper than set, or the cut lands somewhere other than the bed view |
| P11 | HotJoe, SOFT_WOOD, a small plate, Steps: only **Outline, outside**, scrap board on a spoil board, Prepare | Checks show the stock size, depth = plate thickness, 5 mm clearance, and the through-cut note | Any check fails |
| P12 | Send, Start from Files, CNC_JOB_SETUP: X0 Y0 on the stock's front-left corner, Z0 on top | Spindle spins up from the wizard, cuts around the part (outside it) stepping down 1 mm, never moves outside the stock, lifts 5 mm between cuts, stops the spindle at the end | It cuts inside the part, goes outside the stock or below the board: E-stop |
| P13 | Change any setting after Prepare | The result disappears; Send needs Prepare again | An old file can still be sent |
| P14 | BlockOne, a 20 mm cube, open Advanced: seam Random, Z hop 0.4, Skirt loops 2, Prepare, Download | Every check ticked; the file has `G1 Z…` hops between moves and its settings line says `"seam":"random"`; START_JOB/CALCULATE_PA/END_PRINT unchanged | Any check fails, or the file sets a temperature |
| P15 | HotJoe, a plate, Stock above the part 2, Steps: Level the top, Rough out, Outline outside, ball end mill, Prepare | Checks show stock = part + 2 mm on top; Z never below the plate thickness; no move outside the stock. Cutting length 5 mm on a 7 mm plate: "Within the cutting length" fails | It passes with a cut deeper than the cutting length |
| P16 | Run P15's file on scrap, Z0 on the stock top | Levels the top 1 mm first, roughs, then cuts out; spindle stops at the end | Anything cuts outside the stock or below the board: E-stop |
| P17 | Slice a part in OrcaSlicer with the Rhino SwitchFly profile, drop the .gcode in Job setup | Says "Made by OrcaSlicer", picks SwitchFly from `; rhino_toolhead`, shows the toolpath on the bed, time and filament from the file; checks pass with only a temperature note; Send uploads it | It's sliced again, or a file with G28/T0/SWAP_TOOL can be sent |
| P18 | Drop a .gcode without a `; rhino_toolhead` line (e.g. from LightBurn) | Asks which toolhead it's for; picking LightSaber adds the line at the top of the uploaded copy; a file that has `ACTIVATE_LASER` or powers the laser above `laser_s_max` can't be sent | It can be sent without a toolhead, or with too much laser power |

## Toolheads (phase 5): library, tool pages, editing, adding

Studio sends the Portal the same requests as the Portal's own screens, so the Portal's rules apply. Run these with the machine idle and a print head mounted. Nothing here moves the machine; Restart Klipper does stop it, so only press it idle.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| T1 | Open Toolheads | Every tool from the Portal's library, built in and yours, with its slot, kind and care; the mounted one says Mounted. Matches the Portal's Tool library at port 5000 | A tool is missing or in the wrong slot |
| T2 | Select BlockOne, then LightSaber | Its page: About, the connector with the contacts it uses inked, the pin table, materials, macros, use and care, and its drawing (white lines in night mode). Select contact 15 on the drawing: its row is marked | A contact differs from the manual's pin sheet |
| T3 | On a tool page press Care tasks | Care shows that tool only, with "Show everything" to go back | Other tools' tasks show |
| T4 | Dashboard → a tool card under Toolheads at a glance | Opens Care for that tool | |
| T5 | Add a toolhead: Passive, a name, select 2-3 contacts, Next to Review | Review lists it and says which slot it becomes; Create opens its page; the banner lists "added <name>" | Anything is written before Create |
| T6 | Add a toolhead: Subtractive → Hot wire, leave the output empty, Next | "Choose the contact or pin for every output…", nothing sent | It moves on |
| T7 | Edit your new tool: change a material, select another contact, add a control (switch on a free pin) and a macro (`G4 P100`) | The control and macro dialogs show the exact custom_tools.cfg text as you type; a bad name shows the Portal's reason and Save stays greyed. Save changes → its page shows them; the banner lists the change | A broken macro can be saved |
| T8 | With a job running, open Toolheads | The banner says the restart waits for the job, offers "Restart Klipper by itself when the job finishes"; no Restart button | Restart is offered during the job |
| T9 | Idle: Restart Klipper | Asks first; then Klipper restarts, the "which toolhead is mounted?" question appears; the banner clears; `CHECK_TOOLHEADS` lists the new tool | Klipper won't start: open the Portal's banner and undo the last change, or report the red error |
| T10 | Edit tool → Delete tool on your test tool | Asks first (red); it's gone from the library after the restart; its care history is still in the work log | The mounted tool can be deleted |
| T11 | Edit tool → add a photo, then delete it | The photo shows on its page, then goes | |
| T12 | Stop the Portal, open Toolheads | Klipper's own tool list, with a note that the Portal isn't answering; no Add or Edit | Studio offers changes it can't make |
| T13 | Toolheads → Wiring → Tool connector; pick BlockOne, then LightSaber | Only that tool's contacts are inked; the table lists only those; contact 20's wiring note shows if PD12 isn't in the config | A contact differs from the manual's pin sheet |
| T14 | Wiring → System hardware → Add: `test_light`, Lighting, Rhino controls it, On/off, PD15 (FAN5) | The text it writes shows as you type; Add hardware saves it; the card shows under Lighting; the banner lists it. Restart Klipper (idle): `TEST_LIGHT_ON` / `_OFF` switch the header | The preview is wrong, or anything switches on by itself |
| T15 | Edit test_light → Remove hardware | Asks first (red); gone after the restart | Hardware a tool switches on can be removed |
| T16 | Toolhead setup → Kinds of tool: add a Passive kind with one material, Save; open Add a toolhead | The new kind is offered under Passive with its material. Remove it, Save | A built-in or in-use kind can be removed |
| T17 | Toolhead setup → Materials, nozzles, categories: add a nozzle size `9`, Save | The Portal's "must be between" message; nothing saved. Remove it | It saves |

## Care editing (phase 5)

Maintenance records only: nothing here moves the machine or changes Klipper. Run with the Portal on port 5000 open beside it to compare.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| M1 | Care → Tasks | Every task, one fold per area and tool, groups with nothing due folded; counts on Every task / Due / With a status match the Portal's Tasks page | A task is missing or in the wrong group |
| M2 | New task: "Test check", For Frame, After so much use, Machine production hours, every 50, Save | "In plain words" says "Due every 50 production hours, early alarm 10 h before" while typing; Save opens the task, which also shows in the Portal | The plain words disagree with the Portal's schedule column |
| M3 | Set status → Pending - Waiting on parts without a note, then with one | Greyed until there's a note; then the task shows the status, and the work log lists it | It saves without the note |
| M4 | Add this task to the Task Library, then Detach to customise | Linked: only Paused is editable, with Edit the library task / Detach; detached: the full form is back | Linked steps can be edited on the task |
| M5 | Delete task | Asks first (red); it's gone; its work-log lines stay | |
| M6 | Task Library → New Task Book with one task; Assign… to a toolhead; take it off with × | Assign adds the task to that tool (Tasks shows it); × asks, then archives it (Archived filter shows it) | The task is deleted outright |
| M7 | Usage meters → Set on Emergency stops: one more than now; then back | The readout and the Portal agree; the work log shows "Meter set" twice | |
| M8 | Untick, then tick the start-up reminder | The Portal's Usage meters → Reminders follows | |
| M9 | Care setup → Status codes: add one, Save, remove it, Save | Saved, then gone; a code set on a task can't be removed | One in use is removed |
| M10 | Care setup → Areas: add one, Save, remove it, Save; try to remove Motion X/Y | Saved, then gone; Remove is greyed for an area with tasks | |
| M11 | Phone: Care → the section button | The menu opens under it with the groups; picking one closes it | The page scrolls sideways |


## 0.6.2: Files list, Host, Logs

On the machine, Klipper ready, no job unless a row says so.

| # | Do | Pass | Stop if |
|---|---|---|---|
| FL1 | Files: drag two .gcode files and one .stl onto the dashed drop area | Both G-code files upload with progress, the list refreshes; the .stl is named as skipped. Nothing starts | A job starts, or the .stl reaches the Pi |
| FL2 | Files: click the drop area | The file picker opens (several files allowed) | |
| FL3 | Files with BlockOne mounted and verified | BlockOne files have one pastel green pill behind icon and name; other tools' files have none; there is no "Fits"/"Needs" column | Green shows while the mounted tool is unverified |
| FL4 | Files: Last run column, after a print finishes and after one is cancelled | "✓ Completed" and "– Cancelled" with the date, matching Job history; never-run files have a small hollow ring after the name (tooltip "Not run yet") | |
| H1 | Settings → Host, no job: Restart firmware, confirm | Klipper restarts; Studio shows it ready again | Anything moves |
| H2 | Settings → Host, Moonraker → Restart, confirm | Studio drops the connection and reconnects by itself | Studio stays disconnected |
| H3 | Start a job, open Settings → Host | Every button is greyed, "A job is running" shown | Any action runs |
| H4 | Reboot host, confirm | Host reboots, Studio reconnects within ~2 min. (Shut down: only if someone can switch it back on) | |
| L1 | Settings → Logs | klippy.log first; the end of the file is shown, scrolled to the bottom; Download gets the whole file | The page freezes on a big log |
| L2 | After a known error (e.g. a bad config line, restart) | "Last error in this part" shows the error block; Copy last error copies it | |

## 0.6.2: Live tuning (red padlock)

BlockOne mounted and confirmed, homed. Have a hand near Stop.

| # | Do | Pass | Stop if |
|---|---|---|---|
| T1 | Control, tuning strip, padlock closed | Speed, Z and limit controls are faded and do nothing | Any of them sends a command |
| T2 | Tap the red padlock | It opens (outlined); controls light up. Speed + → 105% in the strip and the Console's M220 line | |
| T3 | Z: step 0.01, tap ↓ Closer twice | Z offset −0.020; the nozzle moves 0.02 mm down, nothing else moves | Anything other than Z moves, or a step larger than chosen |
| T4 | Reset | Z offset back to +0.000, nozzle back up by the same amount | |
| T5 | During a print: unlock, adjust speed and Z | Applied live, no dialogs; the print continues | The print stops or the head jumps |
| T6 | Leave Control and come back | Padlock is closed again | It stays open |
| T7 | Swap to the laser | Tuning strip disappears (print heads only) | |

## 0.6.2: Install from zip (needs Tool Manager 1.5.3 on the Rhino)

The first 1.5.3 install is by hand (rhino.sh option 3); these check the next ones.

| # | Do | Pass | Stop if |
|---|---|---|---|
| Z1 | Settings → Software → Install from zip: drop a random .zip | "This isn't a Rhino Tool Manager release zip"; nothing kept, nothing installs | Anything installs |
| Z2 | Drop rhino-config-<same version>.zip | Shows its version vs installed; Install button; nothing installs yet | It installs without pressing Install |
| Z3 | Start a print, then press Install | Refused: a job is running | The install starts |
| Z4 | No job: Install, confirm | Steps tick through; "The Portal is restarting" while it does; done, then Studio reloads itself. Klipper restarted (axes unhomed) | It stops with no reason shown |
| Z5 | After Z4: Go back to <previous> | The previous version installs the same way | |

## 0.6.2: File manager (Files tabs)

Klipper ready. Keep Studio's Console open to compare. **Stop if** anything outside Moonraker's gcodes / config / logs folders is listed or changed, or Klipper restarts without you pressing a restart.

| # | Do | Pass | Stop if |
|---|---|---|---|
| F1 | Files: tabs Gcode files · Config · Logs · Job history | Each lists what is in that folder on the host (`ls ~/printer_data/gcodes` over SSH); folders first; sort by Name, Modified, Size (click again to flip) | Files from elsewhere on the disk |
| F2 | Gcode files: New folder "test", drag a .gcode from the PC onto its row | The row outlines while dragging; the file uploads into test (progress shown); breadcrumb Gcode files › test after opening it | It starts a job |
| F3 | Row menu (right-click; long-press on a phone; or ⋯) on that file: Rename, Duplicate, Move to folder… (back to the top), Download; then drag the row out to the desktop (Chrome/Edge) | Each does what it says, and the folder on the host agrees; Download and drag-out give the file | |
| F4 | Upload a file with a name already there | Asks Replace / Keep both / Cancel; Keep both makes "name (1).gcode" | It overwrites without asking |
| F5 | Start a print; open the menu on its file and on its folder | Edit, Rename, Move, Delete are greyed with "A job is using this file" / "…a file in this folder"; Duplicate and Download work; an "In use" tag on the row | Any of them runs |
| F6 | Config: open printer.cfg, add a comment line, Ctrl+S | "Saved. The file as it was is in studio_backups/printer.cfg.<time>.bak"; Klipper is NOT restarted; Restart Klipper to apply asks first | Klipper restarts by itself |
| F7 | Close the editor with unsaved changes; reload the page with unsaved changes | "Close without saving?" asks first; the browser warns before leaving | Changes lost without a question |
| F8 | Save printer.cfg 11 times | studio_backups keeps the newest 10 copies of it | |
| F9 | Open a G-code file over 2 MB, then klippy.log | Opens read-only (says why); nothing over 25 MB opens (downloads instead) | The page freezes |
| F10 | Delete the test folder | Confirms (red outline Delete) and says everything in it goes; gone from the folder on the host too | It deletes without asking |
| F11 | Logs tab | Read-only: no Upload, New, Rename or Delete anywhere | |
| F12 | Phone | No sideways scrolling; Upload button works; the drop area only appears while uploading | |
| JH1 | Job history | Matches Moonraker's history (`http://rhino.local/server/history/list`: status, start, print time, filament) and its totals; a deleted file is struck through with Reprint off | |
| JH2 | Reprint a finished print-head job with the same tool mounted | The same checks as Start (care note if due), then it starts | It starts with the wrong tool mounted |

## 0.6.2: Cameras, red panels, pin labels, Scan Config

| # | Do | Pass | Stop if |
|---|---|---|---|
| C1 | Settings › Cameras | Each camera row has a small live picture left of Turn off; a turned-off camera shows "Off"; scrolling it out of view stops its stream (crowsnest log or network tab) | |
| R1 | Control: tap the tuning padlock; Motion: Unlock | Each panel turns red (#c0281d) with white text and white-on-red controls; the padlock turns white; locking turns it back to paper and ink | |
| R2 | Pendant | Unchanged (Hold still inverts the keys; no red) | |
| PL1 | Assets › Hardware › Board pins and outputs (Tool Manager 1.5.3): Add label ENCLOSURE_LIGHT on a free header pin | Listed under Pin labels; the restart banner lists it; `myrhino/custom_tools.cfg` has `[board_pins rhino]` with it | Klipper restarts by itself |
| PL2 | In printer.cfg (Files › Config) add `[output_pin enclosure_light]` with `pin: ENCLOSURE_LIGHT`, save, Restart Klipper | Klipper starts; the label shows "Used by printer.cfg [output_pin enclosure_light]"; SET_PIN PIN=enclosure_light VALUE=1 lights it | Klipper reports an alias error |
| PL3 | Click the label's pin, pick another free pin | A save icon appears beside it and "was <old pin>" under it; press save: the banner says "<old> -> <new>" | |
| PL4 | Outputs: Label it on an output written with a raw pin, name it, Use | That one line in its file now says `pin: <label>` (prefix and comment kept); a copy is in `~/printer_data/rhino_data/config_backups`; Klipper starts after the restart | Any other line changed |
| PL5 | Remove a label something uses | Refused, naming what uses it | |
| SC1 | System hardware › Add, step 3: Scan Config | Lists your labels (free ones can be used; used ones say by what) and the pins your config files use; Use puts the label in the pin field; the saved section says `pin: <label>` | |

## Easier on a Pi 3B (after 0.6.2)

| # | Do | Pass | Stop if |
|---|---|---|---|
| LG1 | Settings › Cameras | Thumbnails change about once a second (snapshots), not a full stream; Control and the Dashboard still stream | |
| LG2 | Open a Toolheads page, start a print, watch the Portal log (or the network tab) for a minute | No /api/state reads every 10 s while printing; they resume when the job ends; a change you make still refreshes at once | |
| LG3 | During a print: upload a G-code file; open a G-code file over 1 MB | Each asks first ("…is printing… can make a small host stutter"); Cancel does nothing; small config files open without asking | It uploads or reads without asking |

## 0.6.3: trusted_clients (needs Tool Manager 1.5.4 for the Portal part)

Studio has no login: Moonraker's `[authorization] trusted_clients` decides. Before: note your
`trusted_clients` lines so you can put them back.

| # | Do | Pass | Stop if |
|---|---|---|---|
| TC1 | Open Studio as you run it today | No card; connects as before | The "doesn't trust this screen" card shows on a screen that is in `trusted_clients` |
| TC2 | Take your network's range out of `trusted_clients`, restart Moonraker, open Studio | Studio shows "Moonraker doesn't trust this screen" with this screen's address and a `/24` to add; top bar "Not trusted"; Moonraker's log shows no reconnect storm | Studio keeps reconnecting, or shows the page with no data |
| TC3 | Same state: open `http://<rhino>:5000` (the old Portal page) and try any change | Every action says "Moonraker doesn't trust this address (…)" | A change goes through |
| TC4 | Put the range back (Copy the lines helps), restart Moonraker, press Try again | Connects; Toolheads and Care load | |

### Trusted addresses (Settings) and Tailscale

| # | Do | Pass | Stop if |
|---|---|---|---|
| TC5 | Settings › Trusted addresses | Lists `trusted_clients`; "This screen is <address>, let in by <entry>"; no Remove on that entry or on 127.0.0.0/8 | |
| TC6 | Install Tailscale on the Pi (`curl -fsSL https://tailscale.com/install.sh \| sh`, `sudo tailscale up`); reload the page | **100.64.0.0/10 Tailscale** offered; Add, confirm: Moonraker restarts, screens reconnect, the list shows it; `ls ~/printer_data/rhino_data/config_backups` has a `moonraker.conf.*` copy | Moonraker doesn't come back (send `journalctl -u moonraker -n 30`) |
| TC7 | On your phone with Tailscale on and Wi-Fi off, open `http://<rhino's tailscale name or 100.x address>:5001` | Studio connects | The "doesn't trust" card shows |
| TC8 | During a print: try to Add or Remove | Refused: "A job is running…"; Moonraker not restarted | Moonraker restarts during the print |
| TC9 | Add `printer.local`, then `0.0.0.0/0` | Both refused with a clear message | Either is written |

## 0.6.4: Mike's layout notes (Oct 21)

| # | Do | Pass | Stop if |
|---|---|---|---|
| SW1 | Settings › Software › Install from zip after any install | Log (scrolls, all lines, Copy), then a one-line status bar, then the drop area. Status bar: Ready / Installing … step n of 6 with a bar / stopped at step n / Up to date | The log cuts off older lines |
| SW2 | Scroll the log up during an install | It stays where you are; "Jump to newest" brings it back | It jumps to the bottom while you read |
| CM1 | Settings › Cameras | Previews about 300 px wide on a PC, full width on a phone; still one picture a second | The Pi slows down on this page |
| NW1 | Settings › Network on the Pi 3B (bullseye) | Says the network is run by dhcpcd, that nothing is wrong, and to use raspi-config | |

## 0.6.5: narrow windows (browser snapped to half a screen)

| # | Do | Pass | Stop if |
|---|---|---|---|
| NW2 | Snap the browser to half the screen; open Assets › Board pins and outputs, Tool connector, then every other page | Nothing runs past a panel's edge and the page never scrolls sideways; Outputs shows two lines per output | Text runs off the panel |
| NW3 | Make the window narrower step by step down to phone width, watching the top bar | The red **Stop** button stays whole and on screen at every width; the logo text and "mounted" go first, then the tool name shortens with … | Stop is cut off or pushed off screen |

## 0.6.6: Update from GitHub, one Tool Manager row, PrusaSlicer keeps itself up to date (Tool Manager 1.5.8)

| # | Do | Pass | Stop if |
|---|---|---|---|
| GU1 | Settings › Software | No separate Rhino Studio row; Rhino Tool Manager says "…and Rhino Studio 0.6.6"; Latest shows GitHub's newest release | |
| GU2 | When a newer release is on GitHub: press Update on Rhino Tool Manager, confirm | The Rhino downloads it (button says Downloading…), then Install from zip shows the run: log, status bar, steps; Studio reloads at the end on the new version | It installs without asking, or during a job |
| GU3 | Install from zip with a downloaded zip | Works as before | |
| GU4 | PrusaSlicer row (a host with PrusaSlicer installed) | "Keep it up to date while I use it" ticked, with when it last updated itself; unticking sticks after a reload | |
| GU5 | After a PrusaSlicer update, press Go back | It doesn't reinstall that version by itself; the next newer one it does | It flips back to the version you left |

## 0.7.0: Bed mesh (needs Tool Manager 1.6.0 on the Rhino)

Start with BlockOne mounted and confirmed, the bed clear, a hand near Stop. Mesh checks BM1–BM9 on the Tool Manager side (its docs/testing.md) come first: they check the probe area.

| # | Do | Pass | Stop if |
|---|---|---|---|
| MS1 | Open Bed mesh before installing 1.6.0 | "Bed mesh is not set up", saying how to add it | It offers to make a mesh |
| MS2 | After 1.6.0, open Bed mesh | "No bed mesh in use: moves don't follow the bed." Make a mesh shows 60 °C (the material's bed temperature), soak 5, name bed-60 | |
| MS3 | Mount the laser (or no tool confirmed) | Make the mesh is greyed with the reason (the probe is on the print heads) | It lets you start |
| MS4 | BlockOne, press Make the mesh | Asks first, naming each step (home if needed, heat, soak, level, probe) and the command. On yes: the bed heats, soaks, Z_TILT_ADJUST runs, the bed is probed. Then "bed-60 is in use", "60°C · BlockOne · today", "Not saved yet: bed-60" | Anything moves before you confirm; the head goes outside the bed |
| MS5 | Compare the map with the bed | Front of the machine at the bottom of the map; the low/high corners match what you know of the bed; the probed numbers match the Console's `BED_MESH_OUTPUT` numbers (same mesh) | The map is mirrored or rotated |
| MS6 | Reading | Range, tilt and warp make sense: after levelling, tilt should be small. Highest/lowest X/Y match the points on the map | |
| MS7 | Save to printer.cfg | Asks, says Klipper restarts. After: no "Not saved", the tool question comes back, and "No bed mesh in use" (Klipper loads none at start) | It saves during a job; it would save something other than meshes without saying |
| MS8 | Use bed-60 | Asks; nothing moves; then "bed-60 is in use" | Anything moves |
| MS9 | Make a second mesh at 100 °C (bed-100), then Compare bed-100 minus bed-60 | Shows how the bed moved when hot (often the middle rises) | |
| MS10 | Switch off, then Remove a mesh | Each asks; the mesh leaves the list; Save takes it out of printer.cfg | |
| MS11 | Start a job | Every mesh button is greyed with "A job is running" | Any mesh action is possible during a job |
| MS12 | Phone | Bed mesh in the bottom bar ("Mesh"); the map's numbers are readable; nothing runs off the screen | |

## 0.8.0: Backups (needs Tool Manager 1.7.0 on the Rhino)

The checks are Tool Manager's **B1-B6** (Settings › Host › Backups). Also, in Studio:
- [ ] **BK1** With an older Tool Manager the panel says backups need 1.7, and nothing else on Host changes.
- [ ] **BK2** During a job, Back up now and Restore… are off and say "Not during a job".
- [ ] **BK3** Half-screen (~760 px) and phone: each backup's details sit under its name; Download and Restore… stay usable.

## 0.9.0: Slice profiles (needs Tool Manager 1.8.0 on the Rhino), plus the Oct 25 UI batch

Profiles (Job setup › Settings, and Settings › Slice profiles):
- [ ] **SP1** In Job setup, change a setting and press **Save as new**. The status says "Saved on the Rhino", and the profile appears in Settings › Slice profiles.
- [ ] **SP2** On a second device (the phone), open Job setup for the same toolhead. The same profile and settings come up.
- [ ] **SP3** Clear this browser's site data, reload, and load the same file. The profile and your changed settings come back from the Rhino.
- [ ] **SP4** Open the same profile on two devices, Save to profile on one, then on the other. The second save is refused with "changed on another device". After a reload it saves.
- [ ] **SP5** Settings › Slice profiles › History › Go back to this. The old settings are the newest revision, and what they replaced is in the history.
- [ ] **SP6** Export all, delete a profile, then Import… the file. Everything is back, and a clashing name gets " (2)". Deleted profiles show under "Deleted in the last 30 days" with Bring back.
- [ ] **SP7** Back up now, then restore only "Slice profiles and saved Prepare jobs". The profiles and jobs are as they were at the backup.
- [ ] **SP8** On a browser that used Job setup before 0.9.0, a prompt "Unsaved settings in this browser" appears in Job setup. **Import** makes "Imported …" profiles and the prompt doesn't come back. **Not now** stops it for good on that browser. × asks again next visit.
- **Stop if:** a profile or job change sends anything to Klipper (the console shows a line), or a save quietly overwrites a newer revision.

UI batch:
- [ ] **UI1** Motion, Speed and Flow each have the red padlock in the header. Unlocked, the panel turns red. Motion shows the seconds left.
- [ ] **UI2** Flow and pressure advance only change while the padlock is open. Feed filament doesn't need it.
- [ ] **UI3** Folding Speed or Flow locks tuning. The fold is remembered after a reload.
- [ ] **UI4** Console: input on top, newest line first.
- [ ] **UI5** Camera card is level with Motion on a wide screen, and 16:9 on the phone.
- [ ] **UI6** Settings › Host › Name on the network renames the Rhino (Keep/Undo as before). Network no longer has the field.
- [ ] **UI7** Settings › Software › Update on the Tool Manager row says "Updating…" until Studio reloads itself.

Control › Hardware and macro values (needs Tool Manager 1.9.2):
- [ ] **HC1** Control shows a Hardware panel listing your system hardware. The driver fan has a slider, a % field and Off. Type 50, Enter: the console shows `SET_FAN_SPEED FAN=<name> SPEED=0.5`, no confirm, and the fan changes speed. Off stops it (or slows it to its floor, for a 4-wire fan with no power pin).
- [ ] **HC2** A switch (a light) has Off / On and follows what Klipper reports after a restart.
- [ ] **HC3** A heater or spindle added with the wizard sits behind the padlock: its controls are greyed until unlocked; the panel turns red while unlocked and locks again on a tool swap, at the start of a job, or when you leave Control.
- [ ] **HC4** Macro buttons that take values show a small sliders icon. `DRIVER_FAN_SET` opens a prompt with SPEED, a 0-1 slider and the line it will send; Run sends it. A macro that moves or powers a tool still asks for confirmation after Run.
- [ ] **HC5** A macro without values (Lights full) still runs straight away.
- **Stop if:** a Hardware control drives a tool output (laser, spindle ESC, SERVO_LASER), or a live item changes while the padlock is closed.

Assets (was Toolheads; Mike, Oct 26):
- [ ] **AS1** The rail says Assets (phone bottom bar too). Its menu: Toolheads (Library, Tool connector, Kinds of tool), Hardware (System hardware, Board pins and outputs), Parts (Materials, Nozzles, Categories). Each Parts page shows only its own list and saves it.
- [ ] **AS2** An old address still works: `#/toolheads`, `#/toolheads/BlockOne`, `#/toolheads/wiring/hardware` and `#/toolheads/setup/lists` land on the new pages (Library, BlockOne's page, System hardware, Materials). A tool's page lights Assets in the rail and Library in the menu.
- [ ] **HE1 Edit wizard hardware** (Tool Manager 1.9.5+). Assets › System hardware › a wizard device › **Edit**. *Pass if:* its name, pins (its own pins are offered), settings and tools are filled in, the kind can't change, a PWM cycle shows as `0.00004` (not `4e-05`), and after Save and a restart it works as before with the change. *Stop if:* anything in `custom_tools.cfg` changed that you didn't change (compare the Check step's text with the file).
- [ ] **HE2** With a job hook that calls a device's macro (HK1), rename that device in Edit. *Pass if:* the Check step refuses it, naming the hook, and nothing is saved.
- [ ] **HK1 Job hooks** (Assets › Hardware › Job hooks). Subtractive tools › *When the job starts*: `DUST_ON` (or any wizard output's ON macro); *After the job ends*: its OFF. **Check**, then **Save**, restart Klipper. Start a HotJoe job: it switches on as the file starts, and off after the job ends; cancel one: it switches off. A BlockOne print doesn't switch it. *Pass if:* all of that, and **Save** stays greyed until **Check** passes for exactly what's typed. *Stop if:* anything moves or heats at the wrong moment; remove the hooks and restart.
- [ ] **HK2** Type `G28` under *Before the job starts* and press Check. *Pass if:* refused ("moves an axis") and Save stays greyed.

Large models and job saves (Tool Manager 1.9.7; Mike's Thingiverse sphere, Oct 27):
- [ ] **LM1 Large model.** Prepare › import a big model (the 4 MB sphere) with Kiri:Moto in the browser › **Prepare**. *Pass if:* the job file builds (no "Maximum call stack size exceeded"), the preview shows the whole part, and the file uploads. *Stop if:* the file's start and end lines are missing (`START_JOB … ` near the top, `END_PRINT` last): don't run it.
- [ ] **LM2 Job saves.** Import a model the Rhino hasn't seen and change one setting. *Pass if:* no "Couldn't save the job on the Rhino" message, and `journalctl -u rhino-portal --since "10 min ago" | grep "unhandled error"` prints nothing. Reload Studio and pick the same file: your setting is still there.

3D Preview, Studio 0.10.0 in Tool Manager 1.9.9 (the viewer sends nothing to the machine). Drawing speed on real screens is unmeasured, so PV4 and PV5 set the real limits:
- [ ] **PV1 Print file.** Files › a print file's ⋯ menu › **Preview**. *Pass if:* the part is drawn where it sits on the bed, the layer count and top height match the slicer's, and the file name above the drawing is the one you chose. *Stop if:* the drawing shows a different file from the name above it: don't rely on Preview until that's fixed.
- [ ] **PV2 Laser or knife file.** Preview a LightSaber file. *Pass if:* cuts are strong lines and moves with the laser off show only with **Show travel moves** on. *Stop if:* a move with the laser on looks like travel.
- [ ] **PV3 During a job.** While a job runs, open Preview on another file. *Pass if:* it asks before reading, and after **Read it anyway** the job carries on with no stutter and no "Timer too close" in `klippy.log`. *Stop if:* the job stutters or the log shows that error: stop previewing during jobs, and tell me the file size.
- [ ] **PV4 Kiosk (C260).** Open your largest file. *Pass if:* it opens within about 30 seconds, it turns without long pauses, and it starts in **Lighter drawing** (2 cores). Note the time and the file size. *Stop if:* the browser crashes or the screen locks up: note the file size and leave Preview off the kiosk.
- [ ] **PV6 Start from Preview.** With no job running and the file's tool mounted, press **Start job**, read the confirmation, then **Cancel**. *Pass if:* it's the same confirmation as Start in Files, and nothing moves or starts after Cancel. Then start a small job for real from Preview. *Pass if:* it runs as it does from Files, and a laser, CNC or knife file goes to its setup wizard first. *Stop if:* anything moves or powers on before you confirm, or a job starts without the wizard: use Files only and tell me.
- [ ] **PV7 Job setup with a big ready-made file.** Job setup › a ready-made G-code file of several MB › **Continue**, with the machine heating so its status keeps changing. *Pass if:* the page stays usable, and **Preview** then **Send to Rhino** work, ending with "Nothing has started". *Stop if:* the page freezes for many seconds at a time.
- [ ] **PV5 Phone.** Open a large file. *Pass if:* one finger turns it, two fingers zoom, and the page doesn't slide sideways. *Stop if:* the browser reloads the page by itself, which means it ran out of memory: note the file size.

3D workspace in Job setup (the workspace sends nothing to the machine; Prepare, Send and Start work as before). Saved tilts need the Portal from the same Tool Manager release:
- [ ] **PW1 Place and turn.** Job setup › a 3D model › a print tool. Drag the part, drag empty space, use **Turn on X**, **Turn on Y** and **Lay flat**. *Pass if:* the part follows the pointer, the view turns only from empty space, and the size and angle boxes change to match. *Stop if:* the drawing and the boxes disagree.
- [ ] **PW2 What's drawn is what's sliced.** Tilt the part, move it away from the centre, then **Prepare** and **Preview**. *Pass if:* Preview shows the toolpath the same way up and in the same place, and the first layer sits on the bed. *Stop if:* it's in a different place or the other way up: don't run that file.
- [ ] **PW3 Warnings.** Move the part off the bed and over the leadscrew. *Pass if:* it says so in words, and the check after **Prepare** agrees. *Stop if:* the check passes a file over the keep-out.
- [ ] **PW4 A real job.** Print a small part laid on a different face. *Pass if:* it prints in that orientation where it was placed, and the prime line stays clear. *Stop if:* the head goes anywhere other than the drawn area: cancel.
- [ ] **PW5 Other job types.** A laser drawing, a CNC model and a ready-made G-code file. *Pass if:* each opens from above, **3D** shows it, the choice is remembered on that screen, and a CNC part sits in its stock and can't be dragged.
- [ ] **PW6 Weak screens.** On the kiosk and a phone. *Pass if:* it stays usable, one finger on the part drags it and off the part turns the view. If it's slow, **Lighter drawing** returns to the view from above.
- [ ] **PW7 Several parts, real print.** A print job: **Add file** or right-click › **Duplicate**, then spread two different parts across the bed, one tilted, and **Prepare** with Kiri:Moto. Preview the file, then print it small. *Pass if:* each part prints where it's drawn, and the shorter part stops at its own height while the taller carries on. *Stop if:* the Preview shows a part somewhere else, or the head crosses the bed at print height with no lift between parts.
- [ ] **PW8 Several parts with PrusaSlicer.** The same two parts with **PrusaSlicer on the Rhino**. *Pass if:* the file lands where the parts are drawn, in the Preview and on the bed. *Stop if:* PrusaSlicer moves or merges them differently from the screen. It treats the set as one object, so check what support and brim do.
- [ ] **PW9 Several drawings, real cut.** A laser or knife job with two drawings placed apart, on scrap. Run the job's framing first. *Pass if:* both cut where they're drawn and the frame covers both. *Stop if:* the frame or the head goes anywhere outside what's drawn.
- [ ] **PW10 Menu by hand.** On a PC and a phone with a real graphics card: right-click, long-press, right-drag and one-finger drag on a part, and Esc during Lay flat. *Pass if:* right-drag and one-finger drag never open the menu, and the selected part's outline is easy to see in day and night themes. *Stop if:* a menu action changes a part other than the one named at the top of the menu.
- [ ] **TH1 A theme during a real job.** Load a theme from `Settings › Appearance`, Apply it, and start a short job. Check Pause and Cancel on Control, the Dashboard, a notice, the swap list and Unlock on Motion, by day and by night, on the kiosk and a phone. *Pass if:* Stop, Cancel and the unlocked panel can be told apart from everything else at a glance, from where you stand at the machine. *Stop if:* you have to look twice to find Stop or Cancel, or an unlocked panel doesn't turn red. Go back to Default colours and report it.
- [ ] **TH2 A background picture on the machine.** Settings › Appearance › **Add picture…**, using a phone photo. Try the dim and see-through sliders, then reload, and open it on another screen. *Pass if:* the picture shows on every screen, stays after a reload, and titles, Stop, alerts and the camera stay easy to read at the lowest dim setting. Run a job with the picture on and check the kiosk stays responsive. *Stop if:* the kiosk stutters or the picture covers Stop, an alert or an unlocked panel.
- [ ] **TH3 Fit and text colour on real screens.** With a small picture and a tall one, try each **How it fits** choice, then pick a **Text colour**. Check Control, the Dashboard and Files on a PC, the kiosk and a phone. *Pass if:* Actual size and Fit don't enlarge the picture past what's expected, and text stays readable on every panel. *Stop if:* a text colour makes Stop, Cancel or an alert harder to find. Pick **Theme's own** and report it.
- [ ] **TH4 Built-in themes.** Settings › Appearance › Theme lists 23 built-in themes on a Rhino that has never loaded one. Pick three, preview, Revert, then Apply one, and open Studio on a second screen. *Pass if:* a preview leaves other screens alone, Apply reaches them, and a Klipper restart keeps it. *Stop if:* Stop, Cancel or an unlocked panel looks different from the default look.
- [ ] **TH5 Typefaces at the machine.** Settings › Appearance › Typefaces: pick a title, subcategory and regular text font, and check Control, Job setup, Files and Care on a PC, the kiosk and a phone, with the machine's network cut off from the internet. *Pass if:* the fonts load, nothing runs off a button or panel, and a reload keeps them. *Stop if:* text is cut off on a control you need during a job. Pick **Studio's own** and report it.
- [ ] **HG1 Hologram during a real print.** Start a print of a file under 40 MB and open the Dashboard on a PC, the kiosk and a phone. *Pass if:* the turquoise model appears over the camera, the done part and the amber layer line match what's on the bed, and the amber line moves up one layer at a time. *Stop if:* the amber line is a layer or more away from the real nozzle height (the progress is wrong), or the print shows any stutter, blob or pause while the Dashboard reads the file: hide the model and report it.
- [ ] **HG2 Load on the host.** During the same print, watch the host's CPU (Portal or `top` over SSH) while two browsers open the Dashboard. *Pass if:* each browser reads the file once, the host's load settles within a few seconds, and moving between screens doesn't read it again. *Stop if:* Klipper reports "Timer too close" or the MCU loses contact.
- [ ] **HG3 Big file and the kiosk.** Print a file over 40 MB. *Pass if:* the Dashboard asks before reading it and **Show the model anyway** works. On the kiosk (Lighter drawing) the model stands still and the camera stays smooth. *Stop if:* the kiosk's camera or Stop button lags: hide the model and report it.
- [ ] **HG4 The 3D rhino finishes a job.** Watch the Dashboard on a PC as a short print completes. *Pass if:* during the print the rhino trots side-on at the front of the dial; at the end it runs up the right side seen from behind, across the back, down the left side coming head-on, then turns to face you, rears, hops and stands proud with sparkles. Its rump is no bigger than its shoulders. *Stop if:* the Dashboard stutters or the browser complains about graphics: note the PC and browser.
- [ ] **HG5 Touching the hologram.** During a print, click or drag the hologram, then let go. *Pass if:* it stops turning at once and starts again about 3 seconds after you let go. *Stop if:* it stays stopped, or never stops.
- [ ] **SM1 Marked supports, real print.** A part with one overhang that needs support and one that doesn't (a T, or a shelf bracket), Kiri:Moto. Supports: **Only where I mark**, mark under one overhang only, **Prepare**, then **Preview** before sending. *Pass if:* Preview shows support under the marked overhang only, and the print's support comes away from that overhang. *Stop if:* Preview shows support anywhere else, or none under the mark: don't print it.
- [ ] **SM2 Marks follow the part.** Mark a spot, then turn the part 90°, tilt it and move it, and **Prepare** again. *Pass if:* the amber mark stays on the same spot of the part, and Preview's support moves with it. *Stop if:* the support appears where the part used to be.
- [ ] **SM3 Saved with the file.** Mark two spots, leave Job setup, then open the same file again, and then a different file. *Pass if:* the same file comes back with its two marks and **Only where I mark**; the other file has none. *Stop if:* marks appear on a different file.
- [ ] **SM4 Marked supports with PrusaSlicer.** The same T, PrusaSlicer, Supports **Only where I mark**, mark under one wing, **Prepare**, then **Preview**. *Pass if:* support under the marked wing only. *Stop if:* support under both wings or none: don't print it. Then press **Mark supports** within a second or two of **Fit part** and click once on the kiosk. *Pass if:* the first click places a mark (the browser test sometimes needed a second click on software graphics).
- [ ] **SM5 Painting marks.** Job setup, a T-shaped part, Supports **Only where I mark**, **Mark supports**. Move the mouse over the part. *Pass if:* a ring in the theme's accent follows the pointer on the overhang below; press and drag grows it and release leaves a mark that size; a click inside a mark selects it (size − / + and Remove work). **Erase marks**, drag over a mark: it goes. Turn the view to look from below: the plate is see-through (Settings › Appearance › 3D view) and the marks are painted on the underside. *Stop if:* a mark lands somewhere other than where the ring showed, or Preview's support doesn't match the marks.
- [ ] **SJ1 Start job from Job setup.** Send a small print to the Rhino with the right tool mounted, then **Start job** on the "Sent as" line. *Pass if:* the same confirm as Files appears, the job starts, and Studio opens Control. *Stop if:* it starts without asking.
- [ ] **SJ2 Wrong tool mounted.** As SJ1 with another tool mounted. *Pass if:* it offers **Swap to <tool>** and doesn't start until the swap is confirmed and done. *Stop if:* it offers Start with the wrong tool.
- [ ] **SJ3 While a job runs.** Send a second file during a job. *Pass if:* no Start button, the "A job is running" line and **Open in Files**; nothing starts when the first job ends. *Stop if:* anything queues or starts by itself.

## Your macros and start/end G-code (needs Tool Manager 1.9.13 on the Rhino)

Have a hand near Stop. Nothing printing.

- [ ] **MB1 Starter macros.** Settings › Your macros › **Add the starter macros**. *Pass if:* Park the head, Heat for PLA and Cool down appear, and Park's last step goes to the park spot from `myrhino/positions.cfg` (the one END_PRINT uses). *Stop if:* Park's position isn't the one END_PRINT parks at.
- [ ] **MB2 Run from Control, heat only.** With BlockOne confirmed, Control › System Macros › Your macros › **Heat for PLA**. *Pass if:* it doesn't ask, and the hotend and bed head for the table's PLA temperatures. Then **Cool down**: both go to 0, part fan off. *Stop if:* a temperature other than the table's.
- [ ] **MB3 Run from Control, moving.** **Park the head**. *Pass if:* it asks first, listing the G28 (if not homed), the 10 mm lift and the move; after Proceed the head lifts, then parks. *Stop if:* it moves without asking, or goes anywhere other than the park spot.
- [ ] **MB4 Refusals.** Unconfirm the tool (or swap and don't confirm), press Park. *Pass if:* the console says to confirm the toolhead and nothing moves. Make a macro with a move past the travel (X 2000) and Test run. *Pass if:* refused before sending, saying the travel. *Stop if:* anything is sent.
- [ ] **MB5 Edit on a phone.** On a phone, Settings › Your macros: add a Wait step, move it up, remove it, save. *Pass if:* every control reaches, nothing scrolls sideways, and the macro is saved.
- [ ] **MB6 Start G-code on a toolhead.** BlockOne's page › Start and end G-code › Start G-code: **Park the head**, then restart Klipper from the banner. Print a small part. *Pass if:* after START_JOB heats and homes, the head lifts and goes to the park spot once, then the print starts normally (absolute moves, right feed rate). *Stop if:* the print starts from the wrong place or the first layer is in the air: Cancel.
- [ ] **MB7 Update after an edit.** Change Park (e.g. lift 15 mm) and save. *Pass if:* BlockOne's page says Park changed and offers **Update**; jobs keep the old lift until Update and a restart.
- [ ] **MB8 Backup and restore.** Back up now, delete a macro, then restore only **Your macros** from that backup. *Pass if:* the macro is back. *Stop if:* anything else changes.

## Print head tuning (needs Tool Manager 1.9.16 on the Rhino)

- [ ] **TU1 Extruder calibration.** BlockOne mounted and confirmed, its page › Tune › Extruder calibration. Tick the checks, heat, mark the filament 120 mm above the extruder, Push 100 mm. *Pass if:* it asks first, pushes slowly for about 100 s as two 50 mm moves with only a blink between them, and the value it works out from what's left matches by hand (new = old × (120 − left) / 100). Repeat until two runs agree; Save. *Stop if:* the extruder clicks or skips, or Klipper says "Extrude only move too long" (it shouldn't: each move is 50 mm, Klipper's limit).
- [ ] **TU2 Prints use it.** After TU1, prepare a small print with BlockOne in Job setup and start it. *Pass if:* at job start the console says "rotation distance <saved value> (tuned)" (Tool Manager 1.9.17 applies it; the file itself carries no tuned lines), and the print's walls look as before or better. *Stop if:* under- or over-extrusion appears: cancel and report the value.
- [ ] **TU3 Shown and backed up.** BlockOne's page › Tuning shows Extruder calibration ✓ with the date. Back up now, then restore only "Print head tuning results". *Pass if:* the value is still there.
- [ ] **TU4 First-layer squish.** BlockOne mounted, its paper test done (NOZZLE_HEIGHT_CALIBRATE), the bed washed. Tune › First-layer squish › PLA 0.4 › Make the test › Start job. *Pass if:* five square patches print one layer around the bed, clear of the prime line and keep-out areas; Closer / Farther move the nozzle 0.01 mm each (padlock unlocked, red); Keep saves, and the next print with BlockOne and PLA starts at that height (console: "Z offset … fine-tune …"). *Stop if:* the nozzle digs into the bed or a patch prints in a keep-out area: Cancel.
- [ ] **TU5 Pressure advance.** BlockOne, PLA 0.4, after TU1 and TU4. Tune › Pressure advance › Make the test › Start job. *Pass if:* 21 corner columns print in a row across the middle of the bed with counting marks under them (long under the 1st, 6th, 11th, 16th, 21st); the corners change from bulging (left) to dented (right); picking one and Refine prints 11 finer columns; Save, then a print's console says "Pressure advance <saved> for BlockOne PLA 0.4 mm (tuned)" at CALCULATE_PA. *Stop if:* the pattern runs into a keep-out area or off the bed, or the extruder skips: Cancel.
- [ ] **TU6 Extrusion multiplier.** BlockOne, PLA 0.4, after TU5. Tune › Extrusion multiplier › Make the test › Start job. *Pass if:* six 30 mm cubes print in a row, 3 mm tall, with smooth single-direction tops; the tops get visibly fuller from left (90 %) to right (100 %); Save, then a print's console says "flow <saved %> (tuned)" at job start. Then print something you know well with the 0.8 mm nozzle after tuning that nozzle too: *Pass if:* walls and tops look as good as before. *Stop if:* under- or over-extrusion appears in normal prints: Cancel and report the values on BlockOne's Tuning panel.
- [ ] **TU7 Test files into a new folder.** On a machine with no `gcodes/tuning/` folder (`ls ~/printer_data/gcodes/tuning` says no such file), BlockOne, PLA 0.4: Tune › First layer squish › Make the test. *Pass if:* it says "Sent as tuning/squish-BlockOne-PLA_0_4.gcode" and Files shows a `tuning` folder holding it. *Stop if:* "Upload failed: HTTP 500": send the reason in brackets and `grep -A12 "Upload Write Error" ~/printer_data/logs/moonraker.log | tail -15`.


## Bed › Configuration: moving one lead screw (Studio only; Nov 8)

Klipper v0.13.0-820 (the 7050). `[force_move]` is already enabled in toolchanger.cfg. Have a hand near Stop for all of these.

- [ ] **BC1 Bed, two sub-tabs.** Rail › Bed. *Pass if:* Bed mesh shows as before; Configuration shows the bed with front left, rear centre and front right screws where they really are, and the three Z-tilt probe crosses. An old `#/mesh` link opens Bed › Bed mesh. *Stop if:* a screw is drawn in the wrong corner: the map is read from `[z_tilt] z_positions`, so the config and the map disagree about which motor is which.
- [ ] **BC2 Direction.** Bed homed, no job, nothing on the bed. Tick Front left only, unlock (it asks once), Step 0.1, Up. *Pass if:* only the front-left corner rises, by a hair; Z shows "not homed" afterwards. Then Down puts it back. *Stop if:* the corner goes down on Up, or another corner moves: lock at once and report (the sign or the stepper order is wrong).
- [ ] **BC3 Each motor.** Repeat BC2 for Rear centre and Front right, then with two ticked. *Pass if:* the ticked corners move one after the other, by the step. *Stop if:* a screw binds, clicks or the bed frame visibly racks.
- [ ] **BC4 Turning by hand.** Tick one screw, Release to turn by hand (asks). *Pass if:* that motor turns freely by hand and the bed doesn't drop on its own; the map says "released"; Hold (or the next move) makes it hold again. *Stop if:* the bed sinks at that screw when released.
- [ ] **BC5 Locks.** Unlock, then wait 60 s; unlock and leave the page; unlock and swap a tool. *Pass if:* it locks each time.
- [ ] **BC6 The real recovery.** Next time Z-tilt faults out ("Move out of range" or "Too many retries"): Bed › Configuration shows the error under Home and level. Bring the bed close to level by eye with the screws, Home all, Level the gantry. *Pass if:* Z-tilt finishes and the table shows each pass with the range falling under 0.05. *Stop if:* homing Z goes wrong after the screw moves (it shouldn't: Z was marked not homed, and the saved park height was dropped so a laser or CNC won't take Z from it).

## Settings › Host health (Studio 0.18.1, needs Tool Manager 1.9.19 on the Rhino)

Read only: nothing on this page changes the machine. Best done once idle and once during a long print.

- [ ] **HH1 Cores and temperatures.** Settings › Host health. *Pass if:* four cores show a load that moves every second, each with its own temperature (coretemp "Core 0-3") and clock, and the package temperature; the graphs fill in over a few minutes. *Stop if:* a core sits above 85 °C idle: check the 7050's vents and fan before the next long print.
- [ ] **HH2 Programs.** *Pass if:* Klipper, Moonraker, Rhino Portal, Cameras and nginx are listed with CPU %, memory, the core each runs on and the cores it may use (0-3 unless core pinning is set up). Start a PrusaSlicer slice: it appears, then goes when it ends.
- [ ] **HH3 Boards.** *Pass if:* the main board shows a load under 60 %, a round trip of a few ms, and "0 B" resent; during a print, still 0 B resent. *Stop if:* bytes are resent while idle: check the board's USB cable and note the count.
- [ ] **HH4 Report.** Copy report, paste it into a note on the phone and the PC; Download saves a .txt. *Pass if:* both hold the same readings as the page, and "What to look at" says Normal when nothing is flagged.

## Job setup, Preview and cameras (Studio 0.19.0, Nov 9)

- [ ] **JS1 Parts on the 3D view.** Job setup with two models. *Pass if:* the 3D view fills the panel's width and the parts cards lie over its left side; clicking a card selects that part, and the view still turns by dragging beside the cards. *Stop if:* a card can't be clicked or the view can't be dragged.
- [ ] **JS2 Green on the plate.** A print with a flat bottom, then Lay flat on another face. *Pass if:* a thin green line runs round the base, and the face laid flat is green seen from below. A tilted part shows green only where it touches. *Stop if:* green shows on a part that's floating.
- [ ] **JS3 Supports in Settings.** Kiri:Moto, then PrusaSlicer. *Pass if:* Supports (Off, Automatic, Only where I mark) and Mark supports are at the top of Kiri's Support section and of PrusaSlicer's Support material page; marking still works on the 3D view. *Stop if:* a mark placed doesn't reach the sliced file (check in Preview).
- [ ] **JS4 PrusaSlicer sections fold.** *Pass if:* each section folds and opens from its title, and stays folded after a reload.
- [ ] **JS5 Prepare.** Change a setting, press Prepare at the bottom of Settings. *Pass if:* it slices and opens Preview, the same as the Preview step.
- [ ] **JS6 File name.** Job file: type a name, Send to Rhino. *Pass if:* Files shows it under that name (spaces become _), and Start job sits in the same row as Send, Preview and Download. *Stop if:* a file lands anywhere but the gcodes folder.
- [ ] **PV8 Preview plate.** *Pass if:* Preview shows the same white plate and grid as Job setup, in day and night, and see-through from below by the Appearance setting.
- [ ] **CM1 Camera framing.** Settings › Appearance › Cameras: Dashboard zoom 150 %, Control Whole picture. *Pass if:* the Dashboard picture is enlarged from the middle and Control shows the whole picture with bars; Reset puts both back. *Stop if:* a camera turned or mirrored in Settings › Cameras shows the wrong way after zooming.
- [ ] **CM2 Camera preview.** Settings › Cameras › Edit. *Pass if:* the preview is a 16:9 picture with the same space (about 5-6 mm) above and below it, and the panel is no taller than the form.
- [ ] **SND1 Sound controls.** Before the microphone is installed: Settings › Cameras › Sound, tick it, press Sound off. *Pass if:* it says the microphone service isn't running and names docs/install-mic.md; the Dashboard shows Sound beside the camera's name. After installing (Tool Manager MIC1-MIC4): sound plays, the volume is this screen's own, and leaving the Dashboard stops it. *Stop if:* sound plays without a tap, or keeps playing after leaving the page.

## Wizard rhino and laser / drag knife tuning (needs Tool Manager 1.9.23 on the Rhino; Nov 10)

Run the laser tests on scrap plywood with glasses on, extraction running and an extinguisher nearby; stay for each test.

- [ ] **WR1 The rhino in every wizard.** Add hardware, Add a toolhead, and Tune on a print head, the LightSaber and the DragKnife. *Pass if:* a rhino stands beside each step, drawn in the page's ink in day and night, with the paper showing through its body; on a phone it sits above the step, smaller. *Stop if:* a rhino shows as a solid block, or covers a field.
- [ ] **LT1 Focus ramp.** LightSaber › Tune › Focus height, ramp 2 to 14 mm. Start it; when asked to set focus, lower until the shroud just drags a sheet of paper on the material. *Pass if:* before any X/Y move the bed drops (Z goes up) to 14, the line runs 60 mm getting farther away, ticks every 1 mm with labelled long ticks at 5 and 10; the laser is never on while the bed moves without a cut. Pick the thinnest tick, Save. *Stop if:* the bed moves up toward the laser after the zero, or the shroud touches the material.
- [ ] **LT2 Cut grid.** Cut power and speed, defaults. *Pass if:* labels mark (not cut) the speeds above the columns and the power % left of the rows; 25 squares are cut; picking one shows Was and Now and Save keeps both power and speed for PLYWOOD. *Stop if:* a square or a label lands outside where the pattern was placed, or over the leadscrew.
- [ ] **LT3 Engrave grid.** *Pass if:* 25 filled squares, darker towards high power and slow speed; Save keeps engrave power and speed separately from the cut values.
- [ ] **LT4 Passes and kerf.** *Pass if:* passes cuts five squares, 1 to 5 times each; kerf cuts one 20 mm square, and a part measuring 19.8 saves a kerf of 0.1 mm. *Stop if:* a part measured larger than 20 is accepted.
- [ ] **KT1 Knife depth.** DragKnife › Tune › Depth on vinyl over its backing. *Pass if:* six 20 mm lines, each deeper (0.10 to 0.35 mm); the setup's Z zero and test cut ran first; Save keeps the depth and, if typed, the pressure dial for that material. *Stop if:* the blade goes deeper than the last value, or cuts the mat.
- [ ] **KT2 Blade offset.** *Pass if:* five 15 mm squares with offsets 0.1 to 0.5 mm; one has sharp, closed corners; Save keeps it once for the knife (not per material). *Stop if:* the knife drags across the work between squares (it lifts 2 mm first).
- [ ] **TP1 Tool page.** LightSaber's and DragKnife's pages. *Pass if:* a Tuning panel shows each test once per lens or blade, and per material in a table, with ✓ and the date after a save.
- [ ] **JS7 Job setup starts from tuned values.** After LT2 and LT4 (or KT1-KT2), Job setup with a drawing for that tool and material. *Pass if:* Power, Speed, Passes and Kerf (knife: Depth per pass, Blade offset) show the tuned values and the line under them reads "Tuned for <material> on <date> … In use."; change one, "Use tuned values" appears and puts it back. A material with nothing tuned says "Not tuned for … yet" with a link to Tune. *Stop if:* a file sliced for one material uses another material's tuned values.

### Help (Settings › Help, the ? in the top bar)

Run with the Rhino's network unplugged from the internet (the router's WAN cable out, or the host's gateway blocked), so it proves Help needs nothing outside the shop.

- [ ] **HP1 Help offline.** Settings › Help. *Pass if:* the contents list six parts; Bed opens with its pictures; the search finds "pressure advance" and a hit opens its section; the footer names the installed Tool Manager version. *Stop if:* a page is blank, a picture is broken, or anything waits on the internet (only Printable PDF may).
- [ ] **HP2 The ? opens this screen's chapter.** Press ? on Control, Job setup, Bed › Configuration, Files, Assets, a Tune page, Care and Settings. *Pass if:* each opens its own chapter (Bed › Configuration at the lead screw section, Tune at Tuning a print head); on Help itself the ? is filled and opens the contents. *Stop if:* the ? is missing on a phone, or covers Stop.
- [ ] **HP3 A missing page.** Open `http://rhino.local/#/settings/help/nope`, then `http://rhino.local/help/nope.html` in the address bar. *Pass if:* the first says there's no such page and shows the contents; the second is a plain 404.

### Start wizard (laser and drag knife, Tool Manager 1.9.25)

- [ ] **SW5 Start a laser job from Studio.** Files › a LightSaber file › Start. *Pass if:* the start wizard opens; Next stays off until every checklist line is ticked and until SET in Klipper's Set Z zero window; Trace the outline asks, then traces the job's corners 5 mm above the zero with the laser off; Test fire asks, fires the 5 % pulse, then asks "Is there a small, sharp mark"; Start the job asks, the job starts, Control opens and the laser only powers once the file has loaded. Repeat with the DragKnife (test cut, then "Cut looks good"). *Stop if:* anything moves or fires without asking, the outline is traced with the laser on or outside where the job sits, or the job starts without a fresh zero. Swap tools half way: *pass if* the wizard goes back to the Z zero step.

### Spindle tuning and bits (Tool Manager 1.9.26)

In scrap of the material, clamped flat, glasses and hearing protection on, extraction running.

- [ ] **CT1 Bits.** Assets › Parts › Bits: add the bit in the collet (name without spaces, its packet diameter, flutes, cutting length), Save bits. *Pass if:* it's listed after a reload, and Tune HotJoe and Job setup offer it. *Stop if:* a bit saves with a space in its name.
- [ ] **CT2 True diameter.** Tune HotJoe › True diameter, start it. In the CNC setup: X/Y zero on the stock's front-left corner, Z zero on its top. *Pass if:* one 30 mm slot 5 mm in from both edges, as deep as set; the caliper's inside jaws read close to the bit's size (within 0.1 mm), and Save keeps it once for the bit. *Stop if:* the bit plunges outside the stock, deeper than set, or before the spindle runs.
- [ ] **CT3 Feed.** *Pass if:* five slots left to right, faster each time, all at the same shallow depth; the bit lifts 5 mm between them; the Was/Now table shows the throttle the setup ran at; Save keeps feed and throttle for this bit and material. *Stop if:* a slot runs at a feed other than its label (watch the console), or the spindle stops mid-slot.
- [ ] **CT4 Depth per pass.** *Pass if:* five slots, deeper each time, never deeper than the bit's cutting length; Save keeps depth and plunge. *Stop if:* the spindle bogs down or the bit deflects visibly on the first slot: stop and lower the first depth.
- [ ] **CT5 Job setup.** A CNC job for that material: pick the bit. *Pass if:* tool type, the measured diameter, cutting length, feed, plunge and depth per pass fill in, and the line under the settings names the bit and the throttle to set in the setup. *Stop if:* another bit's or material's values appear.

### Laser operations (Job setup › Settings)

On scrap plywood, glasses on, extraction running. A drawing with an outline and two holes inside it.

- [ ] **LO1 Picking.** Add an Engrave fill, click one hole on the drawing; add a Cut, click the outline. *Pass if:* the drawing shows the numbers on the loops, the fill hatched; a loop picked for a second cut leaves the first; the warning says the outline cuts around loops that run after it until it's the last operation. *Stop if:* a click picks a different loop than the one under the pointer.
- [ ] **LO2 The job.** Prepare, then run it through the start wizard. *Pass if:* the Preview and the cut follow the list: the fill engraves the hole at its power and spacing, the other hole is cut by Everything else, and the outline is cut once everything inside it is done (move it to the bottom first). *Stop if:* the laser fires at a power or place that isn't in the list, or the outline is cut before the work inside it.
- [ ] **LO3 Kept with the file.** Close Studio, open Job setup with the same drawing. *Pass if:* the operations and their picks come back; moving the part keeps the picks. *Stop if:* the picks land on other loops.
- [ ] **SW6 Start a CNC job from Studio** (Tool Manager 1.9.27). Files › a HotJoe file › Start. *Pass if:* six steps: the checklist; X/Y zero with the jog panel under it (Set X/Y zero here asks, nothing moves); Z zero in Klipper's window; Trace the outline traces the job 5 mm above the stock, spindle off, starting from the X/Y zero just set; Start the spindle asks, checks the lid, lifts 10 mm and ramps to the throttle typed, and the page says "Spindle running at …% throttle", the same number Control shows; ±5 % each ask; Start the job asks, the job starts, Control opens. *Stop if:* anything moves or spins without asking, the outline lands away from the stock, or the job starts with the spindle stopped. Stop the spindle on the Spindle step: *pass if* it stops and the bit lifts.

## Console reads lines like Klipper; Install from zip takes the .sig (Studio 0.25.0, Tool Manager 1.9.29)

- [ ] **CS1 Line numbers.** Console, with any tool mounted: `N1 M3 S0`. *Pass if:* the confirmation names M3 ("switches
  the laser or spindle on"); Cancel. *Stop if:* it is sent without asking.
- [ ] **CS2 The raw command behind a wrapper.** With the LightSaber mounted: `G28.1 X Y` (X and Y only; never Z without
  a print head). *Pass if:* it asks, and the reason ends "…the raw Klipper command behind the Rhino's G28 wrapper: its
  own checks are skipped"; Cancel. Then `M104.1 S0`: asks the same way. *Stop if:* either goes without asking.
- [ ] **CS3 Quoted values.** `SET_GCODE_VARIABLE MACRO="SWAP_TOOL" VARIABLE=current_tool VALUE=0` (VALUE=0 is what
  Klipper already has after a restart; still Cancel). *Pass if:* it asks as a tool-state change.
- [ ] **ZS1 Zip and signature.** Settings › Software › Install from zip: drop the zip alone. *Pass if:* the drop area says
  "…is here: now its .sig" and nothing uploads; drop the `.sig`; both upload and the zip shows as checked. The `.sig` of
  another release: "doesn't belong to". *Stop if:* a zip is kept without its signature.

## Next Tool Manager release (1.9.30): readouts for the Klipper extras, and the audit's should-fixes

Built Nov 14 against the mock (`MOCK_HARDWARE=1`: a filament encoder and a spindle tachometer; `MOCK_EXTRAS=linked`
for the Host page). The modules themselves are proven by the Tool Manager's FE7-FE13 and SP8-SP10 first.

- [ ] **RD1 Spindle RPM in the status strip.** HotJoe mounted, warm-up at 0.6 from the start wizard. *Pass if:* the
  Spindle cell's small line reads "N rpm · throttle" with N near the SP5 figure, and "Relay open" again when the rail
  is off. *Stop if:* the cell shows rpm with the relay off.
- [ ] **RD2 Dashboard rail.** During RD1, the Dashboard's bottom rail has a "Spindle … rpm" reading with the throttle
  under it; it disappears when the rail is off.
- [ ] **RD3 Filament chip.** BlockOne mounted, Control › Hardware: the encoder chip reads "Filament OK · N°" and the
  angle follows the wheel by hand; during a print, "Moving · measured / commanded mm · N % slip". *Stop if:* the chip
  says "Off (no print head)" with a print head mounted.
- [ ] **RD4 Host › Klipper extras.** Settings › Host shows the two modules linked; `rm` one link on the host, reload:
  the panel says "1 of 2 not linked" and Relink (with its confirm) restores it. *Stop if:* Relink reports a real file
  in the way.
- [ ] **S1 Your own macro asks.** Add `[gcode_macro MY_PARK] gcode: G28` to the config, restart, press its button on
  Control. *Pass if:* the confirmation shows "its gcode runs G28: homes the machine". Remove the macro afterwards.
- [ ] **S2 Prompt buttons.** Upload a G-code file containing `RESPOND TYPE=command MSG="action:prompt_button Go|FORCE_MOVE
  STEPPER=stepper_z DISTANCE=50|primary"`. *Pass if:* Prepare's checks refuse the file (prompt button). In a Rhino wizard
  prompt, each button whose command differs from its label shows the command in small type under it.
- [ ] **S4 Heater limit from Klipper.** Control, hotend field: type 295. *Pass if:* "Enter 0 to 290°" (the config's
  `max_temp`), and 290 is accepted. *Stop if:* 295 is sent and Klipper answers "out of range".
- [ ] **S5 Padlocks time out.** Unlock Hardware and Flow (tuning); wait 60 s without touching them. *Pass if:* both
  relock, their labels count down, and switching apps on a phone relocks them at once.

## Next release: the belt guide, batch A (Care › Microphone test; looks and listens only, sends nothing to the machine)

Needs the camera sound set up (Settings › Cameras › Sound, Tool Manager 1.9.21 or later). The page listens through the same
WebRTC stream as the Dashboard's sound. No browser microphone permission and no HTTPS are needed, but nothing is proven
until BT0 passes: the C920's microphone rolls off at low notes and the Opus stream is lossy.
- [ ] **BT0 Tone test.** Care › Microphone test › Listen to the camera microphone. On a phone play a steady tone near the
  camera: 100 Hz, then 150 Hz, then 200 Hz (a tone generator app or web page). *Pass if:* **Hearing** shows each tone
  within 1 Hz, the marker on the spectrogram sits on it, and the level line says "Level is fine". *Stop if:* it shows
  nothing, or a different note (twice or half): write down what you played and what it read, and don't go on to the
  belt guide. The typed-Hz route stays available.
- [ ] **BT1 Fans and the room.** Part fan and hotend cold (so its fan is off), motors off, driver fans off if you can. Press
  **Learn the room (5 s)** and stay still. Then switch the part fan on and learn again. *Pass if:* the quiet room reads
  "quiet" (or names the one fan you left running), the fan-on room says "A steady tone at N Hz and its multiples", and
  after learning the fan no longer shows on the spectrogram. *Stop if:* a fan you switched off is still named: say which.
- [ ] **BT2 One belt.** Fans as in BT1, room learned, motors off, gantry at the middle. Flick one belt's long span with a
  plastic tool three times, about 1 cm from the camera's microphone side if you can. *Pass if:* each flick shows up as a
  "Last pluck" within about a second, and three flicks agree within 1 %. Write down the note of each belt (it tells us
  where a 15 mm 2GT belt sits). *Stop if:* the belt rings but no pluck appears, or the readings wander by more than 3 %:
  tell me the Hz you saw, the distance and which fans were on.
- [ ] **BT3 It stops listening.** After BT0, press **Stop** (or leave the page). *Pass if:* within 30 seconds
  `pgrep ffmpeg` on the Rhino prints nothing. *Stop if:* ffmpeg is still running: the microphone service is
  not stopping when nobody listens; note how long it ran.

## Next release: Care guides and the "What's happening" strip (Studio only; the guides send nothing to the machine)

- [ ] **CG1 Guide me.** Care › Tasks, press **Guide me** on the "Clean the collet and collet nut" task (CNC tool in the list). With the spindle
  relay on, then off. *Pass if:* Start is disabled and says the spindle relay reads on while it is on, and enabled once it is off;
  every step must be ticked in order; the last step goes to a log; **Log the work** puts a "Guided: all N steps ticked" entry in the Work log
  and moves the due date. *Stop if:* Start is enabled while the spindle relay reads on.
- [ ] **CG2 Gates keep watching.** Start "Check the hotend screws, heater and thermistor wiring" with the hotend cold, then heat the hotend
  to 60° from Control while you are on step 1. *Pass if:* the step shows "Holding. The hotend is 60°. Let it cool first." and **Done, next** is
  disabled until it cools. *Stop if:* you can tick on while it is hot.
- [ ] **CG3 The electronics bay wait.** Start "Clean dust from the electronics bay and fans" and tick step 1. *Pass if:* a two-minute countdown
  runs, **Done, next** and **Back** stay off until zero. *Stop if:* you can skip the wait.
- [ ] **CG4 What's happening.** Open any BlockOne tuning test (Assets › BlockOne › Tune › First-layer squish), start the test job, and watch the strip
  at the top of the page. *Pass if:* it says "Heating the hotend: N° of M°", then "Running <file> · N %", with the last console lines under it, and the
  line "You can leave this page" while the job runs; leaving the page and coming back shows the same job still running. *Stop if:* the strip
  disagrees with the Dashboard (heating said while Control shows the hotend at temperature, or the percentage differs by more than a few points).

## Next release: the emergency stop wizard (Care › Tasks › "Inspect the machine after an emergency stop or shutdown" › Guide me)

Do these with the machine idle, no job, hands clear, a hand near Stop. The wizard restarts Klipper and homes only after its own confirm.
- [ ] **ES1 What happened.** Press **Stop** in Studio's top bar (M112), then open the task's Guide me. *Pass if:* "Klipper says: shutdown:
  Shutdown due to M112 command" shows, and "The emergency stop was pressed" is already picked. *Stop if:* the message is missing while
  Klipper is shut down.
- [ ] **ES2 The restart asks.** Go on to the restart step. *Pass if:* **Done, next** is off until Klipper says Ready; **Restart Klipper** asks
  "Restart Klipper?" and lists FIRMWARE_RESTART; after you confirm and it comes back, the step lets you go on. *Stop if:* it restarts
  without asking.
- [ ] **ES3 Homing is gated and must be run.** On the homing step, turn a heater on first (hotend 60° from Control). *Pass if:* **Home all
  axes** says "A heater is on" and stays off; with every heater off it asks "Home all axes?" with G28, and **Done, next** stays off until you
  have run it and X, Y and Z read homed. *Stop if:* you can go on without homing, or it homes with a heater on.
- [ ] **ES4 The log.** Finish the wizard. *Pass if:* the Work log entry reads like "After a stop. The emergency stop was pressed. Klipper said:
  “Shutdown due to M112 command”. Restarted Klipper, homed all axes and moved each axis freely.", and the task's due date moves. *Stop if:*
  the cause or Klipper's message is missing.
- [ ] **ES5 The tool sensor stop.** With the tool sensor disagreeing with the selected tool (the toolchanger's own stop), try the homing step.
  *Pass if:* **Home all axes** says the tool sensor disagrees and stays off. *Stop if:* it homes anyway.

## Next release: the level wizard (Care › Tasks › "Level the gantry (Z_TILT_ADJUST) and check the first layer" › Guide me)

Hand near Stop; nothing on the bed. The wizard runs Z_TILT_ADJUST only after its own confirm.
- [ ] **LV1 Gate.** With a laser or CNC tool mounted, open the guide. *Pass if:* Start is off and says to mount and confirm a print head;
  with BlockOne mounted and confirmed it is on. *Stop if:* Start is on with a non-print head mounted.
- [ ] **LV2 Level.** Start, then **Level the gantry**. *Pass if:* it asks "Level the gantry?" with Z_TILT_ADJUST; the list under the step shows each
  pass ("Pass 1: range 0.412 mm" and so on) matching the console; **Done, next** stays off until a pass is within tolerance, then
  goes on. *Stop if:* Done, next is on before Klipper finished within tolerance.
- [ ] **LV3 A failed level.** Use Bed › Configuration to throw the bed far off level until Z-tilt faults (or wait for a real fault), then run
  the wizard's level. *Pass if:* it shows "Stopped: <Klipper's message>" and "Holding. Levelling failed: …" with the advice to bring the
  bed close to level by eye, and Done, next stays off; after you fix it and press **Level the gantry** again it passes. *Stop if:* a
  failed run lets you go on.
- [ ] **LV4 Not homed.** Start with the axes unhomed (after a restart). *Pass if:* the first step is **Home all axes** (it asks, with G28) and
  the level step only comes after X, Y and Z read homed; with the axes already homed there is no homing step. *Stop if:* it levels
  without homing.
- [ ] **LV5 The log.** Finish. *Pass if:* the Work log reads like "Levelled the gantry: 2 passes, final range 0.021 mm, tolerance 0.050
  mm.", and the task's due date moves. *Stop if:* the range is missing or differs from the last pass in the console.
- [ ] **LV6 Phone.** On a phone, scroll to the bottom of any guide. *Pass if:* the last buttons (Start, Done, next) can be scrolled clear of the
  bottom bar and tapped. *Stop if:* a button stays hidden behind the bar.

## Next release: the Z drive service wizards (Care › Tasks › "Clean and lubricate the Z leadscrews" and "Check the Z belt drive (2:1 reduction)" › Guide me)

Hand near Stop; nothing on the bed. The wizards send only G28 and Z_TILT_ADJUST, each after its own confirm. They never move Z themselves:
the reach and the full-travel run are done by you in Control › Motion.
- [ ] **ZD1 Leadscrews, the order.** Start the lubricate guide. *Pass if:* it goes reach the screws, clean, grease, Home all axes (asks, G28),
  run Z through its travel in Control, the backlash question, then the level reminder; **Done, next** on the home step stays off until you
  have run it, even if the axes already read homed. *Stop if:* you can go past the home step without running it.
- [ ] **ZD2 Heaters.** With the hotend at 60° from Control, reach the home step. *Pass if:* **Home all axes** says a heater is on and stays off.
  *Stop if:* it homes with a heater on.
- [ ] **ZD3 Belt, the hand-turn.** Start the belt guide with a print head mounted (it needs one). At the hand-turn step use Bed › Configuration
  to release all three screws. *Pass if:* all three turn together by hand, the link opens Bed › Configuration, and Hold works. *Stop if:* a
  screw doesn't move with the others (a slipping pulley or a worn belt): note which, and record "worn" or "replaced".
- [ ] **ZD4 Belt, re-home then level.** After the release. *Pass if:* the next step is Home all axes (Z reads un-homed), it asks, and the
  level step only comes after X, Y and Z read homed; the level asks (Z_TILT_ADJUST), lists each pass, and Done goes on only when Klipper
  finished within tolerance. *Stop if:* it levels without homing.
- [ ] **ZD5 The log.** Finish each. *Pass if:* the Work log reads like "Z leadscrews cleaned and lubricated. Nut backlash: slight. Re-homed and ran
  Z through its travel." and "Z belt drive checked: replaced the belt. All three screws turned together by hand. Levelled: 2 passes, final range
  0.021 mm.", and each task's due date moves. *Stop if:* the finding or the range is missing.
- [ ] **ZD6 Belt needs a print head.** With a laser or CNC tool mounted, open the belt guide. *Pass if:* Start says to mount and confirm a print
  head; the lubricate guide still starts. *Stop if:* the belt guide starts without a print head.

## Next release: the nozzle, spindle run-in, spindle runout and umbilical wizards, and guide progress (Care › Tasks › Guide me)

Guide progress is kept in memory for the session (not saved anywhere): leaving a guide to use Control and coming back returns you to the same step.
- [ ] **GP1 Progress survives a trip.** In any guide, go to the second step, open Control, then come back to the same guide. *Pass if:* you are on the
  same step with the same answers, and **Start over** clears it. A countdown that was running carries on. *Stop if:* you land back on the start.
- [ ] **NZ1 Gate and heat.** Replace the nozzle, BlockOne mounted. Pick a temperature and press **Heat the hotend**. *Pass if:* the strip says "Heating the
  hotend: N° of 210°", the step says "Holding. Heating…", **Done, next** stays off until the hotend is within 3° of target, then a two-minute soak
  runs before the next step. *Stop if:* you can go on while it is still heating.
- [ ] **NZ2 Heat off.** At the heater-off step. *Pass if:* **Switch the heater off** switches the hotend off, and the step goes on only once no heater
  has a target. *Stop if:* heat is left on after the guide is finished.
- [ ] **NZ3 The log.** *Pass if:* the Work log reads like "Replaced the nozzle: fitted 0.6 mm, hot-tightened at 210°. Z offset redone."
- [ ] **SR1 Run-in never starts the spindle.** Spindle run-in, HotJoe mounted, spindle off. *Pass if:* the guide shows each console line to type
  (Spindle_ACTIVATE, SET_PIN … 0.5, 0.65, 0.8, 1.0, Spindle_DEACTIVATE), nothing in the guide sends one, and each of your commands asks before it
  runs. *Stop if:* the guide starts the spindle by itself.
- [ ] **SR2 Run-in steps.** Type Spindle_ACTIVATE in Control › console, come back. *Pass if:* you are on the same step and **Done, next** is now on; each
  speed step shows the live relay, throttle and RPM (with a tachometer), waits one minute (also when you leave and return), and records the RPM.
  *Stop if:* the guide lets you skip a one-minute wait, or holds you forever after you arm the spindle.
- [ ] **SR3 Run-in end.** *Pass if:* the last step goes on only when the spindle relay reads off, and "rough, rising or too hot" tells you to press Stop.
  *Stop if:* it lets you finish with the spindle on.
- [ ] **SR4 Runout.** Spindle off, a test rod and a dial indicator. *Pass if:* it will not start with the spindle on; it takes four readings, works out
  the total (the spread), and the Work log shows the four readings and the total. *Stop if:* it starts with the spindle relay on.
- [ ] **UF1 Flex test.** Umbilical task, a tool mounted. *Pass if:* **Start watching** runs for a minute; flexing a cable with a known bad conductor
  (or unplugging the tool for a moment) shows "1 drop-out (first at N s…)"; a steady cable shows "No drop-outs." *Stop if:* a real drop-out is not
  counted, or a steady cable is reported as bad.

## Next release: SwitchFly lanes (Assets › Toolheads › SwitchFly › Tune › Lanes)

Needs Tool Manager 1.9.35 (the `SWITCHFLY_*` macros). SwitchFly mounted and confirmed, servo wired to contact 16, UBEC fed from contacts 11/12 with a
common ground, filament out of the hotend for SF1-SF4. Do SF1 on a current-limited supply the first time.

- [ ] **SF1 Power and gating.** Open the Lanes panel. *Pass if:* with the padlock closed only **Turn power off** can act; unlocking enables **Turn power on**;
  the angle and **Switch to lane** controls stay greyed until the power is on, then wake up; **Turn power off** greys them again. *Stop if:* an angle
  control works with the power off, or the UBEC is on while the panel says off.
- [ ] **SF2 Try an angle.** Power on, type 90 in Lane 1, press **Try**. *Pass if:* the servo moves to its middle, the arm on the dial points straight up, and
  Save is still greyed (nothing saved). Typing 200 greys **Try**. *Stop if:* the servo moves past what the selector can take, buzzes against a stop,
  or the UBEC or servo gets hot.
- [ ] **SF3 Set each lane.** Find the angle where the selector sits right on lane 1, **Save**; the same for lane 2. Press **Switch to lane 2**, then
  **Switch to lane 1**. *Pass if:* the selector lands on each lane both ways, three times in a row, and the saved angles are still there after a Klipper
  restart (the field shows them). *Stop if:* it lands in a different place each time.
- [ ] **SF4 A real lane change uses the saved angles.** Hotend hot, Z homed, run `SWITCH_T1 MATERIAL=PLA` then `SWITCH_T0 MATERIAL=PLA`. *Pass if:* the servo
  powers itself on if it was off and lands on the saved angles. *Stop if:* it goes to 0 or 180 instead of the saved angles.
- [ ] **SF5 Retract per lane.** Save a lane 1 retract of 20 mm. With lane 1 in use, hot, run `SWITCH_T1 MATERIAL=PLA`. *Pass if:* the console shows the
  extruder pulling back 20 mm before the servo moves (a material's own value is used when a lane's retract is 0). *Stop if:* the filament is pulled the
  wrong way or by a different distance.
- [ ] **SF6 The power goes at the end.** Power on, start a short job (or press **Cancel** in one). *Pass if:* the end of the job or the cancel turns the UBEC
  off (the panel says off) and the next job start or lane change powers it again and the servo goes to the recorded lane. Then power on and swap to
  another tool. *Pass if:* the UBEC is off after the swap. *Stop if:* the UBEC stays on after a cancel, an end or a swap.
- [ ] **SF7 Other tools.** With BlockOne or HotJoe mounted, open SwitchFly's Tune page. *Pass if:* the Lanes panel says to mount SwitchFly and nothing in it
  works; HotJoe's spindle relay behaves as before. *Stop if:* the panel can switch PA1 with another tool mounted.

## Job setup: the model full width, the panels floating (0.32.0)

Nothing moves; no machine needed beyond Studio itself (the mock is enough).

1. Job setup, load a model, confirm a process. **Pass:** the model view runs the full width of the page; Process (3D printing, laser...) and Settings sit on top of its right side, under the Angle / Top / Fit part buttons, which stay clickable.
2. Click the chevron before "Settings", then before the process title. **Pass:** each folds to its header and the model is clear; the chevron points the other way; reload the page: they stay folded.
3. Drag the part and turn the view with the mouse in the gaps around the panels. **Pass:** both still work. A long Settings list scrolls inside its own panel, not the page.
4. Make the window narrower than about 1100 px, or open it on a phone. **Pass:** the panels stack under the model as before, nothing runs off the screen.
5. **Stop if** a panel covers the Angle / Top / Fit part buttons, hides Prepare with no way to scroll to it, or the model can no longer be dragged.

## Job setup: supports control, folded groups, changed settings, save before Preview (0.33.0)

Nothing moves; the mock plus Portal profiles is enough, but do it once with the real Portal and PrusaSlicer.

1. Job setup, 3D printing, PrusaSlicer, Print tab, Support material page. **Pass:** the only support control is the Supports drop-down (Off / Automatic / Only where I mark); PrusaSlicer's "Generate support material" and "Auto generated supports" checkboxes are gone, also from the search box. Slice with Off, Automatic and Only where I mark: the three results differ as before (none, everywhere, only under marks).
2. Same with Kiri:Moto. **Pass:** the same drop-down, same three results.
3. Open Job setup fresh (clear site data first). **Pass:** every group in Settings (PrusaSlicer's groups; Kiri's Quality, Strength, Speed, ...; the laser, knife and CNC Advanced groups) starts folded. Open one, reload: it stays open on that browser.
4. Change a number, a drop-down and a tick box. **Pass:** each shows a red border; set it back to the profile's value and the border goes. Changing the Supports drop-down turns it red too. Pick another profile or press Reset: all borders clear.
5. With changes made, press Prepare (or the Preview step). **Pass:** a dialog asks to Save to profile (only when a saved profile is in use), Save as new profile…, or Continue without saving; × or Esc stays in Setup. Each choice then opens Preview. A saved profile shows in the Profile list and the borders clear. After "Continue without saving", going back and pressing Prepare does not ask again until you change something else.
6. **Stop if** the dialog doesn't appear with changes, appears with none, loses the changes on any choice, or a PrusaSlicer slice no longer honours the Supports drop-down.

## Control: part fan speed (0.34.0)

Needs the machine with a print head (BlockOne) mounted and confirmed; the fan spins, nothing moves.

1. Control, status strip, Part fan. Click the reading, type 50, Enter. **Pass:** the reading goes to about 50 % within a second or two and the fan turns at about half speed; no confirmation box appears.
2. Click it, type 100, Enter; then 0. **Pass:** full speed, then off.
3. Type 150, or letters, then Enter. **Pass:** it says "Enter 0 to 100 %" and sends nothing. Esc or clicking away leaves the fan as it was.
4. Mount a laser or spindle. **Pass:** the Part fan reading is not shown (or not editable).
5. During a print, set the fan from Control. **Pass:** the fan changes; the next layer change in the file may set it again (the slicer's cooling rules still apply).
6. **Stop if** the fan runs when 0 is set, a value out of range is sent, or the fan reading and the real fan disagree by more than about 10 %.

## Job setup: filament lanes on SwitchFly (building: not in a release yet)

Nothing moves; the mock's `MOCK_SCENARIO=switchfly` is enough for 1-5, and the Rhino's PrusaSlicer for 7-9. Two-lane files can be sliced and previewed but **not sent or downloaded** until the machine has a `SWITCH_LANE` macro (the machine's lane change comes with the hardware redesign).

1. Job setup, load a model, pick 3D printing on SwitchFly. **Pass:** two piano keys (1, 2) sit in the Process panel above "Lane N filament"; pressing a key shows that lane's materials only (path 1 or path 2). Other tools show the old Material drop-down.
2. Parts list: **Pass:** each part has a lane chip (colour square and number); clicking it moves that part to the next lane, and the part's menu has "Print in lane N". With Kiri:Moto selected, moving one part moves them all.
3. Supports on (Support material page): **Pass:** "Support filament" (and, in PrusaSlicer, "Interface filament") appear, each "Same as the part" or a lane. Supports from the other lane show the note about many lane changes and, in PrusaSlicer, to use only the interface layers instead.
4. Kiri:Moto with parts in two lanes. **Pass:** Prepare is disabled with the reason (it prints the whole job from one lane). Put everything in lane 2: Prepare works and the job uses lane 2's filament.
5. Wide window, two or more parts: **Pass:** the Parts list's lane and ⋯ buttons are not covered by the floating Settings panel.
6. **Stop if** a one-lane job slices with the wrong lane's filament, or a two-lane job slices as if it were one lane.
7. PrusaSlicer, two parts, one in each lane, "A tower on the bed". **Pass:** Prepare works; Job file says the Rhino received a 3MF of 2 parts, each in its lane; the preview shows both parts and a purge tower at the bed's front-right, clear of the parts; "Selects a filament lane N times" is a red check that stops Send and Download (no `SWITCH_LANE` macro), and every other check is green. No bare `T0` / `T1` and no `M104` / `M109` are in the file after START_JOB. **Stop if** a part prints in the wrong lane (look at the layers where each part sits), the tower overlaps a part, or the file would send.
8. PrusaSlicer, supports on, "Interface filament" = lane 2, supports on the part's lane. **Pass:** "Purge at a lane change" turns to "The machine purges" and can't be changed (reason shown); the file has no tower; the changes are few (the interface layers only).
9. Same part, "Support filament" = lane 2. **Pass:** the many-changes warning shows; the file has a lane change on every layer that has support. Kiri:Moto with the same: slices (its tower option works both ways).
10. **Rhino's PrusaSlicer is 2.9.7; these were proved on 2.8.1.** Slice item 7 on the Rhino and look for: a purge tower, the markers made into `SWITCH_LANE LANE=n`, and no ramming moves at a change (a short purge only).

## Job setup: lane tabs, change budget, tower area, preview by lane, assemblies (building: not in a release yet)

Nothing moves; the mock (`MOCK_SCENARIO=switchfly`) is enough except where it says the Rhino's PrusaSlicer.

1. PrusaSlicer, Settings, Filament tab, two-lane tool. **Pass:** a tab per lane ("Lane 1 PLA", "Lane 2 PETG") sits under Print / Filament / Printer. Change a filament option on lane 2 (for example Extrusion multiplier): it shows the new value with a red border on lane 2 and the old value, no border, on lane 1; the search box keeps the lane tabs. Reset all puts both back. **On the Rhino:** slice with a changed lane-2 option and check the G-code's settings dump lists two values for it.
2. Lane 2's temperatures and tower settings are locked ("Set by the Rhino"); only what you change on lane 2 differs from lane 1.
3. Parts in both lanes. **Pass:** under the purge choice a line says "About N lane changes" (about one per layer both lanes print); supports from the other lane, or very tall parts in both lanes, turn it into a warning; the interface layers alone on the other lane stay low (about 5). Different nozzle temperatures (15° or more) or bed temperatures show a note under Prepare.
4. With the tower chosen (PrusaSlicer). **Pass:** a crossed "Purge tower" area sits at the bed's front-right in the 3D bed and the flat bed, clear of the parts, and moves clear if a part is moved onto it; choosing "The machine purges" removes it; no room says so and Prepare refuses. **Check on the Rhino:** the sliced tower is inside that area.
5. Preview of a two-lane file. **Pass:** each lane's moves are in that lane's colour (lane 1 ink, lane 2 blue...), with a key under the view; Lighter drawing keeps the colours; a one-lane file looks as before.
6. Drop two or more model files together. **Pass:** the Parts list says "in an assembly"; they sit relative to each other as in their files (two files made to fit, such as a body and its inlay, line up); moving one part moves all (Centre X, dragging, arrow keys); Turn, Tilt, Scale, Lay flat are greyed with a note; "Break the assembly apart" (note or part menu) lets each go its own way, where they are. A file added later is its own part.
7. **Stop if** moving one part of an assembly leaves another behind, the tower area overlaps a part, lane 2's option changes lane 1's value, or a one-lane job shows any lane colours or notes.

## Turning the model, the style guide's lane colours (0.35.1)

1. Job setup, SwitchFly, two parts, put one in lane 2 (the purge tower area appears). Turn the 3D view by dragging empty space, then leave the mouse alone for 3 seconds. **Pass:** the view stays where you turned it (before 0.35.1 it snapped back about twice a second). Also move a part with the tower area showing: the view must not re-frame. **Stop if** the view moves by itself.
2. Style guide, Filament lanes: click a lane's colour square. **Pass:** the browser's colour picker opens; the lane's key, the part chips, the lane tabs and the Preview take the new colour at once (Preview after reopening it) and keep it after a reload; "Back to the look's colours" restores the defaults. The colours are per browser.
3. Style guide: the Light grey swatch and an empty lane key are flat grey with readable text (no dots).

## Settings > Appearance: four pages and your own fonts (Studio 0.36.0, Tool Manager 1.9.43)

Needs the Tool Manager update (the Portal keeps the fonts). Use a font file you own; a WOFF2 is smallest.

1. Settings. **Pass:** the menu has an Appearance group with Theme, Text, Background and This screen; each page opens, has a line saying where its settings are kept, and `#/settings` opens Theme.
2. Theme: pick a built-in theme, then leave for Text without pressing Apply. **Pass:** the preview is dropped and the theme in use is unchanged.
3. This screen: change the camera zoom and the plate see-through. **Pass:** they still take effect on Control and in Job setup, and stay after a reload in the same browser.
4. Text, Your fonts, Add font. **Pass:** the font is listed with a sample line in its own face; it is also in all three typeface lists under "Your fonts".
5. Choose it for Regular text. **Pass:** the interface changes at once; reload, and on a second screen (phone): the same font shows. Big numbers, positions, the console and Stop keep their own fonts.
6. Add a renamed text file as `.woff2`. **Pass:** refused with a message; nothing is listed.
7. Delete the font while it is in use. **Pass:** it asks first and says text goes back to Archivo; the interface falls back to Archivo and the list shows "Deleted font (showing Archivo)".
8. Make a backup in Settings > Host, add a font, restore the backup. **Pass:** the font is still there (the Rhino's backup holds `images/_theme/fonts/`).
9. **Stop if** a font appears on one screen but not another, any file other than a real font is accepted, or a font changes a layout so a button is cut off (note which font and page).

## Connection to Moonraker: dead links and Emergency Stop (Studio 0.36.0)

Use a laptop or phone on Wi-Fi with Studio open. Keep heaters off and nothing moving for 5 and 6 (the Stop test puts Klipper in shutdown; a FIRMWARE_RESTART brings it back).

1. Klipper ready, Studio open on the kiosk or a laptop. Leave it 5 minutes untouched. **Pass:** it stays Connected the whole time; no flicker, no reconnect.
2. Switch the laptop's Wi-Fi off. **Pass:** within 20 seconds the top bar shows the machine as unreachable and the readings clear. Switch Wi-Fi on: Studio reconnects by itself within about 15 seconds and the readings return without a reload.
3. Phone: open Studio, lock the phone for 2 minutes, unlock. **Pass:** within about 10 seconds it shows the true state (connected with live readings, or reconnecting); never old temperatures marked Connected.
4. Settings > Host, restart Klipper. **Pass:** Studio shows Klipper starting, then ready, readings return, and the Console's history isn't doubled.
5. Press Stop with the network fine. **Pass:** Klipper shows shutdown within a second, as before. Run FIRMWARE_RESTART afterwards.
6. Laptop on Wi-Fi, machine idle: switch Wi-Fi off, and press Stop straight away. **Pass:** within about 5 seconds the Stop button says the stop was NOT confirmed and names both routes. Wi-Fi back on: Stop works as in 5.
7. **Stop if** "Connected" stays lit with frozen readings for more than 30 seconds, Stop says it was sent when Klipper did not shut down, or Studio reconnects in a loop while the machine is fine.


## Settings > Health check (Studio 0.36.2, needs Tool Manager 1.9.45)

Nothing here moves the machine. The check only looks.

- [ ] **HC1 Run it.** Settings > System > Health check, **Run the check**. *Pass:* the button says "Checking…" for a few seconds, then a one-line verdict (Fix, Look or Good) and any lines needing you, fixes first; "Everything it checked" lists every line by section. *Stop if* it sits on "Checking…" for over 2 minutes with no message.
- [ ] **HC2 It agrees with the menu.** On the host, `bash ~/rhino-<version>/rhino.sh` option 7. *Pass:* the same lines, the same Fix/Look counts. *Stop if* they differ.
- [ ] **HC3 It notices an old Portal service file.** Before updating the Rhino to 1.9.45, run the check. *Pass:* it says the Portal's service file is from before 1.9.45 (Look), with what to do. After installing 1.9.45 and running it again, it says "The Portal restarts itself if it hangs" (Good).
- [ ] **HC4 It's remembered, and Copy report works.** Leave the page and come back. *Pass:* the last result is still there, with when it was checked. **Copy report**, paste into a note: plain text, every line, the summary and the facts.
- [ ] **HC5 During a job.** Start a short print, run the check. *Pass:* the print is not disturbed (no stutter, no error in the console) and the check finishes. *Stop if* the print stutters: press Pause and tell me.

## Settings > Connect (Studio 0.37.0; the Tailscale line needs Tool Manager 1.9.46)

Nothing here moves the machine. Only the Add buttons change anything (a trusted_clients line, through the Portal, with a Moonraker restart).

- [ ] **CW1 Where am I.** Settings > Connect, step 1. *Pass:* it shows the address you opened Studio from, says whether it is a name, a number or Tailscale, and "The Rhino sees this screen as <your address>" matching `ip addr` on your PC. *Stop if* the Rhino's view of your address is wrong.
- [ ] **CW2 How it connects.** Step 2. *Pass:* Ethernet or Wi-Fi (with signal) as the Rhino is really connected; the address matches `ip addr` over SSH. On a host without NetworkManager it says so instead.
- [ ] **CW3 Refusals.** Step 3, type `0.0.0.0/0`, then `10.0.0.0/7`, then `rhino.local`. *Pass:* each is refused with a plain reason and Add stays greyed. *Stop if* any can be added.
- [ ] **CW4 Add a range.** Machine idle. Add a range you don't use (like `192.168.77.0/24`). *Pass:* about 10 seconds, "is trusted now", Studio reconnects by itself, and the line is in `moonraker.conf` with a copy in `rhino_data/config_backups`. Then remove it in Settings > Trusted addresses. *Stop if* Moonraker doesn't come back in a minute: `sudo systemctl restart moonraker`.
- [ ] **CW5 Tailscale.** Step 4 on a Rhino with Tailscale up. *Pass:* "Found", the warning about shared devices, and Trust my tailnet greyed until the box is ticked; nothing is added unless pressed. Without Tailscale: "Not found" and a link, no button.
- [ ] **CW6 Check.** Step 5. *Pass:* Good lines for Moonraker, Klipper and the Portal. Then `sudo systemctl stop rhino-portal` (machine idle) and Check again: *Pass:* "The Rhino Portal doesn't answer" as a Fix. Start it again.

## Settings > Update the Rhino (Studio 0.37.0)

Do the first one on a spare host or when you can afford a restart. Keep a hand near Stop after any release that says Klipper macros change.

- [ ] **UW1 Before.** Step 1 with a newer release on GitHub. *Pass:* it says which version is available, that no job is running, the free space, the last backup's age, and a link to the release notes. With a job running: "A job is running" as a Fix and Install stays greyed.
- [ ] **UW2 Back up.** Step 2, Back up now. *Pass:* "Done" with the archive name, and the zip is in `~/rhino-backups`. Install stays greyed until it is done (or "go without" is ticked).
- [ ] **UW3 Install.** Step 3, Install. *Pass:* the steps tick off, "Reconnecting" shows while the Portal restarts, Studio reloads by itself and opens at step 4 saying "Updated from X to Y". *Stop if* it sits on Reconnecting for over 5 minutes: see step 5 and Settings > Software's log.
- [ ] **UW4 Check.** Step 4. *Pass:* the Health check runs and its Fix/Look counts are shown next to the "before" counts; Klipper ready. *Stop if* it reports a Fix that wasn't there before: Copy report from the Health check and use Undo (`rhino.sh` option 4).
- [ ] **UW5 If it's wrong.** Step 5 shows the Undo command. *Pass:* `bash ~/rhino-manager/rhino.sh` exists on the host and option 4 is Undo.

## Settings > Park and positions (Studio 0.37.0)

Machine idle, bed clear, hand near Stop for the moves. Undo for a saved change: copy the file from `config/studio_backups` over `myrhino/positions.cfg`.

- [ ] **PW1 What is there.** Step 1. *Pass:* the numbers match `RHINO_POSITIONS` in the Console, and "All positions are inside the travel limits". *Stop if* they differ.
- [ ] **PW2 Jog and review.** Pick Park, jog to a spot clear of the frame, Use this spot, Next. *Pass:* the lines show `variable_park_x` and `variable_park_y` with the new numbers and the sentence "was X… Y…". Type a number outside the limits in the box: refused with the reason; Reset puts the wizard's lines back.
- [ ] **PW3 Try it.** Move there slowly. *Pass:* the console asks, the bed lowers 10 mm, the head goes there slowly, nothing hits anything. *Stop if* it heads anywhere else: press Stop.
- [ ] **PW4 Keep it.** Keep it and restart Klipper. *Pass:* a copy appears in `studio_backups`; comparing it with the new file (`diff`) shows only the changed `variable_*` lines; after the restart and homing, `RHINO_POSITIONS` shows the new numbers.
- [ ] **PW5 It takes effect.** Pause a short print (check OP2). *Pass:* the head parks at the new spot.
- [ ] **PW6 A job blocks it.** During a print. *Pass:* Try and Keep are refused with "A job is running".

## Settings > Nozzle cleaning (Studio 0.37.0; needs a wipe brush)

Machine idle, a print head mounted and homed, **hotend cold** for every test here, bed clear, hand near Stop. The G-code is the wizard's own; read it in step 5 before running anything. Undo for the start G-code: Settings > Toolheads > the head > Start G-code > Clear (then restart Klipper).

- [ ] **NW1 It refuses what it should.** With a laser, knife or CNC head mounted, or the machine not homed, or a job running: step 1 shows a Fix and Next stays greyed.
- [ ] **NW2 Measure.** Jog the nozzle to each end of the bristles (a bed-mounted brush: just touching), Use this spot at each. *Pass:* the two spots show in machine coordinates (compare with the Console's `GET_POSITION`, "toolhead" line). Two spots under 5 mm apart are refused.
- [ ] **NW3 Read the G-code.** Step 5 shows the lines. *Pass:* the first lines save the move state and zero the offsets (`SAVE_GCODE_STATE`, `SET_GCODE_OFFSET X=0 Y=0 Z=0`), the last put it back (`RESTORE_GCODE_STATE`); the bed lowers clear (bigger Z) before and after the wipe. Add `M112` to the box: refused, and Reset puts the lines back.
- [ ] **NW4 Slow and cold.** Run it slowly. *Pass:* the console asks; the bed lowers, the head goes over the brush and wipes slowly; the nozzle touches the bristles (a bed-mounted brush) and nothing else is touched; afterwards a plain `G1 X Y` shows the paper-test nozzle height still applies (the offsets are back). *Stop if* it heads anywhere unexpected: press Stop, then measure again.
- [ ] **NW5 Full speed, cold.** Run it at full speed. *Pass:* the same motion at the chosen speed.
- [ ] **NW6 Save and attach.** Step 7, Add after what is there. *Pass:* "Clean nozzle (<head>)" is in Control > Macros and the head's Start G-code shows the lines; Klipper restart banner appears. After restarting, a short print runs the wipe after the heat-up, the mesh and the prime line, before the first layer, with the nozzle hot. *Stop if* it wipes before homing or with the head over the part: press Stop and tell me.
- [ ] **NW7 It can be taken out again.** Clear the head's Start G-code (Settings > Toolheads) and restart: the next job doesn't wipe.

## Files > Models (Studio 0.37.0, Tool Manager 1.9.46)

Needs Tool Manager 1.9.46 installed (the Portal's library routes). Nothing here touches Klipper or moves the machine. The folder is `~/printer_data/models` on the Rhino.

- [ ] **LB1 Drop files in.** Files > Models, drag two or three STL files (and one `.gcode`) from your computer onto the tab. *Pass:* a line says how many were kept and names the `.gcode` as left out; the files are listed with their size. *Stop if* a `.gcode` is kept, or the page shows an error for a normal STL.
- [ ] **LB2 The same file twice.** Drop the same STL again, then a different file with the same name. *Pass:* the first says it was already here; the second asks Replace, Keep both or Leave it out, and Keep both gives "name (2).stl". *Stop if* a file is silently overwritten.
- [ ] **LB3 Set up a job from a row.** Press Set up a job on one STL. *Pass:* job setup opens with that part on the bed, the same as dropping the same file there. Then press Set up as one job on a folder holding two parts: both parts load as one assembly. *Stop if* job setup shows another file or nothing.
- [ ] **LB4 Folders, rename, move, delete.** Make a folder, drag a row onto it, rename a file, then Delete a folder. *Pass:* Delete names how many files and folders go and says there is no trash; Cancel keeps everything; Delete now removes them. *Stop if* a delete happens without the question.
- [ ] **LB5 It survives a reload and another screen.** Reload the page and open Studio on a phone. *Pass:* the same models are listed on both (they are on the Rhino, not in the browser).
- [ ] **LB6 A full disk is refused.** Not for the machine: Tool Manager's `dev/test_library.py` covers it (an upload that would leave under 2 GB free is refused). On the Rhino, check "room for … more" matches `df -h ~/printer_data`.
- [ ] **LB7 Not in the config backup.** After a Backup now (Settings > Host), the backup zip is not much bigger than before and `~/printer_data/models` is not inside it. *Stop if* the backup grows by the size of the library.
- *Later, with an external drive:* the fstab `nofail` setup and the unplug tests (LB-drive) are in the proposal, not built.


## Job hook after a filament change (Tool Manager 1.9.46; Klipper macro change in `_FC_FINISH`)

A print head mounted, homed, standalone first (no job). Hand near Stop. Needs 1.9.46 installed and Klipper restarted.

- [ ] **FH1 Nothing set, nothing changes.** Leave Settings > Job hooks > "After a filament change" empty. Run `FILAMENT_CHANGE` standalone and go through it. *Pass:* it behaves exactly as before the update. *Stop if* any new message, or the head moves somewhere new.
- [ ] **FH2 It runs after the purge.** Put `M117 Hook ran` in the slot (whole machine), save, run a standalone change. *Pass:* the message shows after the purge, before "Filament change complete". *Stop if* it shows earlier, or the head goes back before it.
- [ ] **FH3 Mid-print.** Short job, run `FILAMENT_CHANGE` while it prints, complete it. *Pass:* the job resumes where it was; the pause and resume hooks still run. *Stop if* the head moves somewhere it wasn't. Never put an absolute Z move (`G1 Z…`) in this slot.

## Models: pictures and Add to library (Studio 0.37.1)

- [ ] **LB8 Pictures.** Files > Models with a few STLs in the library. *Pass:* each row shows a small grey picture of the model after a moment (first time on this screen), and it is there at once on the next visit. *Stop if* the page freezes while they draw, or a model shows a picture of another shape.
- [ ] **LB9 Add to library.** In Job setup drop a model that isn't in the library; under the picture press **Add to library**. *Pass:* "<name> added"; it shows in Files > Models. Pressing it again says it was already in the library; a different file with the same name says so and changes nothing. A model that came from the library doesn't offer the button.

## Wizards section, probe check and motor check (Studio 0.38.0)

Wizards now have their own section (the wand icon in the rail). The old /settings/connect, /positions, /nozzle-cleaning and /update addresses still work (they redirect). Machine homed, a head mounted for the probe check; hand near Stop for anything that moves.

- [ ] **WZ1 The section.** Open Wizards. *Pass:* every wizard is listed in its group, the Settings menu no longer lists them (Health check stays in Settings), and an old bookmark such as `#/settings/update` opens the same wizard under Wizards.
- [ ] **PC1 Probe check, steady.** Probe check, spot in the middle of the bed, Measure. *Pass:* ten touches, a range under about 0.02 mm and a sentence saying the probe is steady; Measure again within 0.01 mm of the first. *Stop if* the probe doesn't stop at the bed, or the head moves somewhere other than the spot shown.
- [ ] **PC2 Probe check, warm bed.** Heat the bed to your usual temperature in step 4 and measure again. *Pass:* it says how far the reading moved. Turn the bed off afterwards. *Stop if* the bed goes above the temperature typed.
- [ ] **PC3 It refuses what it should.** Not homed, no head, or a job running: step 1 shows a Fix and Next stays greyed.
- [ ] **MC1 End switches.** Motor check, Watch the switches, press each end switch and the probe by hand. *Pass:* each shows Triggered while pressed and keeps a tick. *Stop if* a switch never changes.
- [ ] **MC2 Drivers.** Read the drivers. *Pass:* every driver says Fine on a healthy machine; unplug nothing. A flagged driver is explained in a sentence. *Stop if* a driver reports too hot or a short: switch off and look.
- [ ] **MC3 Motors.** Lower the bed and centre the head, then Buzz each motor in turn. *Pass:* each moves about 1 mm and back ten times, the right way; you mark each. *Stop if* anything touches, a motor grinds, or Z moves the wrong way far enough to touch.

## Tune a heater (Studio 0.39.0, Tool Manager 1.9.48; `myrhino/tuned.cfg`)

Needs 1.9.48 installed: `printer.cfg` now has `[include myrhino/tuned.cfg]` after `[include tools/3dp.cfg]`. After the install, Klipper must start normally with nothing tuned (an empty file). Stay near the machine for any tune; Stop cuts the heater.

- [ ] **HT1 Klipper starts with the new include.** After the install and a restart, Klipper is Ready, and `~/printer_data/config/myrhino/tuned.cfg` exists and holds only comments. *Stop if* Klipper reports a config error mentioning tuned.cfg or "SAVE_CONFIG ... conflicts".
- [ ] **HT2 Tune the hotend.** Wizards > Tune a heater > Hotend, your usual temperature, Start. *Pass:* it heats and cycles for 5 to 10 minutes, then shows old and new Kp, Ki, Kd with a sentence. Nothing is kept yet. *Stop if* the temperature goes more than 20 C past the target, or Klipper stops with a heater error (then nothing is changed).
- [ ] **HT3 Keep, restart, hold.** Press Keep it, then restart Klipper from the banner. *Pass:* `tuned.cfg` has `[extruder]` with the new values; after the restart heat the hotend to the target and it holds within 1 C for 5 minutes; Klipper's own `pid_Kp` in `tools/3dp.cfg` is unchanged. *Stop if* Klipper won't start.
- [ ] **HT4 Put back.** Press Put back what it had, restart. *Pass:* `tuned.cfg` is comments only again and the hotend uses its own values. *Stop if* the values stay.
- [ ] **HT5 Bed, and a chamber when you have one.** Same steps for the bed (10 to 20 minutes). With no chamber heater the wizard says none is set up; once you add one (Add hardware), it appears, starts only from a cool chamber, and takes 20 to 60 minutes with the door closed.

## Input shaping, material tower and tuning results (Studio 0.39.0, Tool Manager 1.9.48)

USB accelerometer plugged into the Rhino's host, fixed firmly (to the hotend heatsink fan mount, cable free to move, away from fans). Needs 1.9.48 and a Klipper restart after step 1. The shaking tests move the whole machine: hand near Stop.

- [ ] **SH1 Set it up.** Plug the USB accelerometer into the host. Wizards > Input shaping, step 1: *Pass:* Studio lists the USB board that no config file mentions (marked "Just plugged in" if it appeared while the wizard was open) and fills the serial name; with more than one such board it lists each and you choose; if Klipper already has the accelerometer the wizard opens on step 2. A board still in its bootloader is listed as needing firmware. Check the pins against the board's maker page, Keep, restart Klipper. If you added the board before in Add hardware > Boards, it shows as Added already and "Use it as the accelerometer" keeps only the sensor sections. *Pass:* `myrhino/tuned.cfg` has `[mcu adxl]`, `[adxl345]` and `[resonance_tester]`, and Klipper is Ready after the restart. *Stop if* Klipper reports a config error: remove the accelerometer settings (they are only in tuned.cfg) and tell me the message.
- [ ] **SH2 It answers.** Step 2, Check it. *Pass:* about one g and a low noise number. *Stop if* it doesn't answer: check the cable and the serial name.
- [ ] **SH3 Gentle first.** Step 3, mount a print head, Shake gently. *Pass:* a quiet, brief shake; nothing rattles loose. *Stop if* anything loosens, the head unlocks or a cable catches.
- [ ] **SH4 Measure.** Measure X, then Y. *Pass:* each takes about a minute, the shakes get louder as the frequency climbs, and Klipper gives a recommendation per axis with curves drawn. *Stop if* the machine hits an end stop or anything moves that shouldn't.
- [ ] **SH5 Keep and restart.** Choose, Keep it, restart Klipper. *Pass:* `tuned.cfg` has `[input_shaper]` with your picks; a test print or the ringing tower shows less ringing than before. Put back removes it.
- [ ] **SH6 Another head.** Mount a different head and run it again. *Pass:* the Results page lists a shaper for each head; Klipper loads the last one kept at start, and each job start sets the mounted head's own pick (1.9.49; see SH7).
- [ ] **MT1 Temperature tower.** Wizards > Material tower, Temperature, send and print. *Pass:* the head heats to the first band, the temperature steps down every 5 mm, and the tower prints; pick the best band and record it. *Stop if* the first layer doesn't stick or the nozzle ends up above the temperature typed.
- [ ] **MT2 Retraction tower.** Same with Retraction. *Pass:* two pillars with the length changing every band; strings between them shrink up the tower.
- [ ] **TR1 Results.** Wizards > Tuning results. *Pass:* what you recorded is listed per head with when; Run again opens the right wizard.
- [ ] **SH7 The pick follows the head (Tool Manager 1.9.49).** Keep a shaper for two different print heads. Start a short job with each in turn. *Pass:* the console shows "Input shaper for <head>: X … Hz, Y … Hz (tuned)" at each job start, with that head's numbers; a head with none shows nothing new; a job on a machine with no accelerometer shows nothing. A bad value set by hand (`SAVE_VARIABLE VARIABLE=rhino_shaper_<head> VALUE="'bogus,5,x,1'"`) is reported and ignored. *Stop if* a job fails to start because of it, or Klipper reports a macro error.
- [ ] **SH8 The board is a one-time tool (Tool Manager 1.9.50).** After measuring every head (SH5/SH6), press Remove it from the config on the Keep step, restart Klipper from the banner, then unplug the board. *Pass:* `tuned.cfg` no longer has `[mcu adxl]`, `[adxl345]` or `[resonance_tester]` but still has `[input_shaper]`; Klipper starts Ready with the board unplugged; Wizards > Tuning results still lists the shaper per head. *Stop if* Klipper won't start: with the board plugged in again it should, or press Remove it in Studio (the Portal works while Klipper is down) and restart.
- [ ] **SH9 Unplugged by mistake.** With the accelerometer still configured, unplug it. *Pass:* Wizards > Input shaping shows a red "Not plugged in" bar with Remove it from the config, and Settings > Health check shows a warning; after removing it and restarting, Klipper starts. (Klipper itself will refuse to start while a configured board is missing: that is why the order is remove, restart, unplug.)
