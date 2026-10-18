const F = require("./fold.js");
let fails = 0, n;
function ok(c, m) { if (!c) { fails++; console.log("FAIL", m); } }
let t0 = Date.now(), seqOk = 0, geomOk = 0;
for (n = 1; n <= 20; n++) {
  const s = F.simulate(n); let bad = 0;
  for (let k = 1; k < s.N; k++) if (s.crease[k] !== F.rule(k)) bad++;
  ok(bad === 0, "sequence n=" + n + " mismatches " + bad); if (!bad) seqOk++;
  // stack order: after n folds it must be a permutation of all cells
  const seen = new Uint8Array(s.N); for (const c of s.order) seen[c] = 1; ok(seen.every(v => v === 1), "layers permutation n=" + n);
  const a = F.analyse(F.dragon(s.crease, s.N));
  const g = a.edgeReuse === 0 && a.straight === 0 && a.maxVisits <= 2 && a.dist2 === s.N;
  ok(g, "geometry n=" + n + " " + JSON.stringify(a)); if (g) geomOk++;
  if (n <= 10) ok(F.bruteCrossings(F.dragon(s.crease, s.N)) === 0, "brute crossings n=" + n);
}
console.log("first 15:", Array.from(F.simulate(4).crease).slice(1).join(""));
console.log("n=4 geometry", JSON.stringify(F.analyse(F.dragon(F.simulate(4).crease, 16))));
console.log("n=20 geometry", JSON.stringify(F.analyse(F.dragon(F.simulate(20).crease, 1 << 20))));
console.log("sequence ok for", seqOk, "of 20 values of n; geometry ok for", geomOk, "of 20; ms", Date.now() - t0);
console.log("Gallivan n=12 L/t:", F.gallivanLength(12, 1), "A4 0.1mm max folds:", F.maxFolds(0.297, 1e-4));
// negative control: a wrong rule must be caught
let wrong = 0; const s5 = F.simulate(5); for (let k = 1; k < 32; k++) if (s5.crease[k] !== (k & 1 ? 1 : 0)) wrong++; ok(wrong > 0, "control");
// the wrong sequence must also give a different curve (all-valley turns into a closed square loop, so edges repeat)
const wc = new Uint8Array(32).fill(1), wa = F.analyse(F.dragon(wc, 32)); ok(wa.edgeReuse > 0 && wa.dist2 !== 32, "dragon control");
console.log(fails ? fails + " failures" : "all passed");
process.exit(fails ? 1 : 0);
