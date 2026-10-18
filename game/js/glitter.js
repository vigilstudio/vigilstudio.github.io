// Light on the water: the pure parts (no DOM, no canvas) of the look step of milestone 33. Lanterns (yours and the ones
// you can see), lit beacons and the lit lighthouse lay short wavering streaks of their light on the water near them, and
// the moon lays a path of glints on the sea on the side of the screen where it stands in the sky strip. Each browser works the streaks out
// alone from the positions and lights it already holds; nothing is sent or received and nothing is saved. Two players
// may see a streak a little differently (positions are eased); the tile a streak sits on is the same for everyone.
// Reduced motion keeps the streaks, steady and in place; the governor draws fewer (level 1) or none (level 0).
import { moonAt } from "./living.js";

export const STREAK_CAP = [0, 90, 240];      // streaks one frame may draw at governor level 0, 1 and 2 (lights' and moon's together)
export const MOON_CAP = [0, 18, 48];         // of those, the moon's path takes at most this many
export const DENSITY = 0.6;                  // share of the water tiles in a light's reach that carry a streak
export const REACH = 0.92;                   // streaks lie out to this share of a light's radius
export const PEAK = 0.6;                     // opacity of the brightest lantern streak (right beside its lamp)
export const MOON_PEAK = 0.5;                // opacity of the brightest moon streak (at the moon's brightest)
export const MOON_HALF = 2.2;                // the moon's path is this many tiles wide each side of its middle
export const WARM = [255, 214, 140];         // a plain lantern's, a beacon's and the lighthouse's streak colour
export const MOON_RGB = [214, 226, 250];
export const WIND = 0.0016, SPEED = 0.0011;  // how fast a streak sways (radians a ms) and how fast it brightens and dims

const sm = (f) => { const x = Math.min(1, Math.max(0, f)); return x * x * (3 - 2 * x); };

// How a streak looks at time t. `h` is the tile's own number in [0, 1) (fixed by the seed, so the same for everyone).
// { dx: sideways sway in tiles, w: length in tiles, a: 0..1 how bright it is now }. Reduced motion: no sway, no change.
export function streakState(t, h, reduce) {
  const ph = h * 6.2831853;
  if (reduce) return { dx: 0, w: 0.9, a: 0.85 };
  return { dx: Math.sin(t * WIND + ph) * 0.18 + Math.sin(t * WIND * 2.7 + ph * 3) * 0.06, w: 0.9 + 0.2 * Math.sin(t * SPEED * 1.3 + ph * 2), a: 0.72 + 0.28 * Math.sin(t * SPEED + ph) };
}

// How much of a light reaches a point `d` tiles away when its radius is `r`: 1 beside it, falling smoothly to 0 at REACH of the radius.
export const fall = (d, r) => { if (!(r > 0 && d >= 0)) return 0; const x = d / (r * REACH); return sm(1 - x * x); };

// The streaks the lights lay on the water in view.
//   lights: [{ x, y, r (tiles), f (0..1, how strongly it burns), rgb? }]   isWater(x, y) -> bool for a tile
//   h(x, y) -> [0, 1) the tile's own number          view: { x0, y0, x1, y1 } the tiles in view (inclusive)
// Returns [{ x, y, w, a, rgb }] (tile coordinates of the streak's middle, length in tiles, opacity), at most `cap` of them.
// Lights are taken in the order given, so put the player's own first: when the cap is reached the later ones are the ones left out.
export function lightStreaks(lights, isWater, h, view, t, reduce, cap) {
  const out = [];
  if (!(cap > 0) || !Array.isArray(lights)) return out;
  for (const L of lights) {
    if (!L || !Number.isFinite(L.x) || !Number.isFinite(L.y) || !(L.r > 0)) continue;
    const f = Number.isFinite(L.f) ? Math.min(1, Math.max(0, L.f)) : 1, R = L.r * REACH;
    const xa = Math.max(view.x0, Math.floor(L.x - R)), xb = Math.min(view.x1, Math.ceil(L.x + R));
    const ya = Math.max(view.y0, Math.floor(L.y - R)), yb = Math.min(view.y1, Math.ceil(L.y + R));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const n = h(x, y);
      if (!(n < DENSITY) || !isWater(x, y)) continue;
      const d = Math.hypot(x + 0.5 - L.x, y + 0.5 - L.y), k = fall(d, L.r) * f;
      if (!(k > 0.02)) continue;
      const s = streakState(t, n / DENSITY, reduce);
      const a = PEAK * k * s.a;
      if (!(a > 0.01)) continue;
      out.push({ x: x + 0.5 + s.dx, y: y + 0.2 + 0.6 * h(y, x), w: s.w * (0.55 + 0.6 * k), a, rgb: L.rgb || WARM });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

// The moon's path: glints on the water tiles in view in a column under the moon. `cx` is the column's middle in tiles
// (the caller gives the moon's side of the sky strip, spread over the width of the screen and turned into tile units); `hour` is the night hour.
// Brightest when the moon is high, none when it is low; fainter toward the bottom of the view, narrower toward the
// bottom. `wet` (0..1) dims it in mist and rain. At most `cap` streaks.
export function moonStreaks(hour, cx, isWater, h, view, t, reduce, cap, wet = 0) {
  const out = [], moon = moonAt(hour), lit = moon.lit * (1 - 0.7 * Math.min(1, Math.max(0, wet || 0)));
  if (!(cap > 0) || !(lit > 0.02) || !Number.isFinite(cx)) return out;
  const rows = Math.max(1, view.y1 - view.y0);
  for (let y = view.y0; y <= view.y1; y++) {
    const v = (y - view.y0) / rows, half = MOON_HALF * (1 - 0.45 * v);
    for (let x = Math.max(view.x0, Math.floor(cx - half)); x <= Math.min(view.x1, Math.ceil(cx + half)); x++) {
      const n = h(x, y);
      if (!(n < DENSITY) || !isWater(x, y)) continue;
      const across = Math.abs(x + 0.5 - cx) / half, k = sm(1 - across) * (1 - 0.55 * v);
      const s = streakState(t, n / DENSITY, reduce), a = MOON_PEAK * lit * k * s.a;
      if (!(a > 0.01)) continue;
      out.push({ x: x + 0.5 + s.dx, y: y + 0.2 + 0.6 * h(y, x), w: s.w * (0.6 + 0.5 * k), a, rgb: MOON_RGB });
      if (out.length >= cap) return out;
    }
  }
  return out;
}
