# Proposal: laser travel lifts in a chain's laser file

Status: **written for Mike's approval; nothing below is built.** Mike chose option (a) on Nov 26: a narrow file-check exception. This
is a change to the file check (`src/slicer/check.ts`), not to any Klipper macro, and nothing changes on the machine itself. It still
makes the laser head move in Z during a laser job, so it is written up first.

## Why
In a chain the laser works on a sheet that has features printed on it. The laser's Z zero is the focus on the sheet top
(`LASER_JOB_SETUP` / `SET_Z_ZERO`, applied as a G-code Z offset). A laser file has no Z moves today (check `laserz`), so the head
would cross the printed features at focus height and hit them. The proposal's item 5 wants lifts: tallest feature + 2 mm while
the head travels. Until this is approved a chain's laser file is refused whenever features are printed on the sheet.

## The only Z lines allowed
A **chain laser file** is one whose header carries both of these comments, written by Studio:

```
; rhino_chain_features = <H>      the tallest printed feature, mm (0.2 to 20)
; rhino_chain_lift = <L>          the lift height, mm, exactly H + 2
```

In such a file, and only there, the check accepts exactly two kinds of Z line and nothing else:

```
G1 Z<L> F600 ;RHINO_CHAIN lift     up to L (L is the header's number, never another)
G1 Z0 F600 ;RHINO_CHAIN drop       back to the focus height (Z0)
```

Everything else about the laser file check stays as it is: any other line with a Z word, in any file, is still an error
(`G0 Z`, `G1 Z` to another height, a downward Z, arcs with Z, `G91`, `G28`, ...). The rule "No Z moves" stays in force for every
laser file without the header, including every Job setup laser file.

Extra conditions, all checked:
1. The header numbers are well formed, H is 0.2 to 20 and L equals H + 2 (to 0.001). No header, no exception.
2. Lifts and drops alternate, starting with a lift: no lift without its drop, no two lifts in a row, no drop while low.
3. The file ends low: the last Z line is a drop.
4. The laser is off at every lift and every drop (`M5` seen since the last cutting move, S0 or off), and no cutting move
   (a `G1` with X or Y while the laser is on) happens while lifted.
5. The feed is exactly 600 mm/min.
6. Z never goes below 0 or above L (a consequence of the two exact lines, checked anyway, and added to the file's Z range).

## What runs, in order (a chain with printed features and a laser stage)
1. Job 1 (print): fixtures, pause, you place the sheet, Resume, features. `END_PRINT`.
2. Swap to the laser (`SWAP_TOOL`; the machine cools and lowers the bed).
3. `SET_Z_ZERO` at the focus on the sheet top, then `LASER_JOB_SETUP FILE=<job2>`: test-fire, glasses, extraction (today's start wizard, unchanged).
4. The file: `M5`, then for each travel that passes within 2 mm of a printed feature: `G1 Z<L>`, `G0 X Y` (laser off), `G1 Z0`,
   then `M3 S.. G1 ..` the cut. Travels that don't pass a feature have no lift. `M5`, `DEACTIVATE_LASER`, `END_PRINT`.
Operations whose loops lie over a printed feature are refused by Studio (the focus is on the sheet top, not the feature top).

Z above the zero is the bed moving away from the laser, as on every Klipper printer (layers go up as Z rises while the bed
lowers). **Check on the machine before the first burn** (a dry run with the power at zero).

## What can go wrong
| Risk | What stops it |
|---|---|
| A lift with no matching drop (the head stays high, later cuts go out of focus) | Alternation, ending low (checks 2, 3) |
| A stop or pause while lifted | Safe direction: the head is further from the sheet than focus. Cancel runs `END_PRINT`. A pause and Resume should come back to the same height: **check on the machine** (CH14) |
| Feature height wrong (a mis-scaled design, or the print came out taller) | The lift is H + 2; Studio shows H and asks you to confirm the measured tallest feature before building. A dry run with power zero is the last test |
| Laser fires while moving in Z | Check 4 (laser off at every Z move) |
| A hand-edited or other file uses the exception | It needs the header and the exact lines; anything else is still an error; the header is only written by the chain builder |
| Lift higher than the machine's Z travel | L at most 22 mm; the check also tests the file's Z range against travel as today |

## Tests (written first, each must fail the check)
A lift with no drop; two lifts in a row; a lift above L; a downward Z (Z below 0); a drop with no lift; a Z move in a file
without the header; a header with L not equal to H + 2; a lift in a file whose header says no features (H = 0); a lift with the laser
on; a feed other than 600; a cutting move while lifted; a file that ends lifted; `G0 Z`, `G1 Z5`, `G91` inside a chain laser file. And these must pass:
a chain laser file with lifts, and every existing laser file (no Z moves).

## Rollback
The exception is one function (`chainLifts` in `src/chain/stitch.ts`, beside `chainRaise`) and one branch in the `laserz` check.
Removing both puts a chain's laser file back to "refused while features are printed on the sheet". No macro, config or
Portal change is involved.

## For Mike to confirm
1. Z above the zero moves the bed away from the laser on this machine (CH14 step 1 proves it with the laser off).
2. 2 mm clearance over the tallest feature, and 600 mm/min for the lift and drop.
3. Operations over a printed feature are refused (focus stays on the sheet top).
