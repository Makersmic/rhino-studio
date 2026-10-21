# Rhino Studio

One interface for every Rhino Multi Motion System process: import a model, pick a toolhead, prepare, preview, send and monitor. "Rhino Studio" is a working title; the name and logo live in `src/brand/brand.ts`.

Status: **Phases 3-4** (Job setup: print, laser, knife and CNC job files from Kiri:Moto), on top of 2b (machine control), 2a (live status) and Care (maintenance). **This version can move the Rhino, heat it, run macros and start jobs.** Run the checks in [docs/testing.md](docs/testing.md) in order before trusting it, starting with 2a's A1-A8.

### What it can do

- **Dashboard** (the home screen): a landscape "lock screen" for the machine. The camera fills the background. The mounted tool sits top-left and the machine state (Idle, Busy, Printing, Paused…) top-right. While a job runs, a large job % sits bottom-left with its file, time left and finish time; with no job running that spot stays empty. There's no clock. Every other reading (the mounted tool's temperatures or outputs, position, care) sits on one rail along the bottom, and a short stack of notices says what needs you, in red. It's look-only: values link to the screen with the details, and the only control is the top bar's Stop.
- **Cameras**: every camera Moonraker knows (the same list Mainsail uses), shown on Control in a Camera panel with gallery arrows and dots, and behind the Dashboard. Add, edit, turn, mirror, switch off and delete cameras in Settings → Cameras, with a live preview. MJPEG streams, MJPEG snapshots, IP-camera video and web-page cameras work; WebRTC and HLS come later.
- **Control** screen: temperatures set right in the status strip (click the reading, type, Enter), each with a small history graph (last 5 minutes; the dots widen it to 20), the running job with Pause, Resume and Cancel in the same top box, a camera, jog (locked until you unlock it, relocks after 60 s idle) with the X/Y/Z position under the keys, home, motors off, and a console. Macros come in two sets: the mounted tool's own (on desktop a row of small buttons along the bottom of the status box; on smaller screens a **<tool> Macros** panel with its accent tab; changes on a swap) and **System Macros** (macros that never move: backups, care status, and the machine's lights, chamber or exhaust hardware, picked up by name; the long Other macros list folds away). Swap and Confirm tool are in the top bar; Swap drops an orange list of the toolheads Klipper knows, and picking one runs the Rhino's SWAP_TOOL for that slot after a confirmation; Pause, Resume and Cancel stay with the job.
- **Pendant mode** (Control → Pendant mode, or `#/pendant`): the phone as a pendant at the machine, with Stop always on screen.
  - **Jog** screen uses two-hand control: the jog keys stay greyed out unless the **Hold** button in the bottom corner is held. Hold with one thumb, tap with the other; one tap is one step. Letting go, a cancelled touch, the screen turning off or switching apps kills the keys at once. A left-handed option mirrors the layout. On a computer, hold Shift as the Hold button.
  - **Status** screen: big work/machine position, Home, Set Z zero / Set work zero.
