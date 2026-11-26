# Chain test slice (Nov 26 2026)

`probe.py` slices a 20 x 20 x 4 mm block in Kiri:Moto with four `move(x, y, z)` placements and prints the X/Y extent of the extrusion moves.
Needs Studio's dev server on 5173 (`/kiri/` static files only; it never talks to a machine) and Python with Playwright (`~/.venvs/rhino/bin/python -I probe.py`).
Findings: `docs/design-process-chain.md`, section 3.
