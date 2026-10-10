# Rhino Studio

One interface for every Rhino Multi Motion System process: import a model, pick a toolhead, prepare, preview, send and monitor. "Rhino Studio" is a working title; the name and logo live in `src/brand/brand.ts`.

Status: **Phase 1** (style guide and app shell). Nothing in this version talks to the machine. It cannot move the Rhino or switch on a tool.

## Run it on your PC

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the address it prints (http://localhost:5173). Because `dev` runs with `--host`, the "Network" address also works from a phone or tablet on the same Wi-Fi.

Other commands:

| Command | What it does |
|---|---|
| `npm run typecheck` | Checks types without building |
| `npm run build` | Type-checks, then builds static files into `dist/` |
| `npm run preview` | Serves the `dist/` build locally |
| `npm run icons` | Exports every icon to `design/icons/` as standalone SVG files |

The built `dist/` folder is plain static files and works from any folder, so later it can be served by the nginx that already serves Mainsail on the Pi. Deployment to the Pi comes with Phase 2.

## Folder map

```
src/
  brand/        name, logo, favicon (change the brand here only)
  icons/        toolhead emblems and interface icons (source of truth)
  styles/       tokens.css (every colour, size, font) and base.css
  toolheads/    look of each toolhead: accent, icon, summary
  stores/       machine state (Pinia), theme preference
  components/   shell (top bar, rail, E-stop) and shared parts
  views/        one file per screen
  router.ts     screens and their URLs
design/icons/   exported SVGs for the README, videos and the Portal
scripts/        icon export
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

- The mounted toolhead comes only from Klipper (`printer["gcode_macro SWAP_TOOL"].current_tool`). The UI never sets it, guesses it, or keeps it after a disconnect.
- Anything that moves the machine or powers the laser or spindle will ask for confirmation. The E-stop never asks.
- The on-screen E-stop depends on the browser, network, Pi and Moonraker. It does not replace a physical E-stop or power switch.
- Generated jobs call the existing macros (START_JOB, SWAP_TOOL, END_PRINT) instead of raw tool-change or power G-code.

## Licence

GPL-3.0-or-later (see `LICENSE`). This allows borrowing code from Mainsail and Fluidd, which are GPL-3.0; when we do, the source file gets a comment naming where it came from.

Third-party pieces in use:

| Package | Licence |
|---|---|
| Vue, Vue Router, Pinia, Vite | MIT |
| Archivo, JetBrains Mono (via Fontsource) | SIL Open Font License 1.1 |
| Kiri:Moto engine (from Phase 3) | MIT |
