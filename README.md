# Rhino Studio

One interface for every Rhino Multi Motion System process: import a model, pick a toolhead, prepare, preview, send and monitor. "Rhino Studio" is a working title; the name and logo live in `src/brand/brand.ts`.

Status: **Phase 2b** (machine control), on top of 2a (live status) and Care (maintenance). **This version can move the Rhino, heat it, run macros and start jobs.** Run the checks in [docs/testing.md](docs/testing.md) in order before trusting it, starting with 2a's A1-A8.

### What it can do

- **Dashboard** (the home screen): a landscape "lock screen" for the machine. The camera fills the background. The mounted tool sits top-left and the machine state (Idle, Busy, Printing, Paused…) top-right. While a job runs, a large job % sits bottom-left with its file, time left and finish time; with no job running that spot stays empty. There's no clock. Every other reading (the mounted tool's temperatures or outputs, position, care) sits on one rail along the bottom, and a short stack of notices says what needs you, in red. It's look-only: values link to the screen with the details, and the only control is the top bar's Stop.
- **Cameras**: every camera Moonraker knows (the same list Mainsail uses), shown on Control in a Camera panel with gallery arrows and dots, and behind the Dashboard. Add, edit, turn, mirror, switch off and delete cameras in Settings → Cameras, with a live preview. MJPEG streams, MJPEG snapshots, IP-camera video and web-page cameras work; WebRTC and HLS come later.
- **Control** screen: temperatures set right in the status strip (click the reading, type, Enter), each with a small history graph (last 5 minutes; the dots widen it to 20), the running job with Pause, Resume and Cancel in the same top box, a camera, jog (locked until you unlock it, relocks after 60 s idle) with the X/Y/Z position under the keys, home, motors off, and a console. Macros come in two sets: the mounted tool's own (on desktop a row of small buttons along the bottom of the status box; on smaller screens a **For <tool>** panel with its accent tab; changes on a swap) and **Every tool** (system macros that never move: toolhead list, backups, care status, and the machine's lights, chamber or exhaust hardware, picked up by name). Swap and Confirm tool are in the top bar; Pause, Resume and Cancel stay with the job.
- **Pendant mode** (Control → Pendant mode, or `#/pendant`): the phone as a pendant at the machine, with Stop always on screen.
  - **Jog** screen uses two-hand control: the jog keys stay greyed out unless the **Hold** button in the bottom corner is held. Hold with one thumb, tap with the other; one tap is one step. Letting go, a cancelled touch, the screen turning off or switching apps kills the keys at once. A left-handed option mirrors the layout. On a computer, hold Shift as the Hold button.
  - **Status** screen: big work/machine position, Home, Set Z zero / Set work zero.
- **Klipper prompts**: the Rhino wizards' questions (SWAP_TOOL, RESTORE_TOOL, the job setup wizards) pop up in Studio as well as Mainsail. A button runs only its own command.
- **Files**: upload (button or drag and drop; never starts the file) and Start. Start checks the file's toolhead against the mounted one and blocks a mismatch (offering the swap). Print files start directly (their START_JOB checks again on the machine); laser, spindle, knife and added-tool files start through LASER_JOB_SETUP, CNC_JOB_SETUP, DRAGKNIFE_JOB_SETUP or TOOL_JOB_SETUP with `FILE=`, so the wizard's safety steps and the laser rail (config 1.4.1) aren't skipped.

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

- **Care** screen: due now, every toolhead and machine area, coming up, on hold, the work log and usage meters.
- **Top bar and nav**: what's due, one tap away.
- **Toolhead tiles** (Prepare, Toolheads): each tool's care status.
- **Device**: care for the mounted tool and the machine before the next job.
- **Files**: "Care due" next to files whose toolhead needs attention.
- **Alert**: overdue care on the mounted tool.

Maintenance never blocks a job; it informs. Creating and editing tasks and Task Books stays in the Portal until Phase 5. The dev server forwards `/portal` to `<MOONRAKER host>:5000`; set `PORTAL=http://192.168.1.50:5000` to change it.

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

The built `dist/` folder is plain static files and works from any folder, so later it can be served by the nginx that already serves Mainsail on the Pi. Deployment to the Pi comes with Phase 2.

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
  webcams/      camera rules (+ tests), the camera viewer, Settings → Cameras
  dashboard/    Dashboard notices (+ tests)
  stores/       machine state, control (console, prompts, motion lock, confirmations), cameras, care, settings, theme
  components/   shell (top bar, rail, E-stop) and shared parts
  views/        one file per screen
  router.ts     screens and their URLs
design/icons/   exported SVGs for the README, videos and the Portal
scripts/        icon export, mock Moonraker
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
- **Graphs may use a few simple colours.** Temperature graphs draw the reading as a thin red line and the set temperature as a grey line.
- **Red means stop**, and nothing else is red (apart from graph lines). One exception: on the Dashboard's camera overlay, red marks what needs your attention (a question waiting, a paused job, overdue care), because text there sits on live video and needs a colour that reads over any picture.
- **Toolhead colours** appear only as a small tab on a tool's tile or badge and the thin band under the top bar.
- **Dither patterns** do the shading, the way e-ink displays do: progress bars, locked jog keys, care that's coming due. Overdue is solid ink.
- **Inverted ink** (an ink block with paper text) means live or selected: the armed jog keys, the held Hold button, the chosen step size, the current screen in the nav.
- **Type**: Archivo for the interface; **DSEG7 Classic**, a seven-segment alarm-clock face, only for big readouts (temperatures, tool outputs, job %, the Dashboard clock); **JetBrains Mono** for positions (read to two decimals, so they get a plain, exact face), G-code and the console. All bundled.
- **Hierarchy in the Control status box**: the job % is the biggest number, temperatures and tool outputs next, position smallest.
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
- The on-screen E-stop depends on the browser, network, Pi and Moonraker. It does not replace a physical E-stop or power switch.
- Cameras: reading the list is in `READ_ONLY_METHODS`; editing it uses a third allowlist, `CAMERA_METHODS` (`server.webcams.post_item`, `server.webcams.delete_item`), which only changes Moonraker's camera list. Deleting a camera asks first. A camera picture can lag or freeze: it is not a safety device.
- The Dashboard is look-only: no buttons that act on the machine, and Klipper's wizard questions are answered on Control (the Dashboard shows a red notice that one is waiting). The top bar's Stop stays.
- The Portal client may only read maintenance and log work or snooze (`PORTAL_WRITES` in `src/portal/client.ts`). Those change maintenance records, never the machine.
- Generated jobs call the existing macros (START_JOB, SWAP_TOOL, END_PRINT) instead of raw tool-change or power G-code.

## Licence

GPL-3.0-or-later (see `LICENSE`). This allows borrowing code from Mainsail and Fluidd, which are GPL-3.0; when we do, the source file gets a comment naming where it came from.

Third-party pieces in use:

| Package | Licence |
|---|---|
| Vue, Vue Router, Pinia, Vite | MIT |
| Archivo, JetBrains Mono (via Fontsource) | SIL Open Font License 1.1 |
| DSEG7 Classic by keshikan (bundled in `src/assets/fonts/`, unmodified, licence alongside) | SIL Open Font License 1.1 |
| Kiri:Moto engine (from Phase 3) | MIT |

The mock's camera frames (`scripts/fixtures/webcam/`) were rendered for this project with three.js (MIT); three.js itself isn't part of the app.