- **Klipper prompts**: the Rhino wizards' questions (SWAP_TOOL, RESTORE_TOOL, the job setup wizards) pop up in Studio as well as Mainsail. A button runs only its own command.
- **Toolheads**: the tool library from the Rhino Portal, as Studio's tool tiles. Each tool has its own page, laid out like its manual pages: what it does and how to start a job with it, the tool connector drawn as in the manual (select a contact to find it in the table), materials, macros, its usage meters and care, and its drawing or photos. **Care tasks** opens Care showing only that tool. Added tools have **Edit tool**: name, power limits, materials, checklist, the connector contacts it uses (select them on the drawing), notes, photos, and its controls and macros, each checked live against your Klipper config with the exact text it adds to `custom_tools.cfg`. Toolheads has its own menu too: **Library**; **Wiring** (the tool connector, with a toolhead picker that inks only that tool's contacts; the board's **pin labels** (names for pins, kept as Klipper aliases in `[board_pins rhino]`: click a label's pin for the free ones, pick one and press the save icon, the old pin shows under it; **Label it** switches an output written with a raw pin over to a label), its outputs and a pin map; **System hardware**, the fans, lights, pumps and switches wired to the board, added and edited with the same checked form as a tool's controls (**Scan Config** lists the pin labels and pins your config files already define), live after a restart); and **Toolhead setup** (the kinds of tool Add a toolhead offers with their starting values, material names, nozzle sizes and hardware categories). **Add a toolhead** walks through the Portal's steps (kind, outputs or connector or the print head it copies, limits, materials, controls, macros, review). Changes wait for a Klipper restart; a banner lists them and offers **Restart Klipper** when the machine is idle (or a restart when the job ends). The Portal stays the store and the judge; Studio sends exactly the requests the Portal's own screens send.
- **Dashboard reports**: under the camera screen, everything the Rhino Portal's Dashboard shows, drawn the e-paper way (ink, dots and hatching instead of colours): production hours, jobs, filament, overdue and due-soon tiles; hours and jobs by toolhead; each toolhead at a glance with its most urgent care task; task status, next up and tasks by machine and toolhead; jobs and maintenance logged per week. Every chart has a Table button for the exact numbers. The figures come from the Portal (`/api/maint`, `/api/maint/history`, `/api/dash/jobs`), so they match it; the Dashboard stays look-only.
- **Job setup** (the flow of online manufacturing services like SendCutSend and Xometry: upload, confirm the process, configure): **1 File**: drop a model (STL, 3MF, OBJ) or drawing (SVG, DXF), or start from a toolhead card (what it makes, files it takes, build or cut area, materials). **2 Process**: Studio says whether it's a 3D model or a flat drawing and lists the processes that fit, best first (skipped when you started from a card that fits). **3 Set up & send**: place it on a to-scale bed (leadscrew keep-out and prime line shown), pick the material, adjust the settings and Prepare. Kiri:Moto's engine slices **in the browser**, never on the Pi. Print heads get a print with START_JOB and CALCULATE_PA (the same lines as the Orca profile: tool check, homing, heat from the material table, prime, pressure advance) and END_PRINT; the LightSaber a cut in machine X/Y with power scaled to `laser_s_max`, repeated per pass, rail off at the end; the drag knife a cut with slow blade plunges; HotJoe a cut-out (or clear-and-cut-out) in work coordinates, X0 Y0 at the stock's front-left corner and Z0 on its top. Materials, powers and feeds come from Klipper's own `VARIABLES` tables. Every file is then **checked line by line** (tool, forbidden commands, travel limits or stock, nothing printed or cut over the leadscrew, heaters, laser power, depth, END_PRINT) and anything that fails can't be sent. **Send to Rhino** only uploads it; start it from Files.
- **Advanced settings and ready-made files**: print jobs have fold-outs grouped the way Orca groups them (quality, strength, speed, retraction, support, cooling, bed adhesion); laser and knife cuts have smoothing and outer-outline-only; CNC jobs pick the cutter (end or ball mill, cutting length) and a list of steps (level the top, rough out, outline inside or outside) run in order with one tool. To slice somewhere else (OrcaSlicer offline, LightBurn, Fusion), drop the **.gcode** in Job setup instead: it's shown on the bed as it is, never sliced again, and gets the same line-by-line check with rules for outside programs (a missing toolhead or END_PRINT is a note; forbidden commands, keep-outs, laser power and travel limits still block). A file that doesn't name its toolhead gets `; rhino_toolhead = …` added to the copy that's sent.
- **Files**: Moonraker's folders as tabs, and nothing outside them. **Gcode files**: folders with a breadcrumb, sort by name, date or size, the toolhead each job asks for (green when it's mounted), how it last ran and a hollow ring on files never run; upload by button or drag and drop (several at once, straight onto a folder too; never starts a file). Start checks the file's toolhead against the mounted one and blocks a mismatch (offering the swap); print files start directly (their START_JOB checks again on the machine), laser, spindle, knife and added-tool files through LASER_JOB_SETUP, CNC_JOB_SETUP, DRAGKNIFE_JOB_SETUP or TOOL_JOB_SETUP with `FILE=`, so the wizard's safety steps and the laser rail aren't skipped. **Config**: Klipper's config folder in a full-screen editor (line numbers, G-code and Klipper highlighting, Ctrl+S); saving keeps a copy of the file as it was in `studio_backups` and never restarts anything (**Restart Klipper to apply** asks first and waits for a job to end). **Logs**: read-only. **Job history**: past jobs with status, time and filament, totals, and Reprint. Every row has a menu (right-click, long-press on a phone, or ⋯): Edit or View, Download, Rename, Duplicate, Move to folder, Delete (confirms). A name already taken asks Replace or Keep both. The file a job is using, and its folders, can't be edited, renamed, moved or deleted.
- **Unlocked = red**: a panel with a lock (Motion's Unlock, the tuning padlock) turns red with white controls while it's unlocked and live, and back to paper and ink when it locks.

### What each tool shows

Everything that applies to every tool stays put: toolhead, position, job, camera, motion, macros, console, care. The rest follows the mounted tool (rules in `src/toolheads/readouts.ts`, shared by Control and the Dashboard):

| Tool | Status strip shows | Position | Macro buttons |
|---|---|---|---|
| Print head (BlockOne, SwitchFly) | Hotend and bed (set in place, with graphs), part fan | Machine | Print macros, bed cooldown included (only printing uses the bed); SwitchFly also gets its filament path switches |
| Laser (LightSaber) | Laser rail and power (Off / Armed / Firing), body temperature | Machine (laser files use machine X/Y) | Focus and align, Set Z zero |
| Spindle (HotJoe) | Spindle relay and throttle, body temperature | Work position first, machine below | Set Z zero, Set work zero, Calibrate ESC |
| Drag knife | Body temperature once its thermistor reads | Work position first | Set Z zero |
| Added powered tool | Tool power, body temperature | Work position first | |
| No confirmed tool | Only heaters that are on or still hot | Machine | No tool-specific macros |

Two things come back whatever the tool, because they matter for safety: a bed that's heating or still warm (40° and up) under a laser, spindle or knife job, and the hotend heater switched on while a tool without a hotend is mounted (its output is still wired to the tool connector). Both show with a label in inverted ink and can only be switched off from there. Tool outputs (laser, spindle, fan, tool power) are read from Klipper's pins and are read only: switching a tool on stays with its wizard, or the console, which asks first. Macros for other tools are hidden from the buttons ("Show N for other tools" brings them back) and stay available in the console.

## Tool-change adapters

How Studio reads the mounted tool and swaps it depends on the machine, so that part lives in small adapters (`src/tools/adapters`). Each one says how to recognise its machine from Klipper's object list, which objects to watch, what's mounted, which tools exist, and the command that swaps to tool N. The rest of the app only sees one tool state (mounted, swapping, not confirmed, sensor mismatch, unknown).

| Adapter | Machines | Reads | Swaps with |
|---|---|---|---|
| Rhino tool macros | the Rhino | `SWAP_TOOL.current_tool`, VARIABLES / CUSTOM_TOOLS tool tables | `SWAP_TOOL TOOL=n` (the Rhino wizard) |
| klipper-toolchanger | Voron StealthChanger, TapChanger and similar | `printer.toolchanger`, `[tool …]` objects, tool sensors | `SELECT_TOOL T=n` |

It's picked automatically (Settings > Machine > Tool changing shows what was found and lets you override it).

Each adapter has a tool-change style:

| | Manual (Rhino) | Automatic (toolchangers) |
|---|---|---|
| Who changes tools | You, guided by the wizard's prompts | The machine, from the job file |
| Starting a job | Needs the right tool confirmed | Can start with no tool; a file may use several |
| Swaps from the Swap list | Always confirmed | Confirmed unless you turn it off (Settings) |
| Changes during a job | (none) | Routine: no banner or notice |

Typed console commands (T1, SELECT_TOOL…) always ask, and a tool-sensor mismatch always stops everything. Safety rules hold for every adapter: Studio only reads the tool state, swaps are confirmed first, and anything uncertain locks jogging, tool power and jobs. A tool sensor that disagrees with the selected tool (klipper-toolchanger) is a stop condition: Swap and Home are locked too. Tool-change commands from every family (T0…Tn, SELECT_TOOL, UNSELECT_TOOL, INITIALIZE_TOOLCHANGER, ACTIVATE_EXTRUDER, SET_DUAL_CARRIAGE…) ask before running on any machine. Try it without a machine: `MOCK_SCENARIO=toolchanger npm run mock` (`MOCK_DETECT T=n` fakes the tool sensor; `MOCK_TC=uninitialized` starts uninitialised).

## Run it on your PC

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the address it prints (http://localhost:5173). Because `dev` runs with `--host`, the "Network" address also works from a phone or tablet on the same Wi-Fi.

### Connect it to the Rhino

The dev server forwards Moonraker's paths to the Pi, so nothing on the Pi needs changing:

```bash
MOONRAKER=http://mainsailos.local npm run dev        # the default
MOONRAKER=http://192.168.1.50 npm run dev            # or the Pi's IP
```

On Windows PowerShell: `$env:MOONRAKER="http://192.168.1.50"; npm run dev`.

The checks to run on the machine are in [docs/testing.md](docs/testing.md).

### Maintenance (Care)

Preventive maintenance comes from the Rhino Portal that already runs on the Pi (port 5000): its schedules, usage meters, Task Books and work log. Studio shows it everywhere it matters and can log work and snooze; the Portal stays the engine and keeps the records, so there's only ever one set of maintenance data.

- **Care** screen, with its own menu (groups fold; the whole menu folds to a strip; on a phone it's one button at the top):
  - **Overview**: due now, every toolhead and machine area, coming up, on hold, the latest work and the machine's meters.
  - **Tasks**: every task, grouped by what it's for, one fold per area or tool (quiet groups start folded so what's due stands out). Filter by state, by what it's for, or by typing. **New task** and the task editor: what and for, the schedule rules (every so often, after so much use, after each event, once on a date) with the schedule said back in plain words as you type, where counting starts, steps, parts, safety, reminders. Log work and Set status from any row.
  - **Task Library**: Task Books as cards (what's in each, where it's on, assign or take off, "fits FoamWire: add") and the library tasks. Editing a library task updates every task made from it; a task from the library can be detached to make it your own.
  - **Work log**: everything done, skipped, set or measured, a fold per month.
  - **Usage meters**: the machine's meters as readouts, each tool's in a fold, Set a reading, and the Mainsail reminder switch.
  - **Care setup**: status codes (the four questions, each folded card saying its answers in a line) and the areas, kinds of work and priorities tasks choose from.
- **Top bar and nav**: what's due, one tap away.
- **Toolhead tiles** (Prepare, Toolheads): each tool's care status.
- **Device**: care for the mounted tool and the machine before the next job.
- **Files**: "Care due" next to files whose toolhead needs attention.
- **Alert**: overdue care on the mounted tool.

Maintenance never blocks a job; it informs. The dev server forwards `/portal` to `<MOONRAKER host>:5000`; set `PORTAL=http://192.168.1.50:5000` to change it.

### Work without the machine

```bash
npm run mock                                      # pretend Moonraker on port 7125
MOONRAKER=http://localhost:7125 PORTAL=http://localhost:7125 npm run dev   # second terminal
```

`MOCK_SCENARIO=restart`, `swap`, `custom` or `spindle` (HotJoe mounted, with a work zero) changes what the mock reports. The mock has three pretend cameras showing rendered frames of a print (`MOCK_CAMERAS=0` starts with none). It prints every request the app makes. The mock also serves the Portal's maintenance API with real data from the Portal's own year-of-use demo (`scripts/fixtures/`).

Other commands:

| Command | What it does |
|---|---|
| `npm run typecheck` | Checks types without building |
| `npm run build` | Type-checks, then builds static files into `dist/` |
| `npm run preview` | Serves the `dist/` build locally |
| `npm run icons` | Exports every icon to `design/icons/` as standalone SVG files |
| `npm test` | Runs the unit tests (command safety, prompts, job starts, tool state, G-code headers, client gates, care rules) |
| `npm run mock` | Starts the pretend Moonraker |

The built `dist/` folder is plain static files and works from any folder.

## Run it on the Rhino

From Rhino Tool Manager 1.5.1, the release zip carries a build of Studio and the installer serves it with the
nginx that already serves Mainsail, on a port of its own: **`http://<pi>:5001`**, from any PC, phone or tablet on
the network, with nothing to install. Mainsail's site isn't touched. The Pi's nginx forwards Moonraker, the
cameras and `/portal` the same way the dev server does, so Studio works exactly as it does from a PC. Updating the
Tool Manager (its zip, through `rhino.sh`) updates Studio; Settings › Software shows the version. The zip is made
with `sh dev/make_zip.sh ../rhino-studio` in the Tool Manager repo. Running it from a PC (above) still works.

## Folder map

```
src/
  brand/        name, logo, favicon (change the brand here only)
  icons/        toolhead emblems and interface icons (source of truth)
  styles/       tokens.css (every colour, size, font) and base.css
  toolheads/    look of each toolhead: accent, icon, summary
  moonraker/    websocket client, tool-state rules, G-code header reader (+ tests)
  control/      command safety check, prompt parser, job-start rules (+ tests); motion, heat, job, console panels; dialogs
  portal/       Rhino Portal client (maintenance API)
  maintenance/  care rules (+ tests), task cards, log-work dialog, care tiles
  slicer/       Prepare: job settings, Kiri:Moto settings, Rhino job file writer, file checks, ready-made G-code reader (+ tests), engine loader
  prepare/      Job setup parts: step bar, toolhead cards and their facts (+ tests), bed view, number fields, advanced fold-outs, CNC steps
  webcams/      camera rules (+ tests), the camera viewer, Settings → Cameras
  dashboard/    Dashboard notices (+ tests)
  bedmesh/      bed mesh: reading Klipper's mesh, tilt and warp, which mesh a print uses (+ tests); the top-down map
  stores/       machine state, control (console, prompts, motion lock, confirmations), cameras, care, settings, theme
  components/   shell (top bar, rail, E-stop) and shared parts
  views/        one file per screen
  router.ts     screens and their URLs
design/icons/   exported SVGs for the README, videos and the Portal
scripts/        icon export, mock Moonraker, kiri/ (builds the Kiri:Moto engine into public/kiri/)
public/kiri/    the Kiri:Moto engine, built from a pinned grid-apps commit (MIT, licence alongside)
docs/           testing on the machine
```

## Decisions so far

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript | Catches wrong shapes (Moonraker replies, profiles, macro params) before they reach the machine |
| Components | Our own, no library | Keeps one visual identity; nothing to fight |
| State | Pinia | Vue's official store; machine state is shared by many screens |
| Routing | Hash URLs (`#/prepare`) | Runs from any static folder without server rewrite rules |
| Fonts | Archivo, DSEG7 Classic (seven-segment readouts) and JetBrains Mono, bundled | Clean interface, alarm-clock numbers you read from across the shop; works offline |
| Slicing (from Phase 3) | Kiri:Moto engine in the browser | Keeps CPU load off the Pi 3B so Klipper's timing isn't disturbed |

## Design system

Open **Style** in the app for the live guide. The direction is an **e-paper instrument**: every card is a small e-paper display, the whole app is one consistent set of modules (in the spirit of Mainsail's dashboard), and almost everything is drawn with two colours.

- **Ink and paper** do the work. Night theme is inverted e-ink (charcoal paper, light ink); day theme is warm matte paper with black ink.
- **Graphs may use a few simple colours.** Temperature graphs draw the reading as a thin red line and the set temperature as a grey line. The bed mesh map shades blue below the average and amber above it (`--rs-mesh-low/high`), never red, on a fixed ±0.25 mm scale that only widens when a mesh needs it, so a flat bed looks flat.
- **Red means stop**, and nothing else is red (apart from graph lines). One exception: on the Dashboard's camera overlay, red marks what needs your attention (a question waiting, a paused job, overdue care), because text there sits on live video and needs a colour that reads over any picture.
- **Toolhead colours** appear only as a small tab on a tool's tile or badge and the thin band under the top bar.
- **Dither patterns** do the shading, the way e-ink displays do: progress bars, locked jog keys, care that's coming due. Overdue is solid ink.
- **Inverted ink** (an ink block with paper text) means live or selected: the armed jog keys, the held Hold button, the chosen step size, the current screen in the nav.
- **Type**: Archivo for the interface; **DSEG7 Classic**, a seven-segment alarm-clock face, only for big readouts (temperatures, tool outputs, job %, the Dashboard clock); **JetBrains Mono** for positions (read to two decimals, so they get a plain, exact face), G-code and the console. All bundled.
- **Hierarchy in the Control status box**: the job % is the biggest number, temperatures and tool outputs next, position smallest.
- **Panel colours**: every panel has a ⋮ in its top-right corner with its own settings; for now its colours (background, text, border and dividers), set separately for day and night and saved in Moonraker's database (namespace `rhino_studio`), so every screen shows the same theme and it's backed up with the config. Red (stop, cancel, alerts), the orange swap list and graph lines are never themed. Settings > Appearance: pick a saved theme (it previews straight away; **Apply** keeps it, **Revert** drops it), save the colours in use as a named theme, download a theme file (`*.rhino-theme.json`) to keep or share, load one, delete saved themes, or reset all panels. The day/dark/light choice previews the same way until Apply.
- **Buttons**: outlined = actions; filled ink = the one primary on a module; quiet text = minor (Snooze, Refresh); filled tiles = macro keys only; red = stop or destroy (Cancel job is outlined red, set apart from Pause).
- Every card is an `RsPanel` module: title on the left, a short live status on the right, a dotted rule, then the body.
- Components use `--rs-*` variables only, never raw colours.

## Safety model

- The mounted toolhead comes only from Klipper (`printer["gcode_macro SWAP_TOOL"].current_tool`). The UI never sets it, guesses it, or keeps it after a disconnect or Klipper restart.
- After a restart, `current_tool` is 0 until RESTORE_TOOL is answered. The slot in `save_variables` is shown as "last saved", never as mounted.
- The Moonraker client has two allowlists: `READ_ONLY_METHODS` and `ACTION_METHODS` (G-code, start, pause, resume, cancel). Anything else is refused before it leaves the browser; unit tests check both.
- G-code only leaves as a `CheckedScript` from `src/control/commands.ts`. Every line is classified; anything that moves the machine, powers a tool (M3/M4, SET_PIN, servos, laser rail, spindle, SWITCH_T0/T1 on the shared servo channel), changes the recorded toolhead, restarts Klipper, starts a job or runs an `_internal` macro asks first and says what each line does. Stops (M112, EMERGENCY_STOP) never ask.
- The console is a full console (your choice): you can confirm anything. It guards against slips, not against intent.
- Jogging is locked until you unlock it, relocks after 60 s idle, when you leave the screen, lock the phone or switch apps, and whenever Klipper isn't ready, a job is running, a swap is under way or the mounted tool changes. It needs a confirmed toolhead (tool lengths differ) and homed axes, and refuses moves past the machine's travel. One tap is one fixed step: there is no hold-to-move, so a lost touch or dropped Wi-Fi can't leave the machine moving.
- Prompt buttons run only their own command. A button whose command is `action:prompt_end` is sent back as `RESPOND TYPE=command MSG="action:prompt_end"`.
- Heaters: setting a temperature runs without asking (as in Mainsail), within 0-300° (hotend) and 0-130° (bed). The hotend can only be heated with a confirmed print head mounted: the hotend heater output stays wired when a laser, spindle or knife is fitted, and those tools show their body temperature (thermistor on the shared T0 input) read-only. Switching a heater off is always allowed.
- Jobs: Start is blocked unless the mounted tool is confirmed and matches the file; files that declare no toolhead get a warning. Cancel and Resume ask; Pause doesn't.
- Maintenance never blocks: overdue care shows in the start confirmation, nothing more.
- Bed mesh (needs Tool Manager 1.6.0): making a mesh (RHINO_MESH_CALIBRATE: home if needed, heat, soak, level, probe) needs a confirmed print head, because the probe is on the print heads, and asks first naming each step. Using a mesh and switching it off ask first (Z follows the change from the next move). Removing asks; Save (SAVE_CONFIG) asks, says Klipper restarts and names anything pending that isn't a mesh (a probe z_offset would shift every head). None of it is offered during a job: a print loads its own mesh at the start. Looking at a mesh changes nothing on the machine. On the Rhino, a spindle never cuts with a mesh loaded (SET_Z_ZERO switches it off; the job refuses otherwise).
- The on-screen E-stop depends on the browser, network, Pi and Moonraker. It does not replace a physical E-stop or power switch.
- Cameras: reading the list is in `READ_ONLY_METHODS`; editing it uses a third allowlist, `CAMERA_METHODS` (`server.webcams.post_item`, `server.webcams.delete_item`), which only changes Moonraker's camera list. Deleting a camera asks first. A camera picture can lag or freeze: it is not a safety device.
- The Dashboard is look-only: no buttons that act on the machine, and Klipper's wizard questions are answered on Control (the Dashboard shows a red notice that one is waiting). The top bar's Stop stays.
- The Portal client's writes are allow-listed by kind, each tied to one fixed request (`WRITE_ROUTES` in `src/portal/client.ts`); anything else is refused before it leaves the browser, and unit tests check every route:
  - `PORTAL_WRITES`: log work, snooze. Maintenance records only.
  - `PORTAL_TOOL_CHECKS`: check a new tool, a control or a macro against the whole Klipper config. Changes nothing.
  - `PORTAL_TOOL_WRITES`: add, edit, rename and delete *added* tools and their photos. They change the tool registry and `custom_tools.cfg`, which Klipper only loads at its next restart. The Portal refuses built-in tools, removing the mounted tool, and console-style changes during a job. Delete asks first.
  - `PORTAL_RESTART`: restart Klipper to load waiting tool changes (asks first; offered only when idle, and the Portal refuses during a job), or have the Portal restart it when the job ends.
  - `PORTAL_CARE_WRITES`: maintenance tasks, library tasks and Task Books (create, edit, delete, assign), statuses on tasks, meter readings, the reminder setting. Maintenance records only. Deletes ask first.
  - `PORTAL_CARE_SETUP`: machine areas, kinds of work, priorities, status codes. Maintenance records only; the Portal refuses to remove anything tasks still use.
  - `PORTAL_TOOL_SETUP`: the lists Add a toolhead offers. Portal data only; built-in and in-use kinds can't be removed.
  - `PORTAL_HARDWARE`: check, save and remove system hardware. Writes `custom_tools.cfg`, live after the next Klipper restart like tool changes; removing asks first, and the Portal refuses hardware a tool switches on.
  None of them can move the machine or switch a tool on.
- Generated jobs call the existing macros (START_JOB, SWAP_TOOL, END_PRINT) instead of raw tool-change or power G-code.
- Prepare's files never heat (START_JOB heats from the material table), never home, swap, restart or change work zeros, and never switch a tool's power on: the laser file doesn't switch the rail on (`_LASER_START` does), and the CNC file doesn't start the spindle (CNC_JOB_SETUP does). Run on their own, outside their wizard, they can't fire the laser or spin the spindle.
- Every prepared file is read back line by line before it may be sent (`src/slicer/check.ts`); a failed check blocks Send and Download. The machine's macros keep their own checks too.

## Licence

GPL-3.0-or-later (see `LICENSE`). This allows borrowing code from Mainsail and Fluidd, which are GPL-3.0; when we do, the source file gets a comment naming where it came from.

Third-party pieces in use:

| Package | Licence |
|---|---|
| Vue, Vue Router, Pinia, Vite | MIT |
| Archivo, JetBrains Mono (via Fontsource) | SIL Open Font License 1.1 |
| DSEG7 Classic by keshikan (bundled in `src/assets/fonts/`, unmodified, licence alongside) | SIL Open Font License 1.1 |
| Kiri:Moto engine, GridSpace grid-apps 4.7.0 (bundled in `public/kiri/`, built by `scripts/kiri/build.mjs` with two path fixes, licence alongside) | MIT |

The mock's camera frames (`scripts/fixtures/webcam/`) were rendered for this project with three.js (MIT); three.js itself isn't part of the app.

## PrusaSlicer

FDM jobs can slice with PrusaSlicer running on the Rhino host (through the Rhino Portal, Toolhead_Manager 1.5.0+).
Prepare shows every option on PrusaSlicer's Print, Filament and Printer tabs. The list, labels and tooltips in
`src/slicer/prusa/schema.json` are generated from PrusaSlicer's own source (`scripts/prusa/make_schema.py`;
PrusaSlicer is AGPL-3.0, © Prusa Research and the Slic3r authors). Kiri:Moto in the browser stays available.

The engine comes from Flathub (Toolhead_Manager 1.5.2+; Prusa ships Linux builds nowhere else): the host needs
`sudo apt install flatpak` once, by hand. Settings › Software installs it, shows each step, test-slices it, and
offers **Go back** after an update. Hosts under 2 GB of memory (a Pi 3B) aren't offered it and say why. Try those
states with the mock: `MOCK_SMALL=1`, `MOCK_FLATPAK=0`, `MOCK_PRUSA=0` (not installed).
