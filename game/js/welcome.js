// Welcoming a newcomer (milestone 34). Nothing is sent: it uses only what each browser already holds, the other
// players' positions and the rank number each one told the room (js/rank.js).
//   A player with no help points yet sees a soft gold ring toward the nearest player who has a rank.
//   A player with a rank who stands within WELCOME_R tiles of a player who has no rank yet, for WELCOME_S seconds in a
//   row, earns the help point "welcome" (one per newcomer per visit, and at most one every GAPS_MS.welcome in rank.js).
// Cosmetic like the rank itself: a modified client can claim any rank or stand anywhere (nothing can check what another
// browser says), so the worst a liar gets is gold marks; the gap and the one-per-newcomer key keep it slow.
import { MAX_RANK } from "./rank.js";

export const WELCOME_R = 3;       // tiles between the two players
export const WELCOME_S = 4;       // seconds in a row they must stay that close
export const STEP_MAX_S = 0.25;   // the most time one tick can add (a stalled page cannot finish the wait in one jump)
export const MAX_TRACK = 64;      // newcomers timed at once (a full list refuses new ones)

const rankOf = (p) => (Number.isInteger(p.rank) && p.rank > 0 && p.rank <= MAX_RANK ? p.rank : 0);
const posOf = (p) => ({ x: Number.isFinite(p.tx) ? p.tx : p.x, y: Number.isFinite(p.ty) ? p.ty : p.y });

// The nearest other player who has a rank, or null. peers is any iterable of { id, rank, tx, ty }.
export function nearestRanked(me, peers) {
  let best = null;
  for (const p of peers) {
    if (rankOf(p) < 1) continue;
    const q = posOf(p);
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    const d = Math.hypot(q.x - me.x, q.y - me.y);
    if (!best || d < best.dist) best = { id: p.id, x: q.x, y: q.y, dist: d, near: d <= WELCOME_R };
  }
  return best;
}

export function createWelcome(me, peers, rank, opts = {}) {
  const now = opts.now || (() => performance.now());
  const onEvent = opts.onEvent || (() => {});
  const near = new Map(); // newcomer's seed -> seconds in a row beside me
  const done = new Set(); // seeds already credited this visit: no second point can come from them, so they are not timed or counted as being helped
  let last = now();
  return {
    // Call every frame. Returns { mark, helping }: mark is what a newcomer is shown, helping is true while a player
    // with a rank stands beside a newcomer.
    tick() {
      const t = now(), dt = Math.max(0, Math.min(STEP_MAX_S, (t - last) / 1000)); last = t;
      let helping = false;
      const here = new Set();
      if (rank.rank >= 1) {
        for (const p of peers.values()) {
          if (rankOf(p) > 0 || !Number.isInteger(p.seed) || done.has(p.seed)) continue;
          const q = posOf(p);
          if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || Math.hypot(q.x - me.x, q.y - me.y) > WELCOME_R) continue;
          here.add(p.seed);
          if (!near.has(p.seed) && near.size >= MAX_TRACK) continue;
          const s = (near.get(p.seed) || 0) + dt;
          if (s >= WELCOME_S) { if (rank.credit("welcome", String(p.seed))) { onEvent("welcomed"); done.add(p.seed); near.delete(p.seed); here.delete(p.seed); } else near.set(p.seed, WELCOME_S); }
          else near.set(p.seed, s);
        }
      }
      helping = here.size > 0; // credited newcomers were taken out of `here`, so they no longer count
      for (const k of [...near.keys()]) if (!here.has(k)) near.delete(k);
      const mark = rank.points === 0 ? nearestRanked(me, peers.values()) : null;
      return { mark, helping };
    },
    timed: () => near.size,
    reset() { near.clear(); done.clear(); last = now(); },
  };
}
