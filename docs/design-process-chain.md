# Design: process chains (Studio side)

Status: **started Nov 26 2026. Test slice done; nothing built yet.** Source: Mike's "Proposed Process Chain" (`~/Downloads/proposal-process-chain.md`). Order A (print, then laser) first;
order B (laser, then print) waits for the machine's swap-repeatability test and the motors-on macro changes in that proposal (sections 4 to 5).

## 1. Decisions (Mike, Nov 26)
- Build **order A first**. Order B and the five machine changes for it are later.
- A saved chain is a **Portal-owned versioned JSON file** (slice-profiles pattern: schema version, validated on save, atomic write, last 5 revisions), with its own write route on the
  allowlist and a unit test. The browser holds nothing durable.
- Build for efficiency and cohesion: reuse what exists, add as little as possible.

## 2. Workflow review (what exists, and what that does to the proposal)
- **Order A needs no macro change.** `SWAP_TOOL` refuses during a job. Laser, knife, spindle and added tools never home Z (`G28` and `_RHINO_HOME_SAFE` refuse it), and the laser start
  needs `SET_Z_ZERO` first, so the laser job after a print cannot probe into the parts. After a print `END_PRINT` runs `M84` (homing lost), but `_RHINO_Z_ASK` restores Z from the park height.
  So `CHAIN_HANDOFF` is not needed: Studio runs the existing swap, swap wizard and start wizard in sequence. Order B (a print starting over material) is where the macros are needed.
- **The run wizard orchestrates, it doesn't duplicate.** A print stage starts through `checkStart` and `START_JOB`; a laser stage through `startWizard.ts` with `FILE=`. Same gates, same confirmations.
- **Progress comes from Moonraker's job history** (a stage is done when its file finished after the chain started), plus the mounted tool from Klipper. No new Klipper variable. When history is
  off or cleared the wizard says "unknown" and asks; it never guesses.
- **Reuse:** the laser stage card is `LaserOps.vue` (it already has the reorder buttons). "Place the sheet" is the same pause as the dual-filament design's planned "pause for a hand change at a layer" (one control, not two); the Rhino's own `PAUSE` and
  `RESUME` (`pause_resume.cfg`) do the park and return.
- `_SHEET_PLACE` named in the proposal is **not in either repo** (it comes from the hybrid-sheet proposal). It will be written, not extended.

## 3. Test slice findings (Kiri:Moto 4.7.0; `scripts/chain-probe/`)
1. **Kiri keeps placement.** A block is centred on the bed (X 262.4 to 287.6, Y 187.4 to 212.6) and `move(100, 50, 0)` shifts X/Y by exactly 100 and 50. Two bodies sliced separately and placed with the same
   coordinates therefore land where the placement says, which is what a chain needs.
2. **Kiri cannot lift a part off the bed.** `move(0, 0, 3.1)` changes nothing: layers still start at Z 0.2. PrusaSlicer also drops objects to the bed as far as is known (not tested: it isn't installed on
   this PC; the Rhino runs 2.9.7). So a "floating features" slice is not available in either engine.
3. **So: slice each stage's bodies from the bed, then raise the features with the machine's Z offset after the pause.** The file is: fixtures body, the pause block, `SET_GCODE_OFFSET Z_ADJUST=<sheet thickness> MOVE=0`, features body, end.
   Engine-independent, and it works around Kiri slicing one model at a time (several bodies = several slices, stitched). `Z_ADJUST` adds to the offset the job already carries, so the Rhino's own Z offset is kept.
4. **Kiri's body is easy to stitch.** After the `; --- startup ---` line the file is `;LAYER_CHANGE`, `;Z:` and plain moves to `; --- filament used ---`. Studio's `rhinoFile.ts` already wraps one body with the header, `START_JOB`
   and `END_PRINT`; a chain file wraps two bodies, with the second one's first-layer lines left as they are.
5. **A trap already found in this repo:** Klipper's `RESUME` puts back the G-code offsets from the moment of the pause (see the comment in `TOOLHEAD_DISPATCH.cfg` above `RESUME_BASE`). An offset line placed in the file *after* the `PAUSE` runs after
   the restore, so it holds; one set before the pause would be undone. The stitched file must keep that order.

## 4. Still to prove
- **On the machine:** the nozzle clears the fixtures on resume, the first feature layer lands on the sheet top, `Z_ADJUST` survives the resume, and `END_PRINT` clears it (it sets `Z=0`). (Check on the machine; goes in `docs/testing.md` with the build.)
- **PrusaSlicer 2.9.7:** a bodies-from-the-bed slice and the stitched file. Needs `prusa-slicer` installed on this PC (Mike runs the install), or a run on the Rhino.

## 5. Build order
1. Chain model in plain TypeScript with tests: stages, tool-change grouping into jobs, reorder rules, handoff chips, the stitched print file.
2. Portal chain store (route, allowlist, tests).
3. Builder screen in Prepare, then the run wizard on Control.
4. Order B, the five machine changes and multi-part layout: separate proposals, after the machine tests.
