# Design: two filaments in one job (Studio side)

Status: **design, decisions of Nov 22 2026 folded in. Built so far: the lane keys (section 3) and their logic, shown in the style guide; nothing yet in Job setup.** Mike's answers: the lanes feed one nozzle; lane 2 can print the supports *and* their interface layers;
both slicers (PrusaSlicer and Kiri:Moto). The machine's lane-change macros are **not** part of this: Mike is redesigning the hardware and the macros are written when that
design is assembled. So the Studio side below treats the machine as an interface (section 6) and never sends a two-lane job until the machine says it can run one.

## 1. What Mike asked for
Pick a model; icons for lane 1 and lane 2 filament beside it; lane 2 usable for supports; two tabs (Lane 1 / Lane 2) at the top of Settings, each holding the same settings.

## 2. What the slicers can do (checked, not assumed)
- **PrusaSlicer** has it all: several filaments in one nozzle (single-extruder multi-material), a support filament and an interface filament, a wipe tower, a purge matrix, purge into
  infill. Its per-lane settings are the *filament* settings; print settings (layer height, walls, infill) are shared, with per-part overrides. A non-empty `toolchange_gcode` replaces
  the `Tn` command, so the Rhino can write its own change command. Not yet run here: a two-lane slice on 2.8.1 / 2.9.x (first task of the build).
- **Kiri:Moto** (the bundled engine) has several extruders, a support nozzle (`sliceSupportNozzle`), a purge tower (`outputPurgeTower`) and a configurable change command
  (`gcodeChange`). Fewer controls than PrusaSlicer; to be proven with a test slice before the screens promise anything.
- Rhino rule that stays: **temperatures come from the toolhead's materials table**, not the file. So Lane 1 and Lane 2 each pick a material from that table; the Lane tabs hold
  what the slicer may vary (flow, fan, speed limits, retraction), and temperatures show locked, as they do now.

## 3. The screens
- **Lane keys** (Mike, Nov 22: "piano keys for each lane"): one white key per lane, **two to eight lanes**, so SwitchFly's two lanes and a later external filament switcher use the
  same control (`prepare/LaneKeys.vue`, logic in `prepare/laneKeys.ts`, shown in the style guide). A key shows a patterned band in the lane's tone, the filament, the lane number, a dot
  when the lane has a runout sensor and a mark when the job uses it; double-click opens that lane's material picker. The selected key is pressed in, and it is also the Lane tab
  (below). Eight tones, never red, and each lane has its own pattern so colour is never the only clue. A **black key between two neighbours** switches on "carry on with the next lane
  when this one runs out" (automatic spool change). It is allowed only with the same filament in both lanes and a runout sensor on the left lane, and says why when it isn't.
- **Runout**: per job, *Pause for me* (default) or *Carry on with the linked lane*. The runout sensor is an optional endstop per lane (Mike will add one): until a lane has one, its black
  key stays dark and a running-out lane pauses for a hand change. **Pause for a hand filament change** is also a planned pause at a layer you choose, for single-lane jobs too.
  Which sensor pin and what the machine does on a trigger belong to the machine interface (section 6), not here.
- **Per-part lane**: a lane chip (the lane's tone and number) on each row of the Parts list, and on the selected part's menu ("Print in lane 2"). Whole parts only in this build.
- **Supports** stay one drop-down (Off / Automatic / Only where I mark). Beside it, when two lanes exist: "Support filament" and "Interface filament", each *Same as the part* or
  *Lane 2* (Mike: both on lane 2). No second set of support controls: just who prints them.
- **Lane tabs** at the top of Settings: Lane 1 | Lane 2, the same filament settings in each. Print settings sit above the tabs, shared, because the slicers share them. The red
  border and Save-before-Preview work per lane like everywhere else; a profile keeps both lanes' settings.
- **Preview**: colour by lane, and the layer slider marks the layers where the lane changes.

## 4. Features I expect you to need (each earns its place)
1. **Parts that must line up (assemblies).** Two files from CAD that fit together (a body and its inlay, a sign and its letters) must keep their relative position. Dropping several
   files at once asks "Keep them as one assembly?"; an assembly moves, turns and scales as one, lanes are assigned per part inside it, and each part still drops to the bed. Without
   this, the Parts list's separate placing would break the fit. (Alignment aids: align parts' centres or faces to each other; never auto-arrange an assembly.)
2. **Purge tower you can see and place.** One nozzle means every change purges. The tower is drawn on the bed, auto-placed clear of the parts, draggable, counted in "fits the bed",
   with its size and purge amount per lane pair. PrusaSlicer's "purge into infill" as one switch (Prusa only; Kiri has no such thing, so it isn't offered there).
3. **A change budget, shown before you slice.** Every change costs time, filament and wear on the lane mechanism. Studio estimates changes, purge grams and extra minutes from the
   layers where lane 2 prints, and warns above a limit (for example, supports on lane 2 on every layer). Interface-only on lane 2 is the cheap setting; the readout says so.
4. **Temperature gap check.** Different nozzle temperatures between lanes: a hotend heats fast and cools slowly. Studio shows the gap and warns when going hot to cold. (What the machine
   does about it is the macros' job later.)
5. **One layer height for both lanes** (the slicers need it): the field is shared and says why; it is not offered per lane.
6. **Start checks.** Before a two-lane job starts, the start step lists each lane's material and asks to confirm both are loaded; a material that disagrees with what the machine last
   recorded for that lane is flagged.
7. **Swap lanes.** One button exchanges lane 1 and lane 2 on every part, for when the spools were loaded the other way round.
8. **Job file checks**: changes counted, purge grams, which lane prints what, and which engine made it.

Left out on purpose: painting colours onto a surface, automatic colour matching, a library of filament brands, **a lane by height** (Mike: same nozzle, so same height), any control that repeats one already there.

## 5. Build order
0. **Done:** the lane keys and their rules (tests in `laneKeys.test.ts`), tones in `tokens.css`, a sample in the style guide.
1. Prove it: a two-lane test slice in both engines with a placeholder change command (no machine). Findings go back into this document.
2. The lane model (job holds lane materials and per-part lanes), saved in profiles and jobs; the lane strip, Parts list chips, support and interface choice. Single-lane jobs unchanged.
3. Lane tabs, the purge tower on the bed, assemblies.
4. Preview by lane, the change budget and temperature check, start checks, job file checks.
5. Docs: testing checks, manual notes. All gated: see below.

## 6. The machine interface (open)
Studio will only start a two-lane job when the machine reports it can run one; until then it slices, previews and saves, and Start says why it is refused. What the Portal must provide
is written down only when the new hardware is assembled: how many lanes, the change command and its parameters, whether a lane's material is reported back, what a change does to
temperature, and how purge is split between the tower and the machine. Today's SwitchFly macros (`SWITCH_T0` / `SWITCH_T1`) are **not** assumed: they purge by themselves, only
heat upward, and refuse a bare `T1`, so they would need rework regardless. Nothing in the Klipper config is touched here.

## 7. Decided (Mike, Nov 22)
No lane by height. Pause for a hand change, and a spool-change mode on a runout endstop that is optional per lane. Keep-as-one-assembly is the default when several files are dropped together. Lanes: two to eight, keys as in section 3.
