// tests.js - the checks for moonphase.js. One function, used by test-node.mjs (Node) and by index.html (live).
// runTests(mp, astro) -> { checks: [{ name, pass, detail }], tables: { ... }, counts: { ... } }
// mp = the moonphase.js module, astro = the vendored astronomy-engine module (MIT, see vendor/).
// Every count printed on the page is computed here; every check has a threshold that a wrong result would break.

export const LIMITS = {
  ttSeconds: 90,       // library vs astronomy-engine, dynamical time, any single phase
  residualSeconds: 40, // same, after the mean offset over the sweep is removed (chosen after seeing 27 s; catches slips of about 0.0005 day)
  utSeconds: 120,      // same, in UT (adds the two delta-T models)
  fractionDiff: 0.01,  // illuminated fraction vs astronomy-engine
  roundTrip: 0.01,     // fraction at a computed phase time vs 0, 0.5, 1
  meanGapDays: 1.5,    // true phase vs plain mean-month estimate: a loose sanity bound, chosen after the first run showed a worst gap of 23 hours
};
export const SWEEP = { from: [1800, 0, 1], to: [2200, 0, 1] };   // year, month, day (UTC)
export const FRACTION_SWEEP = { from: [1900, 0, 1], to: [2100, 0, 1], stepDays: 6.13 };

// Plain mean-synodic-month estimate: no periodic terms at all. Epoch and month length are typed from memory
// (new moon of 2000-01-06 18:14 UTC; 29.530588853 days) and are NOT shared with the library's constants.
export const MEAN = { epochMs: Date.UTC(2000, 0, 6, 18, 14), monthDays: 29.530588853 };

const utc = (a) => { const d = new Date(0); d.setUTCFullYear(a[0], a[1], a[2]); d.setUTCHours(0, 0, 0, 0); return d; };
const LON = [0, 90, 180, 270];
const q4 = (n) => ((n % 4) + 4) % 4;
const fmt = (d) => d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");

