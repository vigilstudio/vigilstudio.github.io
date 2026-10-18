// Carrying the flame: a player beside a lit beacon can take a flame, walk it to an unlit beacon (or hand it on to a
// player within reach) and light that beacon with it. The flame is worth FLAME_FUEL (half of BEACON_NEED) of fuel
// in that beacon's shares; the other half, and the second player, still have to come from players (see beacon.js).
//
// The flame is only a token in this page's memory: it is never saved and never counted by anyone else. It goes out
// after FLAME_LIFE_MS, when the holder leaves or reloads, or when it is used. Nothing a player owns is in it, so a
// flame that goes out loses nothing. It is never copied: the giver lets go of it (before sending "fc") when the
// receiver has said yes, and a flame offered twice (the same number again) is refused.
//
// Messages, numbers only (t = a random offer number):
//   { k:"fo", t }          giver -> receiver   "I offer you my flame"
//   { k:"fa", t }          receiver -> giver   "I accept"
//   { k:"fd", t }          either way          "no" (receiver), or "I take the offer back" (giver)
//   { k:"fc", t, b, l }    giver -> receiver   "it is yours": b = the beacon it came from, l = whole seconds it still burns
//   { k:"fh", h }          holder -> room      h=1 "I carry a flame" / h=0 (drawn as a spark by the lantern; sent when it changes and to newcomers)
// A receiver checks: sender said hello, exact fields, whole numbers in range, at most 8 messages a second per
// sender; an offer only from someone in reach; "fa" and "fd" only for an offer it made (or received) from that same
// peer; "fc" only for an offer it accepted from that peer, once.
import { createGuard } from "./guard.js";
import { isGiftId } from "./inventory.js";

