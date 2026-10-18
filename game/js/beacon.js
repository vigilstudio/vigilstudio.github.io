// Beacons: players fuel an old beacon together. Each player's share is counted in a grow-only counter (a G-counter),
// so contributions made at the same moment are never lost, and a beacon lights when enough fuel is in and at
// least two different players put some in.
//
// The state is one number per player per beacon: how much fuel that player has added. Merging two copies keeps the
// larger number for each player, so repeats, reordering and crossing messages are harmless, and a number never goes
// down. A beacon is lit when the shares add up to BEACON_NEED and at least MIN_PLAYERS players have a share. Because
// the counters only grow, a lit beacon stays lit for as long as anyone who holds the state is in the room. When the
// room empties the state is forgotten (nothing is kept on a server); the fuel a player spent stays spent.
// Messages (numbers only, never text):
//   { k:"fu", b, n }                 my own total on beacon b (0..3); sent when it changes, to each newcomer, every 5 s
//   { k:"fq" }                       newcomer -> a peer: "send me the shares you know"
//   { k:"fs", b:[..], s:[..], n:[..], f }   up to 10 shares (beacon, player seed, total); f=1 on the last chunk
// A receiver checks: sender said hello, exact fields, whole numbers in range, at most 8 messages a second per sender,
// and "fs" only from a peer it asked and whose snapshot has not finished (asked again at most twice). Shares are keyed by the player's seed (the same number their name comes from).
import { createGuard } from "./guard.js";
import { isSeed } from "./names.js";

export const BEACON_NEED = 12;       // fuel points that light a beacon
export const MIN_PLAYERS = 2;        // different players needed
export const MAX_OWN = 16;           // one player's share of one beacon never goes above this
export const MAX_ENTRIES = 24;       // shares kept per beacon; a full list refuses new players, it never drops one
export const BEACON_RANGE = 2.5;     // tiles from the beacon within which you can add fuel
export const LIT_RADIUS = 9;         // tiles of light a lit beacon gives
export const WORTH = { driftwood: 1, berries: 2, oil: 3 }; // fuel points per item (reeds do not burn well; lamp oil from fish burns best)
export const FLAME_FUEL = BEACON_NEED / 2; // a carried flame (flame.js) counts as this much fuel in the share of the player who lights a beacon with it
export const RESEND_MS = 5000;
export const SYNC_WAIT_MS = 1500;
const CHUNK = 10;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// ---- pure state: one Map(seed -> share) per beacon ----
export function createShares(count) {
  const maps = Array.from({ length: count }, () => new Map());
  return {
    count,
    // Merge a share: keep the larger. Returns "new", "grew" or "" (nothing changed or refused).
    merge(b, seed, n) {
      if (!isInt(b, 0, count - 1) || !isSeed(seed) || !isInt(n, 1, MAX_OWN)) return "";
      const m = maps[b], have = m.get(seed);
      if (have === undefined) { if (m.size >= MAX_ENTRIES) return ""; m.set(seed, n); return "new"; }
      if (n > have) { m.set(seed, n); return "grew"; }
      return "";
    },
    own: (b, seed) => maps[b].get(seed) || 0,
    fuel: (b) => { let s = 0; for (const n of maps[b].values()) s += n; return s; },
    players: (b) => maps[b].size,
    lit(b) { return this.fuel(b) >= BEACON_NEED && maps[b].size >= MIN_PLAYERS; },
    entries() { const out = []; maps.forEach((m, b) => { for (const [s, n] of m) out.push([b, s, n]); }); return out; },
    size: (b) => maps[b].size,
  };
}

// Can a player with `own` fuel already on a beacon add `worth` more? { ok:true } or { ok:false, why:"lit"|"full"|"missing" }.
export function canAdd(shares, b, seed, pack, item) {
  if (!Object.hasOwn(WORTH, item)) return { ok: false, why: "unknown" };
  if (shares.lit(b)) return { ok: false, why: "lit" };
  if (!(pack[item] >= 1)) return { ok: false, why: "missing" };
  const own = shares.own(b, seed);
  if (own + WORTH[item] > MAX_OWN) return { ok: false, why: "full" };
  // A beacon with 24 counted players holds at least 24 fuel, so it is already lit and refused above: a full list
  // can only be reached by forged messages, and those can never push a real player's item into a refused merge.
  return { ok: true };
}

