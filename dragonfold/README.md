# Creases That Draw a Dragon

Fold a paper strip in half n times, unfold it, read the valley/mountain creases, open each crease to 90 degrees and
get the dragon curve. Also: thickness and length growth, and Gallivan's single-direction folding limit.

Files: `index.html` (the page), `fold.js` (simulation, rule, geometry; MIT, runs in browser and Node), `test.js`
(`node test.js`), `LICENSE` (MIT, copied from the studio's riffle piece).

## How it works
- `simulate(n)` keeps the folded stack as layers of cells (2^n unit cells of strip). Each fold turns the right half
  over onto the left: layer order reverses, each layer flips. Every layer crosses the fold line, and the joined cells
  there give one crease, valley if the layer shows its original top face, mountain otherwise.
- `rule(k)`: write k = 2^j m, m odd; valley if m mod 4 = 1 (the bit above k's lowest set bit is 0), else mountain.
- `dragon()` walks unit steps, turning left at V and right at M.

## What was checked (node test.js, and the same on the page)
- Simulated creases against the closed-form rule, every crease for n = 1 to 20 (1,048,575 creases at n = 20):
  0 differ. This is the only check of the sequence; the simulation and the rule were both written by me.
- The dragon curve on the integer grid for n = 1 to 20: no edge used twice, no straight-through visit (so no
  crossing), at most 2 visits to any point, and squared end distance equal to 2^n (a formula comparison, 20 of 20).
  Points visited twice: 1 at n = 4 and 489,459 at n = 20 (so the curve touches itself; it is not self-avoiding in the
  strict sense).
- A brute-force test of every pair of edges for n = 1 to 10: no crossings or repeats.
- A deliberately wrong rule is caught (negative control).
- Page check (`tools/page_check.mjs`) at 375, 768 and 1100 px, light and dark: no problems.

## Weaker, unverified
- Gallivan's formula L = (pi t / 6)(2^n + 4)(2^n - 1) and her 2002 record of 12 folds were written from memory and
  matched to a search summary of a Science News article (the summary agreed with the formula; sources disagree on the
  length of the strip, 1,200 m to 1,219 m, 4,000 ft, 2,000 ft). Not compared with her booklet or any measurement. At
  12 folds and 1,219 m it implies a thickness of about 0.14 mm, which I could not match to a known tissue thickness.
  It is kept out of the agreement counts above.
- The Moon distance (384,400 km) is recalled.
- The 90-degree orientation convention (left at V) was not compared with a published picture.
- No real paper was folded; folds are ideal (zero thickness in the geometry sections).
- Not looked at on a real phone.

Note: the straight-through count is 0 by construction (every crease turns exactly 90 degrees), so it cannot fail. The brute-force crossing test can only catch repeated edges on this grid. "No crossing" follows from no repeated edge together with the 90-degree turns.
