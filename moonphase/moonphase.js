// moonphase.js - times of new moon, first quarter, full moon and last quarter, and the illuminated fraction.
// Single-file ES module, no dependencies. MIT licence (see LICENSE next to it). Written by Claude, an AI model.
//
// Method: the phase-time series of Jean Meeus, "Astronomical Algorithms" (2nd ed., 1998), chapter 49, and the
// low-accuracy phase angle of chapter 48. EVERY coefficient below was typed from memory, not copied from the
// book or a file: the page compares the result with astronomy-engine to catch typing errors, and that comparison
// is the only thing vouching for them. The delta-T polynomials (Espenak and Meeus) are also from memory.
//
// Times are returned as JavaScript Dates in UT (the clock Moon-watchers use), plus the same instant in
// dynamical time as a Julian Ephemeris Day (jde), which does not depend on any delta-T model.

const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);
const UNIX_JD = 2440587.5;

export const PHASES = ["new", "first quarter", "full", "last quarter"];

// delta T = TT - UT in seconds (Espenak & Meeus polynomials, from memory). Years outside 1900-2150 use the
// long-term parabola, which is only a rough guide: the real value there is not predictable.
export function deltaT(year) {
  const y = year;
  let t;
  if (y >= 1900 && y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y >= 1920 && y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3; }
  if (y >= 1941 && y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
  if (y >= 1961 && y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
  if (y >= 1986 && y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y >= 2005 && y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
  if (y >= 2050 && y <= 2150) { return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y); }
  return -20 + 32 * ((y - 1820) / 100) ** 2;
}

const yearOfJD = (jd) => 2000 + (jd - 2451545) / 365.25;
const jdToDate = (jd) => new Date((jd - UNIX_JD) * 86400000);
const dateToJD = (d) => d.getTime() / 86400000 + UNIX_JD;

// UT Julian Day <-> dynamical-time Julian Day
const jdeFromJd = (jd) => jd + deltaT(yearOfJD(jd)) / 86400;
const jdFromJde = (jde) => jde - deltaT(yearOfJD(jde)) / 86400;

// Meeus ch. 49. k is an integer for new moon, +0.25 first quarter, +0.5 full, +0.75 last quarter; k = 0 is the
// new moon of January 2000. Returns the JDE of that phase.
export function phaseJDE(k) {
  const q = Math.round((k - Math.floor(k)) * 4) % 4;
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  const E2 = E * E;
  let c;
  if (q === 0) {
    c = -0.40720 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F)
      + 0.00739 * E * sin(Mp - M) - 0.00514 * E * sin(Mp + M) + 0.00208 * E2 * sin(2 * M)
      - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
      - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O) - 0.00007 * sin(Mp + 2 * M)
      + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
      - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  } else if (q === 2) {
    c = -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F)
      + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M) + 0.00209 * E2 * sin(2 * M)
      - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
      - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O) - 0.00007 * sin(Mp + 2 * M)
      + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
      - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  } else {
    c = -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M) + 0.00862 * sin(2 * Mp)
      + 0.00804 * sin(2 * F) + 0.00454 * E * sin(Mp - M) + 0.00204 * E2 * sin(2 * M)
      - 0.00180 * sin(Mp - 2 * F) - 0.00070 * sin(Mp + 2 * F) - 0.00040 * sin(3 * Mp)
      - 0.00034 * E * sin(2 * Mp - M) + 0.00032 * E * sin(M + 2 * F) + 0.00032 * E * sin(M - 2 * F)
      - 0.00028 * E2 * sin(Mp + 2 * M) + 0.00027 * E * sin(2 * Mp + M) - 0.00017 * sin(O)
      - 0.00005 * sin(Mp - M - 2 * F) + 0.00004 * sin(2 * Mp + 2 * F) - 0.00004 * sin(Mp + M + 2 * F)
      + 0.00004 * sin(Mp - 2 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(3 * M)
      + 0.00002 * sin(2 * Mp - 2 * F) + 0.00002 * sin(Mp - M + 2 * F) - 0.00002 * sin(3 * Mp + M);
    const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M)
      + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
    c += q === 1 ? W : -W;
  }
  // planetary arguments: fourteen small additive terms
  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165],
    [251.83 + 26.651886 * k, 0.000164], [349.42 + 36.412478 * k, 0.000126],
    [84.66 + 18.206239 * k, 0.000110], [141.74 + 53.303771 * k, 0.000062],
    [207.14 + 2.453732 * k, 0.000060], [154.84 + 7.306860 * k, 0.000056],
    [34.52 + 27.261239 * k, 0.000047], [207.19 + 0.121824 * k, 0.000042],
    [291.34 + 1.844379 * k, 0.000040], [161.72 + 24.198154 * k, 0.000037],
    [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023],
  ];
  for (const [arg, amp] of A) c += amp * sin(arg);
  return jde + c;
}

// One phase by its index n (n = 4k + q, q = 0 new, 1 first quarter, 2 full, 3 last quarter).
export function phase(n) {
  const jde = phaseJDE(n / 4);
  const jd = jdFromJde(jde);
  return { name: PHASES[((n % 4) + 4) % 4], index: n, date: jdToDate(jd), jde };
}

// All phases between two dates (inclusive), oldest first.
export function phasesBetween(from, to) {
  if (!(from instanceof Date) || !(to instanceof Date) || isNaN(from) || isNaN(to)) throw new TypeError("phasesBetween needs two valid Dates");
  if (to < from) throw new RangeError("end date is before start date");
  let n = Math.floor((yearOfJD(dateToJD(from)) - 2000) * 12.3685 * 4) - 8;
  const out = [];
  for (let guard = 0; guard < 400000; n++, guard++) {
    const p = phase(n);
    if (p.date > to) { if (guard > 8) break; else continue; }
    if (p.date >= from) out.push(p);
  }
  return out;
}

// The next phase strictly after a date, and the last one at or before it.
export function nextPhase(date) {
  const r = phasesBetween(new Date(date.getTime() + 1), new Date(date.getTime() + 8 * 86400000));
  return r[0];
}
export function previousPhase(date) {
  const r = phasesBetween(new Date(date.getTime() - 8 * 86400000), date);
  return r[r.length - 1];
}

// Meeus ch. 48 low-accuracy phase angle i (degrees, 0 = full, 180 = new) and the illuminated fraction (1 + cos i) / 2.
export function phaseAngle(date) {
  const jd = dateToJD(date);
  const T = (jdeFromJd(jd) - 2451545) / 36525;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T ** 3 / 545868 - T ** 4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T ** 3 / 24490000;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T ** 3 / 69699 - T ** 4 / 14712000;
  return 180 - D - 6.289 * sin(Mp) + 2.100 * sin(M) - 1.274 * sin(2 * D - Mp) - 0.658 * sin(2 * D)
    - 0.214 * sin(2 * Mp) - 0.110 * sin(D);
}
export function illuminatedFraction(date) {
  if (!(date instanceof Date) || isNaN(date)) throw new TypeError("illuminatedFraction needs a valid Date");
  return (1 + cos(phaseAngle(date))) / 2;
}
