/* checks.js: the self-checks, shared by test.js (Node) and index.html (browser). Needs riffle.js.
   run(Riffle) returns {checks: [...], weak: [...]}. Every entry in `checks` is a pass/fail comparison.
   `weak` holds comparisons with published figures that come from search summaries only; they are shown
   but never counted in the tally. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RiffleChecks = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function perms(n) {
    var out = [], a = [];
    (function rec(used) {
      if (a.length === n) { out.push(a.slice()); return; }
      for (var i = 0; i < n; i++) if (!used[i]) { used[i] = true; a.push(i); rec(used); a.pop(); used[i] = false; }
    })([]);
    return out;
  }
  // Every outcome of one riffle, written as the standard two-digit-per-card description: card positions get a
  // bit; bit-0 positions receive the top packet in order and bit-1 positions the bottom packet in order.
  // All 2^n bit strings are equally likely, which is the Gilbert-Shannon-Reeds model.
  function riffleOutcomes(deck) {
    var n = deck.length, out = [];
    for (var mask = 0; mask < (1 << n); mask++) {
      var zeros = 0, i;
      for (i = 0; i < n; i++) if (!((mask >> i) & 1)) zeros++;
      var l = 0, r = zeros, res = new Array(n);
      for (i = 0; i < n; i++) res[i] = ((mask >> i) & 1) ? deck[r++] : deck[l++];
      out.push(res);
    }
    return out;
  }
  // Exact outcome counts (out of 2^(n k)) for k riffles from the identity, by following every outcome.
  function bruteCounts(n, k) {
    var id = []; for (var i = 0; i < n; i++) id.push(i);
    var dist = new Map(); dist.set(id.join(","), 1);
    for (var s = 0; s < k; s++) {
      var next = new Map();
      dist.forEach(function (cnt, key) {
        var deck = key === "" ? [] : key.split(",").map(Number);
        riffleOutcomes(deck).forEach(function (o) {
          var kk = o.join(",");
          next.set(kk, (next.get(kk) || 0) + cnt);
        });
      });
      dist = next;
    }
    return dist;
  }

  function run(R) {
    var checks = [], weak = [];
    function add(group, name, pass, detail) { checks.push({ group: group, name: name, pass: !!pass, detail: detail || "" }); }

    // ---- hand-computable cases ----
    var id4 = [0, 1, 2, 3];
    add("hand", "risingSequences of the start deck is 1", R.risingSequences(id4) === 1);
    add("hand", "risingSequences of a reversed 5-card deck is 5", R.risingSequences([4, 3, 2, 1, 0]) === 5);
    add("hand", "risingSequences([0,2,1,3]) is 2 (label 2 sits above label 1)", R.risingSequences([0, 2, 1, 3]) === 2);
    add("hand", "risingSequences([2,0,3,1]) is 2 (runs 0,1 and 2,3)", R.risingSequences([2, 0, 3, 1]) === 2);
    add("hand", "Eulerian row for 4 cards is 1, 11, 11, 1", R.eulerianRow(4).join() === "1,11,11,1");
    add("hand", "Eulerian row for 5 cards is 1, 26, 66, 26, 1", R.eulerianRow(5).join() === "1,26,66,26,1");
    var t = R.tvExact(2, 1);
    add("hand", "two cards, one riffle: TV = 1/4 exactly (by hand: half of |3/4-1/2| + |1/4-1/2|)", t.num * 4n === t.den);
    add("hand", "one card: TV is 0 for every k", [0, 1, 5].every(function (k) { return R.tvExact(1, k).num === 0n; }));
    add("hand", "k = 0 leaves the start deck: TV = 1 - 1/n! (n = 5 gives 119/120)", (function () {
      var f = R.tvExact(5, 0); return f.num * 120n === f.den * 119n; })());
    add("hand", "rejects a deck that is not a permutation", (function () {
      try { R.risingSequences([0, 0, 1]); return false; } catch (e) { return e instanceof RangeError; } })());

    // ---- brute force over every permutation, decks of 1..6 cards ----
    for (var n = 1; n <= 6; n++) {
      var all = perms(n), nf = Number(R.factorial(n)), rs = all.map(R.risingSequences);
      // Eulerian numbers against a count of all permutations
      var tally = new Array(n + 1).fill(0);
      rs.forEach(function (r) { tally[r]++; });
      var row = R.eulerianRow(n).map(Number);
      add("brute", n + " cards: Eulerian numbers equal the count of all " + nf + " permutations by rising sequences",
        row.every(function (v, i) { return v === tally[i + 1]; }));
      add("brute", n + " cards: Eulerian numbers sum to " + n + "!", R.eulerianRow(n).reduce(function (a, b) { return a + b; }, 0n) === R.factorial(n));
      for (var k = 1; k <= (n <= 4 ? 5 : 4); k++) {
        var counts = bruteCounts(n, k), a = Math.pow(2, k), total = Math.pow(a, n), bad = 0;
        var tvNum = 0n, nfB = R.factorial(n), anB = BigInt(total);
        all.forEach(function (p, i) {
          var c = counts.get(p.join(",")) || 0;
          if (BigInt(c) !== R.binom(a + n - rs[i], n)) bad++;
          var d = nfB * BigInt(c) - anB; tvNum += d < 0n ? -d : d;
        });
        var sum = 0; counts.forEach(function (c) { sum += c; });
        add("brute", n + " cards, " + k + " riffle(s): all " + nf + " arrangements have exactly C(a+n-r, n) of the " + total + " outcomes (a = " + a + ")",
          bad === 0 && sum === total, bad ? bad + " mismatches" : "");
        var f = R.tvExact(n, k);
        add("brute", n + " cards, " + k + " riffle(s): exact TV from the formula equals TV summed over every arrangement",
          tvNum * f.den === f.num * (2n * nfB * anB));
      }
    }

    // ---- properties of the exact formula (larger decks) ----
    [10, 26, 52].forEach(function (n) {
      var prev = 2, mono = true, curve = R.mixingCurve(n, 25);
      curve.forEach(function (p) { if (p.tv > prev + 1e-15) mono = false; prev = p.tv; });
      add("formula", n + " cards: TV never rises from k = 0 to 25", mono);
      add("formula", n + " cards: TV at k = 25 is below 1e-5", curve[25].tv < 1e-5);
      var pd = R.risingDistribution(n, 8), s = 0n; pd.forEach(function (p) { s += p.num; });
      add("formula", n + " cards: rising-sequence probabilities after 3 riffles sum to exactly 1", s === pd[0].den);
    });
    add("formula", "52 cards: TV is within 1e-9 of 1 for 3 riffles or fewer (a riffles cannot make more than a rising sequences; a random order has about 26)",
      [0, 1, 2, 3].every(function (k) { return 1 - R.tvDistance(52, k) < 1e-9; }));

    // ---- seeded simulation ----
    // (1) 6 cards, 2 riffles, 300000 trials: every arrangement's frequency against its exact probability.
    (function () {
      var n = 6, k = 2, N = 300000, rng = R.makeRng(20261018), freq = new Map(), id = [0, 1, 2, 3, 4, 5];
      for (var i = 0; i < N; i++) { var key = R.shuffle(id, k, rng).join(","); freq.set(key, (freq.get(key) || 0) + 1); }
      var worst = 0, impossible = 0, a = Math.pow(2, k), total = Math.pow(a, n);
      perms(n).forEach(function (p) {
        var pr = Number(R.binom(a + n - R.risingSequences(p), n)) / total, c = freq.get(p.join(",")) || 0;
        if (pr === 0) { impossible += c; return; }
        var z = Math.abs(c - N * pr) / Math.sqrt(N * pr * (1 - pr));
        if (z > worst) worst = z;
      });
      add("simulation", "seeded, 6 cards, 2 riffles, " + N + " trials: no arrangement with more than 4 rising sequences ever appears", impossible === 0, impossible + " seen");
      add("simulation", "seeded, 6 cards, 2 riffles, " + N + " trials: every arrangement within 4.5 standard errors of its exact probability", worst < 4.5, "worst " + worst.toFixed(2));
    })();
    // (2) 52 cards: the rising-sequence count after 1, 2, 3 riffles against its exact distribution.
    [1, 2, 3].forEach(function (k) {
      var n = 52, N = 20000, rng = R.makeRng(7000 + k), id = []; for (var i = 0; i < n; i++) id.push(i);
      var hist = {}, tooMany = 0;
      for (i = 0; i < N; i++) { var r = R.risingSequences(R.shuffle(id, k, rng)); hist[r] = (hist[r] || 0) + 1; if (r > Math.pow(2, k)) tooMany++; }
      var worst = 0;
      R.risingDistribution(n, Math.pow(2, k)).forEach(function (p) {
        var pr = R.ratioToNumber(p);
        if (pr * N < 5) return;
        var z = Math.abs((hist[p.r] || 0) - N * pr) / Math.sqrt(N * pr * (1 - pr));
        if (z > worst) worst = z;
      });
      add("simulation", "seeded, 52 cards, " + k + " riffle(s), " + N + " trials: rising-sequence counts within 4.5 standard errors of exact (and never above " + Math.pow(2, k) + ")",
        worst < 4.5 && tooMany === 0, "worst " + worst.toFixed(2));
    });
    // (3) the cut is binomial
    (function () {
      var n = 52, N = 20000, rng = R.makeRng(99), id = [], i;
      for (i = 0; i < n; i++) id.push(i);
      // the first card of the result comes from the top packet unless the cut is 0; count how often card 0 stays on top
      var top = 0;
      for (i = 0; i < N; i++) if (R.gsr(id, rng)[0] === 0) top++;
      // exact: P(card 0 first) = 1 - P(first drop from the bottom packet), computed from the exact one-riffle law
      // of the top card: sum over cuts c of C(n,c)/2^n * (c/n)  [first draw takes the top packet with prob c/n]
      var p = 0.5; // sum_c C(n,c) c / (n 2^n) = 1/2
      var z = Math.abs(top - N * p) / Math.sqrt(N * p * (1 - p));
      add("simulation", "seeded, 52 cards: card 0 lands on top after one riffle about half the time (exact 1/2 by symmetry)", z < 4.5, "z " + z.toFixed(2));
    })();
    add("simulation", "same seed gives the same shuffle twice", R.shuffle([0, 1, 2, 3, 4, 5, 6, 7], 3, R.makeRng(5)).join() === R.shuffle([0, 1, 2, 3, 4, 5, 6, 7], 3, R.makeRng(5)).join());
    add("simulation", "a shuffle is always a permutation of the deck (1000 seeded shuffles of 20 cards)", (function () {
      var rng = R.makeRng(3), d = []; for (var i = 0; i < 20; i++) d.push(i);
      for (i = 0; i < 1000; i++) { var s = R.shuffle(d, 1 + (i % 4), rng).slice().sort(function (a, b) { return a - b; }); if (s.join() !== d.join()) return false; }
      return true; })());

    // ---- weaker: published figures from search summaries only (not fetched, not counted) ----
    var k52 = R.shufflesToReach(52, 0.5, 30);
    weak.push({ name: "Published: about 7 riffle shuffles are needed for 52 cards (seen only in search summaries; not read from a source page). Computed here: TV first drops to 1/2 or below at k = " + k52 + ".",
      pass: k52 === 7 });
    return { checks: checks, weak: weak };
  }
  return { run: run, perms: perms, riffleOutcomes: riffleOutcomes, bruteCounts: bruteCounts };
});
