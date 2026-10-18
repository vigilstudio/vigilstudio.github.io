// Footprints and wakes: the pure parts (no DOM, no canvas) of the look step of milestone 29. A walker leaves a footprint
// every STRIDE tiles on sand and meadow and a small wake on shallow water; both fade away in a few seconds, so a group's
// path across the island can be read for a moment. Every browser works the marks out alone from the positions it already
// holds (its own, and the eased positions of the players it can see); nothing is sent or received, and nothing is saved.
// Two players may see a walker's marks a little differently (positions arrive ten times a second and are eased).
export const STRIDE = 0.6;          // tiles walked between two footprints
export const FOOT_LIFE_MS = 6000;   // a footprint has faded away after this long
export const WAKE_LIFE_MS = 2200;   // and a wake after this long
export const WAKE_STRIDE = 0.45;    // tiles walked between two wakes
export const FOOT_CAP = 36;         // footprints kept per walker (the oldest is dropped when a new one is made)
export const WAKE_CAP = 8;          // wakes kept per walker
export const MARKS_CAP = 480;       // marks kept in all (12 players at most: MAX_PEERS 11 others and you)
export const MARKS_DRAWN = [0, 120, 300]; // how many (the newest) a frame may draw at governor level 0, 1 and 2
export const JUMP = 2.5;            // a step longer than this many tiles is a jump (a teleport, a lagging tab): no marks across it
export const FOOT_ALPHA = { sand: 0.42, meadow: 0.3 }; // opacity of a new footprint on each ground
export const WAKE_ALPHA = 0.36;

// How strongly a ground takes a footprint, as a name: "sand", "meadow", "wake" (shallow water) or null (nothing: grass,
// deep water, trees and rocks leave no mark). `kindAt(x, y)` is the caller's own lookup of the tile under a point.
export function groundOf(kindAt, x, y) {
  const k = kindAt(x, y);
  return k === "sand" || k === "meadow" || k === "wake" ? k : null;
}

// Opacity of a footprint of age `age` (ms): full at first, then fading in a straight line to 0 at FOOT_LIFE_MS.
export function footAlpha(age, ground) {
  const a = FOOT_ALPHA[ground];
  if (!a || !(age >= 0) || age >= FOOT_LIFE_MS) return 0;
  return a * (1 - age / FOOT_LIFE_MS);
}
// A wake's ring of age `age` (ms): {a, r} opacity and radius in tiles. The ring spreads from 0.09 to 0.5 tile while it
// fades. With `still` (reduced motion, or the lowest drawing levels) it does not spread: a small ring that only fades.
export function wakeRing(age, still) {
  if (!(age >= 0) || age >= WAKE_LIFE_MS) return { a: 0, r: 0 };
  const f = age / WAKE_LIFE_MS;
  return { a: WAKE_ALPHA * (1 - f) * (1 - f * 0.3), r: still ? 0.22 : 0.09 + 0.41 * Math.sqrt(f) };
}

export function createTracks() {
  let marks = [];             // oldest first: { o, x, y, ang, side, ground, t }
  const anchors = new Map();  // walker id -> { x, y, hx, hy, acc, side }
  const count = (o, wake) => { let n = 0; for (const m of marks) if (m.o === o && (m.ground === "wake") === wake) n++; return n; };

  // Call once a frame with the time t (ms) and every walker in view [{ id, x, y, moving }]; `kindAt` names the ground under
  // a point. Makes the new marks and drops the old ones.
  function update(t, walkers, kindAt) {
    const live = new Set();
    for (const w of walkers) {
      if (!Number.isFinite(w.x) || !Number.isFinite(w.y)) continue;
      live.add(w.id);
      let a = anchors.get(w.id);
      if (!a) { anchors.set(w.id, { x: w.x, y: w.y, hx: 1, hy: 0, acc: 0, side: 1 }); continue; }
      const dx = w.x - a.x, dy = w.y - a.y, d = Math.hypot(dx, dy), px = a.x, py = a.y;
      if (d > JUMP) { Object.assign(a, { x: w.x, y: w.y, acc: 0 }); continue; } // a jump: start again from here
      if (d > 1e-4) { a.hx = dx / d; a.hy = dy / d; }
      a.x = w.x; a.y = w.y;
      if (!w.moving) { a.acc = 0; continue; }
      // Walk along the step just taken and drop a mark each time a stride is complete (a slow frame that covers more than
      // one stride makes more than one mark), on whatever ground that point is.
      let s = 0, left = a.acc;
      for (let n = 0; n < 8; n++) {
        const ground = groundOf(kindAt, px + a.hx * Math.min(d, s), py + a.hy * Math.min(d, s));
        const need = ground === "wake" ? WAKE_STRIDE : STRIDE;
        if (left + (d - s) < need) { left += d - s; s = d; break; }
        s += need - left; left = 0;
        const x = px + a.hx * s, y = py + a.hy * s, g = groundOf(kindAt, x, y);
        if (!g) continue;
        const wake = g === "wake", off = wake ? 0 : 0.11 * (a.side = -a.side); // feet alternate left and right of the line walked
        marks.push({ o: w.id, x: x - a.hy * off - a.hx * 0.05, y: y + a.hx * off - a.hy * 0.05, ang: Math.atan2(a.hy, a.hx), side: a.side, ground: g, t });
        const cap = wake ? WAKE_CAP : FOOT_CAP;
        if (count(w.id, wake) > cap) { const i = marks.findIndex(m => m.o === w.id && (m.ground === "wake") === wake); if (i >= 0) marks.splice(i, 1); }
      }
      a.acc = Math.min(left, STRIDE);
    }
    for (const id of [...anchors.keys()]) if (!live.has(id)) anchors.delete(id); // a walker who left keeps no anchor (the marks fade)
    marks = marks.filter(m => t - m.t < (m.ground === "wake" ? WAKE_LIFE_MS : FOOT_LIFE_MS) && t >= m.t);
    if (marks.length > MARKS_CAP) marks = marks.slice(marks.length - MARKS_CAP);
  }
  return {
    update,
    // The newest `max` marks, oldest first (so newer marks are drawn on top).
    list: (max = MARKS_CAP) => (max >= marks.length ? marks : marks.slice(marks.length - Math.max(0, max))),
    size: () => marks.length,
    clear: () => { marks = []; anchors.clear(); },
  };
}
