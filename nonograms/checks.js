// Analysis of candidate puzzles and the self-checks run on that analysis. Shared by the page and the Node tests.
// Every check takes the solvers as arguments so a test can hand it a deliberately broken one.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NonoChecks = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The candidate list: the first SEEDS_PER_SIZE seeds tried at each size, in order, none skipped.
  const SIZES = [5, 7, 10, 12, 15];
  const SEEDS_PER_SIZE = 6;
  const DENSITY = 0.6;
  const EXH_N = 4;                    // grid side for the exhaustive comparison
  function candidates() {
    const out = [];
    for (const size of SIZES) for (let seed = 1; seed <= SEEDS_PER_SIZE; seed++) out.push({ id: size + "-" + seed, size, seed, density: DENSITY });
    return out;
  }

  // Run both solvers on one candidate and give it a verdict from what they returned.
  //   kept       the counter found exactly one solution AND the line solver finished the grid on its own
  //   two        the counter found two solutions (it stops at two)
  //   stuck      one solution, but the line solver stalled (a guess would be needed)
  //   undecided  the counter hit its node limit
  function analyse(cand, P, LS, CT) {
    const hidden = P.gridFor(cand.size, cand.density, cand.seed);
    const { rows, cols } = P.cluesOf(hidden);
    const line = LS.solve(rows, cols);
    const cnt = CT.count(rows, cols, { limit: 2 });
    let verdict;
    if (cnt.gaveUp) verdict = "undecided";
    else if (cnt.count >= 2) verdict = "two";
    else if (cnt.count === 1 && line.status === "solved" && P.sameGrid(line.grid, cnt.solutions[0])) verdict = "kept";
    else verdict = "stuck";
    return Object.assign({}, cand, { hidden, rows, cols, line, cnt, verdict });
  }

  const pass = (id, label, ok, detail, how) => ({ id, label, ok, detail, kind: "real", how });

  // Checks that can fail. Each returns { id, label, ok, detail, how }.
  function realChecks(an, P, ex) {
    const out = [];
    // C1 every solution the counter returned satisfies the clues
    {
      let n = 0, bad = [];
      for (const a of an) for (const s of a.cnt.solutions) { n++; if (!P.satisfies(s, a.rows, a.cols)) bad.push(a.id); }
      out.push(pass("c1", "Every grid the counter returned obeys the clues", bad.length === 0,
        bad.length ? "fails for " + bad.join(", ") : n + " grids re-read run by run and column by column",
        "Flip one cell of one returned grid."));
    }
    // C2 every grid the line solver called solved obeys the clues
    {
      let n = 0, bad = [];
      for (const a of an) if (a.line.status === "solved") { n++; if (!P.satisfies(a.line.grid, a.rows, a.cols)) bad.push(a.id); }
      out.push(pass("c2", "Every grid the line solver finished obeys the clues", bad.length === 0,
        bad.length ? "fails for " + bad.join(", ") : n + " finished grids re-read",
        "Flip one cell of one finished grid."));
    }
    // C3 on kept puzzles the two solvers give the same grid
    {
      const kept = an.filter(a => a.verdict === "kept");
      const bad = kept.filter(a => !(a.cnt.count === 1 && P.sameGrid(a.line.grid, a.cnt.solutions[0]))).map(a => a.id);
      out.push(pass("c3", "On each kept puzzle the two solvers return the same grid", bad.length === 0,
        bad.length ? "differ on " + bad.join(", ") : kept.length + " kept puzzles, grids identical cell for cell",
        "Flip one cell of one line-solver grid."));
    }
    // C4 the two solutions of a rejected puzzle both obey the clues and differ
    {
      const two = an.filter(a => a.verdict === "two");
      const bad = two.filter(a => !(a.cnt.solutions.length === 2 && P.satisfies(a.cnt.solutions[0], a.rows, a.cols) &&
        P.satisfies(a.cnt.solutions[1], a.rows, a.cols) && !P.sameGrid(a.cnt.solutions[0], a.cnt.solutions[1]))).map(a => a.id);
      out.push(pass("c4", "Each rejected puzzle's two grids both obey the clues and differ", bad.length === 0,
        bad.length ? "fails for " + bad.join(", ") : two.length + " rejected puzzles, each with two different valid grids",
        "Make the second grid a copy of the first."));
    }
    // C5 the line solver never finishes a puzzle the counter says has two answers
    {
      const two = an.filter(a => a.verdict === "two");
      const bad = two.filter(a => a.line.status === "solved").map(a => a.id);
      out.push(pass("c5", "The line solver never finishes a puzzle the counter says has two or more answers", bad.length === 0,
        bad.length ? "finished " + bad.join(", ") : two.length + " rejected puzzles, line solver stalled or contradicted on every one",
        "Give a rejected puzzle a 'solved' line result."));
    }
    // C6 on kept puzzles the one solution is the grid the seed drew
    {
      const kept = an.filter(a => a.verdict === "kept");
      const bad = kept.filter(a => !P.sameGrid(a.cnt.solutions[0], a.hidden)).map(a => a.id);
      out.push(pass("c6", "On each kept puzzle the single solution is the grid the seed drew", bad.length === 0,
        bad.length ? "differ on " + bad.join(", ") : kept.length + " kept puzzles",
        "Change one cell of a seed's grid after its clues are made."));
    }
    // C7 exhaustive 4x4: counter against brute force
    out.push(pass("c7", "Counter against brute force on every " + EXH_N + " by " + EXH_N + " clue set", ex.countBad.length === 0,
      ex.countBad.length ? ex.countBad.length + " clue sets disagree, first " + ex.countBad[0] :
        ex.signatures + " clue sets from all " + (1 << (EXH_N * EXH_N)).toLocaleString("en-US") + " grids; " + ex.uniqueSigs + " have exactly one grid; counter matched all (counts up to the real number, no cap)",
      "Replace the counter by one that reports at most 1."));
    // C8 exhaustive 4x4: line solver soundness
    out.push(pass("c8", "Line solver against brute force on every " + EXH_N + " by " + EXH_N + " clue set", ex.lineBad.length === 0,
      ex.lineBad.length ? ex.lineBad.length + " clue sets where it fixed a wrong cell or finished a puzzle with more than one grid, first " + ex.lineBad[0] :
        "every cell it fixed agrees with all grids of that clue set; it finished " + ex.lineSolved + " of " + ex.uniqueSigs + " one-grid sets and never a set with several",
      "Make it mark a cell filled on its first move."));
    return out;
  }

  // Facts that hold because of how the code is written. Shown, never counted.
  function constructionFacts(an, P) {
    const sums = an.every(a => a.rows.flat().reduce((x, y) => x + y, 0) === a.cols.flat().reduce((x, y) => x + y, 0));
    const same = an.slice(0, 3).every(a => P.sameGrid(a.hidden, P.gridFor(a.size, a.density, a.seed)));
    return [
      { id: "k1", label: "Row clues and column clues add to the same total", ok: sums,
        detail: "both are read off one grid, so this holds by construction" },
      { id: "k2", label: "A seed draws the same grid every time", ok: same,
        detail: "the generator is a pure function of the seed, so this holds by construction" }
    ];
  }

  // Every 4x4 grid, grouped by its clues, then both solvers asked about each group.
  // A generator: it yields now and then so the page can keep responding.
  function* exhaustive4Gen(P, LS, CT, limitForCount) {
    const N = EXH_N, total = 1 << (N * N);
    const groups = new Map();
    for (let m = 0; m < total; m++) {
      if ((m & 4095) === 0) yield m / total;
      const g = [];
      for (let r = 0; r < N; r++) { const row = []; for (let c = 0; c < N; c++) row.push((m >> (r * N + c)) & 1); g.push(row); }
      const k = P.cluesOf(g);
      const key = JSON.stringify(k);
      let e = groups.get(key);
      if (!e) { e = { clues: k, count: 0, and: g.map(r => r.slice()), or: g.map(r => r.slice()) }; groups.set(key, e); }
      else {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { e.and[r][c] &= g[r][c]; e.or[r][c] |= g[r][c]; }
      }
      e.count++;
    }
    const res = { signatures: groups.size, uniqueSigs: 0, countBad: [], lineBad: [], lineSolved: 0 };
    let seen = 0;
    for (const [key, e] of groups) {
      if ((++seen & 1023) === 0) yield 1;
      if (e.count === 1) res.uniqueSigs++;
      const c = CT.count(e.clues.rows, e.clues.cols, { limit: limitForCount || 1e9 });
      if (c.count !== e.count) res.countBad.push(key + " brute " + e.count + " counter " + c.count);
      const l = LS.solve(e.clues.rows, e.clues.cols);
      let bad = false;
      for (let r = 0; r < N; r++) for (let cc = 0; cc < N; cc++) {
        const v = l.grid[r][cc];
        if (v === 1 && !e.and[r][cc]) bad = true;     // fixed filled, but some grid has it empty
        if (v === 0 && e.or[r][cc]) bad = true;       // fixed empty, but some grid has it filled
      }
      if (l.status === "contradiction") bad = true;
      if (l.status === "solved" && e.count !== 1) bad = true;
      if (l.status === "solved" && e.count === 1) res.lineSolved++;
      if (bad) res.lineBad.push(key);
    }
    return res;
  }
  // Same thing run to the end in one go (the tests use this; the page steps the generator to stay responsive).
  function exhaustive4(P, LS, CT, limitForCount) {
    const it = exhaustive4Gen(P, LS, CT, limitForCount);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  function tally(an) {
    const t = { total: an.length, kept: 0, two: 0, stuck: 0, undecided: 0, bySize: {} };
    for (const a of an) {
      t[a.verdict]++;
      const s = t.bySize[a.size] || (t.bySize[a.size] = { total: 0, kept: 0, two: 0, stuck: 0, undecided: 0 });
      s.total++; s[a.verdict]++;
    }
    return t;
  }

  // Words for a count: "none", "one puzzle", "3 puzzles".
  function plural(n, one, many) { return n === 0 ? "no " + many : n === 1 ? "one " + one : n + " " + many; }

  return { SIZES, EXH_N, SEEDS_PER_SIZE, DENSITY, candidates, analyse, realChecks, constructionFacts, exhaustive4, exhaustive4Gen, tally, plural };
});
