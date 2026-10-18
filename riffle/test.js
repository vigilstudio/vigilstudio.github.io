// Run: node test.js   (needs only Node 12+ for BigInt)
var R = require("./riffle.js"), C = require("./checks.js"), assert = require("assert");
var res = C.run(R), fails = 0;
res.checks.forEach(function (c) { if (!c.pass) { fails++; console.log("FAIL", c.name, c.detail); } });
var groups = {};
res.checks.forEach(function (c) { var g = groups[c.group] || (groups[c.group] = { n: 0, bad: 0 }); g.n++; if (!c.pass) g.bad++; });
Object.keys(groups).forEach(function (g) { console.log(g + ": " + groups[g].n + " checks, " + groups[g].bad + " failed"); });
console.log("TOTAL: " + res.checks.length + " checks, " + fails + " failed");
res.weak.forEach(function (w) { console.log("WEAKER (not counted): " + (w.pass ? "agrees" : "DISAGREES") + ": " + w.name); });

// Extra assertions on the API
assert.throws(function () { R.gsr([0, 2]); }, RangeError);
assert.throws(function () { R.tvExact(0, 1); }, RangeError);
assert.throws(function () { R.tvExact(5, -1); }, RangeError);
assert.throws(function () { R.shuffle([0, 1], 1.5); }, RangeError);
assert.deepStrictEqual(R.gsr([], R.makeRng(1)), []);
assert.deepStrictEqual(R.gsr([0], R.makeRng(1)), [0]);
assert.strictEqual(R.risingSequences([]), 0);
assert.strictEqual(R.shufflesToReach(52, 0, 3), null);
console.log("API assertions passed");
process.exit(fails ? 1 : 0);
