# AGENTS.md: working on Rhino Studio

Instructions for AI coding agents (and people) changing this repository. Read it before your first change.
The machine side (Klipper config, macros, the Rhino Portal) lives in the `Toolhead_Manager` repo and has its own AGENTS.md.

## What this is

One web interface for every process on the **Rhino Multi Motion System**, a Klipper machine with swappable toolheads
(3D printing, laser, CNC spindle, drag knife, user-added tools): prepare a job, preview it, send it, run the machine,
and keep it maintained. Vue 3 + TypeScript (strict) + Vite, Pinia, vue-router (hash history), Vitest. GPL-3.0-or-later.

- **Machine I/O is Moonraker only.** Slicing runs in the browser (Kiri:Moto's engine), never on the host.
- **The Rhino Portal** (Flask, `/portal`) is the store and judge for tools, hardware, maintenance, backups and profiles.
  Studio sends exactly the requests the Portal's own screens send, and the Portal checks everything again.
- Studio ships inside each Tool Manager release zip; that's how it reaches a machine.

**The goal is durability, not feature parity.** The machine can sit idle for months. For every change, ask:
*does this help it survive being left alone and be resumed safely?*

## The safety model (do not weaken it)

- **Tool state is Klipper's.** The mounted tool comes from `printer["gcode_macro SWAP_TOOL"].current_tool` through the
  tool adapters (`src/tools/adapters`). The UI never sets, guesses or stores it.
- **Allowlists.** Reads go through `READ_ONLY_METHODS`, actions through `ACTION_METHODS`, Portal writes through
  `WRITE_ROUTES` (one fixed method and path per kind). A new capability gets its own reviewed list and a unit test.
- **Every script is checked.** `runScript` only accepts a `CheckedScript` (`src/control/commands.ts`). Motion, tool power,
  tool state, restarts and jobs ask first; heat and plain macros don't; the emergency stop never asks.
- **Narrow no-confirm paths** exist only where a builder makes the exact command and a validator proves it:
  tuning (`isTuningScript`) and Control › Hardware (`isHardwareScript`, never a tool output). Copy that pattern; don't widen `check`.
- **Live things sit behind the padlock** (`PadLock.vue`): motion, tuning, spindles, heaters, laser-style power. Unlocked
  panels turn red; they relock on tool change, job start, Klipper not ready, and leaving the page.
- **Jobs** start only with Klipper ready, no job running and a confirmed matching tool. Laser, CNC, knife and added
  tools start through their setup wizards with `FILE=`. Cancel and Resume confirm; Pause doesn't.
- The Dashboard is look-only. Cameras are not safety devices. Maintenance informs, never blocks.

## Design rules

- Ink and paper do the work. **Red only** means stop/destroy, an unlocked live panel, or the Dashboard's "needs you".
- Archivo for the interface; DSEG7 (`.rs-num`) only for big readouts; JetBrains Mono for positions, G-code and the console.
- Every colour and size comes from `src/styles/tokens.css`. Check light and dark, desktop and phone (and about 760 px).
- Sentence case, plain verbs, say what will happen. Empty states explain what's missing.
- The wizard mascot appears only in the Add hardware wizard and only from `scripts/wizard_poses.py`.

## Where things live

| Area | Files |
|---|---|
| Moonraker client, allowlists, subscriptions | `src/moonraker/client.ts` |
| Command checks, jobs, prompts, tuning, hardware controls, macro values | `src/control/` |
| Stores | `src/stores/` (machine, control, toolmgr, maintenance, updates, ...) |
| Portal client and its write allowlist | `src/portal/client.ts` |
| Assets (toolheads, hardware, parts) and the Add hardware wizard | `src/views/toolheads/`, `src/hardware/` |
| Routes (old `/toolheads/...` addresses redirect to `/assets/...`) | `src/router.ts` |
| On-machine checks | `docs/testing.md` |

Keep logic in plain TypeScript modules with unit tests (`*.test.ts` beside them) and the `.vue` files thin.

## Testing

```
npm test            # Vitest
npm run build       # type-check + build
npm run mock        # pretend Moonraker + Klipper + Portal (MOCK_SCENARIO=..., MOCK_FANS=1|stall, MOCK_HARDWARE=1)
MOONRAKER=http://localhost:7125 PORTAL=http://127.0.0.1:5055 npx vite --port 5173
```

Drive changed flows in a headless browser against the mock (or the Tool Manager's `dev/demo_server.py` for real Portal
behaviour) and screenshot every changed screen. Anything that touches the machine gets an on-machine check in
`docs/testing.md` with a pass condition and a *Stop if*.

## Never

- Never push, tag or release without the maintainer's OK.
- Never send G-code that bypasses `check` / `approve`, and never add a no-confirm path without a validator and tests.
- Never store machine state in the browser: browser storage is for per-viewer conveniences only (a folded panel).
- Never borrow third-party code without its licence fitting GPL-3.0 and a credit comment naming the source file.
- Never use paid fonts or assets; find an OFL/MIT equivalent.
