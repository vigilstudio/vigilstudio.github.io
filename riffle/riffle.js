/* riffle.js: riffle shuffles and their distance from uniform. MIT licence (see LICENSE). No dependencies.
   Written by Claude, an AI model. Works in Node (require) and in a page (window.Riffle).
   A deck is an array holding the labels 0..n-1; the start deck is [0,1,...,n-1]. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Riffle = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Seeded generator (mulberry32). Returns a function giving floats in [0, 1).
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isPerm(deck) {
    if (!Array.isArray(deck)) return false;
    var seen = new Array(deck.length).fill(false);
    for (var i = 0; i < deck.length; i++) {
      var c = deck[i];
      if (!Number.isInteger(c) || c < 0 || c >= deck.length || seen[c]) return false;
      seen[c] = true;
    }
    return true;
  }
  function needDeck(deck) {
    if (!isPerm(deck)) throw new RangeError("deck must be an array holding each of 0..n-1 exactly once");
  }
  function needInt(x, min, name) {
    if (!Number.isInteger(x) || x < min) throw new RangeError(name + " must be an integer >= " + min);
  }

  // Gilbert-Shannon-Reeds riffle: cut with Binomial(n, 1/2), then drop cards one at a time from the packet
  // with probability (cards left in it) / (cards left in both). Takes cards from the tops of the packets and
  // builds the new deck from the top; every interleaving of the two packets is equally likely.
  function gsr(deck, rand) {
    needDeck(deck);
    rand = rand || Math.random;
    var n = deck.length, cut = 0, i;
    for (i = 0; i < n; i++) if (rand() < 0.5) cut++;
    var l = 0, r = cut, out = new Array(n);
    for (i = 0; i < n; i++) {
      var left = cut - l, right = n - r;
      if (left > 0 && (right === 0 || rand() * (left + right) < left)) out[i] = deck[l++];
      else out[i] = deck[r++];
    }
    return out;
  }
  function shuffle(deck, k, rand) {
    needInt(k, 0, "k");
    var d = deck.slice();
    needDeck(d);
    for (var i = 0; i < k; i++) d = gsr(d, rand);
    return d;
  }

  // Rising sequences: maximal runs of consecutive labels i, i+1, ... that sit in increasing positions.
  // Count = 1 + number of labels i whose successor i+1 sits above it in the deck (earlier position).
  function risingSequences(deck) {
    needDeck(deck);
    var n = deck.length;
    if (n === 0) return 0;
    var pos = new Array(n), i;
    for (i = 0; i < n; i++) pos[deck[i]] = i;
    var r = 1;
    for (i = 0; i + 1 < n; i++) if (pos[i + 1] < pos[i]) r++;
    return r;
  }

  // ---- exact arithmetic (BigInt) ----
  function factorial(n) { var f = 1n; for (var i = 2n; i <= BigInt(n); i++) f *= i; return f; }
  function binom(n, k) {            // BigInt n, k >= 0; zero when k > n
    n = BigInt(n); k = BigInt(k);
    if (k < 0n || k > n) return 0n;
    if (k > n - k) k = n - k;
    var r = 1n;
    for (var i = 1n; i <= k; i++) r = r * (n - k + i) / i;
    return r;
  }
  var eulerCache = {};
  // Row of Eulerian numbers for n: element m (0-based) counts permutations of n with m descents.
  function eulerianRow(n) {
    needInt(n, 1, "n");
    if (eulerCache[n]) return eulerCache[n].slice();
    var row = [1n];
    for (var j = 2; j <= n; j++) {
      var next = new Array(j).fill(0n);
      for (var m = 0; m < j; m++) {
        next[m] = BigInt(m + 1) * (m < row.length ? row[m] : 0n) + BigInt(j - m) * (m >= 1 ? row[m - 1] : 0n);
      }
      row = next;
    }
    eulerCache[n] = row;
    return row.slice();
  }
  // Number of arrangements of n cards that have exactly r rising sequences (r = 1..n).
  function risingCount(n, r) {
    needInt(n, 1, "n"); needInt(r, 1, "r");
    return r > n ? 0n : eulerianRow(n)[r - 1];
  }
  // Bayer-Diaconis: after an a-shuffle (k riffles make a = 2^k), one arrangement with r rising sequences has
  // probability C(a + n - r, n) / a^n. Returned as {num, den} BigInt.
  function arrangementProb(n, a, r) {
    needInt(n, 1, "n"); needInt(a, 1, "a"); needInt(r, 1, "r");
    return { num: binom(a + n - r, n), den: BigInt(a) ** BigInt(n) };
  }
  // Exact total-variation distance from uniform after an a-shuffle, as {num, den}:
  //   TV = 1/2 * sum_r A(n,r) * | C(a+n-r, n)/a^n - 1/n! |.
  // Common denominator 2 * n! * a^n, so each term is A(n,r) * | n! C(a+n-r,n) - a^n |.
  function tvExactA(n, a) {
    needInt(n, 1, "n"); needInt(a, 1, "a");
    var nf = factorial(n), an = BigInt(a) ** BigInt(n), row = eulerianRow(n), num = 0n;
    for (var r = 1; r <= n; r++) {
      var d = nf * binom(a + n - r, n) - an;
      if (d < 0n) d = -d;
      num += row[r - 1] * d;
    }
    return { num: num, den: 2n * nf * an };
  }
  function tvExact(n, k) { needInt(k, 0, "k"); return tvExactA(n, Math.pow(2, k)); }
  function ratioToNumber(f) {
    if (f.num === 0n) return 0;
    var SH = 400n;
    return Number((f.num << SH) / f.den) / Math.pow(2, 400);
  }
  function tvDistance(n, k) { return ratioToNumber(tvExact(n, k)); }
  function mixingCurve(n, kmax) {
    needInt(kmax, 0, "kmax");
    var out = [];
    for (var k = 0; k <= kmax; k++) out.push({ k: k, tv: tvDistance(n, k) });
    return out;
  }
  // Smallest k (0..kmax) whose TV distance is <= eps, or null if none.
  function shufflesToReach(n, eps, kmax) {
    kmax = kmax == null ? 60 : kmax;
    for (var k = 0; k <= kmax; k++) if (tvDistance(n, k) <= eps) return k;
    return null;
  }
  // Exact probability that an a-shuffle leaves r rising sequences: A(n,r) * C(a+n-r, n) / a^n, as {num, den}.
  function risingDistribution(n, a) {
    var row = eulerianRow(n), an = BigInt(a) ** BigInt(n), out = [];
    for (var r = 1; r <= n; r++) out.push({ r: r, num: row[r - 1] * binom(a + n - r, n), den: an });
    return out;
  }

  return {
    makeRng: makeRng, gsr: gsr, shuffle: shuffle, risingSequences: risingSequences,
    factorial: factorial, binom: binom, eulerianRow: eulerianRow, risingCount: risingCount,
    arrangementProb: arrangementProb, tvExactA: tvExactA, tvExact: tvExact, tvDistance: tvDistance,
    mixingCurve: mixingCurve, shufflesToReach: shufflesToReach, risingDistribution: risingDistribution,
    ratioToNumber: ratioToNumber
  };
});
