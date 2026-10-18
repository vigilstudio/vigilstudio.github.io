# Clockwork Gears to Cut

A page that hands you an SVG gear set to cut (laser, knife plotter or by hand): six involute spur gears, module 1.5 mm,
pressure angle 20 degrees, no profile shift, 4 mm bores, A4 landscape.

- `gearset.svg`: the sheet to cut. Red hairline = cut, blue = engrave or guide (pitch circles, labels, sheet border).
- `gearset-meshed.svg`: the same gears at true centre distance, for assembly. Reference only.
- `make_gears.py`: writes both files (Python standard library only): `python3 make_gears.py`.
- `gearlib.js`: exact fractions (BigInt), Stern-Brocot search, brute force, and the checks that re-read the SVG.
- `test_gears.mjs`: runs the checks and breaks each once; writes `results.json`. Run with `node test_gears.mjs`.

## The trains
- A, a 12:1 reduction like a clock's, but the hour wheel is not on the minute axis, so it cannot drive concentric hands: A1 (18T) drives A2 (54T); A3 (18T, on A2's shaft) drives A4 (72T): 54/18 x 72/18 = 12 exactly.
- B, Earth to Venus: E (39T) drives V (24T): 39/24 = 13/8 = 1.625, against 365.2564/224.7008 = 1.62554 (error -0.0321 %).
  The 39/24 rather than 13/8 is because a 20-degree pinion needs about 17+ teeth to avoid interference.

## How it was checked
45 checks on the SVG files (all pass): per gear, teeth recounted from the outline (rising crossings of the pitch circle), tip
and root radius, tooth thickness at the pitch circle (half the circular pitch), pitch circle in the file; per mesh, centre
distance from the assembly file against module x (z1+z2)/2 and against the pitch radii read from the file, contact ratio from
the closed form against a walk along the line of action (about 1.65 to 1.67 for the three meshes), and an interference margin;
one-shaft check for A2/A3; exact ratios of both trains. Plus 40 Stern-Brocot results against exhaustive search over all
pairs of tooth counts up to N (all agree), and a seeded sweep of 298 random targets (all agree).
Eleven faults were put in once each (delete a tooth, push a tip out, fatten the teeth, move a gear, stray cos factor in the
contact ratio, a 12-tooth pinion, a Brocot rule that always takes the lower neighbour, bound N-1) and each check failed as
intended; see the table on the page and `results.json`. The brute-force test catches any non-optimal pick for the cases tried
but shares the fraction helpers; the N-1 fault was caught in only 3 of 40 pairs.

## Not checked or weaker
- **Meshing on real cut material was never tested.** Kerf, backlash, strength, friction, the root fillet (a radial line and an arc)
  and the SVG in your cutter's software are untested. Fixing A3 to A2's shaft is left to you.
- The orbital periods (365.2564, 224.7008 days) and the Metonic and Antikythera figures (235/19, 254/19) are from memory:
  fetching Wikipedia and NASA failed in the build environment. Their error columns are computed exactly, but the inputs are weak.
- The involute formulas are from memory; the checks test the file against them, which does not independently prove them.
- The contact-ratio walk and the closed form share tip and base radii.
Made by Claude, an AI model. Released under the studio repository's licence (see ../LICENSE).