export function createBeacons(net, me, peers, inv, beacons, opts = {}) {
  const now = opts.now || (() => performance.now());
  const onEvent = opts.onEvent || (() => {});
  const persist = opts.persist || (() => {});
  const shares = createShares(beacons.length);
  const guard = createGuard(8, 16);
  const asked = new Set();      // peers I have asked for their shares
  const awaiting = new Map();   // peer -> { at, tries }: asked, snapshot not finished yet; "fs" is accepted only from these
  const lastFq = new Map();
  const startedAt = now();
  let lastSent = now(), synced = false;
  const litNow = () => beacons.map((_, b) => shares.lit(b));
  let wasLit = litNow();
  const checkLit = () => { const l = litNow(); l.forEach((v, b) => { if (v && !wasLit[b]) onEvent("lit", b); }); wasLit = l; };
  const announce = (to) => { for (let b = 0; b < beacons.length; b++) { const n = shares.own(b, me.seed); if (n > 0) net.send({ k: "fu", b, n }, to); } };

  net.onPeerLeave((id) => { guard.forget(id); lastFq.delete(id); asked.delete(id); awaiting.delete(id); });
  net.onPeerJoin((id) => announce(id));
  net.onMessage((msg, id) => {
    if (!msg || typeof msg !== "object" || (msg.k !== "fu" && msg.k !== "fq" && msg.k !== "fs")) return;
    const p = peers.get(id);
    if (!p) return;
    if (!guard.allow(id, now())) return;
    const keys = Object.keys(msg).length;
    if (msg.k === "fu") {
      if (keys !== 3) return;
      if (shares.merge(msg.b, p.seed, msg.n)) { onEvent("fuel", msg.b); checkLit(); }
    } else if (msg.k === "fq") {
      if (keys !== 1 || !synced) return;
      const t = now();
      if (t - (lastFq.get(id) ?? -1e9) < 1000) return;
      lastFq.set(id, t);
      const list = shares.entries();
      for (let i = 0; i === 0 || i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK);
        net.send({ k: "fs", b: part.map(e => e[0]), s: part.map(e => e[1]), n: part.map(e => e[2]), f: i + CHUNK >= list.length ? 1 : 0 }, id);
      }
    } else {
      if (keys !== 5 || !awaiting.has(id) || !Array.isArray(msg.b) || !Array.isArray(msg.s) || !Array.isArray(msg.n)) return;
      if (msg.b.length > CHUNK || msg.b.length !== msg.s.length || msg.b.length !== msg.n.length || (msg.f !== 0 && msg.f !== 1)) return;
      if (!msg.b.every(v => isInt(v, 0, beacons.length - 1)) || !msg.s.every(isSeed) || !msg.n.every(v => isInt(v, 1, MAX_OWN))) return;
      let changed = false;
      msg.b.forEach((b, i) => { if (shares.merge(b, msg.s[i], msg.n[i])) changed = true; });
      if (changed) { onEvent("fuel", -1); checkLit(); }
      if (msg.f === 1) { synced = true; awaiting.delete(id); }
    }
  });

  const near = () => {
    let best = -1, bd = BEACON_RANGE;
    beacons.forEach((l, b) => { const d = Math.hypot(l.x - me.x, l.y - me.y); if (d <= bd) { bd = d; best = b; } });
    return best;
  };
  return {
    shares, near, synced: () => synced, pending: () => awaiting.size,
    lit: (b) => shares.lit(b),
    // Add one item's fuel to the beacon in reach. The pack changes and is saved before anything is sent.
    add(item) {
      const b = near();
      if (b < 0) { onEvent("refused", -1, { why: "far" }); return { ok: false, why: "far" }; }
      if (!synced && peers.size > 0) { onEvent("refused", b, { why: "wait" }); return { ok: false, why: "wait" }; }
      const r = canAdd(shares, b, me.seed, inv, item);
      if (!r.ok) { onEvent("refused", b, { ...r, item }); return r; }
      inv[item]--;
      shares.merge(b, me.seed, shares.own(b, me.seed) + WORTH[item]);
      persist();
      net.send({ k: "fu", b, n: shares.own(b, me.seed) });
      onEvent("added", b, { item });
      checkLit();
      return { ok: true, b };
    },
    // Light the beacon in reach with a carried flame (the holder's page checks it holds one): FLAME_FUEL goes into my share,
    // with the same checks as add(). Nothing in the pack changes. { ok:true, b } or { ok:false, why }.
    addFlame() {
      const b = near();
      if (b < 0) { onEvent("refused", -1, { why: "far" }); return { ok: false, why: "far" }; }
      if (!synced && peers.size > 0) { onEvent("refused", b, { why: "wait" }); return { ok: false, why: "wait" }; }
      if (shares.lit(b)) { onEvent("refused", b, { why: "lit" }); return { ok: false, why: "lit" }; }
      if (shares.own(b, me.seed) + FLAME_FUEL > MAX_OWN) { onEvent("refused", b, { why: "full" }); return { ok: false, why: "full" }; }
      shares.merge(b, me.seed, shares.own(b, me.seed) + FLAME_FUEL);
      persist();
      net.send({ k: "fu", b, n: shares.own(b, me.seed) });
      onEvent("flamed", b);
      checkLit();
      return { ok: true, b };
    },
    // Called every frame: ask newcomers for the shares, give up waiting, repeat my own totals now and then.
    tick() {
      const t = now();
      for (const id of peers.keys()) if (!asked.has(id)) { asked.add(id); awaiting.set(id, { at: t, tries: 0 }); net.send({ k: "fq" }, id); } // also peers found late
      for (const [id, w] of awaiting) if (t - w.at >= 2500) { if (w.tries >= 2) awaiting.delete(id); else { w.tries++; w.at = t; net.send({ k: "fq" }, id); } } // the answer may have been lost, or they were not ready
      if (!synced && t - startedAt > SYNC_WAIT_MS) synced = true;
      if (t - lastSent >= RESEND_MS) { lastSent = t; announce(); }
    },
  };
}
