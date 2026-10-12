# Rhino Studio

One interface for every Rhino Multi Motion System process: import a model, pick a toolhead, prepare, preview, send and monitor. "Rhino Studio" is a working title; the name and logo live in `src/brand/brand.ts`.

Status: **Phase 2b** (machine control), on top of 2a (live status) and Care (maintenance). **This version can move the Rhino, heat it, run macros and start jobs.** Run the checks in [docs/testing.md](docs/testing.md) in order before trusting it, starting with 2a's A1-A8.

### What it can do

- **Control** screen: jog (locked until you unlock it, relocks after 60 s idle), home, motors off, heater targets, the running job (pause, resume, cancel), the mounted toolhead with Swap and Confirm, and a console with your macros arranged beside it.
- **Pendant mode** (Control → Pendant mode, or `#/pendant`): the phone as a pendant at the machine, with Stop always on screen.
  - **Jog** screen uses two-hand control: the jog keys stay greyed out unless the **Hold** button in the bottom corner is held. Hold with one thumb, tap with the other; one tap is one step. Letting go, a cancelled touch, the screen turning off or switching apps kills the keys at once. A left-handed option mirrors the layout. On a computer, hold Shift as the Hold button.
  - **Status** screen: big work/machine position, Home, Set Z zero / Set work zero.
- **Klipper prompts**: the Rhino wizards' questions (SWAP_TOOL, RESTORE_TOOL, the job setup wizards) pop up in Studio as well as Mainsail. A button runs only its own command.
- **Files**: upload (button or drag and drop; never starts the file) and Start. Start checks the file's toolhead against the mounted one and blocks a mismatch (offering the swap). Print files start directly (their START_JOB checks again on the machine); laser, spindle, knife and added-tool files start through LASER_JOB_SETUP, CNC_JOB_SETUP, DRAGKNIFE_JOB_SETUP or TOOL_JOB_SETUP with `FILE=`, so the wizard's safety steps and the laser rail (config 1.4.1) aren't skipped.

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

`MOCK_SCENARIO=restart`, `swap` or `custom` changes what the mock reports. It prints every request the app makes. The mock also serves the Portal's maintenance API with real data from the Portal's own year-of-use demo (`scripts/fixtures/`).

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
  stores/       machine state, control (console, prompts, motion lock, confirmations), care, settings, theme
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
| Fonts | Archivo (variable weight and width) and JetBrains Mono, bundled | One family does big light readouts, labels and the wide wordmark; works offline on the shop network |
| Slicing (from Phase 3) | Kiri:Moto engine in the browser | Keeps CPU load off the Pi 3B so Klipper's timing isn't disturbed |

## Design system

Open **Style** in the app for the live guide. The direction is a workshop instrument panel: a black frame, solid colour blocks with big rounded corners, cream "paper" tiles carrying large light numerals (Braun dials, retro control panels), pill-shaped controls, and thin geometric line art with technical-drawing touches (crop marks, index numbers, dotted rules).

- Each toolhead owns one colour from a retro palette and one emblem: BlockOne slate blue, SwitchFly sea teal, LightSaber lilac, HotJoe signal orange, DragKnife sage, user-added tools tan.
- Red is never a tool colour; it means stop. Danger controls also differ in shape and wording, since HotJoe's orange is the nearest hue.
- The app takes the mounted toolhead's colour (band under the top bar, primary buttons, active nav). When Klipper hasn't confirmed the tool, the band is hatched.
- Emblems are drawn once on a 48-unit grid with non-scaling strokes, so they work from 20px to full tiles. Dashed construction lines (tool axis, motion, planned path) appear at 32px and up.
- Components use `--rs-*` variables only, never raw colours.

## Safety model

- The mounted toolhead comes only from Klipper (`printer["gcode_macro SWAP_TOOL"].current_tool`). The UI never sets it, guesses it, or keeps it after a disconnect or Klipper restart.
- After a restart, `current_tool` is 0 until RESTORE_TOOL is answered. The slot in `save_variables` is shown as "last saved", never as mounted.
- The Moonraker client has two allowlists: `READ_ONLY_METHODS` and `ACTION_METHODS` (G-code, start, pause, resume, cancel). Anything else is refused before it leaves the browser; unit tests check both.
- G-code only leaves as a `CheckedScript` from `src/control/commands.ts`. Every line is classified; anything that moves the machine, powers a tool (M3/M4, SET_PIN, servos, laser rail, spindle, SWITCH_T0/T1 on the shared servo channel), changes the recorded toolhead, restarts Klipper, starts a job or runs an `_internal` macro asks first and says what each line does. Stops (M112, EMERGENCY_STOP) never ask.
- The console is a full console (your choice): you can confirm anything. It guards against slips, not against intent.
- Jogging is locked until you unlock it, relocks after 60 s idle, when you leave the screen, lock the phone or switch apps, and whenever Klipper isn't ready, a job is running, a swap is under way or the mounted tool changes. It needs a confirmed toolhead (tool lengths differ) and homed axes, and refuses moves past the machine's travel. One tap is one fixed step: there is no hold-to-move, so a lost touch or dropped Wi-Fi can't leave the machine moving.
- Prompt buttons run only their own command. A button whose command is `action:prompt_end` is sent back as `RESPOND TYPE=command MSG="action:prompt_end"`.
- Jobs: Start is blocked unless the mounted tool is confirmed and matches the file; files that declare no toolhead get a warning. Cancel and Resume ask; Pause doesn't.
- Maintenance never blocks: overdue care shows in the start confirmation, nothing more.
- The on-screen E-stop depends on the browser, network, Pi and Moonraker. It does not replace a physical E-stop or power switch.
- The Portal client may only read maintenance and log work or snooze (`PORTAL_WRITES` in `src/portal/client.ts`). Those change maintenance records, never the machine.
- Generated jobs call the existing macros (START_JOB, SWAP_TOOL, END_PRINT) instead of raw tool-change or power G-code.

## Licence

GPL-3.0-or-later (see `LICENSE`). This allows borrowing code from Mainsail and Fluidd, which are GPL-3.0; when we do, the source file gets a comment naming where it came from.

Third-party pieces in use:

| Package | Licence |
|---|---|
| Vue, Vue Router, Pinia, Vite | MIT |
| Archivo, JetBrains Mono (via Fontsource) | SIL Open Font License 1.1 |
| Kiri:Moto engine (from Phase 3) | MIT |