export const FLAME_LIFE_MS = 150000;  // a flame burns this long, passed on or not
export const FLAME_GAP_MS = 45000;    // after taking a flame from a beacon, a page waits this long before taking another
export const FLAME_OFFER_MS = 20000;  // an offer nobody answers ends after this long
export const FLAME_RANGE = 3;         // tiles: how close the giver must stand (own view of the other player)
export const FLAME_SLACK = 2.5;       // a receiver accepts offers from a little farther (movement lags behind)
const MAX_RECENT = 8;                 // offer numbers remembered per peer, to refuse a repeat
const MAX_LIFE_S = Math.ceil(FLAME_LIFE_MS / 1000);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function createFlame(net, me, peers, beacon, beaconCount, opts = {}) {
  const now = opts.now || (() => performance.now());
  const onEvent = opts.onEvent || (() => {});
  const rand = opts.rand || (() => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 4294967295) + 1; });
  const guard = createGuard(8, 16);
  const recent = new Map();        // peer id -> offer numbers already seen from them
  let held = null;                 // { b, until }
  let outgoing = null;             // { t, to, seed, at }: my offer, waiting
  let incoming = null;             // { t, from, seed, at }: an offer shown to me
  let expecting = null;            // { t, from, seed, at }: I said yes; the flame has not come yet
  let lastTake = -1e9;

  const dist = (p) => Math.hypot(p.tx - me.x, p.ty - me.y);
  const left = () => (held ? Math.max(0, held.until - now()) : 0);
  const announce = (to) => net.send({ k: "fh", h: held ? 1 : 0 }, to);
  const endOut = (type) => { const o = outgoing; outgoing = null; if (o) onEvent(type, { seed: o.seed }); };
  const endIn = (type) => { const o = incoming; incoming = null; if (o) onEvent(type, { seed: o.seed }); };
  const endExp = (type) => { const o = expecting; expecting = null; if (o) onEvent(type, { seed: o.seed }); };
  const idle = () => !held && !outgoing && !incoming && !expecting;
  me.flame = false;
  const setHeld = (h) => { held = h; me.flame = !!h; announce(); };

  net.onPeerJoin((id) => announce(id));
  net.onPeerLeave((id) => {
    guard.forget(id); recent.delete(id);
    if (outgoing && outgoing.to === id) endOut("lost");     // I still hold the flame: nothing to undo
    if (incoming && incoming.from === id) endIn("lost");
    if (expecting && expecting.from === id) endExp("lost"); // they let go before the flame got to me: it has gone out
  });
  net.onMessage((msg, id) => {
    if (!msg || typeof msg !== "object" || typeof msg.k !== "string") return;
    const k = msg.k;
    if (k !== "fh" && k !== "fo" && k !== "fa" && k !== "fd" && k !== "fc") return;
    const p = peers.get(id);
    if (!p) return;
    if (!guard.allow(id, now())) return;
    const keys = Object.keys(msg).length;
    if (k === "fh") {
      if (keys !== 2 || (msg.h !== 0 && msg.h !== 1)) return;
      p.flame = msg.h === 1;
      return;
    }
    if (!isGiftId(msg.t)) return;
    const t = msg.t;
    if (k === "fo") {
      if (keys !== 2) return;
      if (incoming && now() - incoming.at > FLAME_OFFER_MS) endIn("expired");
      if (dist(p) > FLAME_RANGE + FLAME_SLACK) return;
      const seen = recent.get(id) || [];
      const again = seen.includes(t);
      if (!again) { seen.push(t); while (seen.length > MAX_RECENT) seen.shift(); recent.set(id, seen); }
      if (again || held || incoming || expecting || outgoing) { net.send({ k: "fd", t }, id); return; }
      incoming = { t, from: id, seed: p.seed, at: now() };
      onEvent("offered", { seed: p.seed });
    } else if (k === "fa") {
      if (keys !== 2 || !outgoing || outgoing.t !== t || outgoing.to !== id) return;
      const o = outgoing;
      if (!held || left() < 1000) { outgoing = null; net.send({ k: "fd", t }, id); onEvent("out", { seed: o.seed }); return; }
      const l = Math.min(MAX_LIFE_S, Math.max(1, Math.floor(left() / 1000))), b = held.b;
      outgoing = null;
      setHeld(null);                                  // let go first, then tell them
      net.send({ k: "fc", t, b, l }, id);
      onEvent("passed", { seed: o.seed });
    } else if (k === "fd") {
      if (keys !== 2) return;
      if (outgoing && outgoing.t === t && outgoing.to === id) endOut("declined");
      else if (incoming && incoming.t === t && incoming.from === id) endIn("cancelled");
      else if (expecting && expecting.t === t && expecting.from === id) endExp("cancelled");
    } else { // fc
      if (keys !== 4 || !isInt(msg.b, 0, beaconCount - 1) || !isInt(msg.l, 1, MAX_LIFE_S)) return;
      if (!expecting || expecting.t !== t || expecting.from !== id) return;
      const o = expecting; expecting = null;
      if (held) return;                               // cannot happen (taking is refused while expecting); never a second flame
      setHeld({ b: msg.b, until: now() + msg.l * 1000 });
      onEvent("received", { seed: o.seed });
    }
  });

  return {
    get held() { return held ? { b: held.b, left: left() } : null; },
    get outgoing() { return outgoing ? { ...outgoing } : null; },
    get incoming() { return incoming ? { ...incoming } : null; },
    get expecting() { return expecting ? { ...expecting } : null; },
    // Can this page take a flame from the lit beacon it stands beside? { ok:true, b } or { ok:false, why }.
    canTake() {
      if (!idle()) return { ok: false, why: held ? "held" : "busy" };
      const b = beacon.near();
      if (b < 0) return { ok: false, why: "far" };
      if (!beacon.lit(b)) return { ok: false, why: "unlit" };
      if (now() - lastTake < FLAME_GAP_MS) return { ok: false, why: "gap" };
      return { ok: true, b };
    },
    take() {
      const r = this.canTake();
      if (!r.ok) { onEvent("refused", { why: r.why }); return r; }
      lastTake = now();
      setHeld({ b: r.b, until: now() + FLAME_LIFE_MS });
      onEvent("taken", { b: r.b });
      return r;
    },
    // The nearest other player within reach, or null.
    target() {
      let best = null, bd = FLAME_RANGE;
      for (const p of peers.values()) { const d = dist(p); if (d <= bd) { bd = d; best = p; } }
      return best;
    },
    offer() {
      if (!held || outgoing || left() < 1000) return false;
      const p = this.target();
      if (!p) return false;
      outgoing = { t: rand(), to: p.id, seed: p.seed, at: now() };
      net.send({ k: "fo", t: outgoing.t }, p.id);
      onEvent("offering", { seed: p.seed });
      return true;
    },
    cancel() {
      if (!outgoing) return false;
      net.send({ k: "fd", t: outgoing.t }, outgoing.to);
      endOut("cancelled");
      return true;
    },
    accept() {
      if (!incoming) return false;
      if (now() - incoming.at > FLAME_OFFER_MS || held || expecting) { endIn("expired"); return false; }
      const o = incoming; incoming = null;
      expecting = { t: o.t, from: o.from, seed: o.seed, at: now() };
      net.send({ k: "fa", t: o.t }, o.from);
      onEvent("accepted", { seed: o.seed });
      return true;
    },
    decline() {
      if (!incoming) return false;
      net.send({ k: "fd", t: incoming.t }, incoming.from);
      endIn("declined");
      return true;
    },
    // Light the unlit beacon in reach with the flame. The flame is used up only when the beacon took it.
    light() {
      if (!held) { onEvent("refused", { why: "none" }); return { ok: false, why: "none" }; }
      if (outgoing) { onEvent("refused", { why: "offering" }); return { ok: false, why: "offering" }; }
      if (left() < 1) { setHeld(null); onEvent("out", {}); return { ok: false, why: "out" }; }
      const r = beacon.addFlame();
      if (!r.ok) { onEvent("refused", { why: r.why }); return r; }
      setHeld(null);
      onEvent("used", { b: r.b });
      return r;
    },
    // Every frame: let the flame burn out, and end offers nobody answered.
    tick() {
      const t = now();
      if (held && t >= held.until) { const was = outgoing; if (was) { net.send({ k: "fd", t: was.t }, was.to); endOut("cancelled"); } setHeld(null); onEvent("out", {}); }
      if (outgoing && t - outgoing.at > FLAME_OFFER_MS) { net.send({ k: "fd", t: outgoing.t }, outgoing.to); endOut("expired"); }
      if (incoming && t - incoming.at > FLAME_OFFER_MS) endIn("expired");
      if (expecting && t - expecting.at > FLAME_OFFER_MS) endExp("expired");
    },
  };
}
