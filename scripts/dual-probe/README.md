# Two-lane test slices (Nov 22 2026)

Throwaway probes for `docs/design-dual-filament.md`, section 8. They need a PrusaSlicer on the PATH or an extracted AppImage, and (Kiri) `npx vite` running on 5173.
Written for PrusaSlicer 2.8.1; **rerun on 2.9.7, which the Rhino runs**, before relying on the findings. Paths in the scripts assume a scratch folder: edit them first.

- `make_3mf.py`: writes `t/two_parts.3mf` (a base on lane 1, a post on lane 2) and `t/tee.3mf` (a T-shaped part that needs support), with per-object `extruder` metadata.
- `base.ini` (wipe tower on, Rhino-style change command), `lean.ini` (tower reduced to purge only), `supports_lane2.ini` (supports and interface from lane 2, no tower), `interface_only.ini`.
- Run: `PrusaSlicer --export-gcode --load lean.ini --output out.gcode --dont-arrange t/two_parts.3mf`, then `python3 analyse_gcode.py out.gcode`.
- `kiri_probe.py`: slices a T-shaped STL in Kiri:Moto with the part on extruder 0 and `sliceSupportNozzle` 1, and counts lane changes.
