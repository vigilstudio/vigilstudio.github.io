// node nonograms/test.mjs : runs the real checks on the real data, then breaks each check once and requires it to fail.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const P = require("./puzzles.js"), LS = require("./linesolver.js"), CT = require("./counter.js"), K = require("./checks.js");

let failures = 0;
const say = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) failures++; };

const cands = K.candidates();
const an = cands.map(c => K.analyse(c, P, LS, CT));
const ex = K.exhaustive4(P, LS, CT);
const checks = K.realChecks(an, P, ex);
for (const c of checks) say(c.ok, c.id + " " + c.label + " -- " + c.detail);
const t = K.tally(an);
console.log("tally", JSON.stringify(t));

// opening sentence length
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const lede = /<p class="lede" id="lede">([^<]*)</.exec(html);
if (lede) { const w = lede[1].trim().split(/\s+/).length; say(w <= 25, "opening sentence has " + w + " words (limit 25)"); }
else say(false, "lede paragraph not found");

// ---- break each check once
const clone = x => JSON.parse(JSON.stringify(x));
function broken(name, mutate, id, opts = {}) {
  const an2 = clone(an), ex2 = clone(ex);
  mutate(an2, ex2);
  const res = K.realChecks(an2, P, ex2).find(c => c.id === id);
  say(!res.ok, "broken '" + name + "' makes " + id + " fail (" + res.detail.slice(0, 70) + ")");
}
const flip = g => { g[0][0] = g[0][0] ? 0 : 1; };
broken("one cell of a counter grid flipped", a => flip(a.find(x => x.cnt.solutions.length).cnt.solutions[0]), "c1");
broken("one cell of a finished line grid flipped", a => flip(a.find(x => x.line.status === "solved").line.grid), "c2");
broken("one cell of a kept line grid flipped", a => flip(a.find(x => x.verdict === "kept").line.grid), "c3");
broken("second grid copied from first", a => { const x = a.find(y => y.verdict === "two"); x.cnt.solutions[1] = clone(x.cnt.solutions[0]); }, "c4");
broken("rejected puzzle given a solved line result", a => { a.find(y => y.verdict === "two").line.status = "solved"; }, "c5");
broken("seed grid changed", a => flip(a.find(x => x.verdict === "kept").hidden), "c6");

// c7 and c8 with faulty solvers
const capCounter = { count: (r, c, o) => { const x = CT.count(r, c, o); x.count = Math.min(x.count, 1); return x; } };
say(!K.realChecks(an, P, K.exhaustive4(P, LS, capCounter)).find(c => c.id === "c7").ok, "counter capped at 1 makes c7 fail");
const missOne = { count: (r, c, o) => { const res = CT.count(r, c, o); if (res.count > 1) res.count -= 1; return res; } };
say(!K.realChecks(an, P, K.exhaustive4(P, LS, missOne)).find(c => c.id === "c7").ok, "counter that misses one of several solutions makes c7 fail");
const wrongOnUnique = { count: (r, c, o) => { const res = CT.count(r, c, o); if (res.count === 1 && r.length === 4 && r[0].length === 1 && r[0][0] === 4) res.count = 0; return res; } };
say(!K.realChecks(an, P, K.exhaustive4(P, LS, wrongOnUnique)).find(c => c.id === "c7").ok, "counter wrong on one clue set only (first row 4) makes c7 fail");
const eager = { solve: (r, c) => { const x = LS.solve(r, c); x.grid[0][0] = 1; return x; } };
say(!K.realChecks(an, P, K.exhaustive4(P, eager, CT)).find(c => c.id === "c8").ok, "line solver forced to mark (0,0) filled makes c8 fail");
const overclaim = { solve: (r, c) => { const x = LS.solve(r, c); if (x.status === "stuck") { x.status = "solved"; } return x; } };
say(!K.realChecks(an, P, K.exhaustive4(P, overclaim, CT)).find(c => c.id === "c8").ok, "line solver that calls a stall 'solved' makes c8 fail");

// small direct tests
assert.deepEqual(P.lineClue([1,1,0,1,0,0]), [2,1]);
assert.deepEqual(P.lineClue([0,0]), []);
// a known two-solution puzzle: 2x2 diagonal either way
const two = CT.count([[1],[1]], [[1],[1]], { limit: 5 });
say(two.count === 2, "2x2 diagonal puzzle has 2 solutions (counter says " + two.count + ")");
const stall = LS.solve([[1],[1]], [[1],[1]]);
say(stall.status === "stuck" && stall.unknown === 4, "line solver stalls on that puzzle with 4 unknown cells (" + stall.status + ", " + stall.unknown + ")");
// contradiction
const contra = LS.solve([[2]], [[1], []]);
say(contra.status === "contradiction", "line solver reports a contradiction on clues that cannot be met (" + contra.status + ")");
say(CT.count([[2]], [[1], []]).count === 0, "counter finds 0 grids for the same clues");

console.log(failures ? failures + " FAILED" : "all passed");
process.exit(failures ? 1 : 0);
