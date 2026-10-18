# Shuffling Toward Uniform

A zero-dependency, MIT-licensed JavaScript module, `riffle.js`, with a Gilbert-Shannon-Reeds (GSR) riffle shuffle,
a rising-sequence count, and the exact distance from a uniformly random deck after k riffles by the Bayer-Diaconis
formula (Eulerian numbers, exact big-integer arithmetic). `index.html` imports the module and draws the mixing
curve for any deck of 2 to 100 cards. Made by Claude, an AI model.

**Main caveat:** it models a mathematical riffle, not real hands, and the often-quoted "about 7 shuffles for 52
cards" is a figure seen only in search summaries (no source page was read), so it is shown as a weaker comparison and
kept out of the check count.

## API
`makeRng(seed)`, `gsr(deck, rand)`, `shuffle(deck, k, rand)`, `risingSequences(deck)`, `eulerianRow(n)`,
`risingCount(n, r)`, `arrangementProb(n, a, r)`, `tvExact(n, k)` and `tvExactA(n, a)` (as `{num, den}` BigInts),
`tvDistance(n, k)` (a Number), `mixingCurve(n, kmax)`, `shufflesToReach(n, eps, kmax)`, `risingDistribution(n, a)`,
`binom`, `factorial`. A deck is an array holding 0..n-1; the start deck is the identity. Bad input throws `RangeError`.

```js
const R = require("./riffle.js");          // or <script src="riffle.js"> -> window.Riffle
const rng = R.makeRng(42);
const deck = R.shuffle([0,1,2,3,4,5], 3, rng);
R.risingSequences(deck);                   // at most 2^3 = 8 after three riffles
R.tvDistance(52, 7);                       // 0.3341 (computed, see the page)
```
Tests: `node test.js` (Node 12 or later for BigInt; nothing to install).

## How it works
- **GSR:** cut with Binomial(n, 1/2) (n fair coin flips), then drop cards one at a time from a packet with chance
  (cards left in it) / (cards left in both). Every interleaving of the packets is equally likely.
- **Rising sequences:** with label i at position pos(i), the count is 1 plus the number of i with pos(i+1) < pos(i).
- **Distance:** after an a-shuffle (a = 2^k for k riffles) an arrangement with r rising sequences has chance
  C(a+n-r, n) / a^n; there are A(n, r) such arrangements (an Eulerian number). Total variation distance is
  1/2 * sum over r of A(n, r) * |C(a+n-r, n)/a^n - 1/n!|, computed over a common denominator in BigInt.
  These two formulas are used as stated in the literature as I remember them; the brute-force checks below test them
  for up to 6 cards, which is the evidence for them here, not a citation.

## What was checked (all counted in code by `checks.js`; 96 checks, none failing)
- 10 hand cases (Eulerian rows for 4 and 5 cards, TV for 2 cards = 1/4, one card, k = 0, rising-sequence examples,
  bad input).
- 68 brute-force checks. For every deck of 1 to 6 cards, every one of the n! arrangements is listed, and for 1 to 4
  riffles (1 to 5 for decks of 4 or fewer) every outcome of every riffle is followed (2^(nk) of them, as exact integer
  counts). Each arrangement's count equals C(a+n-r, n) exactly, and the exact TV from the formula equals the TV summed
  over every arrangement (compared as exact BigInt fractions). The Eulerian numbers equal the count of all
  permutations by rising sequences.
- 10 formula checks for 10, 26 and 52 cards (TV never rises over k = 0 to 25; it is under 1e-5 at 25; rising-sequence
  probabilities sum to exactly 1; 52 cards sit within 1e-9 of 1 for 3 riffles or fewer).
- 8 seeded simulation checks: 300,000 trials on 6 cards with 2 riffles (every arrangement within 4.5 standard
  errors of its exact probability, none impossible ever seen); 20,000 trials on 52 cards for 1, 2 and 3 riffles
  (rising-sequence counts against the exact law); card 0 on top half the time; determinism; always a permutation.
  Replacing the drop rule by a fair coin makes three of these fail (tried once in a scratch copy).
- The brute-force enumeration uses a two-digit-per-card description of a riffle, not the module's `gsr`, so the exact
  formulas are not tested against the code that uses them. `gsr` itself is tested only by the seeded simulation.
- Page: `node tools/page_check.mjs riffle/` passed at 375, 768 and 1100 px in light and dark with no console errors
  (headless Chromium shell); the self-checks run again in the browser on load; decks of 2 and 100 cards, the log
  scale and bad input were tried.

## Weaker, not counted
- "About 7 shuffles for 52 cards": from search summaries, no source page read. The module's TV for 52 cards first drops
  to 1/2 or below at k = 7, which agrees; that is one weak comparison and sits outside the 96.

## Not verified
- No published table of TV values was compared; the two formulas rest on the brute-force checks above.
- Brute force stops at 6 cards; larger decks rest on the formula and on the 52-card simulation of rising-sequence
  counts, not on the whole order.
- GSR is a model of human riffling, not measured from real shuffles; the distance is for the whole order, and other
  statistics can look random sooner or later.
- Default randomness is `Math.random`, not suitable for security.
- Not tried on a real phone.

## Licence
MIT, full text in `LICENSE`.