export function runTests(mp, astro) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
  const throws = (f, E) => { try { f(); } catch (e) { return e instanceof E; } return false; };

  // ---- the sweep: every phase from 1800 to 2200 ----
  const from = utc(SWEEP.from), to = utc(SWEEP.to);
  const ps = mp.phasesBetween(from, to);
  const counts = { phases: ps.length, years: SWEEP.to[0] - SWEEP.from[0] };

  // structure: strictly increasing, names cycle, gaps sensible
  let cycleOk = true, minGap = Infinity, maxGap = 0, minAt = null, maxAt = null;
  for (let i = 1; i < ps.length; i++) {
    if (q4(ps[i].index) !== (q4(ps[i - 1].index) + 1) % 4) cycleOk = false;
    const g = (ps[i].date - ps[i - 1].date) / 86400000;
    if (g < minGap) { minGap = g; minAt = ps[i].date; }
    if (g > maxGap) { maxGap = g; maxAt = ps[i].date; }
  }
  add("phases come out in order new, first quarter, full, last quarter, repeating, with no gaps", cycleOk && ps.length > 0 && ps[0].name === mp.PHASES[q4(ps[0].index)],
    `${ps.length} phases between ${fmt(ps[0].date)} and ${fmt(ps[ps.length - 1].date)}`);
  add("every gap between neighbouring phases is between 5.5 and 9 days", minGap > 5.5 && maxGap < 9,
    `shortest ${minGap.toFixed(3)} days (before ${fmt(minAt)}), longest ${maxGap.toFixed(3)} days (before ${fmt(maxAt)})`);

  // (a) against astronomy-engine
  const rows = [];
  let sumTT = 0;
  for (const p of ps) {
    const t = astro.SearchMoonPhase(LON[q4(p.index)], new Date(p.date.getTime() - 3 * 86400000), 7);
    const ttDiff = (p.jde - (t.tt + 2451545)) * 86400;   // seconds, library minus astronomy-engine
    const utDiff = (p.date - t.date) / 1000;
    sumTT += ttDiff;
    rows.push({ name: p.name, lib: p.date, ref: t.date, ttDiff, utDiff, index: p.index });
  }
  const meanTT = sumTT / rows.length;
  let worstTT = rows[0], worstUT = rows[0], resid = 0;
  for (const r of rows) {
    if (Math.abs(r.ttDiff) > Math.abs(worstTT.ttDiff)) worstTT = r;
    if (Math.abs(r.utDiff) > Math.abs(worstUT.utDiff)) worstUT = r;
    resid = Math.max(resid, Math.abs(r.ttDiff - meanTT));
  }
  counts.compared = rows.length;
  counts.meanTT = meanTT; counts.residual = resid;
  add(`dynamical time agrees with astronomy-engine within ${LIMITS.ttSeconds} s for every one of ${rows.length} phases`, Math.abs(worstTT.ttDiff) <= LIMITS.ttSeconds,
    `largest ${worstTT.ttDiff.toFixed(1)} s (${worstTT.name}, ${fmt(worstTT.lib)}); mean offset ${meanTT.toFixed(1)} s; largest gap once the mean is removed ${resid.toFixed(1)} s`);
  add(`once the mean offset is removed, every phase is within ${LIMITS.residualSeconds} s of astronomy-engine`, resid <= LIMITS.residualSeconds,
    `largest ${resid.toFixed(1)} s over ${rows.length} phases; terms smaller than about this cannot be vouched for by this comparison`);
  add(`UT agrees within ${LIMITS.utSeconds} s for every phase from 1900 to 2150 (where the delta-T polynomials apply)`,
    rows.filter((r) => r.lib.getUTCFullYear() >= 1900 && r.lib.getUTCFullYear() < 2150).every((r) => Math.abs(r.utDiff) <= LIMITS.utSeconds),
    `largest in that span ${Math.max(...rows.filter((r) => r.lib.getUTCFullYear() >= 1900 && r.lib.getUTCFullYear() < 2150).map((r) => Math.abs(r.utDiff))).toFixed(1)} s; over all ${rows.length}: ${Math.abs(worstUT.utDiff).toFixed(1)} s (${fmt(worstUT.lib)})`);

  // table: at least 10 rows incl. oldest, newest, largest disagreement
  const pick = new Map();
  pick.set(0, "oldest"); pick.set(rows.length - 1, "newest");
  pick.set(rows.indexOf(worstTT), "largest disagreement");
  for (let j = 1; j <= 9; j++) { const i = Math.round((j * (rows.length - 1)) / 10); if (!pick.has(i)) pick.set(i, ""); }
  const table = [...pick.entries()].sort((a, b) => a[0] - b[0]).map(([i, why]) => ({ ...rows[i], why }));

  // (b) against a plain mean-synodic-month estimate
  let worstMean = null, worstMeanGap = 0;
  for (const p of ps) {
    const est = MEAN.epochMs + (p.index / 4) * MEAN.monthDays * 86400000;
    const gap = (p.date - est) / 86400000;
    if (Math.abs(gap) > Math.abs(worstMeanGap)) { worstMeanGap = gap; worstMean = p; }
  }
  counts.meanGapHours = worstMeanGap * 24;
  add(`no phase is more than ${LIMITS.meanGapDays} days from the plain mean-month estimate`, Math.abs(worstMeanGap) <= LIMITS.meanGapDays,
    `worst gap ${(worstMeanGap * 24).toFixed(1)} hours (${worstMean.name}, ${fmt(worstMean.date)}) over ${ps.length} phases`);
  add("the mean-month estimate is not trivially equal to the real times (worst gap exceeds 3 hours)", Math.abs(worstMeanGap) * 24 > 3,
    `worst gap ${(worstMeanGap * 24).toFixed(1)} hours`);

  // (c) round trip: illuminated fraction at each computed phase time
  const target = [0, 0.5, 1, 0.5];
  const dev = [0, 0, 0, 0], devAt = [null, null, null, null];
  for (const p of ps) {
    if (p.date.getUTCFullYear() < 1900 || p.date.getUTCFullYear() >= 2100) continue;
    const q = q4(p.index), d = Math.abs(mp.illuminatedFraction(p.date) - target[q]);
    if (d > dev[q]) { dev[q] = d; devAt[q] = p.date; }
  }
  counts.meanMonth = MEAN.monthDays; counts.meanEpoch = new Date(MEAN.epochMs).toISOString().replace('T', ' ').replace(/:\d\d\.\d+Z$/, ' UT');
  counts.roundTripSpan = "1900 to 2100";
  counts.roundTrip = dev;
  for (let q = 0; q < 4; q++) {
    add(`illuminated fraction at every ${mp.PHASES[q]} time (1900 to 2100) is within ${LIMITS.roundTrip} of ${target[q]}`, dev[q] <= LIMITS.roundTrip,
      `worst deviation ${dev[q].toFixed(5)} at ${fmt(devAt[q])}`);
  }

  // illuminated fraction against astronomy-engine at arbitrary times
  let fw = 0, fwAt = null, nf = 0;
  for (let ms = utc(FRACTION_SWEEP.from).getTime(); ms < utc(FRACTION_SWEEP.to).getTime(); ms += FRACTION_SWEEP.stepDays * 86400000) {
    const d = new Date(ms), a = astro.Illumination(astro.Body.Moon, d).phase_fraction, b = mp.illuminatedFraction(d);
    nf++;
    if (Math.abs(a - b) > fw) { fw = Math.abs(a - b); fwAt = d; }
  }
  counts.fractionSamples = nf; counts.fractionWorst = fw;
  add(`illuminated fraction is within ${LIMITS.fractionDiff} of astronomy-engine at ${nf} times spread over 1900 to 2100`, fw <= LIMITS.fractionDiff,
    `worst difference ${fw.toFixed(5)} at ${fmt(fwAt)}`);

  // API behaviour
  const probe = new Date(Date.UTC(2026, 9, 18, 12));
  const nx = mp.nextPhase(probe), pv = mp.previousPhase(probe);
  add("nextPhase is after the date, previousPhase is at or before it, and they are neighbours (no phase between them)",
    nx.date > probe && pv.date <= probe && q4(nx.index) === (q4(pv.index) + 1) % 4 && mp.phasesBetween(new Date(pv.date.getTime() + 1), new Date(nx.date.getTime() - 1)).length === 0,
    `${fmt(pv.date)} ${pv.name}, then ${fmt(nx.date)} ${nx.name}`);
  add("a window shorter than the gap between phases can return none", mp.phasesBetween(new Date(pv.date.getTime() + 60000), new Date(pv.date.getTime() + 120000)).length === 0, "returns an empty list");
  add("bad input throws (not a Date, end before start, NaN date)",
    throws(() => mp.illuminatedFraction("2026-01-01"), TypeError) && throws(() => mp.phasesBetween(to, from), RangeError) && throws(() => mp.phasesBetween(new Date(NaN), to), TypeError),
    "TypeError, RangeError, TypeError");

  return { checks, table, counts, worst: { tt: worstTT, ut: worstUT } };
}
