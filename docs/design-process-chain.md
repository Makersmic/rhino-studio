# Design: process chains (Studio side)

Status: **started Nov 26 2026. Built: the model (`src/chain/`), the Portal store, and the builder screen (Job setup > Chain: stages grouped by job, chips, sheet, checks, the bed with Zoom to part, save/open/delete). Loading the design (Nov 26, later): bodies of a 3D file, roles, the bed picture, design checks. Laser operations and the job files (Nov 26, later). Not built: the run wizard, laser travel lifts (waiting for Mike).** Source: Mike's "Proposed Process Chain" (`~/Downloads/proposal-process-chain.md`). Order A (print, then laser) first;
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

## 4b. Built: the model (`src/chain/chain.ts`, `stitch.ts`)
Stages and presets, the order rules (a refused move gives its reason), `planSteps` (a new job wherever the tool changes; a manual stage with the same tool on both sides is a pause), the chips between cards, the checks, job file names, and `stitchPrint`.
**One change to the file check:** it forbids `SET_GCODE_OFFSET` everywhere ("changes the work zero"). `chainRaise` is the single exception: the exact line `SET_GCODE_OFFSET Z_ADJUST=<0.2 to 20> MOVE=0`, straight after `PAUSE`, once. Anywhere else, or in any other form, it is still an error, and the check adds the raise to the file's Z range. Order B (a print after a laser) is refused with its reason.

## 4c. Built: the builder screen (Nov 26)
`views/ChainView.vue` (route `/setup/chain`, linked from Job setup's first step), `chain/ChainBed.vue` and `ChainNum.vue`, `stores/chains.ts`. Design: `Design mock` approved by Mike: stage cards **grouped by job** (a job is a file, the tool changes at the gap between groups), generated handoff chips in the gaps, the checks in the Job-file mark style (red only for a blocking check), the bed to scale with Whole bed / Zoom to part (Mike: "yes to zoom to part"). Below 1060 px it is Stages / Bed tabs. The up and down arrows were left out: in order A nothing can move, so a dimmed pair on every card promised a control that does nothing; the order check says so once.
The chain stores the sheet (`width`, `depth`, centre `x`, `y`) so the bed can draw it and the checks can test it against the work area and keep-out areas. "Locate by" and "Parts" are left out until fixtures and layout exist. One print head and one laser per chain for now (changing a stage's tool changes every stage of its kind). Studio's mock Portal serves `/api/chains` (`MOCK_CHAINS=seed|old`).

## 4d. Built: loading the design (`src/chain/design.ts`, the Design panel in `ChainView.vue`)
One 3D file (3MF, STL, OBJ) loaded with Studio's own `loadModelFile`, so a 3MF's objects arrive as separate bodies. Each body gets a part: **the sheet**, **a fixture**, **a feature**, or **leave out** (guessed from its name, changeable; sheet and fixture are offered only when the chain has those stages). "Use as the sheet" copies the sheet body's size, centre and thickness into the chain. The bodies keep their places relative to each other, anchored on the sheet body's centre (else the whole design's) at the chain's sheet centre (else the bed's middle). The bed draws the outlines: the selected stage's bodies solid, earlier stages' faint, later ones not at all; Zoom to part frames the sheet and the design. Checks: something to print in each stage, everything on the bed and clear of keep-out areas, features inside the sheet (an error: they would print in the air), fixtures whose outline box touches the sheet (a note only).
**Remembered (Mike, Nov 26):** the chain stores `design: { file, roles }`. The file goes into the Portal's model library under `Chains/<chain>__<file>` when the chain is saved (before the save, so a chain never names a missing file); the roles list the part of each body by position and name, and a part is only put back where the name still matches. Reopening a chain reads the file back from the library. The library is not in backups, so the design file is not either (a lost file shows a banner and the person loads it again). Laser artwork (SVG/DXF) is refused here with a reason; it comes with the laser stage.

## 4e. Built: laser operations (`src/chain/laser.ts`, the Laser work panel)
The laser stage's work is a flat drawing (SVG or DXF, kept in the model library next to the design) and a list of operations (cut, score, engrave fill) picked on its loops, in the same list as Job setup: `LaserOps.vue` now takes the list, loops and busy state as props and v-model, and Job setup passes its job's. Kiri slices the drawing once to find the loops; the drawing sits on the sheet's centre. **Loops no operation picked are not lasered** (`assembleLaser(..., leaveRest)`): a chain's laser marks a sheet that must stay whole, so there is no hidden "cut everything else". Checks: a laser stage has a drawing (error), it lies on the sheet (error), at least one operation has a loop (note), a Cut operation burns through onto what is under the sheet (note). The Portal keeps `laser: { file, ops }` (rhino/chains.py `clean_laser`, ranges as in the Operations list).
Not yet: the laser job file itself (the operations written out with the travel lifts of the proposal's item 5 and the focus on the sheet top) and the material the laser is tuned for; both come with the job files.

## 4f. Built: the job files (`src/chain/build.ts`, "Job files" on the chain screen)
`buildJobs` makes one file per planned job. A print job: each group (fixtures, features) is moved to where its bodies sit on the bed, sliced from the bed as one part by the engine (Kiri here), and the two are stitched (`stitchPrint`), wrapped by `rhinoFile` and checked by `checkFile` exactly like a Job setup file. A chain with only features is one plain slice. A laser job: the drawing's cut with the operations written out by `assembleLaser(leaveRest)` (loops nobody picked are not lasered); no Z moves. The slicer is passed in so the module is tested with a stand-in (`build.test.ts`); the real one runs the engine. Files can be downloaded or sent to the Rhino's gcodes folder (the same upload as Job setup; never started). Changing anything clears the list. A job that can't be built is listed with its reason, and the chain stores only the jobs that built.
**Refused for now (Mike's decision needed):** a laser job while features are printed on the sheet. The head would cross them at focus height, the proposal wants lifts, and a laser file has no Z moves by a file-check rule; the exception is written up for Mike (options a/b/c in the status to rhino-a2). Also not built: the laser material choice (the head's first material is used for the settings that no operation overrides: only the header's), the run wizard, one print head per chain.

## 5. Build order
1. Chain model in plain TypeScript with tests: stages, tool-change grouping into jobs, reorder rules, handoff chips, the stitched print file.
2. Portal chain store (route, allowlist, tests).
3. Builder screen in Prepare, then the run wizard on Control.
4. Order B, the five machine changes and multi-part layout: separate proposals, after the machine tests.
