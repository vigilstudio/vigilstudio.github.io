// Solver 2: a backtracking solution counter, written separately from the line solver (it shares no code with it).
// It fills the grid one ROW at a time from a list of every legal placement of that row's blocks, and prunes a
// partial grid as soon as some column's cells so far cannot match that column's clue. It counts complete grids.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NonoCounter = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Every 0/1 row of length n whose runs equal clue.
  function placements(clue, n) {
    const out = [];
    const cur = new Array(n).fill(0);
    (function rec(b, pos) {
      if (b === clue.length) { out.push(cur.slice()); return; }
      let rest = 0;
      for (let t = b + 1; t < clue.length; t++) rest += clue[t] + 1;
      for (let s = pos; s + clue[b] + rest <= n; s++) {
        for (let k = 0; k < clue[b]; k++) cur[s + k] = 1;
        rec(b + 1, s + clue[b] + 1);
        for (let k = 0; k < clue[b]; k++) cur[s + k] = 0;
      }
    })(0, 0);
    return out;
  }

  // count(rows, cols, { limit, nodeLimit }) -> { count, solutions, nodes, gaveUp }
  // Stops after `limit` solutions (default 2: "one" and "more than one" are all we need) or `nodeLimit` row tries.
  function count(rows, cols, opts) {
    opts = opts || {};
    const limit = opts.limit || 2, nodeLimit = opts.nodeLimit || 3e6;
    const R = rows.length, C = cols.length;
    const rowPlace = rows.map(cl => placements(cl, C));
    // tail[col][k] = cells needed to finish blocks k.. when the previous cell is empty
    const tail = cols.map(cl => {
      const t = new Array(cl.length + 1).fill(0);
      for (let k = cl.length - 1; k >= 0; k--) t[k] = cl[k] + (k < cl.length - 1 ? 1 : 0) + t[k + 1];
      return t;
    });
    const need = (col, k, c) => {
      const cl = cols[col];
      if (c > 0) return (cl[k] - c) + (k + 1 < cl.length ? 1 + tail[col][k + 1] : 0);
      return tail[col][k];
    };
    const solutions = [];
    const chosen = new Array(R);
    let nodes = 0, gaveUp = false, found = 0;
    const kStack = [], cStack = [];
    for (let r = 0; r <= R; r++) { kStack.push(new Int16Array(C)); cStack.push(new Int16Array(C)); }

    function rec(r) {
      if (gaveUp || found >= limit) return;
      if (r === R) {
        found++;
        if (solutions.length < limit) solutions.push(chosen.map(p => p.slice()));
        return;
      }
      const k0 = kStack[r], c0 = cStack[r], k1 = kStack[r + 1], c1 = cStack[r + 1];
      for (const p of rowPlace[r]) {
        if (++nodes > nodeLimit) { gaveUp = true; return; }
        let good = true;
        for (let col = 0; col < C; col++) {
          const cl = cols[col];
          let k = k0[col], c = c0[col];
          if (p[col] === 1) {
            if (c > 0) { if (c + 1 > cl[k]) { good = false; break; } c++; }
            else { if (k >= cl.length) { good = false; break; } c = 1; }
          } else if (c > 0) {
            if (c !== cl[k]) { good = false; break; }
            k++; c = 0;
          }
          if (need(col, k, c) > R - r - 1) { good = false; break; }
          k1[col] = k; c1[col] = c;
        }
        if (!good) continue;
        chosen[r] = p;
        rec(r + 1);
        if (gaveUp || found >= limit) return;
      }
    }
    rec(0);
    return { count: found, solutions, nodes, gaveUp };
  }

  return { placements, count };
});
