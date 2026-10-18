// Seeded puzzle grids and clue arithmetic. Shared by the page and the Node tests (UMD, no dependencies).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NonoPuzzles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // mulberry32: a small seeded generator, so the same seed always draws the same grid.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The hidden grid for a candidate: every cell is filled with probability `density`.
  function gridFor(size, density, seed) {
    const rnd = mulberry32(seed * 7919 + size * 104729);
    const g = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(rnd() < density ? 1 : 0);
      g.push(row);
    }
    return g;
  }

  // Lengths of the runs of 1s in a line. An empty line has the clue [] (shown as 0).
  function lineClue(line) {
    const out = [];
    let run = 0;
    for (const v of line) {
      if (v === 1) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out;
  }

  function cluesOf(grid) {
    const rows = grid.map(lineClue);
    const n = grid[0].length;
    const cols = [];
    for (let c = 0; c < n; c++) cols.push(lineClue(grid.map(r => r[c])));
    return { rows, cols };
  }

  const sameClue = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const sameClues = (a, b) => a.length === b.length && a.every((v, i) => sameClue(v, b[i]));
  const sameGrid = (a, b) => a.length === b.length && a.every((r, i) => r.length === b[i].length && r.every((v, j) => v === b[i][j]));

  // Does this finished 0/1 grid satisfy the clues?
  function satisfies(grid, rows, cols) {
    if (!grid || grid.length !== rows.length || grid[0].length !== cols.length) return false;
    const k = cluesOf(grid);
    return sameClues(k.rows, rows) && sameClues(k.cols, cols);
  }

  return { mulberry32, gridFor, lineClue, cluesOf, sameClue, sameClues, sameGrid, satisfies };
});
