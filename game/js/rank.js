// Progression: the lamplighter rank. It is earned only by helping other players, counted in your own browser and
// told to the room as one small number. Cosmetic only: it buys nothing, and a modified client can claim any rank
// (nothing here can check what another browser says it did).
//
// Deeds that count, each worth one point (the game calls credit() only when YOU were part of the help):
//   relight  a snuffed friend's lantern came back early while you stood by with a lit lantern
//   shade    a shade was driven off after you put light on it, together with at least one other player
//   gift     an item you gave was confirmed received
//   beacon   a beacon lit after you added fuel to it, together with another player
//   note     a keeper's note was finished after you added to it, together with another player
//   stone    the music stone glowed after you played one note of its tune with two other players
//   welcome  you have a rank and stood beside a player who has none yet for a few seconds (js/welcome.js; once per newcomer per visit)
// A deed is counted once (same key), a gift at most once every 4 s, a relight at most once every 10 s and a stone glow at most once every 30 s, a welcome at most once every 30 s, and the
// points stop at MAX_POINTS. Ranks come from the points; the number told to the room is the rank, 0 to MAX_RANK.
//
// Message (a number, never text), to everyone:
//   { k:"rk", r }   my rank: 0..MAX_RANK. Sent on change, to each newcomer, every 5 s.
// A receiver checks: sender said hello, exactly two fields, r a whole number 0..MAX_RANK (anything else is dropped),
// at most 2 a second per sender. The title shown is looked up in TITLES here; nothing the sender wrote is displayed.
import { createGuard } from "./guard.js";

export const TITLES = ["", "Lamplighter", "Beacon keeper", "Warden of the watch", "Long watcher"];
export const THRESHOLDS = [0, 3, 10, 25, 60]; // points needed for rank 0, 1, 2, 3, 4
export const MAX_RANK = TITLES.length - 1;
export const MAX_POINTS = 100000;
export const MAX_SEEN = 500;                   // deed keys remembered per visit; a full list refuses new ones, it never forgets old ones
export const GAPS_MS = { relight: 10000, gift: 4000, shade: 0, beacon: 0, note: 0, stone: 30000, welcome: 30000 };
export const DEEDS = Object.keys(GAPS_MS);
export const RESEND_MS = 5000;

export const rankFor = (points) => { let r = 0; THRESHOLDS.forEach((t, i) => { if (Number.isFinite(points) && points >= t) r = i; }); return r; };
export const titleFor = (r) => TITLES[Number.isInteger(r) && r >= 0 && r <= MAX_RANK ? r : 0];
export const cleanPoints = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(v, MAX_POINTS) : 0);
export const pointsToNext = (points) => { const r = rankFor(points); return r >= MAX_RANK ? 0 : THRESHOLDS[r + 1] - points; };

export function createRank(start = 0, opts = {}) {
  const now = opts.now || (() => performance.now());
  const onEvent = opts.onEvent || (() => {});
  const persist = opts.persist || (() => {});
  let points = cleanPoints(start);
  const seen = new Set(), lastAt = new Map();
  return {
    get points() { return points; },
    get rank() { return rankFor(points); },
    // Count one deed. Returns true when a point was added.
    credit(kind, key) {
      if (!Object.hasOwn(GAPS_MS, kind)) return false;
      if (typeof key !== "string" && !Number.isInteger(key)) return false;
      const id = kind + ":" + key, t = now();
      if (seen.has(id) || seen.size >= MAX_SEEN || points >= MAX_POINTS) return false;
      if (t - (lastAt.get(kind) ?? -1e9) < GAPS_MS[kind]) return false;
      const before = rankFor(points);
      seen.add(id); lastAt.set(kind, t); points++;
      persist();
      onEvent("deed", kind, points);
      if (rankFor(points) > before) onEvent("rank", rankFor(points));
      return true;
    },
    // A new visit to a lantern: the keys start again (the points stay).
    newVisit() { seen.clear(); lastAt.clear(); },
    seenCount: () => seen.size,
    // Adopt a larger saved total (another tab of this browser): points only ever go up.
    adopt(v) { const p = cleanPoints(v); if (p > points) { points = p; return true; } return false; },
  };
}

export function createRankNet(net, me, peers, rank, opts = {}) {
  const now = opts.now || (() => performance.now());
  const guard = createGuard(2, 4);
  let lastSent = now(), told = rank.rank;
  me.rank = rank.rank;
  const announce = (to) => net.send({ k: "rk", r: rank.rank }, to);
  net.onPeerJoin((id) => announce(id));
  net.onPeerLeave((id) => guard.forget(id));
  net.onMessage((msg, id) => {
    if (!msg || typeof msg !== "object" || msg.k !== "rk") return;
    const p = peers.get(id);
    if (!p || Object.keys(msg).length !== 2 || !Number.isInteger(msg.r) || msg.r < 0 || msg.r > MAX_RANK) return;
    if (!guard.allow(id, now())) return;
    p.rank = msg.r;
  });
  return {
    tick() {
      const t = now();
      me.rank = rank.rank;
      if (rank.rank !== told || t - lastSent >= RESEND_MS) { told = rank.rank; lastSent = t; announce(); }
    },
  };
}
