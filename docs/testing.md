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
| B9 | In the status strip, click the bed temperature, type 40, Enter; then click it again, type 0, Enter | The box fills light grey while you type; the small set temperature in its corner reads 40°, then Off; Mainsail agrees | |
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
| X3 | Heat BlockOne to its print temperature, Length 5, Speed 2, Extrude, then Retract | No confirmation; filament goes in 5 mm, then back 5 mm; X, Y and Z don't move; Mainsail's console shows the G1 E lines inside SAVE/RESTORE_GCODE_STATE | Filament goes the wrong way, or the head moves |
| X4 | Flow: drag to 95%, let go; then + once | Mainsail shows M221 S95, then S96; the big number agrees | |
| X5 | Pressure advance: arrow up twice, wait; type 0.045 in Smooth, Enter | One SET_PRESSURE_ADVANCE per pause, values match `GET_PRESSURE_ADVANCE` (or Mainsail's extruder panel) | Values outside 0–1 s / 0.005–0.2 s are sent |
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
| S2 | Software | Same packages and versions as Mainsail's update panel, without Mainsail; one Status column: "Up to date" or an Update button | Mainsail is listed |
| S3 | Update one package (e.g. Crowsnest) | Asks first, lists what restarts; progress lines appear; ends "Up to date" | It starts without asking |
| S4 | Update all with Moonraker and Klipper behind | Order: system, Moonraker, repos, Klipper last; Studio reconnects after Moonraker by itself and carries on; Klipper restarts once | Klipper restarts more than once, or the run stops at Moonraker |
| S5 | Start a print, open Software | Update buttons are dead, "Not while a job is running" | An update can start |
| S6 | Network, Link now | Response, Wi-Fi signal, traffic and screens connected show and change; address line matches the Pi | |
| S7 | Network, cameras Snapshots, open Control | The camera shows stills at the snapshot rate; Live video brings the stream back | |
| S8 | Network, Reconnect Patient, stop Moonraker 20 s | Reconnects with longer waits (watch the top bar) | |

## Studio served from the Rhino

Needs Toolhead_Manager 1.5.1 installed. **Stop if** Mainsail stops opening.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| S1 | Open `http://<pi>:5001` on the PC | Studio opens, Connected, the mounted tool shows | Mainsail (port 80) no longer opens |
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

Nothing here moves the machine. Camera edits change Moonraker's camera list, which Mainsail uses too.

| # | Do this | Pass when | If it fails |
|---|---|---|---|
| D1 | Open Control | The Camera panel shows the cameras already set up in Mainsail, live | "isn't answering": open `http://mainsailos.local/webcam/?action=stream` in the browser. If that fails too, crowsnest isn't running |
| D2 | With two or more cameras, use the arrows, the dots, and the left/right keys | Each switches camera and the count (e.g. 2 of 3) follows; the Dashboard shows the same camera | Note which control |
| D3 | Settings → Cameras → Add camera, with a wrong address | The preview says the camera isn't answering; Save still works but the panel shows the same message | |
| D4 | Edit that camera to a real address, turn it, mirror it | The preview updates; after saving, Mainsail shows the same camera with the same turn and mirror | Mainsail doesn't show it: note the Moonraker version |
| D5 | Delete it | Asks first; it disappears from Studio and Mainsail; crowsnest is unchanged | It deletes without asking |
| D6 | Leave Control open, switch to another app or lock the phone for 30 s, come back | The picture resumes. On the Pi, `top` shows crowsnest's CPU drop while it's hidden | CPU stays up while hidden |
| D7 | Open the Dashboard during a print | Stats along the top, notices on the left, job along the bottom with time left and finish time. No buttons that act on the machine; tapping a value opens its screen; Stop stays in the top bar | Anything on it starts, stops or moves something (apart from the top bar's Stop) |
| D8 | During a job run a wizard that asks a question (or start a laser job) | The Dashboard shows "Klipper is asking" in red; the question itself appears on Control, not on the Dashboard | |
| D9 | Mount a non-print tool | The Dashboard says "Body temperature" with "No sensor yet" instead of the hotend | It shows a hotend reading for a laser, spindle or knife |
| D10 | Klipper busy without a job (Home all from Mainsail) | The Dashboard's state reads Busy and a "Machine busy" notice shows until homing ends | |
| D11 | Scroll down the Dashboard | Reports under the camera screen: five number tiles, Toolheads (hours, jobs, at a glance, jobs per week) and Maintenance (task status, next up, tasks by machine and toolhead, work per week). The figures match the Portal's own Dashboard at port 5000 | A figure differs from the Portal's |
| D12 | Press Table on any report, then Chart | The numbers as a table, then the chart again; nothing is logged or changed | |
| D13 | Stop the Portal (`sudo systemctl stop rhino-portal`), reload the Dashboard; start it again | The reports say the Portal isn't answering, the camera screen above still works; they come back within 2 minutes of starting it | The Dashboard breaks or goes blank |

Notes:
- Each open camera view is one more stream the Pi 3B sends. Studio only pulls frames from the camera that's on screen, and stops when hidden. If Klipper reports "Timer too close" while watching, use "MJPEG snapshots" at 5 fps instead.
- A camera is not a safety device: the picture can lag or freeze without notice. Don't leave a laser or spindle job unwatched because the Dashboard looks fine.
- WebRTC and HLS cameras show "not supported yet". Crowsnest's default (ustreamer, MJPEG) works.

## What each tool shows

Read only, nothing moves. Compare each tool's status strip with Mainsail.

| # | Do this | Pass when | If it fails |
|---|---|---|---|
| E1 | Mount BlockOne | Hotend, bed and part fan; position is machine position | |
| E2 | Mount LightSaber | No hotend or bed; Laser shows Off with the rail off. During a laser job it shows Armed, then Firing with the power Mainsail shows for `output_pin SERVO_LASER` | Bed or hotend shows while both are cold and off |
| E3 | Mount HotJoe, set a work zero, run CNC_JOB_SETUP to spin-up | Spindle Running with the throttle the wizard reports; Work position matches Mainsail's work coordinates, machine position below | Spindle shows Off while it's running (pin names differ on your config: note them) |
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
| P9 | Download the laser file, open it, start it from Mainsail's own Print (skipping the wizard), on cardboard | Head traces the shape but the laser **doesn't fire** (rail never switched on); END_PRINT parks | It fires: power off and report it |
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
| M8 | Untick, then tick the Mainsail reminder | The Portal's Usage meters → Reminders follows | |
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
| FL4 | Files: Last run column, after a print finishes and after one is cancelled | "✓ Completed" and "– Cancelled" with the date, matching Mainsail's history; never-run files have a small hollow ring after the name (tooltip "Not run yet") | |
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
| T2 | Tap the red padlock | It opens (outlined); controls light up. Speed + → 105% in the strip and in Mainsail | |
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

Klipper ready. Keep Mainsail open on another screen to compare. **Stop if** anything outside Moonraker's gcodes / config / logs folders is listed or changed, or Klipper restarts without you pressing a restart.

| # | Do | Pass | Stop if |
|---|---|---|---|
| F1 | Files: tabs Gcode files · Config · Logs · Job history | Each lists what Mainsail shows for that folder; folders first; sort by Name, Modified, Size (click again to flip) | Files from elsewhere on the disk |
| F2 | Gcode files: New folder "test", drag a .gcode from the PC onto its row | The row outlines while dragging; the file uploads into test (progress shown); breadcrumb Gcode files › test after opening it | It starts a job |
| F3 | Row menu (right-click; long-press on a phone; or ⋯) on that file: Rename, Duplicate, Move to folder… (back to the top), Download; then drag the row out to the desktop (Chrome/Edge) | Each does what it says, and Mainsail agrees; Download and drag-out give the file | |
| F4 | Upload a file with a name already there | Asks Replace / Keep both / Cancel; Keep both makes "name (1).gcode" | It overwrites without asking |
| F5 | Start a print; open the menu on its file and on its folder | Edit, Rename, Move, Delete are greyed with "A job is using this file" / "…a file in this folder"; Duplicate and Download work; an "In use" tag on the row | Any of them runs |
| F6 | Config: open printer.cfg, add a comment line, Ctrl+S | "Saved. The file as it was is in studio_backups/printer.cfg.<time>.bak"; Klipper is NOT restarted; Restart Klipper to apply asks first | Klipper restarts by itself |
| F7 | Close the editor with unsaved changes; reload the page with unsaved changes | "Close without saving?" asks first; the browser warns before leaving | Changes lost without a question |
| F8 | Save printer.cfg 11 times | studio_backups keeps the newest 10 copies of it | |
| F9 | Open a G-code file over 2 MB, then klippy.log | Opens read-only (says why); nothing over 25 MB opens (downloads instead) | The page freezes |
| F10 | Delete the test folder | Confirms (red outline Delete) and says everything in it goes; gone in Mainsail too | It deletes without asking |
| F11 | Logs tab | Read-only: no Upload, New, Rename or Delete anywhere | |
| F12 | Phone | No sideways scrolling; Upload button works; the drop area only appears while uploading | |
| JH1 | Job history | Matches Mainsail's history (status, start, print time, filament) and its totals; a deleted file is struck through with Reprint off | |
| JH2 | Reprint a finished print-head job with the same tool mounted | The same checks as Start (care note if due), then it starts | It starts with the wrong tool mounted |

## 0.6.2: Cameras, red panels, pin labels, Scan Config

| # | Do | Pass | Stop if |
|---|---|---|---|
| C1 | Settings › Cameras | Each camera row has a small live picture left of Turn off; a turned-off camera shows "Off"; scrolling it out of view stops its stream (crowsnest log or network tab) | |
| R1 | Control: tap the tuning padlock; Motion: Unlock | Each panel turns red (#c0281d) with white text and white-on-red controls; the padlock turns white; locking turns it back to paper and ink | |
| R2 | Pendant | Unchanged (Hold still inverts the keys; no red) | |
| PL1 | Toolheads › Wiring › Board pins (Tool Manager 1.5.3): Add label ENCLOSURE_LIGHT on a free header pin | Listed under Pin labels; the restart banner lists it; `myrhino/custom_tools.cfg` has `[board_pins rhino]` with it | Klipper restarts by itself |
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

## 0.6.3: trusted_clients, as Mainsail (needs Tool Manager 1.5.4 for the Portal part)

Studio has no login, like Mainsail: Moonraker's `[authorization] trusted_clients` decides. Before: note your
`trusted_clients` lines so you can put them back.

| # | Do | Pass | Stop if |
|---|---|---|---|
| TC1 | Open Studio as you run it today | No card; connects as before | The "doesn't trust this screen" card shows on a screen Mainsail works on |
| TC2 | Take your network's range out of `trusted_clients`, restart Moonraker, open Studio (and Mainsail) | Mainsail says Unauthorized; Studio shows "Moonraker doesn't trust this screen" with this screen's address and a `/24` to add; top bar "Not trusted"; Moonraker's log shows no reconnect storm | Studio keeps reconnecting, or shows the page with no data |
| TC3 | Same state: open `http://<rhino>:5000` (the old Portal page) and try any change | Every action says "Moonraker doesn't trust this address (…)" | A change goes through |
| TC4 | Put the range back (Copy the lines helps), restart Moonraker, press Try again | Connects; Toolheads and Care load | |

### Trusted addresses (Settings) and Tailscale

| # | Do | Pass | Stop if |
|---|---|---|---|
| TC5 | Settings › Trusted addresses | Lists `trusted_clients`; "This screen is <address>, let in by <entry>"; no Remove on that entry or on 127.0.0.0/8 | |
| TC6 | Install Tailscale on the Pi (`curl -fsSL https://tailscale.com/install.sh \| sh`, `sudo tailscale up`); reload the page | **100.64.0.0/10 Tailscale** offered; Add, confirm: Moonraker restarts, screens reconnect, the list shows it; `ls ~/printer_data/rhino_data/config_backups` has a `moonraker.conf.*` copy | Moonraker doesn't come back (send `journalctl -u moonraker -n 30`) |
| TC7 | On your phone with Tailscale on and Wi-Fi off, open `http://<rhino's tailscale name or 100.x address>:5001` | Studio connects; Mainsail at the same address works too | The "doesn't trust" card shows |
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
| NW2 | Snap the browser to half the screen; open Toolheads › Board pins and outputs, Tool connector, then every other page | Nothing runs past a panel's edge and the page never scrolls sideways; Outputs shows two lines per output | Text runs off the panel |
| NW3 | Make the window narrower step by step down to phone width, watching the top bar | The red **Stop** button stays whole and on screen at every width; the logo text and "mounted" go first, then the tool name shortens with … | Stop is cut off or pushed off screen |

## 0.6.6: Update from GitHub, one Tool Manager row, PrusaSlicer keeps itself up to date (Tool Manager 1.5.8)

| # | Do | Pass | Stop if |
|---|---|---|---|
| GU1 | Settings › Software | No separate Rhino Studio row; Rhino Tool Manager says "…and Rhino Studio 0.6.6"; Latest shows GitHub's newest release | |
| GU2 | When a newer release is on GitHub: press Update on Rhino Tool Manager, confirm | The Rhino downloads it (button says Downloading…), then Install from zip shows the run: log, status bar, steps; Studio reloads at the end on the new version | It installs without asking, or during a job |
| GU3 | Install from zip with a downloaded zip | Works as before | |
| GU4 | PrusaSlicer row (a host with PrusaSlicer installed) | "Keep it up to date while I use it" ticked, with when it last updated itself; unticking sticks after a reload | |
| GU5 | After a PrusaSlicer update, press Go back | It doesn't reinstall that version by itself; the next newer one it does | It flips back to the version you left |
