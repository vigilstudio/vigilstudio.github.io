// Solver 1: the line solver. It looks at one row or column at a time and keeps only what is true in EVERY way
// of placing that line's blocks, until nothing more can be decided. It never guesses.
// Cell values: -1 unknown, 0 empty, 1 filled.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NonoLineSolver = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ok[i][j] is true when cells [0,i) can hold exactly the first j blocks, agreeing with what is known,
  // with the cell right after the last block (if any) empty.
  function prefixTable(clue, line) {
    const n = line.length, m = clue.length;
    const ok = [];
    for (let i = 0; i <= n; i++) ok.push(new Array(m + 1).fill(false));
    ok[0][0] = true;
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j <= m; j++) {
        if (line[i - 1] !== 1 && ok[i - 1][j]) { ok[i][j] = true; continue; }
        if (j >= 1) {
          const c = clue[j - 1], s = i - c;
          if (s < 0) continue;
          let free = true;
          for (let p = s; p < i; p++) if (line[p] === 0) { free = false; break; }
          if (!free) continue;
          if (s === 0) { if (j === 1) ok[i][j] = true; }
          else if (line[s - 1] !== 1 && ok[s - 1][j - 1]) ok[i][j] = true;
        }
      }
    }
    return ok;
  }

  // One line. Returns { line, changed } or null when no placement fits.
  function solveLine(clue, line) {
    const n = line.length, m = clue.length;
    const pre = prefixTable(clue, line);
    if (!pre[n][m]) return null;
    const rev = prefixTable(clue.slice().reverse(), line.slice().reverse());
    const suf = (i, j) => rev[n - i][j];          // cells [i,n) hold exactly the last j blocks
    const canFill = new Array(n).fill(false), canEmpty = new Array(n).fill(false);
    for (let p = 0; p < n; p++) {
      if (line[p] === 1) continue;
      for (let j = 0; j <= m; j++) if (pre[p][j] && suf(Math.min(p + 1, n), m - j)) { canEmpty[p] = true; break; }
    }
    for (let j = 1; j <= m; j++) {
      const c = clue[j - 1];
      for (let s = 0; s + c <= n; s++) {
        let free = true;
        for (let p = s; p < s + c; p++) if (line[p] === 0) { free = false; break; }
        if (!free) continue;
        const e = s + c;
        const leftOk = s === 0 ? j === 1 : (line[s - 1] !== 1 && pre[s - 1][j - 1]);
        if (!leftOk) continue;
        const rightOk = e === n ? j === m : (line[e] !== 1 && suf(e + 1, m - j));
        if (!rightOk) continue;
        for (let p = s; p < e; p++) canFill[p] = true;
      }
    }
    const out = line.slice();
    let changed = false;
    for (let p = 0; p < n; p++) {
      if (canFill[p] && !canEmpty[p]) out[p] = 1;
      else if (canEmpty[p] && !canFill[p]) out[p] = 0;
      else if (!canFill[p] && !canEmpty[p]) return null;
      if (out[p] !== line[p]) changed = true;
    }
    return { line: out, changed };
  }

  // Whole puzzle. A pass is every row, then every column. snapshots[k] is the grid after pass k+1.
  function solve(rows, cols) {
    const R = rows.length, C = cols.length;
    const grid = [];
    for (let r = 0; r < R; r++) grid.push(new Array(C).fill(-1));
    const snapshots = [];
    let passes = 0, lineOps = 0, status = null;
    for (;;) {
      let changed = false;
      for (let r = 0; r < R; r++) {
        const res = solveLine(rows[r], grid[r]); lineOps++;
        if (!res) { status = "contradiction"; break; }
        if (res.changed) { grid[r] = res.line; changed = true; }
      }
      if (status) break;
      for (let c = 0; c < C; c++) {
        const col = grid.map(row => row[c]);
        const res = solveLine(cols[c], col); lineOps++;
        if (!res) { status = "contradiction"; break; }
        if (res.changed) { for (let r = 0; r < R; r++) grid[r][c] = res.line[r]; changed = true; }
      }
      if (status) break;
      if (!changed) break;
      passes++;
      snapshots.push(grid.map(r => r.slice()));
    }
    let unknown = 0;
    for (const row of grid) for (const v of row) if (v === -1) unknown++;
    if (!status) status = unknown === 0 ? "solved" : "stuck";
    return { status, grid, unknown, passes, lineOps, snapshots };
  }

  return { solveLine, solve };
});
