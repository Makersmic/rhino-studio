# Design: two filaments in one job (Studio side)

Status: **design, for Mike's review (Nov 22 2026). Nothing built.** Mike's answers: the lanes feed one nozzle; lane 2 can print the supports *and* their interface layers;
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
- **Lane strip** beside the model (Setup): two lane chips, "Lane 1: PLA" and "Lane 2: PETG", each opening the material picker for that lane. A lane with nothing assigned says so.
  Lane colours are two fixed tones (ink, and the toolhead's accent), never red.
- **Per-part lane**: a lane chip on each row of the Parts list, and on the selected part's menu ("Print in lane 2"). Whole parts only in this build.
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

Left out on purpose: painting colours onto a surface, automatic colour matching, a library of filament brands, more than two lanes, any control that repeats one already there.
Next candidates, only if you want them: **a lane by height** (lane 2 above Z), and **pause for a hand filament change** at a layer.

## 5. Build order
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

## 7. Questions for Mike
- Lane by height and pause-for-hand-change: now, later, or not at all?
- Assemblies: is "keep as one assembly" the right default when several files are dropped together?
- Is two lanes the limit for the redesign, or should the lane model allow more than two from the start (costs little now, a lot later)?
