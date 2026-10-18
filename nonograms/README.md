# Nonograms With Exactly One Answer

Solve small nonograms (5x5 to 15x15), each shown in code to have exactly one answer, and see the puzzles thrown out for having at least two answers. Made by Claude, an AI model. Page: `index.html`.

## What it does
- 30 candidates: the first 6 seeds at each of 5 sizes (5, 7, 10, 12, 15), none skipped, random grids with 60% of cells filled (`checks.js`).
- Two separately written solvers run on every candidate in the browser:
  1. `linesolver.js`: row/column logic only (dynamic programming over one line, keeps what holds in every placement). Never guesses.
  2. `counter.js`: backtracking, row by row, pruned by column clues, counts complete grids; a puzzle is thrown out once it has found at least 2 (it stops counting at 2).
- Verdicts: **kept** = counter found exactly 1 grid and the line solver finished the same grid; **two** = counter found 2; **stuck** = 1 grid but line solver stalls; **undecided** = node limit.
- Result on this data (computed on the page, same numbers from `node test.mjs`): 19 kept, 11 thrown out (two or more answers), 0 stuck, 0 undecided.
- Play board (click, drag, keyboard), step-through of the line solver, gallery of the 11 rejected puzzles with their two grids, printable sheet (browser print dialog, one puzzle per page plus answer key).

## Checks
Eight checks that can fail run on load (all pass): returned grids obey the clues (counter, line solver), solvers agree on kept puzzles, rejected puzzles' two grids differ and both obey clues, line solver never finishes a two-answer puzzle, the one solution is the seed's grid, and an exhaustive comparison over all 65,536 4x4 grids (58,196 distinct clue sets): the counter's count equals brute force on every one, and every cell the line solver fixes agrees with all grids.
Each check was broken once in `test.mjs` and failed as it should (flip one cell, copy a grid, fake a status, a counter capped at 1, a counter missing one of several, a counter wrong on a single clue set, a line solver forced to mark a cell, a line solver that calls a stall solved). The 4x4 test is exhaustive at that size only. Two facts hold by construction (clue totals match; a seed gives the same grid) and are shown but not counted.
Run `node nonograms/test.mjs` from the studio root. Opening sentence: 22 words (counted by the test).

## Not verified
- Both solvers were written by the same author in one sitting; at 5x5 to 15x15 the evidence is that they agree, not an outside reference.
- No published figures are used. No real printer or phone tried; print checked only as a headless-Chrome PDF (20 pages: 19 puzzles and one key page). Touch dragging untried on a real phone.
- Puzzles are random noise, not pictures, and not rated for difficulty. None of the 30 candidates was "stuck"; the page notes that such clue sets exist at 4x4 (1,128).
No outside code, data or fonts are used.
