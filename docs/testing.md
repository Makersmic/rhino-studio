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

Needs Toolhead_Manager 1.5.0. Machine idle unless a check says otherwise. **Stop if** Klipper reports "Timer too
close" or a shutdown while slicing.

| # | Do this | Pass when | Stop if |
|---|---|---|---|
| P1 | Settings > Software, PrusaSlicer engine: Install | Asks first; "Installing…" for a few minutes; then the installed version shows, Up to date | Klipper or Moonraker restart |
| P2 | Job setup: a 3D model, BlockOne, PLA | Engine switch shows PrusaSlicer on the Rhino; Print / Filament / Printer tabs with PrusaSlicer's pages; Simple / Advanced / Expert change how many options show | |
| P3 | Filament tab | Temperatures, diameter and type are locked with "Set by the Rhino" and the material's numbers | A temperature can be typed |
| P4 | Change Perimeters to 4 and Fill pattern to Gyroid, Prepare | Slices on the Rhino with a progress bar; time and filament from PrusaSlicer; every check passes; the file starts with START_JOB and has no M104/M140 above 0 | The file heats or homes |
| P5 | Prepare again with nothing changed | Comes back at once ("from the cache") | |
| P6 | Change a setting while it slices | The old slice stops on the Rhino (Portal log) and a new one starts | Two slices run at once |
| P7 | Start a print, then Prepare a part | Bigger host: slices with half the cores, print keeps going smoothly. Pi 3B: refused, says why | The print stutters or Klipper shuts down |
| P8 | Print the P4 file | First layer and walls look like the Orca prints; SwitchFly path 2 prints the same way | Extrusion runs backwards |

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

