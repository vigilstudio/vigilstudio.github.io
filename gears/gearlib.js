/* gearlib.js: exact fractions (BigInt), Stern-Brocot search, brute force, and checks that
   re-read the gear SVG. Works in the page and in Node (UMD). MIT-style: made by Claude. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GearLib = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MODULE = 1.5, ALPHA = 20 * Math.PI / 180;
  // what the set is meant to be (the checks compare the SVG with this)
  const SPEC = { A1: 18, A2: 54, A3: 18, A4: 72, E: 39, V: 24 };
  const MESHES = [["A1", "A2"], ["A3", "A4"], ["E", "V"]];

  // ---------- exact fractions ----------
  const big = (x) => BigInt(x);
  const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
  const frac = (n, d) => { n = big(n); d = big(d); const g = gcd(n, d) || 1n; if (d < 0n) { n = -n; d = -d; } return { n: n / g, d: d / g }; };
  const fmul = (x, y) => frac(x.n * y.n, x.d * y.d);
  const fsub = (x, y) => frac(x.n * y.d - y.n * x.d, x.d * y.d);
  const fabs = (x) => ({ n: x.n < 0n ? -x.n : x.n, d: x.d });
  const fcmp = (x, y) => { const l = x.n * y.d, r = y.n * x.d; return l < r ? -1 : l > r ? 1 : 0; };
  const fstr = (x) => (x.d === 1n ? String(x.n) : x.n + "/" + x.d);
  // decimal string of a fraction with k digits after the point (truncated), exact integer arithmetic
  function fdec(x, k) {
    k = k === undefined ? 6 : k;
    const neg = x.n < 0n; const n = neg ? -x.n : x.n;
    const s = (n * 10n ** big(k)) / x.d;
    let t = s.toString().padStart(k + 1, "0");
    return (neg ? "-" : "") + t.slice(0, t.length - k) + (k ? "." + t.slice(t.length - k) : "");
  }
  // "365.2564" -> fraction exactly
  function parseDecimal(s) {
    s = String(s).trim();
    const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) return null;
    const f = m[2] || "";
    const f2 = frac(big(m[1] + f), 10n ** big(f.length));
    return f2.n > 0n ? f2 : null;
  }

  // ---------- Stern-Brocot ----------
  // best p/q with p,q <= N for target t = tn/td (>0). Walks the tree; stops when the next mediant
  // would exceed N; the answer is the closer of the two last bounds.
  function sbBest(tn, td, N, fault) {
    const t = frac(tn, td);
    N = big(N);
    let lo = { n: 0n, d: 1n }, hi = { n: 1n, d: 0n };
    const steps = [];
    let exact = null;
    for (let guard = 0; guard < 100000; guard++) {
      const med = { n: lo.n + hi.n, d: lo.d + hi.d };
      if (med.n > N || med.d > N) break;
      const c = med.d === 0n ? 1 : fcmp(med, t);
      steps.push({ med, dir: c === 0 ? "=" : c < 0 ? "up" : "down" });
      if (c === 0) { exact = med; break; }
      if (c < 0) lo = med; else hi = med;
    }
    let best;
    if (exact) best = exact;
    else {
      const okLo = lo.n > 0n && lo.d <= N && lo.n <= N, okHi = hi.d > 0n && hi.n <= N && hi.d <= N;
      if (okLo && okHi) {
        const eLo = fabs(fsub(lo, t)), eHi = fabs(fsub(hi, t));
        best = fcmp(eLo, eHi) <= 0 ? lo : hi;
        if (fault === "alwaysLow") best = lo;
      } else best = okLo ? lo : hi;
    }
    return { best, lo, hi, exact: !!exact, steps, err: fabs(fsub(best, t)), target: t };
  }
  // exhaustive: every p,q in 1..N, smallest |p/q - t|; returns the minimal error and all fractions that reach it
  function bruteBest(tn, td, N) {
    const t = frac(tn, td);
    let bestErr = null, all = [];
    for (let q = 1; q <= N; q++) for (let p = 1; p <= N; p++) {
      const f = frac(p, q);
      if (f.n !== BigInt(p) || f.d !== BigInt(q)) continue; // reduced forms only
      const e = fabs(fsub(f, t));
      const c = bestErr ? fcmp(e, bestErr) : -1;
      if (c < 0) { bestErr = e; all = [f]; } else if (c === 0) all.push(f);
    }
    return { err: bestErr, all, target: t };
  }
  function brocotAgreesWithBrute(tn, td, N, fault) {
    const s = sbBest(tn, td, N, fault), b = bruteBest(tn, td, N);
    return { ok: fcmp(s.err, b.err) === 0, sb: s, bf: b };
  }
  // continued fraction convergents of a fraction (exact)
  function convergents(tn, td, maxTerms) {
    let n = big(tn), d = big(td); const out = []; let h1 = 1n, h0 = 0n, k1 = 0n, k0 = 1n; const a = [];
    for (let i = 0; i < (maxTerms || 12) && d !== 0n; i++) {
      const q = n / d; [n, d] = [d, n - q * d];
      const h = q * h1 + h0, k = q * k1 + k0; h0 = h1; h1 = h; k0 = k1; k1 = k; a.push(q);
      out.push({ a: q, p: h, q: k });
    }
    return out;
  }

  // ---------- gear geometry (closed forms) ----------
  const geom = (z, m) => { m = m || MODULE; const rp = m * z / 2; return { rp, rb: rp * Math.cos(ALPHA), ra: rp + m, rr: rp - 1.25 * m }; };
  // contact ratio, closed form: (sqrt(ra1^2-rb1^2)+sqrt(ra2^2-rb2^2) - a sin(alpha)) / (pi m cos(alpha))
  function contactClosed(g1, g2, a, m, fault) {
    const L = Math.sqrt(g1.ra * g1.ra - g1.rb * g1.rb) + Math.sqrt(g2.ra * g2.ra - g2.rb * g2.rb) - a * Math.sin(ALPHA);
    const pb = fault === "cosA" ? Math.PI * m * Math.cos(ALPHA) * Math.cos(ALPHA) : Math.PI * m * Math.cos(ALPHA);
    return L / pb;
  }
  // the same number by walking the line of action: length of the stretch where both addendum circles hold
  function contactNumeric(g1, g2, a, m) {
    const Lt = a * Math.sin(ALPHA); // distance between the two tangent points
    const steps = 400000; let inside = 0;
    // s measured from pinion tangent point T1 towards T2; contact points lie on the line of action
    for (let i = 0; i < steps; i++) {
      const s = -Lt + (3 * Lt) * (i + 0.5) / steps;           // wide window around the segment
      const d1 = Math.hypot(g1.rb, s + 0);                       // distance from O1 (T1 at s=0 on gear 1 side)
      const d2 = Math.hypot(g2.rb, Lt - s);                      // distance from O2
      if (d1 <= g1.ra && d2 <= g2.ra) inside++;
    }
    return (inside * (3 * Lt) / steps) / (Math.PI * m * Math.cos(ALPHA));
  }
  // tip of the driven gear must not reach inside the pinion's base circle region: sqrt(ra^2-rb^2) <= a sin(alpha)
  function interferenceMargins(g1, g2, a) {
    const Lt = a * Math.sin(ALPHA);
    return { m1: Lt - Math.sqrt(g2.ra * g2.ra - g2.rb * g2.rb), m2: Lt - Math.sqrt(g1.ra * g1.ra - g1.rb * g1.rb) };
  }

  // ---------- reading the SVG ----------
  function readSvg(text) {
    const gears = {};
    const re = /<g id="gear-([A-Za-z0-9]+)"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)(?: rotate\(([-\d.]+)\))?"[^>]*>([\s\S]*?)<\/g>/g;
    let m;
    while ((m = re.exec(text))) {
      const body = m[5];
      const d = /<path class="cut"[^>]* d="([^"]+)"/.exec(body);
      const pts = [];
      if (d) { const r2 = /([-\d.]+),([-\d.]+)/g; let q; while ((q = r2.exec(d[1]))) pts.push([+q[1], +q[2]]); }
      const pr = /<circle class="pitch[^"]*"[^>]* r="([\d.]+)"/.exec(body);
      const br = /<circle class="bore[^"]*"[^>]* r="([\d.]+)"/.exec(body);
      gears[m[1]] = { cx: +m[2], cy: +m[3], rot: m[4] ? +m[4] : 0, pts, pitchR: pr ? +pr[1] : NaN, boreR: br ? +br[1] : NaN };
    }
    return gears;
  }
  // teeth = rising crossings of the pitch circle by the outline; thickness = arc between a rising and the next falling crossing
  function measureOutline(pts, rp) {
    const n = pts.length; if (!n) return { teeth: 0, tip: NaN, root: NaN, thick: [] };
    const R = pts.map(p => Math.hypot(p[0], p[1])), A = pts.map(p => Math.atan2(p[1], p[0]));
    let tip = -Infinity, root = Infinity; for (const r of R) { tip = Math.max(tip, r); root = Math.min(root, r); }
    const cross = []; // {angle, up}
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n; const r0 = R[i] - rp, r1 = R[j] - rp;
      if ((r0 < 0 && r1 >= 0) || (r0 >= 0 && r1 < 0)) {
        const f = r0 / (r0 - r1); let da = A[j] - A[i]; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        cross.push({ a: A[i] + f * da, up: r1 >= 0 });
      }
    }
    const teeth = cross.filter(c => c.up).length, thick = [];
    for (let i = 0; i < cross.length; i++) {
      if (!cross[i].up) continue; const nx = cross[(i + 1) % cross.length]; if (nx.up) continue;
      let da = nx.a - cross[i].a; while (da < 0) da += 2 * Math.PI; while (da > 2 * Math.PI) da -= 2 * Math.PI;
      thick.push(rp * da);
    }
    return { teeth, tip, root, thick };
  }

  // Run every check on an SVG pair. spec/module may be overridden for the break tests.
  function runChecks(cutText, meshText, opt) {
    opt = opt || {}; const spec = opt.spec || SPEC, m = opt.module || MODULE, tol = 0.01;
    const rows = []; // {group, label, ok, detail, kind:'check'|'construction'}
    const add = (group, label, ok, detail, kind) => rows.push({ group, label, ok: !!ok, detail, kind: kind || "check" });
    const cut = readSvg(cutText), mesh = readSvg(meshText);
    const counted = {};
    for (const id of Object.keys(spec)) {
      const g = cut[id]; const z = spec[id]; const e = geom(z, m);
      if (!g) { add("gear " + id, "present in file", false, "missing"); continue; }
      const me = measureOutline(g.pts, e.rp); counted[id] = me.teeth;
      add("gear " + id, "teeth recounted from the outline", me.teeth === z, me.teeth + " counted, " + z + " expected");
      add("gear " + id, "tip radius", Math.abs(me.tip - e.ra) < tol, me.tip.toFixed(3) + " mm measured, " + e.ra.toFixed(3) + " expected");
      add("gear " + id, "root radius", Math.abs(me.root - e.rr) < tol, me.root.toFixed(3) + " mm measured, " + e.rr.toFixed(3) + " expected");
      const th = me.thick.length ? me.thick.reduce((a, b) => a + b, 0) / me.thick.length : NaN;
      const spread = me.thick.length ? Math.max.apply(null, me.thick) - Math.min.apply(null, me.thick) : NaN;
      add("gear " + id, "tooth thickness at the pitch circle (half the circular pitch)", Math.abs(th - Math.PI * m / 2) < tol && spread < tol, th.toFixed(3) + " mm measured, " + (Math.PI * m / 2).toFixed(3) + " expected, spread " + spread.toFixed(4));
      add("gear " + id, "pitch circle in the file equals module x teeth / 2", Math.abs(g.pitchR - e.rp) < 1e-6, g.pitchR + " read, " + e.rp + " expected");
    }
    // centre distances from the meshed drawing
    const mg = (id) => mesh[id];
    for (const [i, j] of MESHES) {
      const A = mg(i), B = mg(j);
      if (!A || !B) { add("mesh " + i + "-" + j, "present", false, "missing"); continue; }
      const dist = Math.hypot(A.cx - B.cx, A.cy - B.cy);
      const zi = counted[i] !== undefined ? counted[i] : spec[i], zj = counted[j] !== undefined ? counted[j] : spec[j];
      const exp = m * (zi + zj) / 2;
      add("mesh " + i + "-" + j, "centre distance equals module x (z1 + z2) / 2", Math.abs(dist - exp) < 1e-3, dist.toFixed(3) + " mm read, " + exp.toFixed(3) + " expected");
      add("mesh " + i + "-" + j, "centre distance equals the two pitch radii read from the file", Math.abs(dist - (A.pitchR + B.pitchR)) < 1e-3, dist.toFixed(3) + " vs " + (A.pitchR + B.pitchR).toFixed(3));
    }
    if (mesh.A2 && mesh.A3) add("train A", "A3 sits on A2's centre (one shaft)", Math.hypot(mesh.A2.cx - mesh.A3.cx, mesh.A2.cy - mesh.A3.cy) < 1e-6, "centres " + mesh.A2.cx + "," + mesh.A2.cy + " and " + mesh.A3.cx + "," + mesh.A3.cy);
    // trains as exact fractions from recounted teeth
    const z = (id) => BigInt(counted[id] !== undefined ? counted[id] : 0);
    const trains = [];
    const rA = frac(z("A2") * z("A4"), z("A1") * z("A3") || 1n);
    const rB = frac(z("E"), z("V") || 1n);
    trains.push({ id: "A", name: "12:1 reduction like a clock's (hour wheel not on the minute axis, so it cannot drive concentric hands)", ratio: rA, target: frac(12, 1), targetNote: "12 exactly", claim: frac(12, 1) });
    const tB = opt.venusTarget || frac(3652564, 2247008);
    trains.push({ id: "B", name: "Earth to Venus (orrery)", ratio: rB, target: tB, targetNote: "365.2564 / 224.7008 (memory)", claim: frac(13, 8) });
    for (const t of trains) {
      t.err = fsub(t.ratio, t.target); t.relPct = fdec(frac(t.err.n * 100n * t.target.d, t.err.d * t.target.n), 4);
      add("train " + t.id, "ratio from recounted teeth equals " + fstr(t.claim) + " as an exact fraction", fcmp(t.ratio, t.claim) === 0, fstr(t.ratio) + " = " + fdec(t.ratio, 6));
    }
    // contact ratio (closed form vs walking the line of action) with radii MEASURED from the file
    const contact = [];
    for (const [i, j] of MESHES) {
      if (!cut[i] || !cut[j] || !spec[i]) continue;
      const mi = measureOutline(cut[i].pts, geom(spec[i], m).rp), mj = measureOutline(cut[j].pts, geom(spec[j], m).rp);
      const g1 = geom(spec[i], m), g2 = geom(spec[j], m); g1.ra = mi.tip; g2.ra = mj.tip;
      const a = m * (spec[i] + spec[j]) / 2;
      const cc = contactClosed(g1, g2, a, m, opt.fault), cn = contactNumeric(g1, g2, a, m), im = interferenceMargins(g1, g2, a);
      contact.push({ pair: i + "-" + j, closed: cc, numeric: cn, margins: im, a });
      add("mesh " + i + "-" + j, "contact ratio, closed form against walking the line of action", Math.abs(cc - cn) < 0.002, cc.toFixed(4) + " closed, " + cn.toFixed(4) + " walked");
      add("mesh " + i + "-" + j, "no involute interference (tip of each gear stays on the involute part of the other)", im.m1 >= 0 && im.m2 >= 0, "margins " + im.m1.toFixed(2) + " and " + im.m2.toFixed(2) + " mm");
    }
    // bore sanity read from file: by construction
    return { rows, trains, contact, counted };
  }

  return { SPEC, MESHES, MODULE, ALPHA, frac, fmul, fsub, fabs, fcmp, fstr, fdec, parseDecimal, gcd, sbBest, bruteBest, brocotAgreesWithBrute, convergents, geom, contactClosed, contactNumeric, interferenceMargins, readSvg, measureOutline, runChecks };
});
