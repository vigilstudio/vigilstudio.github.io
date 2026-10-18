# Moon Phase Times

`moonphase.js` is a single-file ES module (no dependencies, MIT) that returns the times of new moon, first quarter,
full moon and last quarter for any date from 1800 to 2199, and the Moon's illuminated fraction. `index.html` imports it, runs the
tests live in a module worker and shows the results. Made by Claude, an AI model.

**Main caveats:** every Meeus coefficient (and the delta-T polynomials) was typed from memory, not copied from the
book; the only thing vouching for them is a comparison with astronomy-engine, which differs by about a minute and
cannot vouch for terms smaller than about 27 s. The illuminated fraction uses a low-accuracy formula.

## Use
```js
import { phasesBetween, nextPhase, previousPhase, illuminatedFraction } from "./moonphase.js";
nextPhase(new Date("2026-10-18T12:00:00Z"));   // { name, index, date (UT), jde }
phasesBetween(new Date("2026-01-01"), new Date("2026-12-31"));   // oldest first, [] if none
illuminatedFraction(new Date());               // 0 (new) to 1 (full)
```
Also `phase(n)`, `phaseAngle(date)`, `phaseJDE(k)`, `deltaT(year)`, `PHASES`. Bad input throws `TypeError` or
`RangeError`. Times are UT; `jde` is the same instant in dynamical time. Supported 1800 to 2199.

## Run the tests
`node test-node.mjs` (Node 18 or later; takes a few seconds). The same `tests.js` runs on the page.

## Method
Meeus, *Astronomical Algorithms*, chapter 49 (mean phase plus periodic terms, plus 14 planetary terms) for the
times and chapter 48's low-accuracy phase angle for the fraction. I did not have the book; the series is as I
remember it, which is why the checks below exist. Delta-T (TT minus UT) uses Espenak and Meeus polynomials from
memory for 1900 to 2150 and a long-term parabola elsewhere.

## What was checked (15 checks in `tests.js`; all pass in Node and in headless Chromium)
Every count is computed in code; the numbers below are from the run when this was written.
- **(a) astronomy-engine 2.1.19 (MIT), vendored from its npm tarball in `vendor/`:** all 19,789 phases from 1800 to
  2200 compared. In dynamical time the largest difference is 59.4 s (first quarter, 1987-05-06); the mean offset
  is -34.9 s (this module earlier); after removing that mean the largest gap is 26.9 s. UT differences are within
  the same size for 1900 to 2150. The page shows 12 rows, including the oldest, the newest and the largest.
  A possible cause of the mean offset (different treatment of the Sun's apparent position) was not tested.
- **(b) plain mean-month estimate** (one real new moon, 2000-01-06 18:14 UT, plus multiples of 29.530588853 days,
  both from memory): worst gap 23.3 hours over the same 19,789 phases. The check's limit (1.5 days) was chosen
  after seeing that result, so it measures more than it tests.
- **(c) round trip:** illuminated fraction at each computed phase time, 1900 to 2100: within 0.00001 of 0 and 1
  at new and full, within 0.0039 of 0.5 at the quarters. This tests the module against itself.
- Illuminated fraction vs astronomy-engine at 11,917 times between 1900 and 2100: worst difference 0.0034.
- Structure: order and names cycle, gaps between phases are 6.58 to 8.24 days, next/previous are neighbours,
  empty windows return `[]`, bad input throws.
- Mutation test (scratch copy, not shipped): changing one coefficient by 0.001 day, three times, and one by 0.0004
  day made checks fail each time. Smaller slips were not tried.

## What is unverified
- Coefficients below about 27 s in effect (most of the small tail terms) are not vouched for.
- Nothing compared with a printed table or an observation; astronomy-engine is another calculation.
- Delta-T outside 1900 to 2150 and the 1800 to 1900 range have only the sweep's UT comparison.
- No eclipses, local moonrise or viewing angle.

## Licence
Code (`moonphase.js`, `tests.js`, `test-node.mjs`, `runner.js`, the page): MIT, see `LICENSE`.
Vendored, only for the checks: astronomy-engine 2.1.19 by Don Cross, MIT, unmodified except that the author's e-mail address was removed from the copyright and author lines, licence text in
`vendor/LICENSE-astronomy-engine.txt` (fetched from the project's repository; its year range, 2019-2025, differs from the code header's 2019-2023). The 40-second residual limit was, like the 1.5-day one, set after seeing the result.
