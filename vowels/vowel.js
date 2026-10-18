/* Vowel synthesis and formant measurement. Plain script (no modules, no libraries); sets a global `Vowel`.
   Made by Claude, an AI model. */
(function (root) {
  "use strict";
  var SR = 10000;
  // Mean formants for men, F1 F2 F3 in Hz, from Peterson & Barney (1952) as recalled by the page's author.
  // src "summary": the row's numbers were seen in a search summary of a course table that credits P&B 1952.
  // src "memory": not seen in any fetched or searched text this run; typed from memory.
  var TABLE = [
    { ipa: "i", word: "heed",  F: [270, 2290, 3010], src: "summary" },
    { ipa: "ɪ", word: "hid",   F: [390, 1990, 2550], src: "summary" },
    { ipa: "ɛ", word: "head",  F: [530, 1840, 2480], src: "summary" },
    { ipa: "æ", word: "had",   F: [660, 1720, 2410], src: "summary" },
    { ipa: "ɑ", word: "hod",   F: [730, 1090, 2440], src: "summary" },
    { ipa: "ɔ", word: "hawed", F: [570, 840, 2410],  src: "memory" },
    { ipa: "ʊ", word: "hood",  F: [440, 1020, 2240], src: "memory" },
    { ipa: "u", word: "who'd", F: [300, 870, 2240],  src: "memory" },
    { ipa: "ʌ", word: "hud",   F: [640, 1190, 2390], src: "memory" }
  ];
  var BWMAX = 500; // poles wider than this are not taken as formants
  var BW = [60, 90, 120]; // bandwidths in Hz, a common textbook choice, not measured

  function fft(re, im) { // in place, length a power of two
    var n = re.length, i, j, k, m, t;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var a = i + k, b = a + len / 2;
          var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  // Klatt-style digital resonator coefficients for centre F, bandwidth B at rate sr.
  function res(F, B, sr) {
    var T = 1 / sr, c = -Math.exp(-2 * Math.PI * B * T), b = 2 * Math.exp(-Math.PI * B * T) * Math.cos(2 * Math.PI * F * T);
    return { a: 1 - b - c, b: b, c: c };
  }

  // opts: F (array of 2 or 3 Hz), f0, dur (s), sr, source ("glottal" | "impulse")
  function render(opts) {
    var sr = opts.sr || SR, n = Math.round((opts.dur || 0.8) * sr), x = new Float32Array(n), i, k;
    var src = new Float64Array(n), f0 = opts.f0 || 110;
    if (opts.source === "impulse") src[0] = 1;
    else { // Rosenberg glottal pulse, then its first difference (flow derivative, includes lip radiation)
      var ph = 0, Tp = 0.4, Tn = 0.16, g = new Float64Array(n);
      for (i = 0; i < n; i++) {
        g[i] = ph < Tp ? 0.5 * (1 - Math.cos(Math.PI * ph / Tp)) : ph < Tp + Tn ? Math.cos(Math.PI * (ph - Tp) / (2 * Tn)) : 0;
        ph += f0 / sr; if (ph >= 1) ph -= 1;
      }
      for (i = 1; i < n; i++) src[i] = g[i] - g[i - 1];
    }
    var y = src;
    for (k = 0; k < opts.F.length; k++) {
      var r = res(opts.F[k], BW[k], sr), out = new Float64Array(n), y1 = 0, y2 = 0;
      for (i = 0; i < n; i++) { var v = r.a * y[i] + r.b * y1 + r.c * y2; out[i] = v; y2 = y1; y1 = v; }
      y = out;
    }
    var peak = 0;
    for (i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
    for (i = 0; i < n; i++) x[i] = y[i] / (peak || 1) * 0.6;
    return x;
  }

  function hamming(len) { var w = new Float64Array(len); for (var i = 0; i < len; i++) w[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (len - 1)); return w; }

  function polyRoots(c) { // c: [1, a1..ap] highest power first, Durand-Kerner; returns [[re,im],...]
    var p = c.length - 1, r = [], i, j, it;
    for (i = 0; i < p; i++) { var th = 2 * Math.PI * i / p + 0.4; r.push([0.9 * Math.cos(th), 0.9 * Math.sin(th)]); }
    for (it = 0; it < 500; it++) {
      var moved = 0;
      for (i = 0; i < p; i++) {
        var zr = r[i][0], zi = r[i][1], nr = c[0], ni = 0;
        for (j = 1; j <= p; j++) { var t = nr * zr - ni * zi + c[j]; ni = nr * zi + ni * zr; nr = t; }
        var dr = 1, di = 0;
        for (j = 0; j < p; j++) if (j !== i) { var ar = zr - r[j][0], ai = zi - r[j][1]; var t2 = dr * ar - di * ai; di = dr * ai + di * ar; dr = t2; }
        var den = dr * dr + di * di; if (den === 0) continue;
        var qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
        r[i][0] = zr - qr; r[i][1] = zi - qi; moved = Math.max(moved, Math.abs(qr) + Math.abs(qi));
      }
      if (moved < 1e-12) break;
    }
    return r;
  }

  // Autocorrelation LPC of order p over x[start .. start+len), Hamming window. Returns coefficients a[0..p] (a[0]=1) and gain.
  function lpc(x, start, len, p) {
    var w = hamming(len), s = new Float64Array(len), i, k;
    for (i = 0; i < len; i++) s[i] = x[start + i] * w[i];
    var R = new Float64Array(p + 1);
    for (k = 0; k <= p; k++) { var acc = 0; for (i = k; i < len; i++) acc += s[i] * s[i - k]; R[k] = acc; }
    var a = new Float64Array(p + 1), e = R[0]; a[0] = 1;
    for (i = 1; i <= p; i++) {
      var lam = R[i]; for (k = 1; k < i; k++) lam += a[k] * R[i - k];
      var kk = -lam / e, prev = a.slice();
      for (k = 1; k < i; k++) a[k] = prev[k] + kk * prev[i - k];
      a[i] = kk; e *= (1 - kk * kk);
    }
    return { a: a, gain: e / len };
  }

  // Formants from LPC roots: poles in the upper half plane, bandwidth under 500 Hz, lowest nF by frequency.
  function formants(x, sr, nF, start, len, o) {
    o = o || {}; var bwMax = o.bwMax || BWMAX;
    var p = o.order || 2 * nF + 4, m = lpc(x, start, len, p), rts = polyRoots(Array.prototype.slice.call(m.a)), f = [];
    rts.forEach(function (z) {
      var mag = Math.hypot(z[0], z[1]), ang = Math.atan2(z[1], z[0]);
      if (z[1] <= 0 || mag >= 1) return;
      var fr = ang * sr / (2 * Math.PI), bw = -Math.log(mag) * sr / Math.PI;
      if (fr > 90 && fr < sr / 2 - 100 && bw < bwMax) f.push({ f: fr, bw: bw });
    });
    f.sort(function (u, v) { return u.f - v.f; });
    return { F: f.slice(0, nF).map(function (q) { return q.f; }), all: f, lpc: m, order: p };
  }

  // Magnitude spectrum (dB) of x[start..start+len) with a Hamming window; len a power of two.
  function spectrum(x, start, len) {
    var w = hamming(len), re = new Float64Array(len), im = new Float64Array(len), i;
    for (i = 0; i < len; i++) re[i] = x[start + i] * w[i];
    fft(re, im);
    var db = new Float64Array(len / 2);
    for (i = 0; i < len / 2; i++) db[i] = 20 * Math.log10(Math.hypot(re[i], im[i]) + 1e-12);
    return db;
  }
  // LPC envelope in dB at frequency hz, scaled by the caller.
  function envelope(m, hz, sr) {
    var w = 2 * Math.PI * hz / sr, re = 0, im = 0;
    for (var k = 0; k < m.a.length; k++) { re += m.a[k] * Math.cos(w * k); im -= m.a[k] * Math.sin(w * k); }
    return -20 * Math.log10(Math.hypot(re, im));
  }

  function nearest(F12, rows) { // nearest table row by distance in log F1, log F2
    var best = -1, bd = 1e9;
    rows.forEach(function (r, i) {
      var d = Math.hypot(Math.log(F12[0] / r.F[0]), Math.log(F12[1] / r.F[1]));
      if (d < bd) { bd = d; best = i; }
    });
    return { index: best, dist: bd };
  }

  // Round trip: render a vowel, measure it back from the samples. Returns measured formants.
  function roundTrip(F, f0, sr) {
    sr = sr || SR;
    var x = render({ F: F, f0: f0, dur: 0.8, sr: sr });
    var m = formants(x, sr, F.length, Math.round(0.25 * sr), 4096);
    return { x: x, measured: m.F, meas: m };
  }

  function peakNear(db, hz, sr, len, frac) { // parabolic peak of dB spectrum within +-frac of hz
    var df = sr / len, lo = Math.max(1, Math.floor(hz * (1 - frac) / df)), hi = Math.ceil(hz * (1 + frac) / df), b = lo, i;
    for (i = lo; i <= hi; i++) if (db[i] > db[b]) b = i;
    var y0 = db[b - 1], y1 = db[b], y2 = db[b + 1], d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
    return (b + (isFinite(d) ? d : 0)) * df;
  }

  // Self-checks. `fault` (or null) breaks exactly one input of one check, so the check should then fail.
  function checks(fault) {
    var out = [], i;
    function add(id, label, pass, detail, scope) { out.push({ id: id, label: label, pass: pass, detail: detail, scope: scope }); }
    // 1. The table's rows are ordered and inside the chart's range.
    var rows = TABLE.map(function (r) { return r.F.slice(); });
    if (fault === "table") { var t = rows[0][0]; rows[0][0] = rows[0][1]; rows[0][1] = t; }
    var badRows = [];
    rows.forEach(function (F, k) { if (!(F[0] < F[1] && F[1] < F[2] && F[0] >= 200 && F[0] <= 900 && F[1] >= 600 && F[1] <= 2800)) badRows.push(TABLE[k].ipa); });
    add("table", "Table rows have F1 < F2 < F3 and sit inside the chart", badRows.length === 0,
      badRows.length ? "outside: " + badRows.join(", ") : "all " + rows.length + " rows inside",
      "catches a swapped or out-of-range number; not a wrong number inside the range");
    // 2. The synthesiser's impulse response peaks where the formants were set (FFT peak picking).
    var setF = [500, 1500, 2500], rf = setF.slice(); if (fault === "synth") rf[1] = 1650;
    var imp = render({ F: rf, source: "impulse", dur: 0.5, sr: SR }), N = 4096, imp2 = new Float32Array(N); imp2.set(imp.subarray(0, N));
    var db = spectrum(imp2, 0, N), pk = setF.map(function (f) { return peakNear(db, f, SR, N, 0.15); });
    var worst = Math.max.apply(null, pk.map(function (p, k) { return Math.abs(p - setF[k]); }));
    add("synth", "Synthesiser: FFT peaks of its impulse response lie within 30 Hz of the set formants", worst < 30,
      "set " + setF.join("/") + ", peaks " + pk.map(function (p) { return p.toFixed(0); }).join("/") + " Hz", "catches a shifted resonator; uses the same frequencies as input");
    // 3. LPC on a signal with a known answer (impulse response, no pitch harmonics).
    var lsr = fault === "lpc" ? SR * 1.1 : SR;
    var lf = formants(imp, lsr, 3, 0, 4096).F;
    var lw = Math.max.apply(null, lf.map(function (p, k) { return Math.abs(p - setF[k]); }));
    add("lpc", "LPC code recovers a known 500/1500/2500 Hz filter to within 30 Hz", lf.length === 3 && lw < 30,
      "found " + lf.map(function (p) { return p.toFixed(0); }).join("/") + " Hz", "catches a wrong sample rate or order; no pitch harmonics in this test signal");
    // 4. FFT finds a 1000 Hz sine.
    var sine = new Float32Array(N); for (i = 0; i < N; i++) sine[i] = Math.sin(2 * Math.PI * (fault === "fft" ? 1100 : 1000) * i / SR);
    var sp = spectrum(sine, 0, N), pf = peakNear(sp, 1000, SR, N, 0.2);
    add("fft", "FFT puts a 1000 Hz sine at 1000 Hz (within 2 Hz)", Math.abs(pf - 1000) < 2, "peak at " + pf.toFixed(1) + " Hz", "catches a wrong frequency axis; not a wrong amplitude scale");
    // 5. Parseval: energy in time equals energy in frequency.
    var re = new Float64Array(N), im = new Float64Array(N), et = 0, ef = 0;
    for (i = 0; i < N; i++) { re[i] = imp2[i]; et += re[i] * re[i]; }
    fft(re, im); if (fault === "parseval") re[5] += 1;
    for (i = 0; i < N; i++) ef += re[i] * re[i] + im[i] * im[i];
    ef /= N;
    add("parseval", "FFT keeps energy (Parseval), to 1 part in a million", Math.abs(ef - et) / et < 1e-6, "time " + et.toPrecision(6) + ", frequency " + ef.toPrecision(6), "catches a broken butterfly or scaling; not a mirrored axis");
    return out;
  }

  var api = { SR: SR, TABLE: TABLE, BW: BW, BWMAX: BWMAX, fft: fft, render: render, lpc: lpc, formants: formants, spectrum: spectrum, envelope: envelope,
    nearest: nearest, roundTrip: roundTrip, checks: checks, peakNear: peakNear };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Vowel = api;
})(typeof self !== "undefined" ? self : this);
